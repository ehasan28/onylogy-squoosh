<?php
/**
 * Main plugin bootstrap: loads dependencies and wires up hooks.
 *
 * @package Onylogy_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * Core singleton.
 */
final class OIS_Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var OIS_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Settings handler.
	 *
	 * @var OIS_Settings
	 */
	public $settings;

	/**
	 * Attachments helper.
	 *
	 * @var OIS_Attachments
	 */
	public $attachments;

	/**
	 * Optimizer (storage side).
	 *
	 * @var OIS_Optimizer
	 */
	public $optimizer;

	/**
	 * Get the singleton.
	 *
	 * @return OIS_Plugin
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
		$inc = OIS_DIR . 'includes/';
		require_once $inc . 'class-settings.php';
		require_once $inc . 'class-attachments.php';
		require_once $inc . 'class-optimizer.php';
		require_once $inc . 'class-rest.php';

		if ( is_admin() ) {
			require_once OIS_DIR . 'admin/class-admin-page.php';
		}
	}

	/**
	 * Instantiate services.
	 */
	private function init_services() {
		$this->settings    = new OIS_Settings();
		$this->attachments = new OIS_Attachments();
		$this->optimizer   = new OIS_Optimizer( $this->settings, $this->attachments );

		new OIS_REST( $this->settings, $this->attachments, $this->optimizer );

		if ( is_admin() ) {
			new OIS_Admin_Page( $this->settings, $this->attachments );
		}
	}

	/**
	 * Register global hooks.
	 */
	private function hooks() {
		add_filter( 'plugin_action_links_' . OIS_BASENAME, array( $this, 'action_links' ) );
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
		$url  = admin_url( 'upload.php?page=onylogy-squeeze-wp' );
		$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Open', 'onylogy-squeeze-wp' ) . '</a>';
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
			$actions['ois_optimize'] = sprintf(
				'<a href="#" class="ois-row-optimize" data-id="%d">%s</a>',
				$post->ID,
				esc_html__( 'Optimize', 'onylogy-squeeze-wp' )
			);
		} else {
			$actions['ois_restore'] = sprintf(
				'<a href="#" class="ois-row-restore" data-id="%d">%s</a>',
				$post->ID,
				esc_html__( 'Restore original', 'onylogy-squeeze-wp' )
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
			$response['oisPending'] = $this->attachments->is_pending( $attachment->ID );
		}
		return $response;
	}

	/**
	 * Activation: seed defaults.
	 */
	public static function activate() {
		require_once OIS_DIR . 'includes/class-settings.php';
		if ( false === get_option( OIS_Settings::OPTION_KEY ) ) {
			add_option( OIS_Settings::OPTION_KEY, OIS_Settings::defaults() );
		}
	}

	/**
	 * Deactivation: nothing persistent to remove.
	 */
	public static function deactivate() {}
}
