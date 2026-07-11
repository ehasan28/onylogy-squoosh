/**
 * Onylogy Image Squeeze — admin app.
 *
 * A Media Library optimizer: a bulk dashboard (savings summary + one-click
 * "Optimize All") and a settings panel. All compression happens in-browser via
 * the WASM worker; the server only replaces each attachment's own file with
 * the winning result — no separate "sibling" files, no front-end rewriting.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Dashboard from './ui/Dashboard.js';
import Settings from './ui/Settings.js';

export default function App() {
	const [ tab, setTab ] = useState( 'dashboard' );

	return (
		<div className="ois-app">
			<nav className="ois-tabs">
				<button
					type="button"
					className={ 'ois-tab' + ( tab === 'dashboard' ? ' is-active' : '' ) }
					onClick={ () => setTab( 'dashboard' ) }
				>
					{ __( 'Bulk Optimize', 'onylogy-image-squeeze' ) }
				</button>
				<button
					type="button"
					className={ 'ois-tab' + ( tab === 'settings' ? ' is-active' : '' ) }
					onClick={ () => setTab( 'settings' ) }
				>
					{ __( 'Settings', 'onylogy-image-squeeze' ) }
				</button>
			</nav>

			{ tab === 'dashboard' ? <Dashboard /> : <Settings /> }
		</div>
	);
}
