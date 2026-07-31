/**
 * Auto-optimize on upload (browser layer).
 *
 * Loaded on the Media Library / editor screens. Hooks the WordPress uploader so
 * that as soon as an image finishes uploading (and the server has generated its
 * thumbnail sizes), we optimize that one attachment in-browser via the WASM
 * runner. Uploads that arrive without a browser (FTP, imports) are flagged
 * pending server-side and get picked up by the next Bulk run instead.
 */

import apiFetch from '@wordpress/api-fetch';
import { fetchItem, optimizeAttachment } from './lib/runner.js';

// Serialize optimizations so overlapping uploads don't thrash the single worker.
let chain = Promise.resolve();

/**
 * A brief, fixed-position confirmation toast — plain DOM, not a Preact
 * component, since this file runs on every admin screen (not just the
 * Dashboard) and has no other reason to pull in rendering machinery.
 * Visually matches ui/Toast.js (same .ois-toast class from index.css).
 *
 * @param {string} message Text to show.
 */
function showToast( message ) {
	const existing = document.querySelector( '.ois-toast' );
	if ( existing ) {
		existing.remove();
	}
	const el = document.createElement( 'div' );
	el.className = 'ois-toast';
	el.textContent = message;
	document.body.appendChild( el );
	window.setTimeout( () => el.remove(), 3500 );
}

function queueOptimize( attachmentId ) {
	const settings = ( window.OIS && window.OIS.settings ) || {};
	if ( settings.autoOnUpload === false ) {
		return;
	}
	chain = chain
		.then( async () => {
			const item = await fetchItem( attachmentId );
			if ( item ) {
				await optimizeAttachment( item );
			}
		} )
		.catch( () => {} );
}

function extractId( responseText ) {
	try {
		const data = JSON.parse( responseText );
		if ( data && data.data && data.data.id ) {
			return data.data.id; // { success, data: { id } }
		}
		if ( data && data.id ) {
			return data.id;
		}
	} catch ( e ) {
		// ignore
	}
	return null;
}

function hookUploader() {
	const wp = window.wp;
	if ( ! wp || ! wp.Uploader || ! wp.Uploader.prototype ) {
		window.setTimeout( hookUploader, 600 );
		return;
	}
	const proto = wp.Uploader.prototype;
	if ( proto.__oisHooked ) {
		return;
	}
	proto.__oisHooked = true;

	const originalInit = proto.init;
	proto.init = function () {
		if ( originalInit ) {
			originalInit.apply( this, arguments );
		}
		const up = this.uploader;
		if ( up && typeof up.bind === 'function' ) {
			up.bind( 'FileUploaded', function ( uploader, file, response ) {
				const id = extractId( response && response.response );
				if ( id ) {
					queueOptimize( id );
				}
			} );
		}
	};
}

/**
 * Handle the Media Library row actions (Optimize / Restore original).
 */
function hookRowActions() {
	document.addEventListener( 'click', async ( e ) => {
		const opt = e.target.closest( '.ois-row-optimize' );
		const res = e.target.closest( '.ois-row-restore' );
		if ( ! opt && ! res ) {
			return;
		}
		e.preventDefault();
		const link = opt || res;
		const id = parseInt( link.getAttribute( 'data-id' ), 10 );
		if ( ! id ) {
			return;
		}
		const original = link.textContent;
		link.textContent = opt ? 'Optimizing…' : 'Restoring…';
		try {
			if ( opt ) {
				const item = await fetchItem( id );
				if ( item ) {
					await optimizeAttachment( item );
				}
				link.textContent = 'Optimized ✓';
				showToast( 'Image optimized' );
			} else {
				await apiFetch( { path: '/ois/v1/restore', method: 'POST', data: { attachment_id: id } } );
				link.textContent = 'Restored ✓';
				showToast( 'Original restored' );
			}
		} catch ( err ) {
			link.textContent = original;
			showToast( 'Onylogy Squoosh: ' + ( err && err.message ? err.message : 'failed' ) );
		}
	} );
}

hookUploader();
hookRowActions();
