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
	const status = (fixture.status || 'upcoming').toLowerCase();

	// The row's slots are placed into the list's columns by class rather than by
	// order, so a fixture with no court, no division or no score simply leaves
	// that column empty instead of shifting everything after it leftwards.
	return (
		<li className={`tv-fixture-row tv-fixture-row--${status}`}>
			{/* Status is a colour, not a word: it is the least-read text on a row and
			    the most repeated one. The label stays reachable as a tooltip and as
			    hidden text, so nothing depends on being able to tell the colours
			    apart. The dot is hidden from the accessibility tree and the text
			    sits beside it, so the status is announced exactly once — a title on
			    the row or on the dot is announced on top of it, not instead. */}
			<span
				className={`tv-status-dot tv-status-dot--${status}`}
				title={fixture.statusLabel}
				aria-hidden="true"
			/>
			<span className="tv-visually-hidden">{fixture.statusLabel}</span>

			<span className="tv-match-no">#{fixture.match_no ?? '—'}</span>

			<span className="tv-fixture-row-teams">
				<span>{fixture.team1}</span>
				<span className="tv-versus">v</span>
				<span>{fixture.team2}</span>
			</span>

			<span className="tv-fixture-row-meta">
				{court && <span className="tv-court-chip">{court}</span>}
				{showDivision && <DivisionBadge id={fixture.division_id} name={fixture.division_name} />}
				{fixture.round && <span className="tv-round-label">{fixture.round}</span>}
			</span>

			{score && <span className="tv-fixture-row-outcome">{score}</span>}

			{action && <span className="tv-fixture-row-action">{action}</span>}
		</li>
	);
}
