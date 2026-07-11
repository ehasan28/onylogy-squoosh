<?php
/**
 * REST API (namespace ois/v1). The browser drives everything through here:
 * pull the queue, upload optimized bytes, mark attachments complete, restore,
 * read stats, and read/write settings.
 *
 * @package Onylogy_Image_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * REST controller.
 */
class OIS_REST {

	const NS = 'ois/v1';

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
	 * Optimizer.
	 *
	 * @var OIS_Optimizer
	 */
	private $optimizer;

	/**
	 * Constructor.
	 *
	 * @param OIS_Settings    $settings    Settings.
	 * @param OIS_Attachments $attachments Attachments helper.
	 * @param OIS_Optimizer   $optimizer   Optimizer.
	 */
	public function __construct( $settings, $attachments, $optimizer ) {
		$this->settings    = $settings;
		$this->attachments = $attachments;
		$this->optimizer   = $optimizer;
		add_action( 'rest_api_init', array( $this, 'register' ) );
	}

	/**
	 * Capability gate for every route.
	 *
	 * @return bool
	 */
	public function can() {
		return current_user_can( 'upload_files' );
	}

	/**
	 * Register routes.
	 */
	public function register() {
		$auth = array( $this, 'can' );

		register_rest_route( self::NS, '/queue', array(
			'methods'             => 'GET',
			'permission_callback' => $auth,
			'callback'            => array( $this, 'queue' ),
		) );
		register_rest_route( self::NS, '/item/(?P<id>\d+)', array(
			'methods'             => 'GET',
			'permission_callback' => $auth,
			'callback'            => array( $this, 'item' ),
		) );
		register_rest_route( self::NS, '/store', array(
			'methods'             => 'POST',
			'permission_callback' => $auth,
			'callback'            => array( $this, 'store' ),
		) );
		register_rest_route( self::NS, '/record', array(
			'methods'             => 'POST',
			'permission_callback' => $auth,
			'callback'            => array( $this, 'record' ),
		) );
		register_rest_route( self::NS, '/complete', array(
			'methods'             => 'POST',
			'permission_callback' => $auth,
			'callback'            => array( $this, 'complete' ),
		) );
		register_rest_route( self::NS, '/restore', array(
			'methods'             => 'POST',
			'permission_callback' => $auth,
			'callback'            => array( $this, 'restore' ),
		) );
		register_rest_route( self::NS, '/stats', array(
			'methods'             => 'GET',
			'permission_callback' => $auth,
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
			return new WP_Error( 'ois_bad_id', 'Not an image attachment.', array( 'status' => 400 ) );
		}
		if ( ! in_array( $format, array( 'jpeg', 'png', 'webp', 'avif' ), true ) ) {
			return new WP_Error( 'ois_bad_format', 'Invalid format.', array( 'status' => 400 ) );
		}
		$files = $req->get_file_params();
		if ( empty( $files['file']['tmp_name'] ) ) {
			return new WP_Error( 'ois_no_file', 'No file received.', array( 'status' => 400 ) );
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
