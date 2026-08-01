/**
 * Settings panel — reads the localized settings, saves via REST, and updates
 * window.OIS.settings so the runner picks up changes immediately.
 *
 * Rebuilt with the Onylogy Squeeze design system: format chips (multi-select
 * — this plugin auto-picks whichever enabled format comes out smallest, so
 * more than one can be active at once, unlike the desktop/web app's
 * single-select "convert to this one format" chips) and a resize-preset
 * dropdown, instead of bare checkboxes and a raw number input.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Toast from './Toast.js';

// Single global max-dimension presets (this plugin resizes every future
// upload/optimize to one library-wide ceiling, not per-image) — same values
// as the desktop/web app's resize presets, based on WordPress core's own
// default image sizes.
const RESIZE_PRESETS = [
	{ key: 'off', label: __( 'Off — never resize', 'onylogy-squeeze-wp' ), value: 0 },
	{ key: 'thumbnail', label: __( 'Thumbnail (150px)', 'onylogy-squeeze-wp' ), value: 150 },
	{ key: 'medium', label: __( 'Medium (300px)', 'onylogy-squeeze-wp' ), value: 300 },
	{ key: 'medium_large', label: __( 'Medium Large (768px)', 'onylogy-squeeze-wp' ), value: 768 },
	{ key: 'large', label: __( 'Large (1024px)', 'onylogy-squeeze-wp' ), value: 1024 },
	{ key: 'xlarge', label: __( 'Extra Large (1600px)', 'onylogy-squeeze-wp' ), value: 1600 },
	{ key: 'max', label: __( 'Max (2560px)', 'onylogy-squeeze-wp' ), value: 2560 },
	{ key: 'custom', label: __( 'Custom', 'onylogy-squeeze-wp' ), value: -1 },
];

function presetKeyFor( value ) {
	const found = RESIZE_PRESETS.find( ( p ) => p.value === value );
	return found ? found.key : 'custom';
}

export default function Settings( { onSaved } ) {
	const initial = ( window.OIS && window.OIS.settings ) || {};
	const [ form, setForm ] = useState( {
		quality: initial.quality ?? 80,
		webp: !! initial.webp,
		avif: !! initial.avif,
		avifQuality: initial.avifQuality ?? 55,
		resizeMax: initial.resizeMax ?? 0,
		backup: initial.backup !== false,
		autoOnUpload: initial.autoOnUpload !== false,
	} );
	const [ status, setStatus ] = useState( '' );
	const [ toast, setToast ] = useState( '' );

	const set = ( patch ) => setForm( { ...form, ...patch } );

	const toggleFormat = ( key ) => set( { [ key ]: ! form[ key ] } );

	const save = async () => {
		setStatus( 'saving' );
		try {
			const saved = await apiFetch( { path: '/ois/v1/settings', method: 'POST', data: form } );
			window.OIS.settings = { ...window.OIS.settings, ...saved };
			setStatus( 'saved' );
			setToast( __( 'Settings saved', 'onylogy-squeeze-wp' ) );
			if ( onSaved ) {
				onSaved( saved );
			}
			setTimeout( () => setStatus( '' ), 2000 );
		} catch ( e ) {
			setStatus( 'error' );
			setToast( __( 'Could not save settings', 'onylogy-squeeze-wp' ) );
		}
	};

	const presetKey = presetKeyFor( form.resizeMax );

	return (
		<div className="ois-settings">
			<div className="ois-set-row">
				<label className="ois-set-label">
					{ __( 'Compression quality', 'onylogy-squeeze-wp' ) }
					<span className="ois-set-value">{ form.quality }%</span>
				</label>
				<input
					type="range"
					min="40"
					max="100"
					value={ form.quality }
					onChange={ ( e ) => set( { quality: parseInt( e.target.value, 10 ) } ) }
				/>
				<p className="ois-set-hint">
					{ __( 'Applies to recompressing the image in its own format. 80 is a good balance of size and quality.', 'onylogy-squeeze-wp' ) }
				</p>
			</div>

			<div className="ois-set-row">
				<label className="ois-set-label">{ __( 'Also try these formats', 'onylogy-squeeze-wp' ) }</label>
				<div className="ois-format-chip-row">
					<button
						type="button"
						className={ 'ois-format-chip' + ( form.webp ? ' is-active' : '' ) }
						data-format="webp"
						onClick={ () => toggleFormat( 'webp' ) }
					>
						WebP
					</button>
					<button
						type="button"
						className={ 'ois-format-chip' + ( form.avif ? ' is-active' : '' ) }
						data-format="avif"
						onClick={ () => toggleFormat( 'avif' ) }
					>
						AVIF
					</button>
				</div>
				<p className="ois-set-hint">
					{ __( 'For each image, every enabled format is tried and whichever comes out smallest replaces the file in your Media Library — so your theme, page builder and everything else serves it automatically. No front-end setup needed.', 'onylogy-squeeze-wp' ) }
				</p>

				{ form.avif && (
					<div className="ois-quality-sub">
						<label className="ois-set-label">
							{ __( 'AVIF quality', 'onylogy-squeeze-wp' ) }
							<span className="ois-set-value">{ form.avifQuality }%</span>
						</label>
						<input
							type="range"
							min="1"
							max="100"
							value={ form.avifQuality }
							onChange={ ( e ) => set( { avifQuality: parseInt( e.target.value, 10 ) } ) }
						/>
						<p className="ois-set-hint">{ __( 'AVIF looks right at a lower number than JPEG/WebP — 55 is a good starting point.', 'onylogy-squeeze-wp' ) }</p>
					</div>
				) }
			</div>

			<div className="ois-set-row ois-set-row--check">
				<label>
					<input
						type="checkbox"
						checked={ form.autoOnUpload }
						onChange={ ( e ) => set( { autoOnUpload: e.target.checked } ) }
					/>
					{ __( 'Automatically optimize new uploads', 'onylogy-squeeze-wp' ) }
				</label>
			</div>

			<div className="ois-set-row">
				<label className="ois-set-label">{ __( 'Resize large images to', 'onylogy-squeeze-wp' ) }</label>
				<select
					value={ presetKey }
					onChange={ ( e ) => {
						const preset = RESIZE_PRESETS.find( ( p ) => p.key === e.target.value );
						if ( preset && preset.key !== 'custom' ) {
							set( { resizeMax: preset.value } );
						} else {
							set( { resizeMax: form.resizeMax > 0 ? form.resizeMax : 2560 } );
						}
					} }
				>
					{ RESIZE_PRESETS.map( ( p ) => (
						<option value={ p.key } key={ p.key }>{ p.label }</option>
					) ) }
				</select>
				{ presetKey === 'custom' && (
					<input
						type="number"
						min="0"
						step="10"
						value={ form.resizeMax }
						onChange={ ( e ) => set( { resizeMax: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) }
						style={ { marginTop: '8px' } }
					/>
				) }
				<p className="ois-set-hint">
					{ __( 'Applies to the full-size image only (thumbnails are unaffected). Never upscales.', 'onylogy-squeeze-wp' ) }
				</p>
			</div>

			<div className="ois-set-row ois-set-row--check">
				<label>
					<input
						type="checkbox"
						checked={ form.backup }
						onChange={ ( e ) => set( { backup: e.target.checked } ) }
					/>
					{ __( 'Keep a backup of originals so I can restore', 'onylogy-squeeze-wp' ) }
				</label>
				<p className="ois-set-hint">
					{ __( 'Optimizing replaces the file in your Media Library (e.g. photo.png becomes photo.webp). The backup is what lets you undo that — without it, "Restore original" has nothing to restore from.', 'onylogy-squeeze-wp' ) }
				</p>
			</div>

			<div className="ois-set-actions">
				<button type="button" className="button button-primary" onClick={ save } disabled={ status === 'saving' }>
					{ status === 'saving' ? __( 'Saving…', 'onylogy-squeeze-wp' ) : __( 'Save settings', 'onylogy-squeeze-wp' ) }
				</button>
			</div>

			{ toast && <Toast message={ toast } onDone={ () => setToast( '' ) } /> }
		</div>
	);
}
