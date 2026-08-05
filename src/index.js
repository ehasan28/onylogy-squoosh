/**
 * Onylogy Image Optimizer — admin entry point. Mounts the React workbench
 * into the #onyio-app node printed by the PHP admin page.
 */

import { createRoot } from '@wordpress/element';
import App from './app.js';
import './index.css';

function boot() {
	const mount = document.getElementById( 'onyio-app' );
	if ( ! mount ) {
		return;
	}
	createRoot( mount ).render( <App /> );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', boot );
} else {
	boot();
}
