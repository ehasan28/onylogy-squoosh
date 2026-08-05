<?php
/**
 * Main plugin bootstrap: loads dependencies and wires up hooks.
 *
 * @package Onylogy_Image_Optimizer
 */

defined( 'ABSPATH' ) || exit;

/**
 * Core singleton.
 */
final class ONYIO_Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var ONYIO_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Settings handler.
	 *
	 * @var ONYIO_Settings
	 */
	public $settings;

	/**
	 * Attachments helper.
	 *
	 * @var ONYIO_Attachments
	 */
	public $attachments;

	/**
	 * Optimizer (storage side).
	 *
	 * @var ONYIO_Optimizer
	 */
	public $optimizer;

	/**
	 * Get the singleton.
	 *
	 * @return ONYIO_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->includes();
		$this->init_services();
		$this->hooks();
	}

	/**
	 * Load class files.
	 */
	private function includes() {
		$inc = ONYIO_DIR . 'includes/';
		require_once $inc . 'class-settings.php';
		require_once $inc . 'class-attachments.php';
		require_once $inc . 'class-optimizer.php';
		require_once $inc . 'class-rest.php';

		if ( is_admin() ) {
			require_once ONYIO_DIR . 'admin/class-admin-page.php';
		}
	}

	/**
	 * Instantiate services.
	 */
	private function init_services() {
		$this->settings    = new ONYIO_Settings();
		$this->attachments = new ONYIO_Attachments();
		$this->optimizer   = new ONYIO_Optimizer( $this->settings, $this->attachments );

		new ONYIO_REST( $this->settings, $this->attachments, $this->optimizer );

		if ( is_admin() ) {
			new ONYIO_Admin_Page( $this->settings, $this->attachments );
		}
	}

	/**
	 * Register global hooks.
	 */
	private function hooks() {
		add_filter( 'plugin_action_links_' . ONYIO_BASENAME, array( $this, 'action_links' ) );
		add_filter( 'media_row_actions', array( $this, 'row_actions' ), 10, 2 );
		add_filter( 'wp_prepare_attachment_for_js', array( $this, 'prepare_for_js' ), 10, 2 );
	}

	/**
	 * Add a link to the workbench on the Plugins list row.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public function action_links( $links ) {
		$url  = admin_url( 'upload.php?page=onylogy-image-optimizer' );
		$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Open', 'onylogy-image-optimizer' ) . '</a>';
		array_unshift( $links, $link );
		return $links;
	}

	/**
	 * Add Optimize / Restore actions to Media Library rows.
	 *
	 * @param array   $actions Existing actions.
	 * @param WP_Post $post    Attachment.
	 * @return array
	 */
	public function row_actions( $actions, $post ) {
		if ( ! wp_attachment_is_image( $post->ID ) || ! current_user_can( 'upload_files' ) ) {
			return $actions;
		}
		if ( $this->attachments->is_pending( $post->ID ) ) {
			$actions['onyio_optimize'] = sprintf(
				'<a href="#" class="onyio-row-optimize" data-id="%d">%s</a>',
				$post->ID,
				esc_html__( 'Optimize', 'onylogy-image-optimizer' )
			);
		} else {
			$actions['onyio_restore'] = sprintf(
				'<a href="#" class="onyio-row-restore" data-id="%d">%s</a>',
				$post->ID,
				esc_html__( 'Restore original', 'onylogy-image-optimizer' )
			);
		}
		return $actions;
	}

	/**
	 * Expose pending/optimized status on each image's JS-side attachment
	 * model, so Grid view (Backbone, no `media_row_actions` hook available)
	 * can render an Optimize/Restore button per thumbnail the same way List
	 * view already does via row_actions() above.
	 *
	 * @param array   $response   Attachment data sent to the browser.
	 * @param WP_Post $attachment Attachment.
	 * @return array
	 */
	public function prepare_for_js( $response, $attachment ) {
		if ( wp_attachment_is_image( $attachment->ID ) ) {
			$response['onyioPending'] = $this->attachments->is_pending( $attachment->ID );
		}
		return $response;
	}

	/**
	 * Activation: seed defaults.
	 */
	public static function activate() {
		require_once ONYIO_DIR . 'includes/class-settings.php';
		if ( false === get_option( ONYIO_Settings::OPTION_KEY ) ) {
			add_option( ONYIO_Settings::OPTION_KEY, ONYIO_Settings::defaults() );
		}
	}

	/**
	 * Deactivation: nothing persistent to remove.
	 */
	public static function deactivate() {}
}
