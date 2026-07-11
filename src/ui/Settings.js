/**
 * Settings panel — reads the localized settings, saves via REST, and updates
 * window.OIS.settings so the runner picks up changes immediately.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';

export default function Settings( { onSaved } ) {
	const initial = ( window.OIS && window.OIS.settings ) || {};
	const [ form, setForm ] = useState( {
		quality: initial.quality ?? 80,
		webp: !! initial.webp,
		avif: !! initial.avif,
		resizeMax: initial.resizeMax ?? 2560,
		backup: initial.backup !== false,
		autoOnUpload: initial.autoOnUpload !== false,
	} );
	const [ status, setStatus ] = useState( '' );

	const set = ( patch ) => setForm( { ...form, ...patch } );

	const save = async () => {
		setStatus( 'saving' );
		try {
			const saved = await apiFetch( { path: '/ois/v1/settings', method: 'POST', data: form } );
			window.OIS.settings = { ...window.OIS.settings, ...saved };
			setStatus( 'saved' );
			if ( onSaved ) {
				onSaved( saved );
			}
			setTimeout( () => setStatus( '' ), 2000 );
		} catch ( e ) {
			setStatus( 'error' );
		}
	};

	return (
		<div className="ois-settings">
			<div className="ois-set-row">
				<label className="ois-set-label">
					{ __( 'Compression quality', 'onylogy-image-squeeze' ) }
					<span className="ois-set-value">{ form.quality }</span>
				</label>
				<input
					type="range"
					min="40"
					max="100"
					value={ form.quality }
					onChange={ ( e ) => set( { quality: parseInt( e.target.value, 10 ) } ) }
				/>
				<p className="ois-set-hint">
					{ __( 'Applies to JPEG and WebP. 80 is a good balance of size and quality.', 'onylogy-image-squeeze' ) }
				</p>
			</div>

			<div className="ois-set-row ois-set-row--check">
				<label>
					<input
						type="checkbox"
						checked={ form.webp }
						onChange={ ( e ) => set( { webp: e.target.checked } ) }
					/>
					{ __( 'Allow converting to WebP', 'onylogy-image-squeeze' ) }
				</label>
				<p className="ois-set-hint">
					{ __( 'When WebP comes out smaller, it replaces the image in your Media Library — so your theme, page builder and everything else serves it automatically. No front-end setup needed.', 'onylogy-image-squeeze' ) }
				</p>
			</div>

			<div className="ois-set-row ois-set-row--check">
				<label>
					<input
						type="checkbox"
						checked={ form.avif }
						onChange={ ( e ) => set( { avif: e.target.checked } ) }
					/>
					{ __( 'Also allow AVIF (slower to encode)', 'onylogy-image-squeeze' ) }
				</label>
			</div>

			<div className="ois-set-row ois-set-row--check">
				<label>
					<input
						type="checkbox"
						checked={ form.autoOnUpload }
						onChange={ ( e ) => set( { autoOnUpload: e.target.checked } ) }
					/>
					{ __( 'Automatically optimize new uploads', 'onylogy-image-squeeze' ) }
				</label>
			</div>

			<div className="ois-set-row">
				<label className="ois-set-label">
					{ __( 'Resize large images to a max width/height (px)', 'onylogy-image-squeeze' ) }
				</label>
				<input
					type="number"
					min="0"
					step="10"
					value={ form.resizeMax }
					onChange={ ( e ) => set( { resizeMax: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) }
				/>
				<p className="ois-set-hint">
					{ __( '0 disables resizing. Never upscales.', 'onylogy-image-squeeze' ) }
				</p>
			</div>

			<div className="ois-set-row ois-set-row--check">
				<label>
					<input
						type="checkbox"
						checked={ form.backup }
						onChange={ ( e ) => set( { backup: e.target.checked } ) }
					/>
					{ __( 'Keep a backup of originals so I can restore', 'onylogy-image-squeeze' ) }
				</label>
				<p className="ois-set-hint">
					{ __( 'Optimizing replaces the file in your Media Library (e.g. photo.png becomes photo.webp). The backup is what lets you undo that — without it, "Restore original" has nothing to restore from.', 'onylogy-image-squeeze' ) }
				</p>
			</div>

			<div className="ois-set-actions">
				<button type="button" className="button button-primary" onClick={ save } disabled={ status === 'saving' }>
					{ status === 'saving' ? __( 'Saving…', 'onylogy-image-squeeze' ) : __( 'Save settings', 'onylogy-image-squeeze' ) }
				</button>
				{ status === 'saved' && <span className="ois-set-ok">{ __( 'Saved', 'onylogy-image-squeeze' ) }</span> }
				{ status === 'error' && <span className="ois-set-err">{ __( 'Could not save', 'onylogy-image-squeeze' ) }</span> }
			</div>
		</div>
	);
}
