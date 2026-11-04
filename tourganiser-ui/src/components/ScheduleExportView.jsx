import TournamentPattern from './TournamentPattern';
import { tournamentAccentStyle } from '../utils/tournamentIdentity';
import {
	chunkAtBreaks,
	courtBreakIndices,
	DEFAULT_PRINT_ORIENTATION,
	formatDateLabel,
	getCourtName,
	getEntryDivisionStyle,
	getEntryLabel,
	getEntryOfficials,
	getEntrySecondary,
} from '../utils/scheduleUtils';
import {
	getBlockTier,
	getGridPrintScale,
	getPageBlocks,
	getPageStartRows,
	getPrintableDays,
	getPrintRowsForDay,
	resolveCourtBreaks,
	resolveRowBreaks,
} from '../utils/schedulePrintLayout';

// The schedule's printed/exported rendering — grid and list layouts, chunked
// onto pages. Used two ways: by ScheduleMakerModal (the organiser's own
// export action) and by utils/scheduleExportDocument.js (both the organiser's
// and every other viewer's "View/Print Schedule" action, rendered into a
// standalone document via renderToStaticMarkup). Neither reads component
// state or hooks beyond the props passed in — everything here is pure and
// presentational over data already fully assembled by the caller.

// "Courts 1-6", or the single court's own name when a group holds just one —
// naming it by range reads oddly for a group of one.
function courtRangeLabel(courts) {
	if (courts.length === 0) return '';
	if (courts.length === 1) return courts[0].name;

	return `${courts[0].name} - ${courts[courts.length - 1].name}`;
}

// The day label is additive: the date this already showed stays, day.label
// (already on the day object — normaliseTournamentDays, "Day N" by default or
// a custom one) is added alongside it, same pairing ScheduleTab already shows
// on screen.
export function ScheduleExportHeader({ tournamentId, tournamentName, dayLabel, date, courtRangeLabel: courts }) {
	return (
		<div className="schedule-export-header" style={tournamentAccentStyle(tournamentId)}>
			<div className="schedule-export-header-identity" aria-hidden="true">
				<TournamentPattern tournamentId={tournamentId} />
			</div>

			<div>
				<p>Tourganiser</p>
				<h2>{tournamentName}</h2>
				<h3>Tournament Schedule</h3>
				{courts && <p className="schedule-export-court-range">Courts: {courts}</p>}
			</div>
			<div className="schedule-export-date">
				{dayLabel} - {formatDateLabel(date)}
			</div>
		</div>
	);
}

// `layout` is the saved or staged print layout for this type, or null for "use
// the smart default" — every consumer here treats those the same way, so a
// caller that has no layouts at all (an old schedule, a viewer of a tournament
// nobody has arranged) needs no special case.
export function ScheduleExportPages({
	type,
	schedule,
	fixturesById,
	tournamentName,
	tournamentId,
	divisions = [],
	layout = null,
}) {
	const days = getPrintableDays(schedule);

	if (type === 'grid') {
		const courtGroups = chunkAtBreaks(schedule.courts, courtBreakIndices(schedule.courts, resolveCourtBreaks(schedule, layout)));

		return (
			<>
				{courtGroups.map((courts, groupIndex) =>
					days.map((day) => (
						<ScheduleExportGridPages
							key={`${groupIndex}-${day.id}`}
							schedule={schedule}
							day={day}
							courts={courts}
							// Only labelled once there is more than one group — with a
							// single group (six courts or fewer) there is nothing to
							// distinguish, matching every other "named only when there's
							// more than one" convention in this app.
							courtRangeLabel={courtGroups.length > 1 ? courtRangeLabel(courts) : null}
							fixturesById={fixturesById}
							tournamentName={tournamentName}
							tournamentId={tournamentId}
							divisions={divisions}
							layout={layout}
						/>
					)),
				)}
			</>
		);
	}

	return (
		<>
			{days.map((day) => (
				<ScheduleExportListPages
					key={day.id}
					schedule={schedule}
					day={day}
					fixturesById={fixturesById}
					tournamentName={tournamentName}
					tournamentId={tournamentId}
					divisions={divisions}
					layout={layout}
				/>
			))}
		</>
	);
}

// Formatted once, so the scale can't pick up floating-point noise in the markup.
const mm = (value) => `${value.toFixed(2)}mm`;

// One `.schedule-export-page` per run of grid rows that fits one sheet, not one per
// day. Each carries its own header, so a day spilling onto a second sheet still names
// itself on every one.
//
// Time runs to scale down the page, in millimetres, so a match is exactly as tall as
// the time it takes: it crosses grid lines where it needs to, and two matches can share
// one hour. The rows only decide where the lines fall and where a page may break.
//
// `courts` is one court group (courtRangeLabel above), not the whole schedule. An entry
// on a court outside this group belongs to a different group's pages.
function ScheduleExportGridPages({
	schedule,
	day,
	courts,
	courtRangeLabel: rangeLabel,
	fixturesById,
	tournamentName,
	tournamentId,
	divisions = [],
	layout,
}) {
	const orientation = layout?.orientation || DEFAULT_PRINT_ORIENTATION.grid;
	const {
		rows: allSlots,
		slotMinutes,
		entries,
		outsideEntries,
		rowsPerPage,
		isNaturalBreak,
	} = getPrintRowsForDay('grid', schedule, day, orientation);

	const slotChunks = chunkAtBreaks(allSlots, resolveRowBreaks({ layout, day, rows: allSlots, rowsPerPage, isNaturalBreak }));
	const pageStarts = getPageStartRows(slotChunks);

	const courtIds = new Set(courts.map((court) => court.id));
	const groupEntries = entries.filter((item) => item.entry.courtId === null || courtIds.has(item.entry.courtId));
	const groupOutside = outsideEntries.filter((entry) => entry.courtId === null || courtIds.has(entry.courtId));
	const scale = getGridPrintScale({
		pages: slotChunks,
		slotMinutes,
		orientation,
		// Its heading and one line per entry, so the list stays on the same sheet.
		reservedMm: groupOutside.length > 0 ? 9 + groupOutside.length * 4.5 : 0,
	});

	return slotChunks.map((slots, pageIndex) => {
		const startOffset = pageStarts[pageIndex] * slotMinutes;
		const pageMinutes = slots.length * slotMinutes;
		const blocks = getPageBlocks(groupEntries, { startOffset, endOffset: startOffset + pageMinutes });
		const height = mm(pageMinutes * scale);
		const lines = slots.map((slot, index) => ({ slot, top: mm(index * slotMinutes * scale) }));
		const venueBreaks = blocks.filter((block) => block.entry.courtId === null);

		return (
			<div key={`${day.id}-${pageIndex}`} className="schedule-export-page schedule-export-grid-page" data-export-page="true">
				<ScheduleExportHeader
					tournamentId={tournamentId}
					tournamentName={tournamentName}
					dayLabel={day.label}
					date={day.date}
					courtRangeLabel={rangeLabel}
				/>
				<div className="schedule-export-grid">
					{/* The court count travels as a custom property rather than as a
					    finished grid-template-columns string. The track sizes themselves
					    belong in the stylesheet, where the print route can give the columns
					    a real minimum width on a narrow screen and let the grid scroll. */}
					<div className="schedule-export-grid-table" style={{ '--schedule-grid-courts': courts.length }}>
						<div className="schedule-export-grid-head">Time</div>
						{courts.map((court) => (
							<div key={court.id} className="schedule-export-grid-head">
								{court.name}
							</div>
						))}

						<div className="schedule-export-grid-time" style={{ height }}>
							{lines.map(({ slot, top }) => (
								<span key={slot} className="schedule-export-grid-time-label" style={{ top }}>
									{slot}
								</span>
							))}
						</div>

						{courts.map((court, courtIndex) => (
							<div
								key={court.id}
								className="schedule-export-grid-court"
								// Every placement explicit, because the band of venue-wide breaks
								// below shares this row, and auto-placement would move these
								// columns aside to avoid overlapping it.
								style={{ height, gridColumn: courtIndex + 2, gridRow: 2 }}>
								{/* Real elements rather than a background: a browser may leave
								    backgrounds off the printed page unless asked. */}
								{lines.map(({ slot, top }) => (
									<span key={slot} className="schedule-export-grid-line" style={{ top }} />
								))}
								{blocks
									.filter((block) => block.entry.courtId === court.id)
									.map((block) => (
										<ScheduleExportGridBlock
											key={block.entry.id}
											block={block}
											scale={scale}
											fixturesById={fixturesById}
											divisions={divisions}
										/>
									))}
							</div>
						))}

						{venueBreaks.length > 0 && (
							<div className="schedule-export-grid-breaks" style={{ gridRow: 2, gridColumn: `2 / span ${courts.length}` }}>
								{venueBreaks.map(({ entry, top, length }) => (
									<div
										key={entry.id}
										className="schedule-export-grid-break"
										style={{ top: mm(top * scale), height: mm(length * scale) }}>
										<strong>{entry.title || 'Break'}</strong> {entry.startTime} - {entry.endTime}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{pageIndex === slotChunks.length - 1 && groupOutside.length > 0 && (
					<div className="schedule-export-grid-outside">
						<h4>Outside the day&apos;s hours</h4>
						{groupOutside.map((entry) => (
							<p key={entry.id}>
								<strong>
									{entry.startTime} - {entry.endTime}
								</strong>{' '}
								{getCourtName(schedule, entry.courtId)}: {getEntryLabel(entry, fixturesById)}
							</p>
						))}
					</div>
				)}
			</div>
		);
	});
}

// A match's small print, with the match number first, so that a line too long for its
// column loses the round name rather than the number an organiser looks a match up by.
function getMatchContext(entry, fixturesById) {
	const fixture = fixturesById[entry.fixtureId];
	if (entry.type === 'break' || !fixture) return getEntrySecondary(entry, fixturesById);

	const round = fixture.divisionName ? `${fixture.divisionName} - ${fixture.round}` : fixture.round;

	return `Match ${fixture.matchNo} - ${round}`;
}

// One match, or a break on a single court, at its true height. What it says depends on
// how tall that is, most important first, so a block that runs short loses the least.
function ScheduleExportGridBlock({ block, scale, fixturesById, divisions }) {
	const { entry, top, length, continuesFromPrevious, continuesToNext } = block;
	const height = length * scale;
	const tier = getBlockTier(height);
	const officials = getEntryOfficials(entry);
	const saysEverything = tier === 'tall' || tier === 'full';
	// The last few minutes of a match named on the page before: too short to hold a line.
	const isSliver = continuesFromPrevious && height < 2.6;
	const classes = [
		'schedule-export-grid-entry',
		`is-${tier}`,
		entry.type === 'break' ? 'is-break' : '',
		continuesFromPrevious ? 'continues-from-previous' : '',
		continuesToNext ? 'continues-to-next' : '',
	];

	return (
		<div
			className={classes.filter(Boolean).join(' ')}
			style={{ top: mm(top * scale), height: mm(height), ...getEntryDivisionStyle(entry, fixturesById, divisions) }}>
			{tier !== 'minimal' && !isSliver && (
				<span className="schedule-export-grid-entry-time">
					{continuesFromPrevious && 'Continued · '}
					{entry.startTime} - {entry.endTime}
				</span>
			)}
			{!isSliver && <strong>{getEntryLabel(entry, fixturesById)}</strong>}
			{saysEverything && officials && <span className="schedule-export-grid-entry-officials">{officials}</span>}
			{saysEverything && <span className="schedule-export-grid-entry-secondary">{getMatchContext(entry, fixturesById)}</span>}
		</div>
	);
}

// Same reasoning as the grid version: one page per chunk of rows, each with
// its own repeated header. entries is already the flat array the on-screen
// list uses, so chunking it is a straight array split. Unaffected by court
// chunking — it already prints one row per fixture regardless of court count.
function ScheduleExportListPages({ schedule, day, fixturesById, tournamentName, tournamentId, divisions = [], layout }) {
	const { rows: entries, rowsPerPage, isNaturalBreak } = getPrintRowsForDay('list', schedule, day, layout?.orientation);
	const pages = chunkAtBreaks(entries, resolveRowBreaks({ layout, day, rows: entries, rowsPerPage, isNaturalBreak }));

	return pages.map((pageEntries, pageIndex) => (
		<div key={`${day.id}-${pageIndex}`} className="schedule-export-page schedule-export-list-page" data-export-page="true">
			<ScheduleExportHeader tournamentId={tournamentId} tournamentName={tournamentName} dayLabel={day.label} date={day.date} />
			<div className="schedule-export-list">
				{pageEntries.map((entry) => (
					<div key={entry.id} className="schedule-export-list-row" style={getEntryDivisionStyle(entry, fixturesById, divisions)}>
						<div>
							<strong>
								{entry.startTime} - {entry.endTime}
							</strong>
						</div>
						<div>{getCourtName(schedule, entry.courtId)}</div>
						<div>
							<strong>{getEntryLabel(entry, fixturesById)}</strong>
						</div>
						{/* One cell, so that officials sit under the round and can't push the
						    row onto a second line of columns. */}
						<div className="schedule-export-list-context">
							<span>{getMatchContext(entry, fixturesById)}</span>
							{getEntryOfficials(entry) && (
								<span className="schedule-export-list-officials">{getEntryOfficials(entry)}</span>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	));
}
