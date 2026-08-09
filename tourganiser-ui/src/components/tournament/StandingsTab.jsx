import { useState } from 'react';
import DivisionSelector from './DivisionSelector';
import SectionState from './SectionState';
import BracketView from './BracketView';

const STAGE_GROUPS = 'groups';
const STAGE_KNOCKOUT = 'knockout';

// Standings for one division at a time.
//
// Everything here is rendered as the server computed it. rankGroup has already
// applied the full ranking chain — matches won, then set ratio, then point
// ratio, then head-to-head, then seed — and re-sorting in the client would put a
// second, competing definition of the ranking in the codebase, which
// docs/tournament-rules.md exists to prevent.
//
// There is no points column. Tourganiser ranks by matches won; no points system
// exists to have a column for.
export default function StandingsTab({ divisions = [], selectedDivisionId, onSelectDivision }) {
	// Which stage the reader asked for, which is not necessarily one the current
	// division has. Resolved against what is actually available during render.
	const [requestedStage, setRequestedStage] = useState(null);
	const [advanced, setAdvanced] = useState(false);

	if (divisions.length === 0) {
		return (
			<SectionState
				variant="empty"
				title="This tournament has no divisions"
				message="Standings appear once a division has been added."
			/>
		);
	}

	// The selection lives in View.jsx so an Overview card can set the tab and the
	// division together. Falling back to the first division happens here rather
	// than there, so null keeps meaning "not chosen yet".
	const division = divisions.find((entry) => entry.id === selectedDivisionId) ?? divisions[0];

	// A round with only empty groups is a round whose fixtures have not been
	// generated. It would render as a table with headings and no rows.
	const rounds = (division.standings ?? []).filter((round) =>
		(round.groups ?? []).some((group) => (group.standings ?? []).length > 0),
	);
	const bracketRounds = division.bracket?.rounds ?? [];

	// Derived from the division, never a hard-coded pair: a league has no
	// knockout, and a straight knockout has no tables.
	const stages = [];
	if (rounds.length > 0) stages.push({ id: STAGE_GROUPS, label: 'Pool / League' });
	if (bracketRounds.length > 0) stages.push({ id: STAGE_KNOCKOUT, label: 'Knockout' });

	// Resolved during render rather than corrected in an effect. Switching to a
	// division that has no knockout has to fall back on the spot, and the lint
	// config forbids setState in an effect body in any case.
	const activeStage = stages.some((stage) => stage.id === requestedStage) ? requestedStage : stages[0]?.id;

	const finalStandings = division.finalStandings ?? [];

	return (
		<div className="tv-standings">
			<div className="tv-standings-toolbar">
				<DivisionSelector divisions={divisions} selectedId={division.id} onSelect={onSelectDivision} />

				{/* Off by default. Set and point ratio are the tiebreakers rather than
				    the story, and seven columns already fill a phone. */}
				{activeStage === STAGE_GROUPS && (
					<label className="tv-advanced-toggle">
						<input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
						<span>Advanced statistics</span>
					</label>
				)}
			</div>

			{/* The division has to be named here. DivisionSelector renders nothing
			    for a single-division tournament, so without this heading the page
			    would never say which division is on screen. */}
			<h2 className="tv-band-heading">{division.name}</h2>

			{/* One stage is not a choice, so it gets no tabs. */}
			{stages.length > 1 && (
				<div className="tv-stage-tabs" role="tablist" aria-label="Stage">
					{stages.map((stage) => (
						<button
							key={stage.id}
							type="button"
							role="tab"
							aria-selected={stage.id === activeStage}
							className={`tv-stage-tab ${stage.id === activeStage ? 'active' : ''}`}
							onClick={() => setRequestedStage(stage.id)}>
							{stage.label}
						</button>
					))}
				</div>
			)}

			{stages.length === 0 && (
				<SectionState
					variant="empty"
					title="No standings for this division yet"
					message="Standings appear once the division's rounds and fixtures have been generated."
				/>
			)}

			{activeStage === STAGE_GROUPS && (
				<>
					{/* Above the tables: once a division is decided, its result is the
					    first thing a reader wants. */}
					{finalStandings.length > 0 && <FinalStandings rows={finalStandings} />}

					{rounds.map((round) => (
						<div key={round.roundIndex} className="tv-standings-round">
							{/* Named only when there is more than one. A single round's
							    name repeats what the tab already says. */}
							{rounds.length > 1 && <h3 className="tv-standings-round-name">{round.round}</h3>}

							{round.groups
								.filter((group) => (group.standings ?? []).length > 0)
								.map((group) => (
									<StandingsGroup
										key={group.groupIndex}
										group={group}
										advanced={advanced}
										showName={round.groups.length > 1}
									/>
								))}
						</div>
					))}
				</>
			)}

			{activeStage === STAGE_KNOCKOUT && <BracketView rounds={bracketRounds} />}
		</div>
	);
}

// One table per group. A league is a round with a single group, which is why
// there is no separate league presentation — it is the same table.
function StandingsGroup({ group, advanced, showName }) {
	return (
		<div className="tv-standings-group">
			{showName && <h4 className="tv-standings-group-name">{group.name}</h4>}

			{/* The scroll lives on this wrapper, not the page. Turning the advanced
			    columns on widens the table inside a container whose own width never
			    changes, so nothing outside it moves. */}
			<div className="tv-table-scroll">
				<table className="tv-standings-table">
					<thead>
						<tr>
							<th scope="col" className="tv-col-rank">
								#
							</th>
							<th scope="col" className="tv-col-team">
								Team
							</th>
							<th scope="col">
								<abbr title="Played">P</abbr>
							</th>
							<th scope="col">
								<abbr title="Won">W</abbr>
							</th>
							<th scope="col">
								<abbr title="Lost">L</abbr>
							</th>
							<th scope="col">
								<abbr title="Sets won">SW</abbr>
							</th>
							<th scope="col">
								<abbr title="Sets lost">SL</abbr>
							</th>
							{advanced && (
								<>
									<th scope="col">Set ratio</th>
									<th scope="col">Point ratio</th>
								</>
							)}
						</tr>
					</thead>
					<tbody>
						{group.standings.map((row, index) => (
							<tr key={row.id}>
								{/* Position in the array. A standings row carries no rank of
								    its own — being ranked is what the ordering already is. */}
								<td className="tv-col-rank">{index + 1}</td>
								<th scope="row" className="tv-col-team">
									{row.name}
								</th>
								<td>{row.played}</td>
								<td>{row.won}</td>
								<td>{row.lost}</td>
								<td>{row.setsWon}</td>
								<td>{row.setsLost}</td>
								{advanced && (
									<>
										<td>{formatRatio(row.setsRatio)}</td>
										<td>{formatRatio(row.pointsRatio)}</td>
									</>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// Sets won with none lost is an undefined ratio, not a large one — see
// docs/tournament-rules.md. The server represents it with a Symbol so that two
// undefined ratios compare equal, and JSON.stringify drops symbol-valued
// properties, so it reaches us as a missing key rather than as null. Anything
// that is not a finite number is that case.
function formatRatio(value) {
	return Number.isFinite(value) ? value.toFixed(3) : 'MAX';
}

// Rendered above the tables when the division has finished. rank and note are
// both server-computed; note carries how the placing was reached.
function FinalStandings({ rows }) {
	return (
		<div className="tv-final-standings">
			<h3 className="tv-standings-round-name">Final standings</h3>

			<ol className="tv-final-standings-list">
				{rows.map((row) => (
					<li key={row.team_id ?? row.rank}>
						<span className="tv-final-rank">{row.rank}</span>
						<span className="tv-final-name">{row.name}</span>
						{row.note && <span className="tv-final-note">{row.note}</span>}
					</li>
				))}
			</ol>
		</div>
	);
}
