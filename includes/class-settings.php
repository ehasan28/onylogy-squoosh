<?php
/**
 * Settings storage. All options live under a single option row. Keys match the
 * camelCase names the JS reads, so there is no server/client mapping to keep in
 * sync.
 *
 * @package Onylogy_Image_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * Settings handler.
 */
class OIS_Settings {

	const OPTION_KEY = 'ois_settings';

	/**
	 * Cached settings.
	 *
	 * @var array|null
	 */
	private $cache = null;

	/**
	 * Default settings.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'quality'      => 80,      // JPEG/WebP quality 40-100.
			'webp'         => 1,       // Create & serve WebP.
			'avif'         => 0,       // Create & serve AVIF (slower, opt-in).
			'serve'        => 1,       // Rewrite front-end markup to serve next-gen.
			'autoOnUpload' => 1,       // Optimize new uploads automatically.
			'resizeMax'    => 2560,    // Max full-size dimension in px (0 = off).
			'backup'       => 1,       // Keep restorable backups of originals.
			'flattenColor' => '#ffffff', // Background for transparent -> opaque.
		);
	}

	/**
	 * Get all settings merged with defaults.
	 *
	 * @return array
	 */
	public function all() {
		if ( null === $this->cache ) {
			$stored      = get_option( self::OPTION_KEY, array() );
			$this->cache = wp_parse_args( is_array( $stored ) ? $stored : array(), self::defaults() );
		}
		return $this->cache;
	}

	/**
	 * Get one setting.
	 *
	 * @param string $key     Key.
	 * @param mixed  $default Fallback.
	 * @return mixed
	 */
	public function get( $key, $default = null ) {
		$all = $this->all();
		return array_key_exists( $key, $all ) ? $all[ $key ] : $default;
	}

	/**
	 * Sanitize + persist a partial or full settings update.
	 *
	 * @param array $input Raw incoming values (camelCase keys).
	 * @return array The full, sanitized, stored settings.
	 */
	public function save( $input ) {
		$out = $this->all();
		if ( ! is_array( $input ) ) {
			return $out;
		}

		if ( isset( $input['quality'] ) ) {
			$out['quality'] = max( 40, min( 100, absint( $input['quality'] ) ) );
		}
		foreach ( array( 'webp', 'avif', 'serve', 'autoOnUpload', 'backup' ) as $flag ) {
			if ( array_key_exists( $flag, $input ) ) {
				$out[ $flag ] = ! empty( $input[ $flag ] ) && 'false' !== $input[ $flag ] ? 1 : 0;
			}
		}
		if ( isset( $input['resizeMax'] ) ) {
			$out['resizeMax'] = max( 0, min( 12000, absint( $input['resizeMax'] ) ) );
		}
		if ( isset( $input['flattenColor'] ) ) {
			$color                = sanitize_hex_color( $input['flattenColor'] );
			$out['flattenColor'] = $color ? $color : '#ffffff';
		}

		update_option( self::OPTION_KEY, $out );
		$this->cache = $out;
		return $out;
	}
}
