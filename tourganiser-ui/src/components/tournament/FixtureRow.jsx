import { enteredByLabel, setScores, setsWon } from './fixtureUtils';
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
export default function FixtureRow({
	fixture,
	showDivision = false,
	court = null,
	action = null,
	officials = '',
	divisions = [],
}) {
	const status = (fixture.status || 'upcoming').toLowerCase();
	// Present only for the organiser and the tournament's editors, and only on a
	// fixture someone is recorded as scoring — the server sends nothing otherwise,
	// so there is no empty line to suppress here.
	const enteredBy = enteredByLabel(fixture.enteredBy);
	// A cancelled match was never played. Cancelling stores a single 0-0 set, a
	// convention rather than a score, so it shows no score at all.
	const result = fixture.status === 'CANCELLED' ? null : fixture.result;
	// A live match's last set is still being played and has no winner yet.
	const live = fixture.status === 'LIVE';
	const sets = setsWon(result, { live });
	const scores = setScores(result);

	// The unscheduled state has no court and no officials, so the left column
	// holds two lines rather than three. That is not missing data and gets no
	// placeholder.
	const hasPlace = Boolean(court || showDivision || fixture.round);

	// Only in a multi-division tournament: a faint tint of the division's colour
	// on the whole row, plus its name in the meta line, are what make "Division 1
	// vs Division 2" readable at a glance in a flattened list. A single-division
	// tournament has nothing to tell apart. The tint replaced a coloured dot that
	// was too easy to confuse with the status dot beside it; the row's border
	// takes the division colour too, and a live row keeps both: its pulsing
	// red status dot is what marks it live.
	//
	// `divisions` — the tournament's full division list — is threaded through
	// from the caller so this row's colour never collides with a sibling
	// division's; see divisionColors.js.
	const divisionStyle = showDivision ? divisionColorStyle(fixture.division_id, divisions) : undefined;

	return (
		<li
			className={`tv-fixture-row${divisionStyle ? ' tv-fixture-row--division' : ''} tv-fixture-row--${status}`}
			style={divisionStyle}>
			<div className="tv-fixture-row-meta">
				<span className="tv-fixture-row-status">
					{/* Only a live match gets a dot: a pulsing red one. Upcoming, completed
					    and cancelled read from the row itself (a score, or none), so a dot
					    for them added nothing. The status stays reachable as hidden text
					    on every row, and the dot is hidden from the accessibility tree,
					    so the status is announced exactly once. */}
					{status === 'live' && (
						<span className="tv-status-dot tv-status-dot--live" title={fixture.statusLabel} aria-hidden="true" />
					)}
					<span className="tv-visually-hidden">{fixture.statusLabel}</span>
					<span className="tv-match-no">#{fixture.match_no ?? '—'}</span>
				</span>

				{hasPlace && (
					<span className="tv-fixture-row-place">
						{court && <span className="tv-court-chip">{court}</span>}
						{showDivision && fixture.division_name && (
							<span className="tv-division-inline">{fixture.division_name}</span>
						)}
						{fixture.round && <span className="tv-round-label">{fixture.round}</span>}
					</span>
				)}

				{officials && <span className="tv-fixture-row-officials">Officials: {officials}</span>}
				{enteredBy && <span className="tv-fixture-row-officials">Entered by {enteredBy}</span>}
			</div>

			<div className="tv-fixture-row-teams">
				<TeamLine name={fixture.team1} sets={sets?.[0]} scores={scores?.[0]} opponentScores={scores?.[1]} live={live} />
				<TeamLine name={fixture.team2} sets={sets?.[1]} scores={scores?.[1]} opponentScores={scores?.[0]} live={live} />
			</div>

			{action && <div className="tv-fixture-row-action">{action}</div>}
		</li>
	);
}

// A fragment rather than a wrapper, so the three cells sit directly in the
// teams grid and the sets and per-set scores of the two lines align with each
// other however long the names are.
//
// The per-set scores, then sets won: `Team One 25 25 2` reads as having scored
// 25 and 25 and so won two sets — the same order as the Overview's On court now
// and Recent results (TeamScoreLine in OverviewNow.jsx). A set's score is bold
// for the team that won it; a live match's last set is still being played and
// stays plain. An unplayed fixture has neither, and renders empty cells rather
// than zeroes.
function TeamLine({ name, sets, scores, opponentScores, live = false }) {
	const lastIndex = (scores?.length ?? 0) - 1;

	return (
		<>
			<span className="tv-team-name">{name}</span>
			<span className="tv-team-scores">
				{scores?.map((score, index) => {
					const finished = !(live && index === lastIndex);
					const wonSet = finished && score > (opponentScores?.[index] ?? Infinity);

					return (
						<span key={index} className={wonSet ? 'is-set-won' : undefined}>
							{score}
						</span>
					);
				})}
			</span>
			<span className="tv-team-sets">{sets ?? ''}</span>
		</>
	);
}
