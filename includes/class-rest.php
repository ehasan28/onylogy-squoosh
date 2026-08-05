<?php
/**
 * REST API (namespace onyio/v1). The browser drives everything through here:
 * pull the queue, upload optimized bytes, mark attachments complete, restore,
 * read stats, and read/write settings.
 *
 * @package Onylogy_Image_Optimizer
 */

defined( 'ABSPATH' ) || exit;

/**
 * REST controller.
 */
class ONYIO_REST {

	const NS = 'onyio/v1';

	/**
	 * Settings.
	 *
	 * @var ONYIO_Settings
	 */
	private $settings;

	/**
	 * Attachments helper.
	 *
	 * @var ONYIO_Attachments
	 */
	private $attachments;

	/**
	 * Optimizer.
	 *
	 * @var ONYIO_Optimizer
	 */
	private $optimizer;

	/**
	 * Constructor.
	 *
	 * @param ONYIO_Settings    $settings    Settings.
	 * @param ONYIO_Attachments $attachments Attachments helper.
	 * @param ONYIO_Optimizer   $optimizer   Optimizer.
	 */
	public function __construct( $settings, $attachments, $optimizer ) {
		$this->settings    = $settings;
		$this->attachments = $attachments;
		$this->optimizer   = $optimizer;
		add_action( 'rest_api_init', array( $this, 'register' ) );
	}

	/**
	 * Base capability gate for every route.
	 *
	 * @return bool
	 */
	public function can() {
		return current_user_can( 'upload_files' );
	}

	/**
	 * Gate for routes that read or act on a single attachment: the base
	 * capability plus edit access to that specific attachment, so a user
	 * with only upload_files can't read or modify media they don't own.
	 * The id is read from the route param (id) or a body param
	 * (attachment_id), whichever the route uses.
	 *
	 * @param WP_REST_Request $req Request.
	 * @return bool
	 */
	public function can_edit_attachment( $req ) {
		if ( ! $this->can() ) {
			return false;
		}
		$id = (int) $req->get_param( 'attachment_id' );
		if ( ! $id ) {
			$id = (int) $req->get_param( 'id' );
		}
		return $id > 0 && current_user_can( 'edit_post', $id );
	}

	/**
	 * Gate for routes that expose or affect the whole library rather than a
	 * single attachment (the queue and aggregate stats): require
	 * edit_others_posts so a Contributor/Author with only upload_files can't
	 * enumerate or see totals for attachments that aren't theirs.
	 *
	 * @return bool
	 */
	public function can_manage_library() {
		return $this->can() && current_user_can( 'edit_others_posts' );
	}

	/**
	 * Register routes.
	 */
	public function register() {
		$auth = array( $this, 'can' );

		register_rest_route( self::NS, '/queue', array(
			'methods'             => 'GET',
			'permission_callback' => array( $this, 'can_manage_library' ),
			'callback'            => array( $this, 'queue' ),
		) );
		register_rest_route( self::NS, '/item/(?P<id>\d+)', array(
			'methods'             => 'GET',
			'permission_callback' => array( $this, 'can_edit_attachment' ),
			'callback'            => array( $this, 'item' ),
		) );
		register_rest_route( self::NS, '/store', array(
			'methods'             => 'POST',
			'permission_callback' => array( $this, 'can_edit_attachment' ),
			'callback'            => array( $this, 'store' ),
		) );
		register_rest_route( self::NS, '/record', array(
			'methods'             => 'POST',
			'permission_callback' => array( $this, 'can_edit_attachment' ),
			'callback'            => array( $this, 'record' ),
		) );
		register_rest_route( self::NS, '/complete', array(
			'methods'             => 'POST',
			'permission_callback' => array( $this, 'can_edit_attachment' ),
			'callback'            => array( $this, 'complete' ),
		) );
		register_rest_route( self::NS, '/restore', array(
			'methods'             => 'POST',
			'permission_callback' => array( $this, 'can_edit_attachment' ),
			'callback'            => array( $this, 'restore' ),
		) );
		register_rest_route( self::NS, '/stats', array(
			'methods'             => 'GET',
			'permission_callback' => array( $this, 'can_manage_library' ),
			'callback'            => array( $this, 'stats' ),
		) );
		register_rest_route( self::NS, '/settings', array(
			array(
				'methods'             => 'GET',
				'permission_callback' => $auth,
				'callback'            => array( $this, 'get_settings' ),
			),
			array(
				'methods'             => 'POST',
				'permission_callback' => $auth,
				'callback'            => array( $this, 'save_settings' ),
			),
		) );
	}

	/**
	 * Build the work payload for one attachment. If it has no optimizable
	 * files, mark it complete so it never blocks the queue, and return null.
	 *
	 * @param int $id Attachment ID.
	 * @return array|null
	 */
	private function payload( $id ) {
		$files = $this->attachments->size_files( $id );
		if ( empty( $files ) ) {
			$this->optimizer->complete( $id );
			return null;
		}
		return array(
			'id'    => $id,
			'title' => get_the_title( $id ),
			'files' => array_map(
				function ( $f ) {
					return array(
						'size'   => $f['size'],
						'url'    => $f['url'],
						'format' => $f['format'],
					);
				},
				$files
			),
		);
	}

	/**
	 * GET /queue — up to per_page pending attachments + total pending count.
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response
	 */
	public function queue( $req ) {
		$per_page = min( 20, max( 1, (int) $req->get_param( 'per_page' ) ) );
		$ids      = $this->attachments->query( array( 'posts_per_page' => -1, 'no_found_rows' => true ) )->posts;

		$items = array();
		$total = 0;
		foreach ( $ids as $id ) {
			if ( ! $this->attachments->is_pending( $id ) ) {
				continue;
			}
			$total++;
			if ( count( $items ) < $per_page ) {
				$payload = $this->payload( $id );
				if ( $payload ) {
					$items[] = $payload;
				} else {
					$total--; // was auto-completed (nothing to do)
				}
			}
		}

		return rest_ensure_response( array( 'total' => $total, 'items' => $items ) );
	}

	/**
	 * GET /item/{id} — one attachment's work payload (row action / auto-upload).
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response
	 */
	public function item( $req ) {
		$id = (int) $req['id'];
		if ( ! wp_attachment_is_image( $id ) ) {
			return rest_ensure_response( array( 'id' => $id, 'files' => array() ) );
		}
		$payload = $this->payload( $id );
		return rest_ensure_response( $payload ? $payload : array( 'id' => $id, 'files' => array() ) );
	}

	/**
	 * POST /store — write one optimized file (multipart).
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function store( $req ) {
		$id     = (int) $req->get_param( 'attachment_id' );
		$size   = sanitize_text_field( (string) $req->get_param( 'size' ) );
		$format = sanitize_key( (string) $req->get_param( 'format' ) );

		if ( ! wp_attachment_is_image( $id ) ) {
			return new WP_Error( 'onyio_bad_id', 'Not an image attachment.', array( 'status' => 400 ) );
		}
		if ( ! in_array( $format, array( 'jpeg', 'png', 'webp', 'avif' ), true ) ) {
			return new WP_Error( 'onyio_bad_format', 'Invalid format.', array( 'status' => 400 ) );
		}
		$files = $req->get_file_params();
		if ( empty( $files['file']['tmp_name'] ) ) {
			return new WP_Error( 'onyio_no_file', 'No file received.', array( 'status' => 400 ) );
		}

		$result = $this->optimizer->store(
			$id,
			$size,
			$format,
			$files['file']['tmp_name'],
			(int) $req->get_param( 'width' ),
			(int) $req->get_param( 'height' ),
			(int) $req->get_param( 'original_size' )
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( $result );
	}

	/**
	 * POST /record — note an original size when the format wasn't replaced.
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response
	 */
	public function record( $req ) {
		$id   = (int) $req->get_param( 'attachment_id' );
		$size = sanitize_text_field( (string) $req->get_param( 'size' ) );
		$this->optimizer->record_original( $id, $size, (int) $req->get_param( 'original_size' ) );
		return rest_ensure_response( array( 'ok' => true ) );
	}

	/**
	 * POST /complete — mark an attachment done and recompute totals.
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response
	 */
	public function complete( $req ) {
		$id = (int) $req->get_param( 'attachment_id' );
		return rest_ensure_response( $this->optimizer->complete( $id ) );
	}

	/**
	 * POST /restore — restore originals.
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response
	 */
	public function restore( $req ) {
		$id = (int) $req->get_param( 'attachment_id' );
		$this->optimizer->restore( $id );
		return rest_ensure_response( array( 'ok' => true ) );
	}

	/**
	 * GET /stats.
	 *
	 * @return WP_REST_Response
	 */
	public function stats() {
		return rest_ensure_response( $this->attachments->stats() );
	}

	/**
	 * GET /settings.
	 *
	 * @return WP_REST_Response
	 */
	public function get_settings() {
		return rest_ensure_response( $this->settings->all() );
	}

	/**
	 * POST /settings.
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response
	 */
	public function save_settings( $req ) {
		$params = $req->get_json_params();
		if ( ! is_array( $params ) ) {
			$params = $req->get_body_params();
		}
		return rest_ensure_response( $this->settings->save( $params ) );
	}
}
