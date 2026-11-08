import { useState } from 'react';
import DivisionBadge from './DivisionBadge';
import Icon from '../Icons';
import { setsWon, setScores } from './fixtureUtils';
import { getCourtName } from '../../utils/scheduleUtils';
import { divisionColorStyle } from '../../utils/divisionColors';

// The "happening now" sections of the Overview: the status line, the queue of
// things an organiser role has to do, what is on court, what is next, the day
// timeline and division progress. OverviewTab decides which of them a viewer
// gets and in what order; these only render what they are handed.
//
// Every time-based input is computed by scheduleNow.js against one clock read in
// OverviewTab, so all of these agree about what "now" is.

// "Ongoing · Groenkloof Campus · 68 of 142 played". The one line a spectator
// needs before anything else.
export function StatusLine({ tournament, dashboard }) {
	const status = tournament.status || 'Not Started';
	const total = dashboard.totalFixtures ?? 0;
	const played = dashboard.completedFixtureCount ?? 0;

	return (
		<p className="tv-ov-status">
			<span className={`tv-status-pill tv-status-pill--${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
			{tournament.location && (
				<span className="tv-ov-status-part">
					<Icon name="location" size={16} />
					{tournament.location}
				</span>
			)}
			{total > 0 && (
				<span className="tv-ov-status-part">
					<Icon name="progress" size={16} />
					{played} of {total} played
				</span>
			)}
		</p>
	);
}

// What a fixture's card says under its teams. Only completed sets are stored, so
// a live match says which set is under way rather than a running score.
function progressNote(fixture) {
	const sets = Array.isArray(fixture.result) ? fixture.result.length : 0;

	if (fixture.status === 'COMPLETED') return 'Final';
	if (fixture.status === 'CANCELLED') return 'Cancelled';
	if (fixture.status === 'LIVE') return sets > 0 ? `Set ${sets + 1} in progress` : 'No sets entered yet';
	return 'Not started';
}

function scoreLabel(fixture) {
	return fixture.result?.length > 0 ? 'Edit score' : 'Enter score';
}

// One team's line on a court card: name, sets won, then each set's points.
function CourtTeamLine({ name, won, points, leading }) {
	return (
		<div className={`tv-ov-team ${leading ? 'is-leading' : ''}`.trim()}>
			<span className="tv-ov-team-name">{name || 'TBD'}</span>
			<span className="tv-ov-team-sets">{won ?? ''}</span>
			<span className="tv-ov-team-points">{points?.join(' ') ?? ''}</span>
		</div>
	);
}

function CourtCard({ entry, fixture, schedule, divisions, next, canScore, onScore }) {
	// Not shown for a cancelled match: its stored 0-0 is a convention, not a score.
	const showScore = fixture.status !== 'CANCELLED';
	const won = showScore ? setsWon(fixture.result) : null;
	const points = showScore ? setScores(fixture.result) : null;
	const court = entry ? getCourtName(schedule, entry.courtId) : null;

	return (
		<article
			className={`tv-ov-court tv-ov-court--${String(fixture.status || 'UPCOMING').toLowerCase()}`}
			style={divisionColorStyle(fixture.division_id, divisions)}>
			<div className="tv-ov-court-head">
				<span className="tv-ov-court-name">{court ?? (fixture.match_no != null ? `Match ${fixture.match_no}` : 'Match')}</span>
				<DivisionBadge id={fixture.division_id} name={fixture.division_name} divisions={divisions} />
			</div>

			<div className="tv-ov-court-teams">
				<CourtTeamLine name={fixture.team1} won={won?.[0]} points={points?.[0]} leading={won && won[0] > won[1]} />
				<CourtTeamLine name={fixture.team2} won={won?.[1]} points={points?.[1]} leading={won && won[1] > won[0]} />
			</div>

			<div className="tv-ov-court-foot">
				<span className="tv-ov-court-note">{progressNote(fixture)}</span>
				{canScore && (
					<button type="button" className="tv-ov-action" onClick={() => onScore(fixture.id)}>
						{scoreLabel(fixture)}
					</button>
				)}
			</div>

			{next && (
				<p className="tv-ov-court-next">
					<span>Next</span>
					<b>
						{next.team1 || 'TBD'} v {next.team2 || 'TBD'}
					</b>
				</p>
			)}
		</article>
	);
}

// The matches on court. `nextByCourt` (court id → fixture) is passed only to
// organiser roles, whose cards also say what that court plays next.
//
// `collapseAfter` shows that many cards and a button for the rest, so a venue
// with many courts does not bury Up next on a phone. Organiser roles pass none:
// they are running every court.
export function CourtsBand({
	cards,
	schedule,
	divisions,
	nextByCourt = null,
	canScoreFixture,
	onScoreFixture,
	collapseAfter = null,
}) {
	const [expanded, setExpanded] = useState(false);
	const liveCount = cards.filter(({ fixture }) => fixture.status === 'LIVE').length;
	const collapsed = collapseAfter != null && !expanded && cards.length > collapseAfter;
	const shown = collapsed ? cards.slice(0, collapseAfter) : cards;

	return (
		<section className="tv-band tv-ov-band" aria-labelledby="tv-ov-courts">
			<div className="tv-band-header">
				<h2 id="tv-ov-courts" className="tv-band-heading">
					On court now
				</h2>
				{liveCount > 0 && <span className="tv-ov-meta">{liveCount} live</span>}
			</div>

			{cards.length === 0 ? (
				<p className="tv-activity-empty">Nothing is being played right now.</p>
			) : (
				<div className="tv-ov-courts">
					{shown.map(({ entry, fixture }) => (
						<CourtCard
							key={fixture.id}
							entry={entry}
							fixture={fixture}
							schedule={schedule}
							divisions={divisions}
							next={entry && nextByCourt ? nextByCourt.get(entry.courtId) : null}
							canScore={canScoreFixture?.(fixture)}
							onScore={onScoreFixture}
						/>
					))}
				</div>
			)}

			{collapsed && (
				<button type="button" className="tv-ov-more" onClick={() => setExpanded(true)}>
					Show all {cards.length} courts
				</button>
			)}
		</section>
	);
}

// A compact fixture line: court or match number, the teams, division and round.
function FixtureLine({ fixture, lead, divisions, action = null }) {
	return (
		<li className="tv-ov-line">
			<span className="tv-ov-line-lead">{lead}</span>
			<span className="tv-ov-line-body">
				<span className="tv-ov-line-teams">
					{fixture.team1 || 'TBD'} <span className="tv-versus">v</span> {fixture.team2 || 'TBD'}
				</span>
				<span className="tv-ov-line-meta">
					<DivisionBadge id={fixture.division_id} name={fixture.division_name} divisions={divisions} />
					{fixture.round && <span>{fixture.round}</span>}
				</span>
			</span>
			{action}
		</li>
	);
}

// The next slot when there is a schedule; otherwise the backend's own upcoming
// list (already ordered and capped), without the live matches it also carries.
export function UpNextBand({ slot, schedule, upcoming = [], divisions, onOpenFixtures }) {
	const lines = slot
		? slot.matches.map(({ entry, fixture }) => ({ fixture, lead: getCourtName(schedule, entry.courtId) }))
		: upcoming
				.filter((fixture) => fixture.status !== 'LIVE')
				.slice(0, 5)
				.map((fixture) => ({ fixture, lead: fixture.match_no != null ? `#${fixture.match_no}` : '' }));

	return (
		<section className="tv-band tv-ov-band" aria-labelledby="tv-ov-next">
			<div className="tv-band-header">
				<h2 id="tv-ov-next" className="tv-band-heading">
					Up next{slot ? ` · ${slot.startTime}` : ''}
				</h2>
				<button type="button" className="tv-ov-link" onClick={onOpenFixtures}>
					Full schedule
				</button>
			</div>

			{lines.length === 0 ? (
				<p className="tv-activity-empty">Nothing is scheduled to play next.</p>
			) : (
				<ul className="tv-ov-list">
					{lines.map(({ fixture, lead }) => (
						<FixtureLine key={fixture.id} fixture={fixture} lead={lead} divisions={divisions} />
					))}
				</ul>
			)}
		</section>
	);
}

function QueueItem({ count, warn = false, title, detail, children }) {
	return (
		<div className="tv-ov-queue-item">
			<span className={`tv-ov-count ${warn ? 'is-warn' : ''}`.trim()}>{count}</span>
			<div className="tv-ov-queue-text">
				<span className="tv-ov-queue-title">{title}</span>
				{detail && <span className="tv-ov-queue-detail">{detail}</span>}
			</div>
			{children}
		</div>
	);
}

// The organiser roles' to-do list. Each item opens an action that already exists:
// the score dialog, the next-round dialog, scoresheet printing.
export function QueueBand({
	missing = [],
	readyDivisions = [],
	scoresheetSlot = null,
	schedule,
	divisions,
	canScoreFixture,
	onScoreFixture,
	canProgressRounds = false,
	onProgressRound,
	scoresheetTemplateReady = false,
	onPrintScoresheets,
}) {
	const items = missing.length + readyDivisions.length + (scoresheetSlot ? 1 : 0);

	return (
		<section className="tv-band tv-ov-band" aria-labelledby="tv-ov-queue">
			<div className="tv-band-header">
				<h2 id="tv-ov-queue" className="tv-band-heading">
					Your queue
				</h2>
				<span className="tv-ov-meta">
					{items === 0 ? 'All clear' : `${items} ${items === 1 ? 'thing needs' : 'things need'} you`}
				</span>
			</div>

			{items === 0 ? (
				<p className="tv-activity-empty">Nothing needs you right now.</p>
			) : (
				<div className="tv-ov-queue">
					{missing.map((slot) => (
						<div key={slot.startTime} className="tv-ov-queue-group">
							<QueueItem
								count={slot.missing.length}
								warn
								title={`No result yet from the ${slot.startTime} slot`}
								detail={`${slot.missing.length === 1 ? 'One match' : `${slot.missing.length} matches`} finished without a result`}
							/>
							<ul className="tv-ov-list tv-ov-list--nested">
								{slot.matches
									.filter(({ fixture }) => slot.missing.includes(fixture))
									.map(({ entry, fixture }) => (
										<FixtureLine
											key={fixture.id}
											fixture={fixture}
											lead={getCourtName(schedule, entry.courtId)}
											divisions={divisions}
											action={
												canScoreFixture?.(fixture) ? (
													<button type="button" className="tv-ov-action" onClick={() => onScoreFixture(fixture.id)}>
														{scoreLabel(fixture)}
													</button>
												) : null
											}
										/>
									))}
							</ul>
						</div>
					))}

					{readyDivisions.map((division) => (
						<QueueItem
							key={division.id}
							count={1}
							title={`${division.name}: round complete`}
							detail={division.currentRoundName ? `${division.currentRoundName} has finished` : null}>
							{canProgressRounds && (
								<button type="button" className="tv-ov-action" onClick={() => onProgressRound(division.id)}>
									Review and start
								</button>
							)}
						</QueueItem>
					))}

					{scoresheetSlot && (
						<QueueItem
							count={scoresheetSlot.matches.length}
							title={`Scoresheets for ${scoresheetSlot.startTime}`}
							detail={`${scoresheetSlot.matches.length === 1 ? 'One match' : `${scoresheetSlot.matches.length} matches`}`}>
							<button
								type="button"
								className="tv-ov-action"
								disabled={!scoresheetTemplateReady}
								title={scoresheetTemplateReady ? undefined : 'Scoresheet template not available on this device'}
								onClick={() => onPrintScoresheets(scoresheetSlot.matches.map(({ fixture }) => fixture))}>
								<Icon name="download" size={16} />
								Print {scoresheetSlot.matches.length}
							</button>
						</QueueItem>
					)}
				</div>
			)}
		</section>
	);
}

const MAX_COURT_CHIPS = 6;

// The scorer's section: the matches they can enter a result for right now, on
// the courts they chose. The court choice is a device convenience, held by
// OverviewTab.
export function ToScoreBand({ items, schedule, divisions, courts = [], court, onCourtChange, onScoreFixture }) {
	return (
		<section className="tv-band tv-ov-band" aria-labelledby="tv-ov-toscore">
			<div className="tv-band-header">
				<h2 id="tv-ov-toscore" className="tv-band-heading">
					To score
				</h2>
				<span className="tv-ov-meta">You enter results for the current round</span>
			</div>

			{/* Chips while they fit on a line or two; a select past that, where a
			    wall of chips would push the matches off the first screen. */}
			{courts.length > MAX_COURT_CHIPS && (
				<label className="tv-ov-court-select">
					<span>Court</span>
					<select value={court} onChange={(event) => onCourtChange(event.target.value)}>
						<option value="">All courts</option>
						{courts.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.name}
							</option>
						))}
					</select>
				</label>
			)}

			{courts.length > 1 && courts.length <= MAX_COURT_CHIPS && (
				<div className="tv-ov-chips" role="group" aria-label="Courts">
					<button
						type="button"
						className={`tv-ov-chip ${court ? '' : 'is-on'}`.trim()}
						aria-pressed={!court}
						onClick={() => onCourtChange('')}>
						All courts
					</button>
					{courts.map((entry) => (
						<button
							key={entry.id}
							type="button"
							className={`tv-ov-chip ${court === entry.id ? 'is-on' : ''}`.trim()}
							aria-pressed={court === entry.id}
							onClick={() => onCourtChange(entry.id)}>
							{entry.name}
						</button>
					))}
				</div>
			)}

			{items.length === 0 ? (
				<p className="tv-activity-empty">Nothing to score right now.</p>
			) : (
				<ul className="tv-ov-list">
					{items.map(({ entry, fixture, late }) => (
						<FixtureLine
							key={fixture.id}
							fixture={fixture}
							lead={
								<>
									{entry ? getCourtName(schedule, entry.courtId) : fixture.match_no != null ? `#${fixture.match_no}` : ''}
									{late && <span className="tv-ov-late">{entry.startTime}, no result</span>}
								</>
							}
							divisions={divisions}
							action={
								<button type="button" className="tv-ov-action tv-ov-action--primary" onClick={() => onScoreFixture(fixture.id)}>
									{scoreLabel(fixture)}
								</button>
							}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

const CELL_LABELS = {
	done: 'played',
	live: 'live',
	missing: 'no result',
	upcoming: 'upcoming',
	free: 'free',
};

// Slots down, courts across. Each cell is a status, so each carries its label for
// a screen reader and a tooltip; the legend says what the colours mean.
export function TimelineBand({ rows, schedule, nowTime, played, total, canEditSchedule = false, onOpenSchedule }) {
	return (
		<section className="tv-band tv-ov-band" aria-labelledby="tv-ov-day">
			<div className="tv-band-header">
				<h2 id="tv-ov-day" className="tv-band-heading">
					Today
				</h2>
				<span className="tv-ov-meta">
					{played} of {total} played
				</span>
			</div>

			<div className="tv-ov-panel">
				<ol className="tv-ov-timeline">
					{rows.map((row) => (
						<li key={row.startTime} className={`tv-ov-slot ${row.startTime <= nowTime ? 'is-past' : ''}`.trim()}>
							<span className="tv-ov-slot-time">{row.startTime}</span>
							<span className="tv-ov-cells">
								{row.cells.map((cell) => {
									const label = `${getCourtName(schedule, cell.courtId)}: ${CELL_LABELS[cell.state]}`;

									return (
										<span key={cell.courtId} className={`tv-ov-cell tv-ov-cell--${cell.state}`} title={label}>
											<span className="tv-visually-hidden">{label}</span>
										</span>
									);
								})}
							</span>
						</li>
					))}
				</ol>

				<ul className="tv-ov-legend" aria-hidden="true">
					{['done', 'live', 'missing', 'upcoming'].map((state) => (
						<li key={state}>
							<span className={`tv-ov-cell tv-ov-cell--${state}`} />
							{CELL_LABELS[state]}
						</li>
					))}
				</ul>

				{canEditSchedule && (
					<button type="button" className="tv-subtle-action" onClick={onOpenSchedule}>
						Edit schedule
					</button>
				)}
			</div>
		</section>
	);
}

// Division progress as one compact list: name, current round, matches played.
// The organiser's full cards (add, remove, recolour) are DivisionsBand in
// OverviewTab; this is everyone else's.
export function DivisionProgressBand({ divisions, onOpenDivision }) {
	if (divisions.length === 0) return null;

	return (
		<section className="tv-band tv-ov-band" aria-labelledby="tv-ov-divisions">
			<h2 id="tv-ov-divisions" className="tv-band-heading">
				Divisions
			</h2>

			<ul className="tv-ov-panel tv-ov-divisions">
				{divisions.map((division) => {
					const total = division.fixtureCount ?? 0;
					const completed = division.completedFixtureCount ?? 0;
					const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

					return (
						<li key={division.id} style={divisionColorStyle(division.id, divisions)}>
							<button type="button" className="tv-ov-division" onClick={() => onOpenDivision(division.id, 'standings')}>
								<span className="tv-ov-division-dot" aria-hidden="true" />
								<span className="tv-ov-division-text">
									<span className="tv-ov-division-name">{division.name}</span>
									{division.currentRoundName && (
										<span className="tv-ov-division-round">{division.currentRoundName}</span>
									)}
								</span>
								<span className="tv-ov-division-count">
									{completed}/{total}
								</span>
								<span className="tv-progress-bar tv-ov-division-bar">
									<span className="tv-progress-fill" style={{ width: `${percent}%` }} />
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
