<?php
/**
 * Front-end next-gen delivery. Wraps <img> tags in <picture> with WebP/AVIF
 * <source> entries when the sibling files exist. The browser picks the best
 * format it supports and falls back to the original <img> otherwise.
 *
 * Using <picture> (rather than Accept-header rewriting) keeps this
 * host-independent — it works on nginx, needs no .htaccess, and no Vary header.
 *
 * @package Onylogy_Image_Squeeze
 */

defined( 'ABSPATH' ) || exit;

/**
 * Front-end rewriter.
 */
class OIS_Serve {

	/**
	 * Settings.
	 *
	 * @var OIS_Settings
	 */
	private $settings;

	/**
	 * Cached upload dir info.
	 *
	 * @var array|null
	 */
	private $uploads = null;

	/**
	 * Formats to offer, best first.
	 *
	 * @var array
	 */
	private $formats = array();

	/**
	 * Constructor.
	 *
	 * @param OIS_Settings $settings Settings.
	 */
	public function __construct( $settings ) {
		$this->settings = $settings;

		if ( is_admin() || is_feed() || ! $settings->get( 'serve' ) ) {
			return;
		}
		if ( $settings->get( 'avif' ) ) {
			$this->formats[] = array( 'ext' => 'avif', 'mime' => 'image/avif' );
		}
		if ( $settings->get( 'webp' ) ) {
			$this->formats[] = array( 'ext' => 'webp', 'mime' => 'image/webp' );
		}
		if ( empty( $this->formats ) ) {
			return;
		}

		add_filter( 'wp_content_img_tag', array( $this, 'filter_content_img' ), 20, 1 );
		add_filter( 'wp_get_attachment_image', array( $this, 'filter_attachment_img' ), 20, 1 );
	}

	/**
	 * @param string $html Image HTML.
	 * @return string
	 */
	public function filter_content_img( $html ) {
		return $this->wrap( $html );
	}

	/**
	 * @param string $html Image HTML.
	 * @return string
	 */
	public function filter_attachment_img( $html ) {
		return $this->wrap( $html );
	}

	/**
	 * Wrap an <img> in a <picture> with next-gen sources where available.
	 *
	 * @param string $html Original <img> HTML.
	 * @return string
	 */
	private function wrap( $html ) {
		// Idempotent: skip if there's no <img>, if already wrapped, or if we've
		// already tagged this <img> (content filters can run more than once).
		if ( false === strpos( $html, '<img' )
			|| false !== strpos( $html, '<picture' )
			|| false !== strpos( $html, 'data-ois' ) ) {
			return $html;
		}

		$src    = $this->attr( $html, 'src' );
		$srcset = $this->attr( $html, 'srcset' );
		$sizes  = $this->attr( $html, 'sizes' );
		if ( ! $src && ! $srcset ) {
			return $html;
		}

		$sources = '';
		foreach ( $this->formats as $format ) {
			$source_srcset = $this->build_srcset( $srcset ? $srcset : $src, $format['ext'] );
			if ( ! $source_srcset ) {
				continue; // a sibling was missing — skip this format entirely
			}
			$sources .= '<source type="' . esc_attr( $format['mime'] ) . '" srcset="' . esc_attr( $source_srcset ) . '"';
			if ( $sizes ) {
				$sources .= ' sizes="' . esc_attr( $sizes ) . '"';
			}
			$sources .= ' />';
		}

		if ( ! $sources ) {
			return $html;
		}
		// Tag the <img> so a second content-filter pass won't wrap it again.
		$tagged = preg_replace( '/<img\b/', '<img data-ois="1"', $html, 1 );
		return '<picture>' . $sources . $tagged . '</picture>';
	}

	/**
	 * Rebuild a srcset (or single src) pointing at sibling files. Each candidate
	 * that has a sibling is kept; those without one are skipped (the browser
	 * still has the original <img> as a fallback and picks the nearest webp
	 * candidate). Returns '' only when no candidate has a sibling at all.
	 *
	 * @param string $srcset Original srcset or single URL.
	 * @param string $ext    Sibling extension.
	 * @return string
	 */
	private function build_srcset( $srcset, $ext ) {
		$out = array();
		foreach ( explode( ',', $srcset ) as $part ) {
			$part = trim( $part );
			if ( '' === $part ) {
				continue;
			}
			$bits       = preg_split( '/\s+/', $part, 2 );
			$url        = $bits[0];
			$descriptor = isset( $bits[1] ) ? ' ' . $bits[1] : '';

			$path = $this->url_to_path( $url );
			if ( ! $path || ! file_exists( $path . '.' . $ext ) ) {
				continue; // skip just this size; keep the others
			}
			$out[] = $url . '.' . $ext . $descriptor;
		}
		return implode( ', ', $out );
	}

	/**
	 * Extract an attribute value from an HTML tag.
	 *
	 * @param string $html Tag HTML.
	 * @param string $name Attribute name.
	 * @return string
	 */
	private function attr( $html, $name ) {
		if ( preg_match( '/\s' . preg_quote( $name, '/' ) . '=("|\')(.*?)\1/i', $html, $m ) ) {
			return $m[2];
		}
		return '';
	}

	/**
	 * Map an uploads URL to an absolute path (or '' if not in uploads).
	 *
	 * @param string $url URL.
	 * @return string
	 */
	private function url_to_path( $url ) {
		if ( null === $this->uploads ) {
			$this->uploads = wp_get_upload_dir();
		}
		$baseurl = $this->uploads['baseurl'];
		// Normalize protocol-relative / scheme differences.
		$url = preg_replace( '#^https?:#', '', $url );
		$rel = preg_replace( '#^https?:#', '', $baseurl );
		if ( 0 !== strpos( $url, $rel ) ) {
			return '';
		}
		return $this->uploads['basedir'] . substr( $url, strlen( $rel ) );
	}
}
