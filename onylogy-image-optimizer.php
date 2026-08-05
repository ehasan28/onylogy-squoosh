<?php
/**
 * Plugin Name:       Onylogy Image Optimizer
 * Plugin URI:        https://github.com/ehasan28/onylogy-squeeze-wp
 * Description:        Automatically compress, resize and convert your Media Library to WebP/AVIF at Squoosh-level quality — in place, so every theme and page builder serves the optimized file automatically. All processing runs in your browser via WebAssembly — no server image library, no cloud, no per-image cost.
 * Version:           3.1.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            Ehasanul Haque
 * Author URI:        https://github.com/ehasan28
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       onylogy-image-optimizer
 *
 * @package Onylogy_Image_Optimizer
 */

// Exit if accessed directly.
defined( 'ABSPATH' ) || exit;

define( 'ONYIO_VERSION', '3.1.0' );
define( 'ONYIO_FILE', __FILE__ );
define( 'ONYIO_DIR', plugin_dir_path( __FILE__ ) );
define( 'ONYIO_URL', plugin_dir_url( __FILE__ ) );
define( 'ONYIO_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Load the bootstrap class.
 */
require_once ONYIO_DIR . 'includes/class-plugin.php';

/**
 * Boot the plugin on plugins_loaded so all of WordPress is available.
 *
 * @return ONYIO_Plugin
 */
function onyio() {
	return ONYIO_Plugin::instance();
}
add_action( 'plugins_loaded', 'onyio' );

// Activation: seed sane defaults without overwriting existing settings.
register_activation_hook( __FILE__, array( 'ONYIO_Plugin', 'activate' ) );

// Deactivation: nothing persistent to tear down in v1 (no cron, no tables).
register_deactivation_hook( __FILE__, array( 'ONYIO_Plugin', 'deactivate' ) );
