import { canProgress } from './fixtureUtils';

// A pointer to Standings, not a second copy of its "Start Next Round" logic.
// Progression is division-scoped (see canProgress), so this doesn't name a
// division — it shows if any can advance, and lets the reader pick one via
// the DivisionSelector already on Standings.
export default function RoundCompleteBanner({ divisions = [], creator = false, onGoToStandings }) {
	if (!creator || !divisions.some(canProgress)) return null;

	return (
		<div className="tv-round-banner" role="status">
			<div className="tv-round-banner-text">
				<p className="tv-round-banner-title">A round is complete</p>
				<p className="tv-round-banner-detail">Start the next round from Standings.</p>
			</div>
			<div className="tv-round-banner-actions">
				<button type="button" className="tv-primary-action" onClick={onGoToStandings}>
					Go to Standings
				</button>
			</div>
		</div>
	);
}
