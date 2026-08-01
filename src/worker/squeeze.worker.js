/**
 * Squeeze worker — runs all decode/resize/flatten/encode off the main thread.
 *
 * Ported from onylogy-squeeze's src/worker/squeeze.worker.js and extended
 * for standalone desktop use:
 *  - Resize now goes through @jsquash/resize (the actual WASM resize methods
 *    Squoosh itself offers: triangle/catrom/mitchell/lanczos3/hqx/magicKernel*)
 *    instead of a plain canvas draw-scale, for real output-quality parity.
 *  - Encode targets carry a full per-codec options object (chroma subsampling,
 *    progressive, effort, etc.) instead of a single quality number, so the UI
 *    can expose the same settings Squoosh's own options panels expose.
 *
 * The .wasm files are copied to a flat build/wasm/ directory (see
 * webpack.config.js's CopyPlugin) and located via each codec's `locateFile`,
 * so nothing has to bundle a .wasm.
 */

import encodeJpeg from '@jsquash/jpeg/encode';
import { init as initJpegEnc } from '@jsquash/jpeg/encode';
import encodePng from '@jsquash/png/encode';
import { init as initPngEnc } from '@jsquash/png/encode';
import encodeWebp from '@jsquash/webp/encode';
import { init as initWebpEnc } from '@jsquash/webp/encode';
import encodeAvif from '@jsquash/avif/encode';
import { init as initAvifEnc } from '@jsquash/avif/encode';
import resizeImage, { initResize, initHqx, initMagicKernel } from '@jsquash/resize';

let wasmBase = '';
const inited = {};

/**
 * Ensure an encoder's WASM is initialised (once).
 *
 * @param {string} format Format key.
 */
async function ensureEncoder( format ) {
	if ( inited[ format ] ) {
		return;
	}
	const locate = ( path ) => wasmBase + path;
	switch ( format ) {
		case 'jpeg':
			await initJpegEnc( undefined, { locateFile: locate } );
			break;
		case 'webp':
			await initWebpEnc( undefined, { locateFile: locate } );
			break;
		case 'avif':
			await initAvifEnc( undefined, { locateFile: locate } );
			break;
		case 'png':
			await initPngEnc( wasmBase + 'squoosh_png_bg.wasm' );
			break;
		default:
			throw new Error( 'Unsupported output format: ' + format );
	}
	inited[ format ] = true;
}

/**
 * Ensure the specific resize WASM module(s) a method needs are initialised.
 *
 * @param {string} method Resize method key.
 */
async function ensureResizeMethod( method ) {
	if ( method === 'hqx' ) {
		if ( ! inited.resizeHqx ) {
			await initHqx( wasmBase + 'squooshhqx_bg.wasm' );
			inited.resizeHqx = true;
		}
		// hqx upsamples then falls through to a regular resize pass.
		if ( ! inited.resizeMain ) {
			await initResize( wasmBase + 'squoosh_resize_bg.wasm' );
			inited.resizeMain = true;
		}
		return;
	}
	if ( method && method.startsWith( 'magicKernel' ) ) {
		if ( ! inited.resizeMagicKernel ) {
			await initMagicKernel( wasmBase + 'jsquash_magic_kernel_bg.wasm' );
			inited.resizeMagicKernel = true;
		}
		return;
	}
	if ( ! inited.resizeMain ) {
		await initResize( wasmBase + 'squoosh_resize_bg.wasm' );
		inited.resizeMain = true;
	}
}

/**
 * Encode ImageData into the requested format.
 *
 * @param {ImageData} imageData Pixels.
 * @param {string}    format    Target format key.
 * @param {Object}    options   Full per-codec option object (merged with the
 *                              codec's own defaults inside jSquash).
 * @return {Promise<ArrayBuffer>} Encoded bytes.
 */
async function encode( imageData, format, options ) {
	await ensureEncoder( format );
	switch ( format ) {
		case 'jpeg':
			return encodeJpeg( imageData, options );
		case 'webp':
			return encodeWebp( imageData, options );
		case 'avif':
			return encodeAvif( imageData, options );
		case 'png':
			return encodePng( imageData, options );
		default:
			throw new Error( 'Unsupported output format: ' + format );
	}
}

/**
 * Formats that cannot store transparency and therefore need flattening.
 */
const OPAQUE_ONLY = { jpeg: true };

/**
 * Decode a source blob into a plain ImageData at native resolution, via the
 * browser's own createImageBitmap (fast, native for every format this
 * plugin supports — jpeg/png/webp/avif).
 *
 * @param {Blob}   blob         Source image blob.
 * @param {string} sourceFormat Format key the client already sniffed (unused
 *                              here; kept in the signature to match the
 *                              caller's message shape).
 * @return {Promise<ImageData>} Native-resolution pixels.
 */
async function decodeSource( blob, sourceFormat ) { // eslint-disable-line no-unused-vars
	let bitmap;
	try {
		bitmap = await createImageBitmap( blob );
	} catch ( e ) {
		throw new Error(
			'Could not decode this image. The file may be corrupt or in a format your browser cannot read.'
		);
	}

	const canvas = new OffscreenCanvas( bitmap.width, bitmap.height );
	const ctx = canvas.getContext( '2d', { alpha: true } );
	ctx.drawImage( bitmap, 0, 0 );
	bitmap.close();
	return ctx.getImageData( 0, 0, canvas.width, canvas.height );
}

/**
 * Resize an ImageData with a @jsquash/resize method, if resize dimensions
 * were requested. No-op (returns the input untouched) otherwise.
 *
 * Accepts either an explicit `{ width, height }` (the caller already knows
 * the target size — e.g. a per-image tool with its own preview), or
 * `{ maxWidth, maxHeight }` (the caller only has a size ceiling — e.g. this
 * plugin's single library-wide "resize large images to" setting). The
 * max-dimension form is resolved here, once imageData's own width/height are
 * already known, instead of requiring an extra decode round-trip just to
 * learn them. Never upscales.
 *
 * @param {ImageData} imageData Source pixels.
 * @param {Object}    resize    { width, height, method, fitMethod, premultiply, linearRGB }
 *                               or { maxWidth, maxHeight, method, fitMethod, premultiply, linearRGB }.
 * @return {Promise<ImageData>} Resized (or original) pixels.
 */
async function applyResize( imageData, resize ) {
	if ( ! resize ) {
		return imageData;
	}

	let { width, height } = resize;
	if ( ! width || ! height ) {
		const maxWidth = resize.maxWidth || 0;
		const maxHeight = resize.maxHeight || 0;
		if ( ! maxWidth && ! maxHeight ) {
			return imageData;
		}
		const scale = Math.min(
			maxWidth ? maxWidth / imageData.width : 1,
			maxHeight ? maxHeight / imageData.height : 1,
			1 // never upscale
		);
		width = Math.max( 1, Math.round( imageData.width * scale ) );
		height = Math.max( 1, Math.round( imageData.height * scale ) );
	}

	if ( width === imageData.width && height === imageData.height ) {
		return imageData;
	}
	await ensureResizeMethod( resize.method );
	return resizeImage( imageData, { ...resize, width, height } );
}

/**
 * Flatten an ImageData onto a background colour (for formats that can't
 * hold alpha, e.g. transparent PNG -> JPEG should never go black).
 *
 * @param {ImageData} imageData Source pixels.
 * @param {string}    bgColor   Flatten colour.
 * @return {ImageData} Opaque pixels.
 */
function flatten( imageData, bgColor ) {
	const bg = new OffscreenCanvas( imageData.width, imageData.height );
	const bgCtx = bg.getContext( '2d', { alpha: false } );
	bgCtx.fillStyle = bgColor || '#ffffff';
	bgCtx.fillRect( 0, 0, imageData.width, imageData.height );

	const src = new OffscreenCanvas( imageData.width, imageData.height );
	src.getContext( '2d' ).putImageData( imageData, 0, 0 );

	bgCtx.drawImage( src, 0, 0 );
	return bgCtx.getImageData( 0, 0, imageData.width, imageData.height );
}

self.onmessage = async ( event ) => {
	const msg = event.data || {};

	if ( msg.type === 'init' ) {
		wasmBase = msg.wasmBase;
		self.postMessage( { type: 'ready' } );
		return;
	}

	if ( msg.type === 'optimize' ) {
		const { id, blob, sourceFormat, resize, bgColor, targets } = msg;
		try {
			let imageData = await decodeSource( blob, sourceFormat );
			imageData = await applyResize( imageData, resize );

			const outputs = [];
			const transfer = [];
			for ( const t of targets ) {
				const dataForFormat = OPAQUE_ONLY[ t.format ]
					? flatten( imageData, bgColor )
					: imageData;
				// eslint-disable-next-line no-await-in-loop
				const buffer = await encode( dataForFormat, t.format, t.options || {} );
				outputs.push( {
					key: t.key,
					format: t.format,
					buffer,
					width: imageData.width,
					height: imageData.height,
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
		return;
	}

	if ( msg.type === 'decode' ) {
		// Decode any supported format into raw pixels for on-screen preview.
		const { id, blob, sourceFormat } = msg;
		try {
			const imageData = await decodeSource( blob, sourceFormat );
			self.postMessage(
				{
					type: 'decoded',
					id,
					width: imageData.width,
					height: imageData.height,
					data: imageData.data.buffer,
				},
				[ imageData.data.buffer ]
			);
		} catch ( err ) {
			self.postMessage( {
				type: 'error',
				id,
				message: err && err.message ? err.message : String( err ),
			} );
		}
	}
};
