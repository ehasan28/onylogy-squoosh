/**
 * Format metadata shared between the UI and the worker.
 *
 * Ported from onylogy-squeeze's src/lib/formats.js, with per-codec default
 * option objects lifted directly from each @jsquash/* package's meta.js (the
 * same option sets Squoosh itself uses).
 */

export const FORMATS = {
	jpeg: {
		label: 'MozJPEG',
		mime: 'image/jpeg',
		ext: 'jpg',
		alpha: false,
		lossy: true,
		defaultOptions: {
			quality: 75,
			baseline: false,
			arithmetic: false,
			progressive: true,
			optimize_coding: true,
			smoothing: 0,
			color_space: 3,
			quant_table: 3,
			trellis_multipass: false,
			trellis_opt_zero: false,
			trellis_opt_table: false,
			trellis_loops: 1,
			auto_subsample: true,
			chroma_subsample: 2,
			separate_chroma_quality: false,
			chroma_quality: 75,
		},
	},
	png: {
		label: 'PNG (OxiPNG)',
		mime: 'image/png',
		ext: 'png',
		alpha: true,
		lossy: false,
		defaultOptions: {},
	},
	webp: {
		label: 'WebP',
		mime: 'image/webp',
		ext: 'webp',
		alpha: true,
		lossy: true,
		defaultOptions: {
			quality: 75,
			target_size: 0,
			target_PSNR: 0,
			method: 4,
			sns_strength: 50,
			filter_strength: 60,
			filter_sharpness: 0,
			filter_type: 1,
			partitions: 0,
			segments: 4,
			pass: 1,
			show_compressed: 0,
			preprocessing: 0,
			autofilter: 0,
			partition_limit: 0,
			alpha_compression: 1,
			alpha_filtering: 1,
			alpha_quality: 100,
			lossless: 0,
			exact: 0,
			image_hint: 0,
			emulate_jpeg_size: 0,
			thread_level: 0,
			low_memory: 0,
			near_lossless: 100,
			use_delta_palette: 0,
			use_sharp_yuv: 0,
		},
	},
	avif: {
		label: 'AVIF',
		mime: 'image/avif',
		ext: 'avif',
		alpha: true,
		lossy: true,
		defaultOptions: {
			quality: 50,
			qualityAlpha: -1,
			denoiseLevel: 0,
			tileColsLog2: 0,
			tileRowsLog2: 0,
			speed: 6,
			subsample: 1,
			chromaDeltaQ: false,
			sharpness: 0,
			tune: 0,
			enableSharpYUV: false,
			bitDepth: 8,
			lossless: false,
		},
	},
};

export const OUTPUT_ORDER = [ 'webp', 'avif', 'jpeg', 'png' ];

/**
 * Guess the source format key from a File's MIME type / name.
 *
 * @param {File} file Source file.
 * @return {string} Format key or 'unknown'.
 */
export function sourceFormat( file ) {
	const mime = ( file.type || '' ).toLowerCase();
	if ( mime.includes( 'jpeg' ) || mime.includes( 'jpg' ) ) {
		return 'jpeg';
	}
	if ( mime.includes( 'png' ) ) {
		return 'png';
	}
	if ( mime.includes( 'webp' ) ) {
		return 'webp';
	}
	if ( mime.includes( 'avif' ) ) {
		return 'avif';
	}
	const name = ( file.name || '' ).toLowerCase();
	const m = name.match( /\.([a-z0-9]+)$/ );
	const ext = m ? m[ 1 ] : '';
	if ( ext === 'jpg' || ext === 'jpeg' ) {
		return 'jpeg';
	}
	if ( [ 'png', 'webp', 'avif' ].includes( ext ) ) {
		return ext;
	}
	return 'unknown';
}

/**
 * Human-readable byte size.
 *
 * @param {number} bytes Byte count.
 * @return {string} e.g. "1.2 MB".
 */
export function formatBytes( bytes ) {
	if ( ! bytes && bytes !== 0 ) {
		return '—';
	}
	if ( bytes < 1024 ) {
		return bytes + ' B';
	}
	const units = [ 'KB', 'MB', 'GB' ];
	let value = bytes / 1024;
	let i = 0;
	while ( value >= 1024 && i < units.length - 1 ) {
		value /= 1024;
		i++;
	}
	return value.toFixed( value >= 10 ? 0 : 1 ) + ' ' + units[ i ];
}
