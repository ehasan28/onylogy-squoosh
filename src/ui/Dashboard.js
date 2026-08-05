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
			setToast( __( 'Stopped', 'onylogy-image-optimizer' ) );
		} else if ( result.done > 0 ) {
			setToast(
				result.failed > 0
					? sprintf(
						/* translators: 1: optimized count, 2: bytes saved, 3: failed count. */
						__( 'Optimized %1$d images, saved %2$s (%3$d failed)', 'onylogy-image-optimizer' ),
						result.done,
						formatBytes( result.totalSaved ),
						result.failed
					)
					: sprintf(
						/* translators: 1: optimized count, 2: bytes saved. */
						__( 'Optimized %1$d images, saved %2$s', 'onylogy-image-optimizer' ),
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
		return <p className="onyio-loading">{ __( 'Loading…', 'onylogy-image-optimizer' ) }</p>;
	}
	if ( stats.error ) {
		return <p className="onyio-error">{ __( 'Could not load statistics.', 'onylogy-image-optimizer' ) }</p>;
	}

	const percent = stats.bytes_original > 0
		? Math.round( ( stats.bytes_saved / stats.bytes_original ) * 100 )
		: 0;

	return (
		<div className="onyio-dash">
			<div className="onyio-cards">
				<div className="onyio-card onyio-card--hero">
					<span className="onyio-card__num">{ formatBytes( stats.bytes_saved ) }</span>
					<span className="onyio-card__label">{ __( 'Total saved', 'onylogy-image-optimizer' ) }</span>
					<span className="onyio-card__sub">{ percent }% { __( 'smaller', 'onylogy-image-optimizer' ) }</span>
				</div>
				<div className="onyio-card">
					<span className="onyio-card__num">{ stats.optimized }</span>
					<span className="onyio-card__label">{ __( 'Optimized', 'onylogy-image-optimizer' ) }</span>
				</div>
				<div className="onyio-card">
					<span className="onyio-card__num">{ stats.pending }</span>
					<span className="onyio-card__label">{ __( 'Pending', 'onylogy-image-optimizer' ) }</span>
				</div>
				<div className="onyio-card">
					<span className="onyio-card__num">{ stats.images_total }</span>
					<span className="onyio-card__label">{ __( 'Images total', 'onylogy-image-optimizer' ) }</span>
				</div>
			</div>

			{ running && progress && (
				<div className="onyio-run">
					<ProgressBar value={ progress.done + progress.failed } max={ progress.total } />
					<div className="onyio-run__meta">
						<span>
							{ sprintf(
								/* translators: 1: done, 2: total. */
								__( '%1$d of %2$d done', 'onylogy-image-optimizer' ),
								progress.done + progress.failed,
								progress.total
							) }
							{ progress.failed > 0 &&
								' · ' + sprintf(
									/* translators: %d: failures. */
									__( '%d failed', 'onylogy-image-optimizer' ),
									progress.failed
								) }
						</span>
						<span className="onyio-run__saved">
							{ __( 'Saved this run:', 'onylogy-image-optimizer' ) }{ ' ' }
							<strong>{ formatBytes( progress.totalSaved ) }</strong>
						</span>
					</div>
					{ progress.current && (
						<p className="onyio-run__current">{ progress.current }</p>
					) }
				</div>
			) }

			<div className="onyio-dash__actions">
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
								__( 'Optimize all %d images', 'onylogy-image-optimizer' ),
								stats.pending
							)
							: __( 'Everything is optimized 🎉', 'onylogy-image-optimizer' ) }
					</button>
				) : (
					<button type="button" className="button button-hero" onClick={ stop }>
						{ __( 'Stop', 'onylogy-image-optimizer' ) }
					</button>
				) }
				{ running && (
					<p className="onyio-dash__note">
						{ __( 'Keep this tab open until it finishes — optimization runs in your browser.', 'onylogy-image-optimizer' ) }
					</p>
				) }
			</div>

			{ toast && <Toast message={ toast } onDone={ () => setToast( '' ) } /> }
		</div>
	);
}
