<?php
/**
 * Reads attachments and resolves the concrete on-disk size files (full plus
 * every intermediate thumbnail) that the optimizer works on. Also owns the
 * per-attachment optimization record stored in the `_ois_data` post meta.
 *
 * @package Onylogy_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * Attachment helper.
 */
class OIS_Attachments {

	const META_KEY = '_ois_data';

	/**
	 * Formats we can decode+re-encode. gif/svg are skipped.
	 */
	const OPTIMIZABLE = array( 'jpeg', 'png', 'webp', 'avif' );

	/**
	 * Normalize a file extension to a format key.
	 *
	 * @param string $path File path or name.
	 * @return string Format key or ''.
	 */
	public static function format_of( $path ) {
		$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		if ( 'jpg' === $ext || 'jpeg' === $ext ) {
			return 'jpeg';
		}
		if ( in_array( $ext, array( 'png', 'webp', 'avif' ), true ) ) {
			return $ext;
		}
		return '';
	}

	/**
	 * List every optimizable size file for an attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array<int, array{size:string, path:string, url:string, format:string}>
	 */
	public function size_files( $attachment_id ) {
		$full_path = get_attached_file( $attachment_id );
		if ( ! $full_path || ! file_exists( $full_path ) ) {
			return array();
		}
		$meta    = wp_get_attachment_metadata( $attachment_id );
		$uploads = wp_get_upload_dir();
		$dir     = trailingslashit( dirname( $full_path ) );
		$to_url  = function ( $abs ) use ( $uploads ) {
			return str_replace(
				trailingslashit( $uploads['basedir'] ),
				trailingslashit( $uploads['baseurl'] ),
				$abs
			);
		};

		$files = array();

		$full_format = self::format_of( $full_path );
		if ( in_array( $full_format, self::OPTIMIZABLE, true ) ) {
			$files[] = array(
				'size'   => 'full',
				'path'   => $full_path,
				'url'    => $to_url( $full_path ),
				'format' => $full_format,
			);
		}

		if ( is_array( $meta ) && ! empty( $meta['sizes'] ) ) {
			foreach ( $meta['sizes'] as $size => $info ) {
				if ( empty( $info['file'] ) ) {
					continue;
				}
				$abs    = $dir . $info['file'];
				$format = self::format_of( $abs );
				if ( ! in_array( $format, self::OPTIMIZABLE, true ) || ! file_exists( $abs ) ) {
					continue;
				}
				$files[] = array(
					'size'   => $size,
					'path'   => $abs,
					'url'    => $to_url( $abs ),
					'format' => $format,
				);
			}
		}

		return $files;
	}

	/**
	 * Map of size => absolute path, used to validate write targets.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array<string, string>
	 */
	public function allowed_paths( $attachment_id ) {
		$map = array();
		foreach ( $this->size_files( $attachment_id ) as $f ) {
			$map[ $f['size'] ] = $f['path'];
		}
		return $map;
	}

	/**
	 * Get the optimization record for an attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array
	 */
	public function record( $attachment_id ) {
		$data = get_post_meta( $attachment_id, self::META_KEY, true );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * Whether an attachment still needs optimization.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	public function is_pending( $attachment_id ) {
		$rec = $this->record( $attachment_id );
		return empty( $rec['status'] ) || 'done' !== $rec['status'];
	}

	/**
	 * Query image attachments.
	 *
	 * @param array $args Extra WP_Query args.
	 * @return WP_Query
	 */
	public function query( $args = array() ) {
		return new WP_Query(
			array_merge(
				array(
					'post_type'      => 'attachment',
					'post_status'    => 'inherit',
					'post_mime_type' => array( 'image/jpeg', 'image/png', 'image/webp', 'image/avif' ),
					'posts_per_page' => 20,
					'fields'         => 'ids',
					'orderby'        => 'ID',
					'order'          => 'DESC',
					'no_found_rows'  => false,
				),
				$args
			)
		);
	}

	/**
	 * Aggregate library statistics.
	 *
	 * @return array
	 */
	public function stats() {
		$q     = $this->query( array( 'posts_per_page' => -1, 'no_found_rows' => true ) );
		$total = 0;
		$done  = 0;
		$orig  = 0;
		$opt   = 0;
		$saved = 0;

		foreach ( $q->posts as $id ) {
			$total++;
			$rec = $this->record( $id );
			if ( ! empty( $rec['status'] ) && 'done' === $rec['status'] ) {
				$done++;
				$orig  += isset( $rec['original'] ) ? (int) $rec['original'] : 0;
				$opt   += isset( $rec['optimized'] ) ? (int) $rec['optimized'] : 0;
				$saved += isset( $rec['saved'] ) ? (int) $rec['saved'] : 0;
			}
		}

		return array(
			'images_total'    => $total,
			'optimized'       => $done,
			'pending'         => max( 0, $total - $done ),
			'bytes_original'  => $orig,
			'bytes_optimized' => $opt,
			'bytes_saved'     => $saved,
		);
	}
}
