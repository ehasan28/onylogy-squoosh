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
import './index.css';

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
			showToast( 'Onylogy Squeeze: ' + ( err && err.message ? err.message : 'failed' ) );
		}
	} );
}

/**
 * Grid view: List view gets its Optimize/Restore link for free via PHP's
 * `media_row_actions` filter, but Grid view (and the "Add Media" modal,
 * which renders the same way) is a Backbone view with no such hook — so we
 * decorate the rendered thumbnails ourselves. Status per attachment comes
 * from `oisPending`, added to each attachment's JS model server-side by
 * OIS_Plugin::prepare_for_js() (see includes/class-plugin.php).
 *
 * @param {Element} el One `.attachment` thumbnail element.
 */
function decorateGridAttachment( el ) {
	if ( el.querySelector( '.ois-grid-action' ) ) {
		return;
	}
	const id = parseInt( el.getAttribute( 'data-id' ), 10 );
	if ( ! id ) {
		return;
	}
	const model = window.wp && wp.media && wp.media.attachment ? wp.media.attachment( id ) : null;
	const attrs = model ? model.toJSON() : {};
	if ( 'image' !== attrs.type || ! ( 'oisPending' in attrs ) ) {
		return;
	}
	const preview = el.querySelector( '.attachment-preview' );
	if ( ! preview ) {
		return;
	}
	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.setAttribute( 'data-id', String( id ) );
	btn.className = attrs.oisPending
		? 'ois-grid-action ois-row-optimize'
		: 'ois-grid-action ois-row-restore';
	btn.textContent = attrs.oisPending ? 'Optimize' : 'Restore';
	preview.appendChild( btn );
}

/**
 * Watch the Grid view/modal attachments list for thumbnails as Backbone
 * renders them (initial load, scrolling, and re-filtering all add nodes
 * after this script has already run once).
 */
function watchGrid() {
	const container = document.querySelector( '.attachments-browser .attachments, .media-frame-content .attachments' );
	if ( ! container ) {
		window.setTimeout( watchGrid, 600 );
		return;
	}
	container.querySelectorAll( '.attachment' ).forEach( decorateGridAttachment );
	new MutationObserver( ( mutations ) => {
		mutations.forEach( ( m ) => {
			m.addedNodes.forEach( ( node ) => {
				if ( node.nodeType !== 1 ) {
					return;
				}
				if ( node.classList.contains( 'attachment' ) ) {
					decorateGridAttachment( node );
				}
				node.querySelectorAll( '.attachment' ).forEach( decorateGridAttachment );
			} );
		} );
	} ).observe( container, { childList: true, subtree: true } );
}

hookUploader();
hookRowActions();
watchGrid();
