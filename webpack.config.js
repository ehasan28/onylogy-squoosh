/**
 * Extends the default @wordpress/scripts webpack config to copy the @jsquash
 * WebAssembly codec binaries into build/wasm/. The worker locates them there
 * at runtime via each codec's `locateFile`, so webpack never needs to bundle
 * a .wasm itself.
 *
 * The emscripten/wasm-bindgen glue contains `new URL('x.wasm', import.meta.url)`
 * expressions that webpack would otherwise resolve by emitting its own hashed
 * copy of every codec (~7 MB of duplicates). We short-circuit that with an
 * `asset/resource` rule that resolves those URLs to build/wasm/[name] but does
 * NOT emit — CopyPlugin is the single source of the binaries.
 */

const path = require( 'path' );
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const CopyPlugin = require( 'copy-webpack-plugin' );

const CODECS = [
	'node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
	'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
	'node_modules/@jsquash/webp/codec/enc/webp_enc.wasm',
	'node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm',
	'node_modules/@jsquash/avif/codec/enc/avif_enc.wasm',
	'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm',
	'node_modules/@jsquash/jxl/codec/enc/jxl_enc_mt.wasm',
	'node_modules/@jsquash/jxl/codec/enc/jxl_enc_mt_simd.wasm',
	'node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm',
	'node_modules/@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
	'node_modules/@jsquash/resize/lib/hqx/pkg/squooshhqx_bg.wasm',
	'node_modules/@jsquash/resize/lib/magic-kernel/pkg/jsquash_magic_kernel_bg.wasm',
];

module.exports = {
	...defaultConfig,
	entry: {
		index: path.resolve( process.cwd(), 'src/index.js' ),
		'auto-upload': path.resolve( process.cwd(), 'src/auto-upload.js' ),
	},
	module: {
		...defaultConfig.module,
		rules: [
			{
				test: /\.wasm$/,
				type: 'asset/resource',
				generator: {
					emit: false,
					filename: 'wasm/[name][ext]',
				},
			},
			...defaultConfig.module.rules,
		],
	},
	plugins: [
		...defaultConfig.plugins,
		new CopyPlugin( {
			patterns: CODECS.map( ( from ) => ( {
				from,
				to: 'wasm/[name][ext]',
			} ) ),
		} ),
	],
};
