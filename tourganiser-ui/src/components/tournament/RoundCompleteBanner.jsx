import { canProgress } from './fixtureUtils';

// A pointer to Standings, not a second copy of its "Start Next Round" logic.
// Progression is division-scoped (see canProgress), so the banner names each
// division that can advance and opens Standings on that division — opening it
// on whichever division happened to sort first sent the organiser to one with
// nothing to progress.
export default function RoundCompleteBanner({ divisions = [], creator = false, onGoToStandings }) {
	const ready = creator ? divisions.filter(canProgress) : [];
	if (ready.length === 0) return null;

	const single = ready.length === 1;

	return (
		<div className="tv-round-banner" role="status">
			<div className="tv-round-banner-text">
				<p className="tv-round-banner-title">
					{single ? `${ready[0].name}: round complete` : 'Rounds complete'}
				</p>
				<p className="tv-round-banner-detail">
					{single
						? 'Start the next round from Standings.'
						: `${ready.map((division) => division.name).join(', ')} can start their next round from Standings.`}
				</p>
			</div>
			<div className="tv-round-banner-actions">
				{ready.map((division) => (
					<button
						key={division.id}
						type="button"
						className="tv-primary-action"
						onClick={() => onGoToStandings(division.id)}>
						{single ? 'Go to Standings' : `${division.name} standings`}
					</button>
				))}
			</div>
		</div>
	);
}
