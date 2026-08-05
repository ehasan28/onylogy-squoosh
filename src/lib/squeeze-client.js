/**
 * Main-thread client for the squeeze worker. Promise-based; one worker
 * instance shared across all jobs, jobs correlated by id.
 *
 * Upgraded to match onylogy-squeeze's current worker contract (full
 * per-format options objects instead of a single quality number, explicit
 * `sourceFormat`, `decode` for pixels) — see
 * ../worker/squeeze.worker.js. `wasmBase` resolution stays the
 * WordPress-specific line: derived from `self.ONYIO.pluginUrl` + `build/wasm/`,
 * set by admin/class-admin-page.php's wp_localize_script().
 */

import { sourceFormat as guessSourceFormat } from './formats';

let worker = null;
let readyPromise = null;
let seq = 0;
const pending = new Map();

/**
 * Lazily create the worker and wait for it to report ready (WASM base set).
 *
 * @return {Promise<Worker>} The ready worker.
 */
function getWorker() {
	if ( readyPromise ) {
		return readyPromise;
	}

	worker = new Worker( new URL( '../worker/squeeze.worker.js', import.meta.url ) );

	worker.onmessage = ( event ) => {
		const msg = event.data || {};
		if ( msg.type === 'result' || msg.type === 'decoded' || msg.type === 'error' ) {
			const entry = pending.get( msg.id );
			if ( ! entry ) {
				return;
			}
			pending.delete( msg.id );
			if ( msg.type === 'error' ) {
				entry.reject( new Error( msg.message ) );
			} else {
				entry.resolve( msg );
			}
		}
	};

	// build/wasm/ lives next to the enqueued bundle. ONYIO.pluginUrl is the
	// plugin root; the build dir is a known child.
	const base =
		( typeof self !== 'undefined' && self.ONYIO && self.ONYIO.pluginUrl
			? self.ONYIO.pluginUrl
			: '/' ) + 'build/wasm/';

	readyPromise = new Promise( ( resolve ) => {
		const onReady = ( event ) => {
			if ( event.data && event.data.type === 'ready' ) {
				worker.removeEventListener( 'message', onReady );
				resolve( worker );
			}
		};
		worker.addEventListener( 'message', onReady );
		worker.postMessage( { type: 'init', wasmBase: base } );
	} );

	return readyPromise;
}

/**
 * Optimize a source image into one or more outputs in a single decode pass.
 *
 * @param {Blob}   file    Source image.
 * @param {Object} options {
 *                           resize: { width, height, method, fitMethod, premultiply, linearRGB } | null,
 *                           bgColor: string,
 *                           targets: [ { key, format, options } ],
 *                           sourceFormat?: string, // auto-detected from `file` when omitted
 *                         }
 * @return {Promise<Array<{key:string, format:string, buffer:ArrayBuffer, width:number, height:number}>>} Outputs.
 */
export async function optimize( file, options ) {
	const w = await getWorker();
	const id = ++seq;

	const result = await new Promise( ( resolve, reject ) => {
		pending.set( id, { resolve, reject } );
		w.postMessage(
			{
				type: 'optimize',
				id,
				blob: file,
				sourceFormat: options.sourceFormat || guessSourceFormat( file ),
				resize: options.resize || null,
				bgColor: options.bgColor || '#ffffff',
				targets: options.targets,
			}
		);
	} );

	return result.outputs;
}

/**
 * Decode any supported image into raw pixels. Not used by the bulk/auto-
 * upload flow today, but kept available for any future preview feature.
 *
 * @param {Blob}   file        Source image.
 * @param {string} [sourceFmt] Format key; auto-detected from `file` when omitted.
 * @return {Promise<ImageData>} Decoded pixels.
 */
export async function decode( file, sourceFmt ) {
	const w = await getWorker();
	const id = ++seq;

	const result = await new Promise( ( resolve, reject ) => {
		pending.set( id, { resolve, reject } );
		w.postMessage( {
			type: 'decode',
			id,
			blob: file,
			sourceFormat: sourceFmt || guessSourceFormat( file ),
		} );
	} );

	return new ImageData(
		new Uint8ClampedArray( result.data ),
		result.width,
		result.height
	);
}
