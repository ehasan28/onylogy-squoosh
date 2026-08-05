/**
 * Simple determinate progress bar.
 */

export default function ProgressBar( { value, max } ) {
	const pct = max > 0 ? Math.min( 100, Math.round( ( value / max ) * 100 ) ) : 0;
	return (
		<div className="onyio-progress" role="progressbar" aria-valuenow={ pct } aria-valuemin={ 0 } aria-valuemax={ 100 }>
			<div className="onyio-progress__fill" style={ { width: pct + '%' } } />
			<span className="onyio-progress__label">{ pct }%</span>
		</div>
	);
}
