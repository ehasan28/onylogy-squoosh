/**
 * Format metadata shared between the UI and the worker.
 */

export const FORMATS = {
	jpeg: { label: 'JPEG', mime: 'image/jpeg', ext: 'jpg', alpha: false, lossy: true },
	png: { label: 'PNG', mime: 'image/png', ext: 'png', alpha: true, lossy: false },
	webp: { label: 'WebP', mime: 'image/webp', ext: 'webp', alpha: true, lossy: true },
	avif: { label: 'AVIF', mime: 'image/avif', ext: 'avif', alpha: true, lossy: true },
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
