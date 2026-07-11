<?php
/**
 * Server-side file operations for the optimizer. The server NEVER encodes an
 * image — the browser sends already-optimized bytes. This class only:
 *   - flags new uploads as pending (so nothing is missed),
 *   - applies the resize-on-upload threshold via core,
 *   - backs up originals, writes optimized bytes / next-gen siblings to disk,
 *   - records savings, and restores from backup.
 *
 * @package Onylogy_Image_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * Optimizer (storage side).
 */
class OIS_Optimizer {

	/**
	 * Settings.
	 *
	 * @var OIS_Settings
	 */
	private $settings;

	/**
	 * Attachments helper.
	 *
	 * @var OIS_Attachments
	 */
	private $attachments;

	/**
	 * Constructor.
	 *
	 * @param OIS_Settings    $settings    Settings.
	 * @param OIS_Attachments $attachments Attachments helper.
	 */
	public function __construct( $settings, $attachments ) {
		$this->settings    = $settings;
		$this->attachments = $attachments;

		add_filter( 'wp_generate_attachment_metadata', array( $this, 'mark_pending' ), 20, 2 );
		add_filter( 'big_image_size_threshold', array( $this, 'resize_threshold' ) );
	}

	/**
	 * Flag every freshly generated attachment as pending optimization.
	 *
	 * @param array $metadata      Attachment metadata.
	 * @param int   $attachment_id Attachment ID.
	 * @return array Unmodified metadata.
	 */
	public function mark_pending( $metadata, $attachment_id ) {
		if ( ! wp_attachment_is_image( $attachment_id ) ) {
			return $metadata;
		}
		$rec = $this->attachments->record( $attachment_id );
		if ( empty( $rec['status'] ) ) {
			update_post_meta( $attachment_id, OIS_Attachments::META_KEY, array( 'status' => 'pending' ) );
		}
		return $metadata;
	}

	/**
	 * Feed the configured max dimension into core's on-upload downscale.
	 *
	 * @param int $threshold Default threshold.
	 * @return int
	 */
	public function resize_threshold( $threshold ) {
		$max = (int) $this->settings->get( 'resizeMax' );
		return $max > 0 ? $max : $threshold;
	}

	/**
	 * Backup directory for an attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return string Absolute path (trailing slash).
	 */
	private function backup_dir( $attachment_id ) {
		$uploads = wp_get_upload_dir();
		return trailingslashit( $uploads['basedir'] ) . 'ois-backups/' . $attachment_id . '/';
	}

	/**
	 * Store an optimized file. Called by the REST endpoint after validating caps.
	 *
	 * @param int    $attachment_id Attachment ID.
	 * @param string $size          Size key (must exist for this attachment).
	 * @param string $kind          'orig' | 'webp' | 'avif'.
	 * @param string $tmp           Absolute path to the uploaded temp file.
	 * @param int    $width         Output width.
	 * @param int    $height        Output height.
	 * @param int    $original_size Reported original byte size.
	 * @return array|WP_Error { saved, newSize } or error.
	 */
	public function store( $attachment_id, $size, $kind, $tmp, $width, $height, $original_size ) {
		$paths = $this->attachments->allowed_paths( $attachment_id );
		if ( ! isset( $paths[ $size ] ) ) {
			return new WP_Error( 'ois_bad_size', 'Unknown size for this attachment.', array( 'status' => 400 ) );
		}
		$target_orig = $paths[ $size ];
		$new_size    = (int) @filesize( $tmp );

		$rec = $this->attachments->record( $attachment_id );

		// One-time backup of every current size file + metadata snapshot.
		if ( $this->settings->get( 'backup' ) && empty( $rec['backed_up'] ) ) {
			$this->backup_all( $attachment_id );
			$rec                 = $this->attachments->record( $attachment_id );
			$rec['backed_up']    = 1;
			$rec['meta_backup']  = wp_get_attachment_metadata( $attachment_id );
		}

		if ( ! isset( $rec['files'][ $size ] ) || ! is_array( $rec['files'][ $size ] ) ) {
			$rec['files'][ $size ] = array();
		}
		$entry      = &$rec['files'][ $size ];
		$entry['o'] = max( isset( $entry['o'] ) ? (int) $entry['o'] : 0, (int) $original_size );

		if ( 'orig' === $kind ) {
			if ( ! $this->write_file( $tmp, $target_orig ) ) {
				return new WP_Error( 'ois_write', 'Could not write optimized file.', array( 'status' => 500 ) );
			}
			$entry['n'] = $new_size;
			$this->refresh_metadata( $attachment_id, $size, $width, $height, $new_size );
		} else {
			// WebP/AVIF sibling: original name + .webp / .avif (EWWW convention).
			$sibling = $target_orig . '.' . ( 'avif' === $kind ? 'avif' : 'webp' );
			if ( ! $this->write_file( $tmp, $sibling ) ) {
				return new WP_Error( 'ois_write', 'Could not write next-gen file.', array( 'status' => 500 ) );
			}
			$entry[ $kind ] = $new_size;
		}
		unset( $entry );

		update_post_meta( $attachment_id, OIS_Attachments::META_KEY, $rec );

		$saved = ( 'orig' === $kind ) ? max( 0, (int) $original_size - $new_size ) : 0;
		return array( 'saved' => $saved, 'newSize' => $new_size );
	}

	/**
	 * Record the original size of a size file whose original format was NOT
	 * replaced (the re-encode wasn't smaller), so savings math stays correct.
	 *
	 * @param int    $attachment_id Attachment ID.
	 * @param string $size          Size key.
	 * @param int    $original_size Original byte size.
	 */
	public function record_original( $attachment_id, $size, $original_size ) {
		$rec = $this->attachments->record( $attachment_id );
		if ( ! isset( $rec['files'][ $size ] ) || ! is_array( $rec['files'][ $size ] ) ) {
			$rec['files'][ $size ] = array();
		}
		$rec['files'][ $size ]['o'] = max(
			isset( $rec['files'][ $size ]['o'] ) ? (int) $rec['files'][ $size ]['o'] : 0,
			(int) $original_size
		);
		update_post_meta( $attachment_id, OIS_Attachments::META_KEY, $rec );
	}

	/**
	 * Finalize an attachment: recompute totals and mark done.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array The record.
	 */
	public function complete( $attachment_id ) {
		$rec  = $this->attachments->record( $attachment_id );
		$orig = 0;
		$opt  = 0;
		if ( ! empty( $rec['files'] ) ) {
			foreach ( $rec['files'] as $f ) {
				if ( ! isset( $f['o'] ) ) {
					continue;
				}
				$o = (int) $f['o'];
				// Best served byte size: recompressed original (or the untouched
				// original if not replaced), then the smaller of any next-gen.
				$best = isset( $f['n'] ) ? (int) $f['n'] : $o;
				if ( isset( $f['webp'] ) && (int) $f['webp'] < $best ) {
					$best = (int) $f['webp'];
				}
				if ( isset( $f['avif'] ) && (int) $f['avif'] < $best ) {
					$best = (int) $f['avif'];
				}
				$orig += $o;
				$opt  += $best;
			}
		}
		$rec['original']  = $orig;
		$rec['optimized'] = $opt;
		$rec['saved']     = max( 0, $orig - $opt );
		$rec['status']    = 'done';
		update_post_meta( $attachment_id, OIS_Attachments::META_KEY, $rec );
		return $rec;
	}

	/**
	 * Restore an attachment's originals and remove next-gen siblings.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	public function restore( $attachment_id ) {
		$rec = $this->attachments->record( $attachment_id );
		$dir = $this->backup_dir( $attachment_id );

		// Remove next-gen siblings for all known size files first.
		foreach ( $this->attachments->allowed_paths( $attachment_id ) as $path ) {
			foreach ( array( '.webp', '.avif' ) as $ext ) {
				if ( file_exists( $path . $ext ) ) {
					@unlink( $path . $ext );
				}
			}
		}

		// Restore metadata snapshot (covers resized dimensions).
		if ( ! empty( $rec['meta_backup'] ) && is_array( $rec['meta_backup'] ) ) {
			wp_update_attachment_metadata( $attachment_id, $rec['meta_backup'] );
		}

		// Copy backup files back to the upload directory.
		$full_path = get_attached_file( $attachment_id );
		$upload_dir = trailingslashit( dirname( $full_path ) );
		if ( is_dir( $dir ) ) {
			foreach ( (array) glob( $dir . '*' ) as $backup ) {
				$name = basename( $backup );
				@copy( $backup, $upload_dir . $name );
			}
			$this->rrmdir( $dir );
		}

		delete_post_meta( $attachment_id, OIS_Attachments::META_KEY );
		return true;
	}

	/**
	 * Back up all current size files (originals) for an attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 */
	private function backup_all( $attachment_id ) {
		$dir = $this->backup_dir( $attachment_id );
		wp_mkdir_p( $dir );
		foreach ( $this->attachments->size_files( $attachment_id ) as $f ) {
			$dest = $dir . basename( $f['path'] );
			if ( ! file_exists( $dest ) ) {
				@copy( $f['path'], $dest );
			}
		}
	}

	/**
	 * After replacing a size file, refresh WordPress metadata (filesize, and
	 * dimensions when the full-size was resized).
	 *
	 * @param int    $attachment_id Attachment ID.
	 * @param string $size          Size key.
	 * @param int    $width         New width.
	 * @param int    $height        New height.
	 * @param int    $new_size      New byte size.
	 */
	private function refresh_metadata( $attachment_id, $size, $width, $height, $new_size ) {
		$meta = wp_get_attachment_metadata( $attachment_id );
		if ( ! is_array( $meta ) ) {
			return;
		}
		if ( 'full' === $size ) {
			if ( $width > 0 && $height > 0 ) {
				$meta['width']  = $width;
				$meta['height'] = $height;
			}
			$meta['filesize'] = $new_size;
		} elseif ( isset( $meta['sizes'][ $size ] ) ) {
			$meta['sizes'][ $size ]['filesize'] = $new_size;
		}
		wp_update_attachment_metadata( $attachment_id, $meta );
	}

	/**
	 * Move/copy an uploaded temp file to a destination, overwriting.
	 *
	 * @param string $tmp  Source temp path.
	 * @param string $dest Destination path.
	 * @return bool
	 */
	private function write_file( $tmp, $dest ) {
		if ( is_uploaded_file( $tmp ) ) {
			// Copy (not move) so the same temp can be reused defensively.
			return (bool) @copy( $tmp, $dest );
		}
		return (bool) @copy( $tmp, $dest );
	}

	/**
	 * Recursively remove a directory.
	 *
	 * @param string $dir Directory.
	 */
	private function rrmdir( $dir ) {
		foreach ( (array) glob( trailingslashit( $dir ) . '*' ) as $file ) {
			is_dir( $file ) ? $this->rrmdir( $file ) : @unlink( $file );
		}
		@rmdir( $dir );
	}
}
