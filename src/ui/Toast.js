/**
 * A brief, fixed-position confirmation toast. Auto-dismisses after ~3.5s.
 */

import { useEffect } from '@wordpress/element';

export default function Toast( { message, onDone } ) {
	useEffect( () => {
		const timer = setTimeout( () => onDone && onDone(), 3500 );
		return () => clearTimeout( timer );
	}, [ message ] ); // eslint-disable-line react-hooks/exhaustive-deps

	if ( ! message ) {
		return null;
	}
	return <div className="ois-toast">{ message }</div>;
}
