<?php
/**
 * Admin: the Media → Squeeze dashboard, plus enqueuing the auto-on-upload
 * + row-action script on the Media Library / editor screens.
 *
 * @package Onylogy_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin controller.
 */
class OIS_Admin_Page {

	const PAGE_SLUG   = 'onylogy-squeeze';
	const HOOK_SUFFIX = 'media_page_onylogy-squeeze';

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

		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'assets' ) );
	}

	/**
	 * Register the submenu under Media.
	 */
	public function menu() {
		add_submenu_page(
			'upload.php',
			__( 'Onylogy Squeeze', 'onylogy-squeeze' ),
			__( 'Squeeze', 'onylogy-squeeze' ),
			'upload_files',
			self::PAGE_SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * The base config every screen needs.
	 *
	 * @return array
	 */
	private function boot_data() {
		return array(
			'pluginUrl' => esc_url_raw( OIS_URL ),
			'version'   => OIS_VERSION,
			'settings'  => $this->settings->all(),
		);
	}

	/**
	 * Load the manifest for a build entry.
	 *
	 * @param string $entry Entry name (index | auto-upload).
	 * @return array
	 */
	private function asset( $entry ) {
		$file = OIS_DIR . 'build/' . $entry . '.asset.php';
		return file_exists( $file )
			? require $file
			: array( 'dependencies' => array(), 'version' => OIS_VERSION );
	}

	/**
	 * Enqueue assets on the relevant screens.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function assets( $hook ) {
		if ( self::HOOK_SUFFIX === $hook ) {
			$this->enqueue_app();
			return;
		}
		// Auto-optimize on upload + row actions live on the media/editor screens.
		if ( in_array( $hook, array( 'upload.php', 'post.php', 'post-new.php', 'media-new.php' ), true ) ) {
			$this->enqueue_auto();
		}
	}

	/**
	 * Enqueue the full dashboard app.
	 */
	private function enqueue_app() {
		$asset = $this->asset( 'index' );

		wp_enqueue_script( 'ois-app', OIS_URL . 'build/index.js', $asset['dependencies'], $asset['version'], true );
		wp_localize_script( 'ois-app', 'OIS', $this->boot_data() );
		if ( file_exists( OIS_DIR . 'build/index.css' ) ) {
			// Fonts (Bricolage Grotesque + Montserrat) are self-hosted via
			// @font-face inside build/index.css itself — no external request.
			wp_enqueue_style( 'ois-app', OIS_URL . 'build/index.css', array(), $asset['version'] );
		}
		wp_enqueue_style( 'ois-admin', OIS_URL . 'assets/css/admin.css', array(), OIS_VERSION );
	}

	/**
	 * Enqueue the lightweight auto-upload / row-action script.
	 */
	private function enqueue_auto() {
		$asset = $this->asset( 'auto-upload' );
		wp_enqueue_script( 'ois-auto', OIS_URL . 'build/auto-upload.js', $asset['dependencies'], $asset['version'], true );
		wp_localize_script( 'ois-auto', 'OIS', $this->boot_data() );
		if ( file_exists( OIS_DIR . 'build/auto-upload.css' ) ) {
			// Styles the toast and the Grid view Optimize/Restore button —
			// both rendered outside the dashboard shell on this screen.
			wp_enqueue_style( 'ois-auto', OIS_URL . 'build/auto-upload.css', array(), $asset['version'] );
		}
	}

	/**
	 * Render the dashboard page shell (React mounts into #ois-app).
	 */
	public function render() {
		if ( ! current_user_can( 'upload_files' ) ) {
			return;
		}
		echo '<div class="wrap ois-wrap">';
		echo '<h1 class="ois-title">' . esc_html__( 'Onylogy Squeeze', 'onylogy-squeeze' );
		echo ' <a class="ois-badge" href="https://onylogy.com" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Onylogy Studio', 'onylogy-squeeze' ) . '</a></h1>';
		echo '<p class="ois-tagline">' . esc_html__( 'Compress, resize and convert your whole Media Library — all in your browser, no cloud, no per-image cost.', 'onylogy-squeeze' ) . '</p>';
		echo '<div id="ois-app"></div>';
		echo '</div>';
	}
}
