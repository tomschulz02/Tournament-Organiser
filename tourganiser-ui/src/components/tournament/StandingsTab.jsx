import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import DivisionSelector from './DivisionSelector';
import SectionState from './SectionState';
import BracketView from './BracketView';
import TeamIdentity from './TeamIdentity';
import Icon from '../Icons';
import { canProgress } from './fixtureUtils';
import { nextRoundFixtures } from './nextRound';
import {
	STAGE_GROUPS,
	STAGE_KNOCKOUT,
	STAGE_RANKINGS,
	poolCut,
	recentForm,
	divisionStages,
	defaultStage,
} from './standingsView';
import { fetchRoundProgression } from '../../requests';
import { describeRules, matchPoints, rulesOf } from '../../utils/rankingRules';
import { useHelpTopic } from '../../HelpContext';

const STATUS_LABELS = {
	done: 'Done',
	live: 'In progress',
	ready: 'Ready to start',
	idle: 'Not started',
};

// Standings for one division at a time.
//
// Everything here is rendered as the server computed it. rankGroup has already
// applied the full ranking chain — the division's method, then its tiebreak
// deciders, then seed — and re-sorting in the client would put a second,
// competing definition of the ranking in the codebase, which
// docs/tournament-rules.md exists to prevent.
//
// A "Pts" column appears only when the division ranks by match points. The
// figure is worked out here from the row's scorelines purely for display; the
// order is still the server's. Points for and against are a different thing —
// points scored in play — and always have columns.
//
// Two presentations of the same rows: full tables from 768px, and below that a
// card per pool whose rows expand, so a phone never scrolls sideways. Both are
// rendered and CSS shows one, so switching width loses nothing.
export default function StandingsTab({
	divisions = [],
	selectedDivisionId,
	onSelectDivision,
	canProgressRounds = false,
	onProgressRound,
	tournamentId,
	canExportResults = false,
}) {
	// Which stage the reader asked for, which is not necessarily one the current
	// division has. Resolved against what is actually available during render.
	const [requestedStage, setRequestedStage] = useState(null);
	const [advanced, setAdvanced] = useState(false);

	// The selection lives in View.jsx so an Overview card can set the tab and the
	// division together. Falling back to the first division happens here rather
	// than there, so null keeps meaning "not chosen yet". Computed even with zero
	// divisions — rather than behind the early return below — so activeStage is
	// available to useHelpTopic, which (like every hook) has to run unconditionally.
	const division = divisions.length > 0 ? (divisions.find((entry) => entry.id === selectedDivisionId) ?? divisions[0]) : null;

	// A round with only empty groups is a round whose fixtures have not been
	// generated. It would render as a table with headings and no rows.
	const rounds = division ? (division.standings ?? []).filter((round) =>
		(round.groups ?? []).some((group) => (group.standings ?? []).length > 0),
	) : [];
	const bracketRounds = division?.bracket?.rounds ?? [];
	const rules = rulesOf(division);

	// One column set for the whole division rather than one per group, so two
	// tables sitting above each other have the same columns in the same order
	// even when one group's fixtures happened never to produce a 2-1.
	const outcomeColumns = deriveOutcomeColumns(rounds);

	const finalStandings = division?.finalStandings ?? [];

	// The next round can start. Organiser roles only; the server revalidates and
	// answers 409 either way, so this is presentation, not enforcement.
	const progressReady = Boolean(division && canProgressRounds && onProgressRound && canProgress(division));
	const proposal = useRoundProposal(progressReady ? division.id : null);

	// Derived from the division's structure, so a stage still to come is listed
	// (and disabled) rather than missing: a league has no knockout, and a
	// straight knockout has no tables.
	const stages = divisionStages(division, {
		groups: rounds.length > 0,
		groupsPlayed: rounds.some((round) => round.groups.some((group) => group.standings.some((row) => row.played > 0))),
		knockout: bracketRounds.length > 0,
		rankings: finalStandings.length > 0,
	});

	// Resolved during render rather than corrected in an effect. Switching to a
	// division that has no knockout has to fall back on the spot, and the lint
	// config forbids setState in an effect body in any case.
	const activeStage = stages.some((stage) => stage.id === requestedStage && stage.available)
		? requestedStage
		: defaultStage(stages);
	useHelpTopic(activeStage ? `tournament-standings-${activeStage}` : null);

	if (!division) {
		return (
			<SectionState
				variant="empty"
				title="This tournament has no divisions"
				message="Standings appear once a division has been added."
			/>
		);
	}

	const state = division.state ?? {};

	return (
		<div className="tv-standings">
			<div className="tv-standings-toolbar">
				<DivisionSelector divisions={divisions} selectedId={division.id} onSelect={onSelectDivision} />

				{/* Organiser roles only, and only once some division has a placing
				    decided — the export is the final ranking of every division, not
				    just the one on screen. Presentation, not security. */}
				{canExportResults && tournamentId && divisions.some((item) => (item.finalStandings ?? []).length > 0) && (
					<Link
						to={`/tournaments/view/${tournamentId}/results/final`}
						className="tv-subtle-action"
						target="_blank"
						rel="noopener">
						Export final results
					</Link>
				)}
			</div>

			{/* The division has to be named here. DivisionSelector renders nothing
			    for a single-division tournament, so without this heading the page
			    would never say which division is on screen. */}
			<h2 className="tv-band-heading">{division.name}</h2>

			{/* One stage is not a choice, so it gets no cards. */}
			{stages.length > 1 && (
				<div className="tv-stage-cards" role="tablist" aria-label="Stage">
					{stages.map((stage) => (
						<button
							key={stage.id}
							type="button"
							role="tab"
							aria-selected={stage.id === activeStage}
							disabled={!stage.available}
							className={`tv-stage-card${stage.id === activeStage ? ' tv-stage-card--active' : ''}`}
							onClick={() => setRequestedStage(stage.id)}>
							<span className="tv-stage-card-label">{stage.label}</span>
							<span className={`tv-stage-card-status tv-stage-card-status--${stage.status}`}>
								{STATUS_LABELS[stage.status]}
							</span>
						</button>
					))}
				</div>
			)}

			{stages.every((stage) => !stage.available) && (
				<SectionState
					variant="empty"
					title="No standings for this division yet"
					message="Standings appear once the division's rounds and fixtures have been generated."
				/>
			)}

			<div className={`tv-standings-body${progressReady ? ' tv-standings-body--sided' : ''}`}>
				<div className="tv-standings-main">
					{activeStage === STAGE_GROUPS && (
						<>
							{/* Belongs to the tables alone — the ratios and the set-score
							    breakdown are tiebreakers for the pool tables. Off by
							    default. Phones get the same figures by expanding a row,
							    so the switch is hidden there. */}
							<div className="tv-standings-groups-toolbar">
								<label className="tv-switch">
									<input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
									<span className="tv-switch-track" aria-hidden="true" />
									<span>Advanced statistics</span>
								</label>
							</div>

							{rounds.map((round) => {
								const groups = round.groups.filter((group) => (group.standings ?? []).length > 0);
								// The exact qualifiers only for the round being progressed.
								const proposalIds =
									round.roundIndex === (state.currentRound ?? 0) ? proposal.data?.qualifiers?.map((team) => team.id) : null;
								const cut = poolCut(state, round.roundIndex, round.groups.length, proposalIds);

								return (
									<div key={round.roundIndex} className="tv-standings-round">
										{/* Named only when there is more than one. A single round's
										    name repeats what the stage card already says. */}
										{rounds.length > 1 && <h3 className="tv-standings-round-name">{round.round}</h3>}

										{cut && <CutNote cut={cut} poolCount={round.groups.length} />}

										{groups.map((group) => (
											<StandingsGroup
												key={group.groupIndex}
												group={group}
												advanced={advanced}
												outcomeColumns={outcomeColumns}
												showName={round.groups.length > 1}
												cut={cut}
												fixtures={division.fixtures}
												rules={rules}
											/>
										))}

										<p className="tv-standings-rules">{describeRules(rules)}</p>
									</div>
								);
							})}
						</>
					)}

					{activeStage === STAGE_KNOCKOUT && <BracketView rounds={bracketRounds} />}

					{activeStage === STAGE_RANKINGS && <FinalStandings rows={finalStandings} />}
				</div>

				{progressReady && (
					<NextRoundPreview
						division={division}
						proposal={proposal}
						onStart={() => onProgressRound(division.id)}
					/>
				)}
			</div>
		</div>
	);
}

// The server's proposal for the next round, fetched once per division while it
// is ready to progress. Keyed by division id rather than reset in an effect, so
// switching division shows "loading" on the spot and a late answer for the old
// division is dropped. Polling refreshes the division, not this, so the preview
// is fetched once rather than every 20 seconds.
function useRoundProposal(divisionId) {
	const [entry, setEntry] = useState({ divisionId: null, data: null, error: null });

	useEffect(() => {
		if (!divisionId) return undefined;
		let cancelled = false;

		fetchRoundProgression(divisionId)
			.then((response) => {
				if (!cancelled) setEntry({ divisionId, data: response.data, error: null });
			})
			.catch((err) => {
				if (!cancelled) setEntry({ divisionId, data: null, error: err.message || 'Could not load the next round.' });
			});

		return () => {
			cancelled = true;
		};
	}, [divisionId]);

	if (!divisionId || entry.divisionId !== divisionId) {
		return { loading: Boolean(divisionId), data: null, error: null };
	}

	return { loading: false, data: entry.data, error: entry.error };
}

// What the line under each pool means. The line itself only marks the places
// every pool is guaranteed; best runners-up are ranked across pools, so they are
// said rather than drawn. Once the exact qualifiers are known they are shaded.
function CutNote({ cut, poolCount }) {
	const next = cut.nextRoundName ?? 'the next round';
	const sentences = [];

	if (cut.guaranteed > 0) {
		sentences.push(
			poolCount > 1
				? `The top ${countWord(cut.guaranteed)} in each pool go through to ${next}.`
				: `The top ${countWord(cut.guaranteed)} go through to ${next}.`,
		);
	}

	if (cut.extra > 0) {
		const place = placeWord(cut.guaranteed + 1);
		sentences.push(
			cut.guaranteed > 0
				? cut.extra === 1
					? `So does the best ${place}-placed team across the pools.`
					: `So do the ${countWord(cut.extra)} best ${place}-placed teams across the pools.`
				: `The ${countWord(cut.qualifiers)} best ${place}-placed teams across the pools go through to ${next}.`,
		);
	}

	if (cut.qualified) sentences.push('Shaded teams are through.');

	return <p className="tv-standings-cut-note">{sentences.join(' ')}</p>;
}

// Words for the small numbers a sentence reads better with: "the two best
// third-placed teams" rather than "the best 2 3rd-placed teams".
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const PLACE_WORDS = [null, 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function countWord(n) {
	return COUNT_WORDS[n] ?? String(n);
}

function placeWord(n) {
	if (PLACE_WORDS[n]) return PLACE_WORDS[n];
	const rem100 = n % 100;
	if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
	return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

// Qualifying rows: the exact set when it is known, otherwise the guaranteed
// places. The line sits under the last guaranteed place either way.
function rowMarks(cut, row, index, rowCount) {
	if (!cut) return { qualifies: false, cutAfter: false };

	const qualifies = cut.qualified ? cut.qualified.has(row.id) : index < cut.guaranteed;
	const cutAfter = cut.guaranteed > 0 && index === cut.guaranteed - 1 && index < rowCount - 1;

	return { qualifies, cutAfter };
}

// The set-score columns the advanced view shows, taken from the scorelines the
// division's fixtures actually produced.
//
// Not hard-coded and not assumed to be best-of-three: a round carries no
// match-format key — see docs/division-state.md — so the data is the only thing
// that knows. A best-of-five division yields six columns and a division with no
// completed fixtures yields none, both for the same reason.
function deriveOutcomeColumns(rounds) {
	const keys = new Set();

	rounds.forEach((round) =>
		(round.groups ?? []).forEach((group) =>
			(group.standings ?? []).forEach((row) =>
				Object.keys(row.setOutcomes ?? {}).forEach((key) => keys.add(key)),
			),
		),
	);

	// Best result first: most sets won, then fewest conceded. 2-0, 2-1, 1-2, 0-2.
	return [...keys].sort((a, b) => {
		const [aWon, aLost] = a.split('-').map(Number);
		const [bWon, bLost] = b.split('-').map(Number);

		return bWon - aWon || aLost - bLost;
	});
}

// One group, as a table from 768px and as a card below. A league is a round
// with a single group, which is why there is no separate league presentation.
function StandingsGroup({ group, advanced, outcomeColumns, showName, cut, fixtures, rules }) {
	return (
		<div className="tv-standings-group">
			{showName && <h4 className="tv-standings-group-name">{group.name}</h4>}

			<StandingsTable group={group} advanced={advanced} outcomeColumns={outcomeColumns} cut={cut} rules={rules} />
			<PoolCard group={group} outcomeColumns={outcomeColumns} cut={cut} fixtures={fixtures} rules={rules} />
		</div>
	);
}

function StandingsTable({ group, advanced, outcomeColumns, cut, rules }) {
	const rowCount = group.standings.length;
	// Match points are what the table is ranked on when the division ranks by
	// points, so they get a column of their own, first among the figures.
	const byPoints = rules.method === 'points';

	return (
		// The scroll lives on this wrapper, not the page. Turning the advanced
		// columns on widens the table inside a container whose own width never
		// changes, so nothing outside it moves.
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
						{byPoints && (
							<th scope="col">
								<abbr title="Match points">Pts</abbr>
							</th>
						)}
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
						<th scope="col">
							<abbr title="Points for">PF</abbr>
						</th>
						<th scope="col">
							<abbr title="Points against">PA</abbr>
						</th>
						{advanced && (
							<>
								<th scope="col" className="tv-col-ratio">
									<abbr title="Set ratio">SR</abbr>
								</th>
								<th scope="col" className="tv-col-ratio">
									<abbr title="Point ratio">PR</abbr>
								</th>
								{outcomeColumns.map((key) => (
									<th key={key} scope="col" className="tv-col-outcome">
										<abbr title={`Matches finishing ${key}`}>{key}</abbr>
									</th>
								))}
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{group.standings.map((row, index) => {
						const { qualifies, cutAfter } = rowMarks(cut, row, index, rowCount);

						return (
							<tr
								key={row.id}
								className={`${qualifies ? 'tv-standings-row--through' : ''}${cutAfter ? ' tv-standings-row--cut' : ''}`.trim() || undefined}>
								{/* Position in the array. A standings row carries no rank of
								    its own — being ranked is what the ordering already is. */}
								<td className="tv-col-rank">{index + 1}</td>
								<th scope="row" className="tv-col-team">
									{row.name}
									{qualifies && <span className="tv-visually-hidden"> (through)</span>}
								</th>
								{byPoints && (
									<td>
										<strong>{matchPoints(row, rules.points)}</strong>
									</td>
								)}
								<td>{row.played}</td>
								<td>{row.won}</td>
								<td>{row.lost}</td>
								<td>{row.setsWon}</td>
								<td>{row.setsLost}</td>
								<td>{row.pointsFor}</td>
								<td>{row.pointsAgainst}</td>
								{advanced && (
									<>
										<td className="tv-col-ratio">{formatRatio(row.setsRatio)}</td>
										<td className="tv-col-ratio">{formatRatio(row.pointsRatio)}</td>
										{/* A scoreline this team never produced is a zero, not a
										    blank — the column exists because some other team in
										    the division reached it. */}
										{outcomeColumns.map((key) => (
											<td key={key} className="tv-col-outcome">
												{row.setOutcomes?.[key] ?? 0}
											</td>
										))}
									</>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// The phone presentation: five figures per row, and a tap opens the rest —
// points, ratios, scoreline counts and recent form — under that row. Which rows
// are open is local, so a 20-second refresh keeps them open.
function PoolCard({ group, outcomeColumns, cut, fixtures, rules }) {
	const [open, setOpen] = useState(() => new Set());
	const baseId = useId();
	const rowCount = group.standings.length;

	const toggle = (id) =>
		setOpen((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<div className="tv-pool-card">
			<div className="tv-pool-card-head" aria-hidden="true">
				<span className="tv-pool-card-rank">#</span>
				<span className="tv-pool-card-team">Team</span>
				<span>P</span>
				<span>W–L</span>
				<span>Sets</span>
				<span />
			</div>

			<ol className="tv-pool-card-rows">
				{group.standings.map((row, index) => {
					const { qualifies, cutAfter } = rowMarks(cut, row, index, rowCount);
					const isOpen = open.has(row.id);
					const detailId = `${baseId}-${index}`;

					return (
						<li
							key={row.id}
							className={`tv-pool-card-row${qualifies ? ' tv-pool-card-row--through' : ''}${cutAfter ? ' tv-pool-card-row--cut' : ''}`}>
							<button
								type="button"
								className="tv-pool-card-summary"
								aria-expanded={isOpen}
								aria-controls={detailId}
								aria-label={`${index + 1}. ${row.name}${qualifies ? ', through' : ''}: played ${row.played}, won ${row.won}, lost ${row.lost}, sets ${row.setsWon}–${row.setsLost}`}
								onClick={() => toggle(row.id)}>
								<span className="tv-pool-card-rank">{index + 1}</span>
								<span className="tv-pool-card-team">{row.name}</span>
								<span>{row.played}</span>
								<span>
									{row.won}–{row.lost}
								</span>
								<span>
									{row.setsWon}–{row.setsLost}
								</span>
								<Icon
									name="leftChevron"
									size={16}
									fill="currentColor"
									className={`tv-pool-card-chevron${isOpen ? ' tv-pool-card-chevron--open' : ''}`}
								/>
							</button>

							{isOpen && (
								<dl id={detailId} className="tv-pool-card-detail">
									{rules.method === 'points' && (
										<div>
											<dt>Match points</dt>
											<dd>{matchPoints(row, rules.points)}</dd>
										</div>
									)}
									<div>
										<dt>Points</dt>
										<dd>
											{row.pointsFor}–{row.pointsAgainst}
										</dd>
									</div>
									<div>
										<dt>Set ratio</dt>
										<dd>{formatRatio(row.setsRatio)}</dd>
									</div>
									<div>
										<dt>Point ratio</dt>
										<dd>{formatRatio(row.pointsRatio)}</dd>
									</div>
									{outcomeColumns.map((key) => (
										<div key={key}>
											<dt>{key.replace('-', '–')}</dt>
											<dd>{row.setOutcomes?.[key] ?? 0}</dd>
										</div>
									))}
									<div className="tv-pool-card-form">
										<dt>Form</dt>
										<dd>
											<Form results={recentForm(fixtures, row.id)} />
										</dd>
									</div>
								</dl>
							)}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

function Form({ results }) {
	if (results.length === 0) return <span className="tv-form-empty">No results yet</span>;

	return (
		<span className="tv-form" aria-label={`Last ${results.length}, oldest first: ${results.map((r) => (r === 'W' ? 'won' : 'lost')).join(', ')}`}>
			{results.map((result, index) => (
				<span key={index} className={`tv-form-chip tv-form-chip--${result === 'W' ? 'won' : 'lost'}`} aria-hidden="true">
					{result}
				</span>
			))}
		</span>
	);
}

// Beside the tables on a wide screen, above them on a narrow one: who meets whom
// in the next round on the server's ranking, and the button that opens the
// existing next-round modal, where the organiser can still reorder before it
// starts.
function NextRoundPreview({ division, proposal, onStart }) {
	const rounds = division.state?.rounds ?? [];
	const current = division.state?.currentRound ?? 0;
	const fallbackName = rounds[current + 1]?.name ?? 'next round';
	const data = proposal.data;
	const nextName = data?.nextRoundName ?? fallbackName;
	const eligible = data?.eligibleTeams ?? [];
	const nameFor = (teamId) => (teamId === null ? 'No team' : (eligible.find((team) => team.id === teamId)?.name ?? 'Unknown'));
	const matchups =
		data?.nextRound && data.nextRound.type !== 'roundRobin'
			? nextRoundFixtures(data.nextRound.groups, data.qualifiers.map((team) => team.id), data.nextRound.placement)
			: [];

	return (
		<aside className="tv-next-round" aria-labelledby="tv-next-round-heading">
			<p className="tv-next-round-eyebrow">Next round</p>
			<h3 id="tv-next-round-heading" className="tv-next-round-name">
				{nextName}
			</h3>
			<p className="tv-next-round-sub">
				{data?.roundName ?? rounds[current]?.name ?? 'This round'} is complete.
			</p>

			{proposal.loading && <p className="tv-next-round-note">Working out the matchups…</p>}
			{proposal.error && (
				<p className="tv-next-round-note" role="alert">
					{proposal.error}
				</p>
			)}

			{data?.nextRound?.type === 'roundRobin' && (
				<p className="tv-next-round-note">Every team carries forward to this leg, in ranking order.</p>
			)}

			{matchups.length > 0 && (
				<ul className="tv-next-round-matchups">
					{matchups.map((entry, index) => (
						<li key={index} className="tv-next-round-matchup">
							{entry.type === 'match' ? (
								<>
									<TeamIdentity name={nameFor(entry.team1Id)} size="small" />
									<span className="tv-next-round-vs">vs</span>
									<TeamIdentity name={nameFor(entry.team2Id)} size="small" />
									{entry.label && <span className="tv-next-round-tag">{entry.label}</span>}
								</>
							) : (
								<>
									<TeamIdentity name={nameFor(entry.teamId)} size="small" />
									<span className="tv-next-round-tag">{entry.type === 'bye' ? 'Bye' : 'Awaiting placement match'}</span>
								</>
							)}
						</li>
					))}
				</ul>
			)}

			<button type="button" className="tv-primary-action tv-next-round-start" onClick={onStart}>
				Start {nextName}
			</button>
			<p className="tv-next-round-note">You can reorder or swap teams before it starts.</p>
		</aside>
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

// The division's final placings. rank and note are both server-computed; note
// carries how the placing was reached.
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
