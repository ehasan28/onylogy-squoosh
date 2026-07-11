<?php
/**
 * Plugin Name:       Onylogy Image Squeeze
 * Plugin URI:        https://github.com/ehasan28/onylogy-image-squeeze
 * Description:        Automatically compress, resize and convert your Media Library to WebP/AVIF at Squoosh-level quality. All processing runs in your browser via WebAssembly — no server image library, no cloud, no per-image cost.
 * Version:           2.0.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            Ehasanul Haque
 * Author URI:        https://onylogy.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       onylogy-image-squeeze
 * Domain Path:       /languages
 *
 * @package Onylogy_Image_Squeeze
 */

// Exit if accessed directly.
defined( 'ABSPATH' ) || exit;

define( 'OIS_VERSION', '2.0.0' );
define( 'OIS_FILE', __FILE__ );
define( 'OIS_DIR', plugin_dir_path( __FILE__ ) );
define( 'OIS_URL', plugin_dir_url( __FILE__ ) );
define( 'OIS_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Load the bootstrap class.
 */
require_once OIS_DIR . 'includes/class-plugin.php';

/**
 * Boot the plugin on plugins_loaded so all of WordPress is available.
 *
 * @return OIS_Plugin
 */
function ois() {
	return OIS_Plugin::instance();
}
add_action( 'plugins_loaded', 'ois' );

// Activation: seed sane defaults without overwriting existing settings.
register_activation_hook( __FILE__, array( 'OIS_Plugin', 'activate' ) );

// Deactivation: nothing persistent to tear down in v1 (no cron, no tables).
register_deactivation_hook( __FILE__, array( 'OIS_Plugin', 'deactivate' ) );
