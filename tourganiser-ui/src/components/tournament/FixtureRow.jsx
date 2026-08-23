import DivisionBadge from './DivisionBadge';
import { setScores, setsWon } from './fixtureUtils';
import { divisionColorStyle } from '../../utils/divisionColors';

// One fixture, shared by both states of the Fixtures & Schedule tab. The
// scheduled state is the same fixture better informed, not a different thing, so
// it is the same row with a court and officials added rather than a second
// presentation.
//
// A card in three columns: what and where on the left at a fixed width, the
// match itself in the middle taking the rest, and the organiser's action on the
// right. The fixed left column is what aligns the courts, badges and round
// labels down the list — every row's left edge is the same width, so they line
// up by construction rather than by a shared grid.
//
// `action` is the per-fixture organiser slot, supplied by View.jsx and empty for
// everyone else.
export default function FixtureRow({ fixture, showDivision = false, court = null, action = null, officials = '' }) {
	const status = (fixture.status || 'upcoming').toLowerCase();
	const sets = setsWon(fixture.result);
	const scores = setScores(fixture.result);

	// The unscheduled state has no court and no officials, so the left column
	// holds two lines rather than three. That is not missing data and gets no
	// placeholder.
	const hasPlace = Boolean(court || showDivision || fixture.round);

	// Only in a multi-division tournament: the left border echoing the division
	// badge's colour is what makes "Division 1 vs Division 2" readable at a
	// glance in a flattened list. A single-division tournament has nothing to
	// differentiate, and the row keeps its plain border (see the CSS fallback).
	const style = showDivision ? divisionColorStyle(fixture.division_id) : undefined;

	return (
		<li className={`tv-fixture-row tv-fixture-row--${status}`} style={style}>
			<div className="tv-fixture-row-meta">
				<span className="tv-fixture-row-status">
					{/* Status is a colour, not a word: it is the least-read text on a row
					    and the most repeated one. The label stays reachable as a tooltip
					    and as hidden text, so nothing depends on being able to tell the
					    colours apart. The dot is hidden from the accessibility tree and
					    the text sits beside it, so the status is announced exactly once —
					    a title on the row or on the dot is announced on top of it, not
					    instead. */}
					<span
						className={`tv-status-dot tv-status-dot--${status}`}
						title={fixture.statusLabel}
						aria-hidden="true"
					/>
					<span className="tv-visually-hidden">{fixture.statusLabel}</span>
					<span className="tv-match-no">#{fixture.match_no ?? '—'}</span>
				</span>

				{hasPlace && (
					<span className="tv-fixture-row-place">
						{court && <span className="tv-court-chip">{court}</span>}
						{showDivision && <DivisionBadge id={fixture.division_id} name={fixture.division_name} />}
						{fixture.round && <span className="tv-round-label">{fixture.round}</span>}
					</span>
				)}

				{officials && <span className="tv-fixture-row-officials">Officials: {officials}</span>}
			</div>

			<div className="tv-fixture-row-teams">
				<TeamLine name={fixture.team1} sets={sets?.[0]} scores={scores?.[0]} />
				<TeamLine name={fixture.team2} sets={sets?.[1]} scores={scores?.[1]} />
			</div>

			{action && <div className="tv-fixture-row-action">{action}</div>}
		</li>
	);
}

// A fragment rather than a wrapper, so the three cells sit directly in the
// teams grid and the sets and per-set scores of the two lines align with each
// other however long the names are.
//
// Sets won is the prominent figure and the per-set scores are the detail beside
// it: `Team One 2 25 25` reads as two sets won, having scored 25 and 25. An
// unplayed fixture has neither, and renders empty cells rather than zeroes.
function TeamLine({ name, sets, scores }) {
	return (
		<>
			<span className="tv-team-name">{name}</span>
			<span className="tv-team-sets">{sets ?? ''}</span>
			<span className="tv-team-scores">{scores ? scores.join(' ') : ''}</span>
		</>
	);
}
