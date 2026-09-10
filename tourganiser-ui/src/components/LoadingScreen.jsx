import { useEffect, useState } from 'react';
import '../App.css';
import { getLoadingPhrases } from '../loadingPhrases';

// How long each phrase stays on screen before the next one takes over in a
// fullPage rotation. Long enough to read a short line, short enough that a
// multi-second wait (schedule generation, tournament creation) visibly keeps
// talking rather than looking stuck on one sentence.
const ROTATION_MS = 2200;

// One component, two variants, driven by props rather than two competing
// components — see docs/decisions.md.
//
// `fullPage` is today's centred ring (same markup, same `--z-loading`
// stacking layer as before this existed) plus rotating contextual text drawn
// from loadingPhrases.js. `inline` is the button-scoped spinner: visually
// consistent with the ring (same spin animation) but renders no text at all —
// a button has no room for a sentence, and per the underlying decision this
// mirrors ScoreUpdateModal's pre-existing .btn-spinner exactly, so every
// current button-spinner call site (ScoreUpdateModal, TeamsTab, Settings,
// Login) can adopt this without its surrounding CSS changing.
//
// No props (`<LoadingScreen />`) still renders something reasonable — the
// ring plus the fallback phrases — rather than breaking, so an unmigrated
// call site is never worse off than before.
export default function LoadingScreen({ variant = 'fullPage', context } = {}) {
	if (variant === 'inline') {
		return <span className="btn-spinner" aria-hidden="true" />;
	}

	return <FullPageLoading context={context} />;
}

function FullPageLoading({ context }) {
	const phrases = getLoadingPhrases(context);
	const [index, setIndex] = useState(0);

	// Only runs an interval when there is more than one line to rotate
	// through. A loading screen is mounted fresh per wait rather than having
	// its context swapped mid-flight, so there is no need to reset the index
	// on a context change — the modulo wrap keeps it in range regardless.
	useEffect(() => {
		if (phrases.length < 2) return undefined;

		const id = setInterval(() => {
			setIndex((current) => (current + 1) % phrases.length);
		}, ROTATION_MS);

		return () => clearInterval(id);
		// phrases is a fresh array every render (getLoadingPhrases returns a
		// literal), so it is deliberately not a dependency — context is the
		// actual identity that should restart the interval.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [context]);

	return (
		<div className="loading-container">
			<div className="lds-ring-container">
				<div className="lds-ring">
					<div></div>
					<div></div>
					<div></div>
					<div></div>
				</div>
			</div>
			<p className="loading-message" key={phrases[index]}>
				{phrases[index]}
			</p>
		</div>
	);
}
