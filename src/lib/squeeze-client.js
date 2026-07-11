/**
 * Main-thread client for the squeeze worker. Promise-based; one worker instance
 * shared across all jobs, jobs correlated by id.
 */

let worker = null;
let readyPromise = null;
let seq = 0;
const pending = new Map();

/**
 * Lazily create the worker and wait for it to report ready (WASM base set).
 *
 * @return {Promise<Worker>} The ready worker.
 */
function getWorker() {
	if ( readyPromise ) {
		return readyPromise;
	}

	worker = new Worker( new URL( '../worker/squeeze.worker.js', import.meta.url ) );

	worker.onmessage = ( event ) => {
		const msg = event.data || {};
		if ( msg.type === 'result' || msg.type === 'error' ) {
			const entry = pending.get( msg.id );
			if ( ! entry ) {
				return;
			}
			pending.delete( msg.id );
			if ( msg.type === 'error' ) {
				entry.reject( new Error( msg.message ) );
			} else {
				entry.resolve( msg );
			}
		}
	};

	// build/wasm/ lives next to the enqueued bundle. OIS.pluginUrl is the
	// plugin root; the build dir is a known child.
	const base =
		( typeof self !== 'undefined' && self.OIS && self.OIS.pluginUrl
			? self.OIS.pluginUrl
			: '/' ) + 'build/wasm/';

	readyPromise = new Promise( ( resolve ) => {
		const onReady = ( event ) => {
			if ( event.data && event.data.type === 'ready' ) {
				worker.removeEventListener( 'message', onReady );
				resolve( worker );
			}
		};
		worker.addEventListener( 'message', onReady );
		worker.postMessage( { type: 'init', wasmBase: base } );
	} );

	return readyPromise;
}

/**
 * Optimize a source image into one or more outputs in a single decode pass.
 *
 * @param {Blob}   file    Source image.
 * @param {Object} options { resize:{maxWidth,maxHeight}, bgColor, targets:[{key,format,quality}] }.
 * @return {Promise<Array<{key:string, format:string, buffer:ArrayBuffer, width:number, height:number}>>} Outputs.
 */
export async function optimize( file, options ) {
	const w = await getWorker();
	const id = ++seq;

	const result = await new Promise( ( resolve, reject ) => {
		pending.set( id, { resolve, reject } );
		w.postMessage(
			{
				type: 'optimize',
				id,
				blob: file,
				resize: options.resize || null,
				bgColor: options.bgColor || '#ffffff',
				targets: options.targets,
			}
		);
	} );

	return result.outputs;
}
