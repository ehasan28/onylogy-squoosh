<?php
/**
 * Uninstall cleanup.
 *
 * Removes the plugin option and per-attachment optimization records. The
 * optimized image files and any backups are LEFT IN PLACE — deleting them
 * could remove the images your site serves. Use each image's "Restore original"
 * action before uninstalling if you want originals back.
 *
 * @package Onylogy_Image_Optimizer
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'onyio_settings' );
delete_post_meta_by_key( '_onyio_data' );
