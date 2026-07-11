/**
 * Squeeze worker — runs all decode/resize/flatten/encode off the main thread.
 *
 * Decode + resize + transparency-flatten happen with OffscreenCanvas (native,
 * fast, universal). Encoding uses the @jsquash/* WebAssembly codecs so output
 * quality is host-independent (mozjpeg / oxipng / webp / avif), exactly like
 * Squoosh. The .wasm files are copied to build/wasm/ and located via each
 * codec's `locateFile`, so webpack never has to bundle a .wasm.
 *
 * The `optimize` message decodes a source image ONCE and produces multiple
 * outputs (e.g. a recompressed original-format file plus WebP/AVIF siblings),
 * which is how the library optimizer avoids decoding the same file repeatedly.
 */

import encodeJpeg from '@jsquash/jpeg/encode';
import { init as initJpeg } from '@jsquash/jpeg/encode';
import encodePng from '@jsquash/png/encode';
import { init as initPng } from '@jsquash/png/encode';
import encodeWebp from '@jsquash/webp/encode';
import { init as initWebp } from '@jsquash/webp/encode';
import encodeAvif from '@jsquash/avif/encode';
import { init as initAvif } from '@jsquash/avif/encode';

let wasmBase = '';
const inited = {};

/**
 * Ensure a codec's WASM is initialised (once).
 *
 * @param {string} format Format key.
 */
async function ensureCodec( format ) {
	if ( inited[ format ] ) {
		return;
	}
	const locate = ( path ) => wasmBase + path;
	switch ( format ) {
		case 'jpeg':
			await initJpeg( undefined, { locateFile: locate } );
			break;
		case 'webp':
			await initWebp( undefined, { locateFile: locate } );
			break;
		case 'avif':
			await initAvif( undefined, { locateFile: locate } );
			break;
		case 'png':
			await initPng( wasmBase + 'squoosh_png_bg.wasm' );
			break;
		default:
			throw new Error( 'Unsupported output format: ' + format );
	}
	inited[ format ] = true;
}

/**
 * Encode ImageData into the requested format.
 *
 * @param {ImageData} imageData Pixels.
 * @param {string}    format    Target format key.
 * @param {number}    quality   Quality 0-100 (ignored by png).
 * @return {Promise<ArrayBuffer>} Encoded bytes.
 */
async function encode( imageData, format, quality ) {
	await ensureCodec( format );
	const q = Math.max( 0, Math.min( 100, quality ) );
	switch ( format ) {
		case 'jpeg':
			return encodeJpeg( imageData, { quality: q } );
		case 'webp':
			return encodeWebp( imageData, { quality: q } );
		case 'avif':
			return encodeAvif( imageData, { quality: q } );
		case 'png':
			return encodePng( imageData );
		default:
			throw new Error( 'Unsupported output format: ' + format );
	}
}

/**
 * Formats that cannot store transparency and therefore need flattening.
 */
const OPAQUE_ONLY = { jpeg: true };

/**
 * Decode a blob into a base OffscreenCanvas at the (optionally resized) target
 * dimensions, preserving alpha. Returns the canvas + its context + dimensions.
 *
 * @param {Blob}   blob    Source image blob.
 * @param {Object} resize  { maxWidth, maxHeight } (0 = no limit).
 * @return {Promise<{canvas: OffscreenCanvas, ctx: Object, width: number, height: number, hasAlpha: boolean}>} Base raster.
 */
async function decodeToCanvas( blob, resize ) {
	let bitmap;
	try {
		bitmap = await createImageBitmap( blob );
	} catch ( e ) {
		throw new Error(
			'Could not decode this image. The file may be corrupt or in a format your browser cannot read.'
		);
	}

	let { width, height } = bitmap;
	const maxW = ( resize && resize.maxWidth ) || 0;
	const maxH = ( resize && resize.maxHeight ) || 0;
	if ( maxW > 0 || maxH > 0 ) {
		const scaleW = maxW > 0 ? maxW / width : Infinity;
		const scaleH = maxH > 0 ? maxH / height : Infinity;
		const scale = Math.min( scaleW, scaleH, 1 ); // never upscale
		width = Math.max( 1, Math.round( width * scale ) );
		height = Math.max( 1, Math.round( height * scale ) );
	}

	const canvas = new OffscreenCanvas( width, height );
	const ctx = canvas.getContext( '2d', { alpha: true } );
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( bitmap, 0, 0, width, height );
	bitmap.close();

	return { canvas, ctx, width, height };
}

/**
 * Get ImageData for a target format, flattening onto a background colour when
 * the format can't hold alpha (so transparent PNG -> JPG never goes black).
 *
 * @param {Object} base    Result of decodeToCanvas.
 * @param {string} format  Target format.
 * @param {string} bgColor Flatten colour.
 * @return {ImageData} Pixels for the encoder.
 */
function imageDataFor( base, format, bgColor ) {
	if ( ! OPAQUE_ONLY[ format ] ) {
		return base.ctx.getImageData( 0, 0, base.width, base.height );
	}
	const flat = new OffscreenCanvas( base.width, base.height );
	const fctx = flat.getContext( '2d', { alpha: false } );
	fctx.fillStyle = bgColor || '#ffffff';
	fctx.fillRect( 0, 0, base.width, base.height );
	fctx.drawImage( base.canvas, 0, 0 );
	return fctx.getImageData( 0, 0, base.width, base.height );
}

self.onmessage = async ( event ) => {
	const msg = event.data || {};

	if ( msg.type === 'init' ) {
		wasmBase = msg.wasmBase;
		self.postMessage( { type: 'ready' } );
		return;
	}

	if ( msg.type === 'optimize' ) {
		const { id, blob, resize, bgColor, targets } = msg;
		try {
			const base = await decodeToCanvas( blob, resize );
			const outputs = [];
			const transfer = [];
			for ( const t of targets ) {
				const imageData = imageDataFor( base, t.format, bgColor );
				// eslint-disable-next-line no-await-in-loop
				const buffer = await encode( imageData, t.format, t.quality );
				outputs.push( {
					key: t.key,
					format: t.format,
					buffer,
					width: base.width,
					height: base.height,
				} );
				transfer.push( buffer );
			}
			self.postMessage( { type: 'result', id, outputs }, transfer );
		} catch ( err ) {
			self.postMessage( {
				type: 'error',
				id,
				message: err && err.message ? err.message : String( err ),
			} );
		}
	}
};
