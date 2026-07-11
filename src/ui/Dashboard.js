/**
 * Bulk optimization dashboard — savings summary + the "Optimize All" runner.
 */

import { useState, useEffect, useRef, useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { getStats, runQueue } from '../lib/runner.js';
import { formatBytes } from '../lib/formats.js';
import ProgressBar from './ProgressBar.js';

export default function Dashboard() {
	const [ stats, setStats ] = useState( null );
	const [ running, setRunning ] = useState( false );
	const [ progress, setProgress ] = useState( null );
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
		await runQueue( {
			onProgress: ( state ) => setProgress( { ...state } ),
			shouldStop: () => stopRef.current,
		} );
		setRunning( false );
		await loadStats();
	};

	const stop = () => {
		stopRef.current = true;
	};

	if ( ! stats ) {
		return <p className="ois-loading">{ __( 'Loading…', 'onylogy-image-squeeze' ) }</p>;
	}
	if ( stats.error ) {
		return <p className="ois-error">{ __( 'Could not load statistics.', 'onylogy-image-squeeze' ) }</p>;
	}

	const percent = stats.bytes_original > 0
		? Math.round( ( stats.bytes_saved / stats.bytes_original ) * 100 )
		: 0;

	return (
		<div className="ois-dash">
			<div className="ois-cards">
				<div className="ois-card ois-card--hero">
					<span className="ois-card__num">{ formatBytes( stats.bytes_saved ) }</span>
					<span className="ois-card__label">{ __( 'Total saved', 'onylogy-image-squeeze' ) }</span>
					<span className="ois-card__sub">{ percent }% { __( 'smaller', 'onylogy-image-squeeze' ) }</span>
				</div>
				<div className="ois-card">
					<span className="ois-card__num">{ stats.optimized }</span>
					<span className="ois-card__label">{ __( 'Optimized', 'onylogy-image-squeeze' ) }</span>
				</div>
				<div className="ois-card">
					<span className="ois-card__num">{ stats.pending }</span>
					<span className="ois-card__label">{ __( 'Pending', 'onylogy-image-squeeze' ) }</span>
				</div>
				<div className="ois-card">
					<span className="ois-card__num">{ stats.images_total }</span>
					<span className="ois-card__label">{ __( 'Images total', 'onylogy-image-squeeze' ) }</span>
				</div>
			</div>

			{ running && progress && (
				<div className="ois-run">
					<ProgressBar value={ progress.done + progress.failed } max={ progress.total } />
					<div className="ois-run__meta">
						<span>
							{ sprintf(
								/* translators: 1: done, 2: total. */
								__( '%1$d of %2$d done', 'onylogy-image-squeeze' ),
								progress.done + progress.failed,
								progress.total
							) }
							{ progress.failed > 0 &&
								' · ' + sprintf(
									/* translators: %d: failures. */
									__( '%d failed', 'onylogy-image-squeeze' ),
									progress.failed
								) }
						</span>
						<span className="ois-run__saved">
							{ __( 'Saved this run:', 'onylogy-image-squeeze' ) }{ ' ' }
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
								__( 'Optimize all %d images', 'onylogy-image-squeeze' ),
								stats.pending
							)
							: __( 'Everything is optimized 🎉', 'onylogy-image-squeeze' ) }
					</button>
				) : (
					<button type="button" className="button button-hero" onClick={ stop }>
						{ __( 'Stop', 'onylogy-image-squeeze' ) }
					</button>
				) }
				{ running && (
					<p className="ois-dash__note">
						{ __( 'Keep this tab open until it finishes — optimization runs in your browser.', 'onylogy-image-squeeze' ) }
					</p>
				) }
			</div>
		</div>
	);
}
