/**
 * Bulk optimization dashboard — savings summary + the "Optimize All" runner.
 */

import { useState, useEffect, useRef, useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { getStats, runQueue } from '../lib/runner.js';
import { formatBytes } from '../lib/formats.js';
import ProgressBar from './ProgressBar.js';
import Toast from './Toast.js';

export default function Dashboard() {
	const [ stats, setStats ] = useState( null );
	const [ running, setRunning ] = useState( false );
	const [ progress, setProgress ] = useState( null );
	const [ toast, setToast ] = useState( '' );
	const stopRef = useRef( false );

	const loadStats = useCallback( async () => {
		try {
			setStats( await getStats() );
		} catch ( e ) {
			setStats( { error: true } );
		}
	}, [] );

	useEffect( () => {
		loadStats();
	}, [ loadStats ] );

	const start = async () => {
		stopRef.current = false;
		setRunning( true );
		setProgress( { done: 0, failed: 0, total: stats ? stats.pending : 0, totalSaved: 0, current: '' } );
		const result = await runQueue( {
			onProgress: ( state ) => setProgress( { ...state } ),
			shouldStop: () => stopRef.current,
		} );
		setRunning( false );
		await loadStats();

		if ( stopRef.current ) {
			setToast( __( 'Stopped', 'onylogy-squeeze' ) );
		} else if ( result.done > 0 ) {
			setToast(
				result.failed > 0
					? sprintf(
						/* translators: 1: optimized count, 2: bytes saved, 3: failed count. */
						__( 'Optimized %1$d images, saved %2$s (%3$d failed)', 'onylogy-squeeze' ),
						result.done,
						formatBytes( result.totalSaved ),
						result.failed
					)
					: sprintf(
						/* translators: 1: optimized count, 2: bytes saved. */
						__( 'Optimized %1$d images, saved %2$s', 'onylogy-squeeze' ),
						result.done,
						formatBytes( result.totalSaved )
					)
			);
		}
	};

	const stop = () => {
		stopRef.current = true;
	};

	if ( ! stats ) {
		return <p className="ois-loading">{ __( 'Loading…', 'onylogy-squeeze' ) }</p>;
	}
	if ( stats.error ) {
		return <p className="ois-error">{ __( 'Could not load statistics.', 'onylogy-squeeze' ) }</p>;
	}

	const percent = stats.bytes_original > 0
		? Math.round( ( stats.bytes_saved / stats.bytes_original ) * 100 )
		: 0;

	return (
		<div className="ois-dash">
			<div className="ois-cards">
				<div className="ois-card ois-card--hero">
					<span className="ois-card__num">{ formatBytes( stats.bytes_saved ) }</span>
					<span className="ois-card__label">{ __( 'Total saved', 'onylogy-squeeze' ) }</span>
					<span className="ois-card__sub">{ percent }% { __( 'smaller', 'onylogy-squeeze' ) }</span>
				</div>
				<div className="ois-card">
					<span className="ois-card__num">{ stats.optimized }</span>
					<span className="ois-card__label">{ __( 'Optimized', 'onylogy-squeeze' ) }</span>
				</div>
				<div className="ois-card">
					<span className="ois-card__num">{ stats.pending }</span>
					<span className="ois-card__label">{ __( 'Pending', 'onylogy-squeeze' ) }</span>
				</div>
				<div className="ois-card">
					<span className="ois-card__num">{ stats.images_total }</span>
					<span className="ois-card__label">{ __( 'Images total', 'onylogy-squeeze' ) }</span>
				</div>
			</div>

			{ running && progress && (
				<div className="ois-run">
					<ProgressBar value={ progress.done + progress.failed } max={ progress.total } />
					<div className="ois-run__meta">
						<span>
							{ sprintf(
								/* translators: 1: done, 2: total. */
								__( '%1$d of %2$d done', 'onylogy-squeeze' ),
								progress.done + progress.failed,
								progress.total
							) }
							{ progress.failed > 0 &&
								' · ' + sprintf(
									/* translators: %d: failures. */
									__( '%d failed', 'onylogy-squeeze' ),
									progress.failed
								) }
						</span>
						<span className="ois-run__saved">
							{ __( 'Saved this run:', 'onylogy-squeeze' ) }{ ' ' }
							<strong>{ formatBytes( progress.totalSaved ) }</strong>
						</span>
					</div>
					{ progress.current && (
						<p className="ois-run__current">{ progress.current }</p>
					) }
				</div>
			) }

			<div className="ois-dash__actions">
				{ ! running ? (
					<button
						type="button"
						className="button button-primary button-hero"
						onClick={ start }
						disabled={ stats.pending === 0 }
					>
						{ stats.pending > 0
							? sprintf(
								/* translators: %d: pending count. */
								__( 'Optimize all %d images', 'onylogy-squeeze' ),
								stats.pending
							)
							: __( 'Everything is optimized 🎉', 'onylogy-squeeze' ) }
					</button>
				) : (
					<button type="button" className="button button-hero" onClick={ stop }>
						{ __( 'Stop', 'onylogy-squeeze' ) }
					</button>
				) }
				{ running && (
					<p className="ois-dash__note">
						{ __( 'Keep this tab open until it finishes — optimization runs in your browser.', 'onylogy-squeeze' ) }
					</p>
				) }
			</div>

			{ toast && <Toast message={ toast } onDone={ () => setToast( '' ) } /> }
		</div>
	);
}
