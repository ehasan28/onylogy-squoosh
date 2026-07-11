/**
 * The optimization runner — the "Bulk Smush" engine.
 *
 * Pulls the queue of attachments needing work from the REST API, and for each
 * attachment fetches every size file, runs it through the WASM worker once
 * (recompress in its own format + emit WebP/AVIF siblings per settings), and
 * POSTs each result back to be written to disk. Reused for bulk runs, the
 * per-attachment auto-on-upload path, and the Media row action.
 */

import apiFetch from '@wordpress/api-fetch';
import { optimize } from './squeeze-client.js';

const NS = '/ois/v1';

/**
 * Current plugin settings, localized by PHP as window.OIS.settings.
 *
 * @return {Object} Settings.
 */
function settings() {
	return ( typeof window !== 'undefined' && window.OIS && window.OIS.settings ) || {};
}

/**
 * Build the list of encode targets for one size file.
 *
 * @param {string}  sourceFormat File's own format (jpeg|png|webp).
 * @param {boolean} isFull       Whether this is the full-size file (resizable).
 * @return {Array<{key:string, format:string, quality:number}>} Targets.
 */
function targetsFor( sourceFormat ) {
	const s = settings();
	const quality = typeof s.quality === 'number' ? s.quality : 80;
	const origFormat = sourceFormat === 'webp' ? 'webp' : sourceFormat;
	const targets = [ { key: 'orig', format: origFormat, quality } ];
	if ( s.webp && sourceFormat !== 'webp' ) {
		targets.push( { key: 'webp', format: 'webp', quality } );
	}
	if ( s.avif && sourceFormat !== 'avif' ) {
		targets.push( { key: 'avif', format: 'avif', quality: s.avifQuality || 55 } );
	}
	return targets;
}

/**
 * Fetch dashboard statistics.
 *
 * @return {Promise<Object>} Stats.
 */
export function getStats() {
	return apiFetch( { path: NS + '/stats' } );
}

/**
 * Process a single size file: fetch, optimize, and REPLACE that size file in
 * place with whichever candidate (recompressed original, WebP, or AVIF) comes
 * out smallest. There is no "served format" decision at request time — this
 * attachment's own file, in the Media Library, becomes the winning format, so
 * the theme, page builders and WordPress core all pick it up automatically.
 *
 * @param {number} attachmentId Attachment ID.
 * @param {Object} file         { size, url, format }.
 * @return {Promise<number>} Bytes saved for this size file.
 */
async function processFile( attachmentId, file ) {
	const s = settings();
	const res = await fetch( file.url, { credentials: 'same-origin', cache: 'no-store' } );
	if ( ! res.ok ) {
		throw new Error( 'Could not read ' + file.url );
	}
	const blob = await res.blob();
	const originalSize = blob.size;

	const isFull = file.size === 'full';
	const resize =
		isFull && s.resizeMax > 0
			? { maxWidth: s.resizeMax, maxHeight: s.resizeMax }
			: null;

	const outputs = await optimize( blob, {
		resize,
		bgColor: s.flattenColor || '#ffffff',
		targets: targetsFor( file.format ),
	} );

	let winner = null;
	for ( const out of outputs ) {
		if ( out.buffer.byteLength < originalSize && ( ! winner || out.buffer.byteLength < winner.buffer.byteLength ) ) {
			winner = out;
		}
	}

	if ( ! winner ) {
		// Nothing beat the original — leave the file untouched, but still
		// record its size so the savings math stays correct.
		await apiFetch( {
			path: NS + '/record',
			method: 'POST',
			data: { attachment_id: attachmentId, size: file.size, original_size: originalSize },
		} );
		return 0;
	}

	const form = new FormData();
	form.append( 'attachment_id', String( attachmentId ) );
	form.append( 'size', file.size );
	form.append( 'format', winner.format );
	form.append( 'width', String( winner.width ) );
	form.append( 'height', String( winner.height ) );
	form.append( 'original_size', String( originalSize ) );
	form.append(
		'file',
		new Blob( [ winner.buffer ], { type: 'application/octet-stream' } ),
		file.size + '.' + winner.format
	);
	await apiFetch( { path: NS + '/store', method: 'POST', body: form } );

	return Math.max( 0, originalSize - winner.buffer.byteLength );
}

/**
 * Optimize a single attachment (all its size files), then mark it complete.
 *
 * @param {Object} item { id, files: [...] }.
 * @return {Promise<number>} Total bytes saved for this attachment.
 */
export async function optimizeAttachment( item ) {
	let saved = 0;
	for ( const file of item.files ) {
		// eslint-disable-next-line no-await-in-loop
		saved += await processFile( item.id, file );
	}
	await apiFetch( { path: NS + '/complete', method: 'POST', data: { attachment_id: item.id } } );
	return saved;
}

/**
 * Fetch a single attachment's work item (used by auto-on-upload / row action).
 *
 * @param {number} attachmentId Attachment ID.
 * @return {Promise<Object|null>} Work item or null if nothing to do.
 */
export async function fetchItem( attachmentId ) {
	const data = await apiFetch( { path: NS + '/item/' + attachmentId } );
	return data && data.files && data.files.length ? data : null;
}

/**
 * Run the full pending queue.
 *
 * @param {Object} handlers { onProgress(state), shouldStop():boolean }.
 * @return {Promise<Object>} Final totals.
 */
export async function runQueue( handlers = {} ) {
	const onProgress = handlers.onProgress || ( () => {} );
	const shouldStop = handlers.shouldStop || ( () => false );

	// First page tells us the total pending count.
	let page = 1;
	let processed = 0;
	let totalSaved = 0;
	let done = 0;
	let failed = 0;

	// Always request page 1: as items are marked complete they leave the queue,
	// so the queue shrinks under us — keep pulling page 1 until it's empty.
	// eslint-disable-next-line no-constant-condition
	while ( true ) {
		if ( shouldStop() ) {
			break;
		}
		// eslint-disable-next-line no-await-in-loop
		const queue = await apiFetch( { path: NS + '/queue?per_page=5' } );
		if ( ! queue.items.length ) {
			break;
		}
		if ( ! processed ) {
			processed = queue.total; // initial pending count for the progress bar
		}
		for ( const item of queue.items ) {
			if ( shouldStop() ) {
				break;
			}
			try {
				// eslint-disable-next-line no-await-in-loop
				totalSaved += await optimizeAttachment( item );
				done++;
			} catch ( e ) {
				failed++;
			}
			onProgress( { done, failed, total: processed, totalSaved, current: item.title } );
		}
		page++;
		if ( page > 100000 ) {
			break; // absolute safety valve
		}
	}

	return { done, failed, totalSaved };
}
