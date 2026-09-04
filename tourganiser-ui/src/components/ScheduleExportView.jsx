import React from 'react';
import TournamentPattern from './TournamentPattern';
import { tournamentAccentStyle } from '../utils/tournamentIdentity';
import {
	buildGridRowTimes,
	formatDateLabel,
	getCourtName,
	getDayBounds,
	getDayEntries,
	getEntryDivisionStyle,
	getEntryLabel,
	getEntryOfficials,
	getEntryRowPlacement,
	getEntrySecondary,
	getSlotMinutes,
} from '../utils/scheduleUtils';

// The schedule's printed/exported rendering — grid and list layouts, chunked
// onto pages. Used two ways: by ScheduleMakerModal (the organiser's own
// export action) and by utils/scheduleExportDocument.js (both the organiser's
// and every other viewer's "View/Print Schedule" action, rendered into a
// standalone document via renderToStaticMarkup). Neither reads component
// state or hooks beyond the props passed in — everything here is pure and
// presentational over data already fully assembled by the caller.

// How many list rows / grid slot-rows one printed A4 page is estimated to
// hold, derived from the row heights already governing rendering (the list
// row's own padding, the grid's min-height: 56px cell) against the @page
// dimensions (utils/scheduleExportDocument.js) minus margins and the header's
// own height.
//
// Deliberately conservative: the safe failure mode is a page that breaks a
// little early and prints with some blank space at the foot, not one that
// overflows and silently reintroduces the bug this exists to fix (every
// `.schedule-export-page` forces `break-after: page` in print, so an
// undersized estimate costs whitespace, never a split). Tune these against
// real printed/PDF output if a page comes out badly under- or over-full.
const PRINT_LIST_ROWS_PER_PAGE = 14;
const PRINT_GRID_SLOTS_PER_PAGE = 7;

// The ceiling on how many courts share one grid table. Past this a single
// table of columns stops being readable — 19 courts in one row was the
// reported case. 6 is inside the 4-6 range asked for, chosen as the ceiling
// so a 6-court or smaller tournament (the common case) is completely
// unaffected: one court group, identical output to before this existed.
const COURTS_PER_GROUP = 6;

// Splits into groups of `size`, preserving order. A day with nothing to show
// still gets one (empty) chunk, matching the one-page-per-day floor the
// unchunked version always had.
function chunkList(list, size) {
	const chunks = [];

	for (let index = 0; index < list.length; index += size) {
		chunks.push(list.slice(index, index + size));
	}

	return chunks.length > 0 ? chunks : [[]];
}

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

export function ScheduleExportPages({ type, schedule, fixturesById, tournamentName, tournamentId }) {
	const days = schedule.days.filter((day) => day.enabled !== false);

	if (type === 'grid') {
		const courtGroups = chunkList(schedule.courts, COURTS_PER_GROUP);

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
				/>
			))}
		</>
	);
}

// One `.schedule-export-page` per chunk of time-slot rows that fits one
// sheet, not one per day — each chunk is a full grid table (head row plus
// only that chunk's slots) with its own header, so a day spilling onto a
// second or third sheet still names itself on every one.
//
// Entries are placed once against the whole day's axis, exactly as before
// chunking existed; only which rows get rendered on a given page changes.
// getEntryRowPlacement's rowStart is a global row number, and slicing the
// slot list preserves order, so `rowOffset + localIndex` reconstructs the
// same global row index a chunk's slots always had — placement itself is
// untouched.
//
// `courts` is one court group (courtRangeLabel above), not the whole
// schedule — an entry on a court outside this group simply matches no cell
// in this table, which is correct: it belongs to a different group's pages.
function ScheduleExportGridPages({ schedule, day, courts, courtRangeLabel: rangeLabel, fixturesById, tournamentName, tournamentId }) {
	// The same fixed axis and the same row arithmetic the screen uses, so the
	// printed page puts an entry in the row the organiser saw it in. Matching on
	// startTime alone dropped every entry that did not begin exactly on a slot.
	const dayBounds = getDayBounds(schedule);
	const allSlots = buildGridRowTimes(schedule, dayBounds);
	const axis = { start: dayBounds.start, slotMinutes: getSlotMinutes(schedule), rowCount: allSlots.length };
	const entries = getDayEntries(schedule, day.date)
		.map((entry) => ({ entry, ...getEntryRowPlacement(entry, axis) }))
		.filter((item) => item.inDay);

	const slotChunks = chunkList(allSlots, PRINT_GRID_SLOTS_PER_PAGE);

	return slotChunks.map((slots, pageIndex) => {
		const rowOffset = pageIndex * PRINT_GRID_SLOTS_PER_PAGE;

		return (
			<div key={`${day.id}-${pageIndex}`} className="schedule-export-page" data-export-page="true">
				<ScheduleExportHeader
					tournamentId={tournamentId}
					tournamentName={tournamentName}
					dayLabel={day.label}
					date={day.date}
					courtRangeLabel={rangeLabel}
				/>
				<div className="schedule-export-grid">
					<div
						className="schedule-export-grid-table"
						style={{ gridTemplateColumns: `88px repeat(${courts.length}, minmax(0, 1fr))` }}>
						<div className="schedule-export-grid-head">Time</div>
						{courts.map((court) => (
							<div key={court.id} className="schedule-export-grid-head">
								{court.name}
							</div>
						))}
						{slots.map((slot, localIndex) => {
							const rowIndex = rowOffset + localIndex;

							return (
								<React.Fragment key={slot}>
									<div className="schedule-export-grid-time">{slot}</div>
									{courts.map((court) => {
										const placed = entries.find(
											(item) => item.entry.courtId === court.id && item.rowStart === rowIndex + 1,
										);
										const spanningBreak = entries.find(
											(item) =>
												item.entry.courtId === null &&
												item.rowStart <= rowIndex + 1 &&
												item.rowStart + item.rowSpan > rowIndex + 1,
										);

										return (
											<div
												key={`${court.id}-${slot}`}
												className="schedule-export-grid-cell"
												style={placed ? getEntryDivisionStyle(placed.entry, fixturesById) : undefined}>
												{spanningBreak ? (
													<strong>{spanningBreak.entry.title}</strong>
												) : placed ? (
													<>
														<span>{getEntrySecondary(placed.entry, fixturesById)}</span>
														<strong>{getEntryLabel(placed.entry, fixturesById)}</strong>
														{getEntryOfficials(placed.entry) && (
															<span style={{ color: 'dodgerblue' }}>{getEntryOfficials(placed.entry)}</span>
														)}
													</>
												) : null}
											</div>
										);
									})}
								</React.Fragment>
							);
						})}
					</div>
				</div>
			</div>
		);
	});
}

// Same reasoning as the grid version: one page per chunk of rows, each with
// its own repeated header. entries is already the flat array the on-screen
// list uses, so chunking it is a straight array split. Unaffected by court
// chunking — it already prints one row per fixture regardless of court count.
function ScheduleExportListPages({ schedule, day, fixturesById, tournamentName, tournamentId }) {
	const entries = getDayEntries(schedule, day.date);
	const pages = chunkList(entries, PRINT_LIST_ROWS_PER_PAGE);

	return pages.map((pageEntries, pageIndex) => (
		<div key={`${day.id}-${pageIndex}`} className="schedule-export-page" data-export-page="true">
			<ScheduleExportHeader tournamentId={tournamentId} tournamentName={tournamentName} dayLabel={day.label} date={day.date} />
			<div className="schedule-export-list">
				{pageEntries.map((entry) => (
					<div key={entry.id} className="schedule-export-list-row" style={getEntryDivisionStyle(entry, fixturesById)}>
						<div>
							<strong>
								{entry.startTime} - {entry.endTime}
							</strong>
						</div>
						<div>{getCourtName(schedule, entry.courtId)}</div>
						<div>
							<strong>{getEntryLabel(entry, fixturesById)}</strong>
						</div>
						{getEntryOfficials(entry) && <div style={{ color: 'dodgerblue' }}>{getEntryOfficials(entry)}</div>}
						<div>{getEntrySecondary(entry, fixturesById)}</div>
					</div>
				))}
			</div>
		</div>
	));
}
