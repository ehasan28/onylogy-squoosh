<?php
/**
 * Server-side file operations for the optimizer. The server NEVER encodes an
 * image — the browser sends already-optimized bytes. This class only:
 *   - flags new uploads as pending (so nothing is missed),
 *   - applies the resize-on-upload threshold via core,
 *   - backs up originals, then REPLACES the attachment's own file in place
 *     (so Media Library, theme, and page builders all serve the optimized /
 *     next-gen file automatically — no separate "sibling" file, no front-end
 *     rewriting needed),
 *   - records savings, and restores from backup.
 *
 * @package Onylogy_Squoosh
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
	 * MIME type for a format key.
	 *
	 * @param string $format jpeg|png|webp|avif.
	 * @return string
	 */
	private function mime_for( $format ) {
		$map = array(
			'jpeg' => 'image/jpeg',
			'png'  => 'image/png',
			'webp' => 'image/webp',
			'avif' => 'image/avif',
			'jxl'  => 'image/jxl',
		);
		return isset( $map[ $format ] ) ? $map[ $format ] : 'application/octet-stream';
	}

	/**
	 * File extension to use for a format, preserving the existing extension
	 * when the format family hasn't actually changed (e.g. don't rename a
	 * .jpeg to .jpg just because we recompressed it).
	 *
	 * @param string $format  jpeg|png|webp|avif|jxl.
	 * @param string $old_ext The file's current extension.
	 * @return string
	 */
	private function ext_for( $format, $old_ext ) {
		$old_ext = strtolower( $old_ext );
		$family  = array(
			'jpeg' => array( 'jpg', 'jpeg' ),
			'png'  => array( 'png' ),
			'webp' => array( 'webp' ),
			'avif' => array( 'avif' ),
			'jxl'  => array( 'jxl' ),
		);
		if ( isset( $family[ $format ] ) && in_array( $old_ext, $family[ $format ], true ) ) {
			return $old_ext;
		}
		$default = array(
			'jpeg' => 'jpg',
			'png'  => 'png',
			'webp' => 'webp',
			'avif' => 'avif',
			'jxl'  => 'jxl',
		);
		return isset( $default[ $format ] ) ? $default[ $format ] : $old_ext;
	}

	/**
	 * Store an optimized file, REPLACING the attachment's own size file (and
	 * its extension/MIME type, if the format changed). Called by the REST
	 * endpoint after validating caps.
	 *
	 * @param int    $attachment_id Attachment ID.
	 * @param string $size          Size key (must exist for this attachment).
	 * @param string $format        'jpeg' | 'png' | 'webp' | 'avif' — the winning format.
	 * @param string $tmp           Absolute path to the uploaded temp file.
	 * @param int    $width         Output width.
	 * @param int    $height        Output height.
	 * @param int    $original_size Reported original byte size.
	 * @return array|WP_Error { saved, newSize } or error.
	 */
	public function store( $attachment_id, $size, $format, $tmp, $width, $height, $original_size ) {
		$paths = $this->attachments->allowed_paths( $attachment_id );
		if ( ! isset( $paths[ $size ] ) ) {
			return new WP_Error( 'ois_bad_size', 'Unknown size for this attachment.', array( 'status' => 400 ) );
		}
		$old_path  = $paths[ $size ];
		$new_bytes = (int) @filesize( $tmp );

		$rec = $this->attachments->record( $attachment_id );

		// One-time backup of every current size file + a full metadata/mime
		// snapshot, taken before any writes so Restore can put everything
		// back exactly as it was.
		if ( $this->settings->get( 'backup' ) && empty( $rec['backed_up'] ) ) {
			$this->snapshot( $attachment_id );
			$rec = $this->attachments->record( $attachment_id );
		}

		$old_ext  = pathinfo( $old_path, PATHINFO_EXTENSION );
		$new_ext  = $this->ext_for( $format, $old_ext );
		$new_path = trailingslashit( dirname( $old_path ) ) . pathinfo( $old_path, PATHINFO_FILENAME ) . '.' . $new_ext;

		if ( ! $this->write_file( $tmp, $new_path ) ) {
			return new WP_Error( 'ois_write', 'Could not write optimized file.', array( 'status' => 500 ) );
		}
		if ( $new_path !== $old_path && file_exists( $old_path ) ) {
			@unlink( $old_path );
		}

		$mime = $this->mime_for( $format );

		if ( 'full' === $size ) {
			update_post_meta( $attachment_id, '_wp_attached_file', _wp_relative_upload_path( $new_path ) );
			wp_update_post( array( 'ID' => $attachment_id, 'post_mime_type' => $mime ) );

			$meta = wp_get_attachment_metadata( $attachment_id );
			if ( ! is_array( $meta ) ) {
				$meta = array();
			}
			$meta['file']     = _wp_relative_upload_path( $new_path );
			$meta['filesize'] = $new_bytes;
			if ( $width > 0 && $height > 0 ) {
				$meta['width']  = $width;
				$meta['height'] = $height;
			}
			wp_update_attachment_metadata( $attachment_id, $meta );
		} else {
			$meta = wp_get_attachment_metadata( $attachment_id );
			if ( is_array( $meta ) && isset( $meta['sizes'][ $size ] ) ) {
				$meta['sizes'][ $size ]['file']      = basename( $new_path );
				$meta['sizes'][ $size ]['mime-type'] = $mime;
				$meta['sizes'][ $size ]['filesize']  = $new_bytes;
				if ( $width > 0 && $height > 0 ) {
					$meta['sizes'][ $size ]['width']  = $width;
					$meta['sizes'][ $size ]['height'] = $height;
				}
				wp_update_attachment_metadata( $attachment_id, $meta );
			}
		}

		if ( ! isset( $rec['files'][ $size ] ) || ! is_array( $rec['files'][ $size ] ) ) {
			$rec['files'][ $size ] = array();
		}
		$rec['files'][ $size ]['o'] = max( isset( $rec['files'][ $size ]['o'] ) ? (int) $rec['files'][ $size ]['o'] : 0, (int) $original_size );
		$rec['files'][ $size ]['n'] = $new_bytes;
		update_post_meta( $attachment_id, OIS_Attachments::META_KEY, $rec );

		return array(
			'saved'   => max( 0, (int) $original_size - $new_bytes ),
			'newSize' => $new_bytes,
		);
	}

	/**
	 * Record the original size of a size file that wasn't replaced (no
	 * candidate beat it), so savings math stays correct.
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
				$orig += (int) $f['o'];
				$opt  += isset( $f['n'] ) ? (int) $f['n'] : (int) $f['o'];
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
	 * Restore an attachment to exactly the state it was in before its first
	 * optimization: original files, original filenames/extensions, original
	 * MIME type and metadata.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	public function restore( $attachment_id ) {
		$rec = $this->attachments->record( $attachment_id );
		$dir = $this->backup_dir( $attachment_id );

		// Delete every CURRENT size file (whatever format/extension it's in now).
		foreach ( $this->attachments->allowed_paths( $attachment_id ) as $path ) {
			if ( file_exists( $path ) ) {
				@unlink( $path );
			}
		}

		// Copy the backups (kept under their original basenames) back into place.
		$full_path  = get_attached_file( $attachment_id );
		$target_dir = trailingslashit( dirname( $full_path ) );
		if ( is_dir( $dir ) ) {
			foreach ( (array) glob( $dir . '*' ) as $backup ) {
				@copy( $backup, $target_dir . basename( $backup ) );
			}
			$this->rrmdir( $dir );
		}

		// Restore MIME type, the attached-file pointer, and the full metadata
		// snapshot (covers filenames, dimensions, and per-size MIME types).
		if ( ! empty( $rec['mime_backup'] ) ) {
			wp_update_post( array( 'ID' => $attachment_id, 'post_mime_type' => $rec['mime_backup'] ) );
		}
		if ( ! empty( $rec['attached_backup'] ) ) {
			update_post_meta( $attachment_id, '_wp_attached_file', $rec['attached_backup'] );
		}
		if ( ! empty( $rec['meta_backup'] ) && is_array( $rec['meta_backup'] ) ) {
			wp_update_attachment_metadata( $attachment_id, $rec['meta_backup'] );
		}

		delete_post_meta( $attachment_id, OIS_Attachments::META_KEY );
		return true;
	}

	/**
	 * Snapshot an attachment's current file layout before the first write:
	 * back up every size file under its original basename, and record the
	 * MIME type / attached-file pointer / full metadata needed to restore it.
	 *
	 * @param int $attachment_id Attachment ID.
	 */
	private function snapshot( $attachment_id ) {
		$rec                     = $this->attachments->record( $attachment_id );
		$rec['backed_up']        = 1;
		$rec['meta_backup']      = wp_get_attachment_metadata( $attachment_id );
		$rec['mime_backup']      = get_post_field( 'post_mime_type', $attachment_id );
		$rec['attached_backup']  = get_post_meta( $attachment_id, '_wp_attached_file', true );
		update_post_meta( $attachment_id, OIS_Attachments::META_KEY, $rec );

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
	 * Move/copy an uploaded temp file to a destination, overwriting.
	 *
	 * @param string $tmp  Source temp path.
	 * @param string $dest Destination path.
	 * @return bool
	 */
	private function write_file( $tmp, $dest ) {
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
