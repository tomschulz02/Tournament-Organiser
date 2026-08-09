import DivisionBadge from './DivisionBadge';
import { formatResult } from './fixtureUtils';

// One fixture, shared by both states of the Fixtures & Schedule tab. The
// scheduled state is the same fixture better informed, not a different thing, so
// it is the same row with a court chip added rather than a second presentation.
//
// A hybrid of a compact row and a match card: one line on a wide viewport, but
// each field is its own block so it can reflow rather than truncate when the
// space is not there.
//
// `action` is the per-fixture organiser slot. It stays empty for now — score
// entry and round progression are out of scope — but the slot exists so that
// mounting ScoreUpdateModal later is a change to the caller, not to this row.
export default function FixtureRow({ fixture, showDivision = false, court = null, action = null }) {
	const score = formatResult(fixture.result);

	return (
		<li className={`tv-fixture-row tv-fixture-row--${(fixture.status || 'upcoming').toLowerCase()}`}>
			<span className="tv-match-no">#{fixture.match_no ?? '—'}</span>

			<span className="tv-fixture-row-teams">
				<span>{fixture.team1}</span>
				<span className="tv-versus">v</span>
				<span>{fixture.team2}</span>
			</span>

			<span className="tv-fixture-row-meta">
				{court && <span className="tv-court-chip">{court}</span>}
				{showDivision && <DivisionBadge name={fixture.division_name} />}
				{fixture.round && <span className="tv-round-label">{fixture.round}</span>}
			</span>

			<span className={`tv-fixture-row-outcome ${score ? '' : 'tv-fixture-row-outcome--status'}`}>
				{score || fixture.statusLabel}
			</span>

			{action && <span className="tv-fixture-row-action">{action}</span>}
		</li>
	);
}
