import React from 'react';
import TournamentPattern from './TournamentPattern';
import { tournamentAccentStyle } from '../utils/tournamentIdentity';
import {
	chunkAtBreaks,
	courtBreakIndices,
	formatDateLabel,
	getCourtName,
	getEntryDivisionStyle,
	getEntryLabel,
	getEntryOfficials,
	getEntrySecondary,
} from '../utils/scheduleUtils';
import {
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

// One `.schedule-export-page` per chunk of time-slot rows that fits one
// sheet, not one per day — each chunk is a full grid table (head row plus
// only that chunk's slots) with its own header, so a day spilling onto a
// second or third sheet still names itself on every one.
//
// Entries are placed once against the whole day's axis, exactly as before
// chunking existed; only which rows get rendered on a given page changes.
// getEntryRowPlacement's rowStart is a global row number, and slicing the
// slot list preserves order, so `pageRowOffset + localIndex` reconstructs the
// same global row index a chunk's slots always had — placement itself is
// untouched.
//
// `courts` is one court group (courtRangeLabel above), not the whole
// schedule — an entry on a court outside this group simply matches no cell
// in this table, which is correct: it belongs to a different group's pages.
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
	// The same fixed axis and the same row arithmetic the screen uses, so the
	// printed page puts an entry in the row the organiser saw it in. Matching on
	// startTime alone dropped every entry that did not begin exactly on a slot.
	const { rows: allSlots, entries, rowsPerPage, isNaturalBreak } = getPrintRowsForDay('grid', schedule, day);

	const slotChunks = chunkAtBreaks(allSlots, resolveRowBreaks({ layout, day, rows: allSlots, rowsPerPage, isNaturalBreak }));
	// The row a page starts at is no longer pageIndex * a fixed size — with
	// arbitrary breaks it has to be summed, and getEntryRowPlacement's rowStart
	// is a global row number, so getting this wrong misplaces every entry on
	// every page after the first.
	const pageStarts = getPageStartRows(slotChunks);

	return slotChunks.map((slots, pageIndex) => {
		const pageRowOffset = pageStarts[pageIndex];

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
							const rowIndex = pageRowOffset + localIndex;

							return (
								<React.Fragment key={slot}>
									<div className="schedule-export-grid-time">{slot}</div>
									{courts.map((court) => {
										// Every entry that starts in this row, not the first of them.
										// The printed grid still snaps an entry to the row that
										// contains it — a sheet of paper has no way to draw a block
										// at an arbitrary offset and keep the row legible — but two
										// matches can now start in one row, and finding one of them
										// left the other off the page altogether.
										const placed = entries.filter(
											(item) => item.entry.courtId === court.id && item.rowStart === rowIndex + 1,
										);
										const spanningBreak = entries.find(
											(item) =>
												item.entry.courtId === null &&
												item.rowStart <= rowIndex + 1 &&
												item.rowStart + item.rowSpan > rowIndex + 1,
										);

										return (
											<div key={`${court.id}-${slot}`} className="schedule-export-grid-cell">
												{spanningBreak ? (
													<strong>{spanningBreak.entry.title}</strong>
												) : (
													placed.map((item) => (
														<div
															key={item.entry.id}
															className="schedule-export-grid-entry"
															style={getEntryDivisionStyle(item.entry, fixturesById, divisions)}>
															{/* The row is labelled with the time it starts, which is
															    the entry's own time only when the two agree. Where
															    they do not — a 25-minute match on a 45-minute grid —
															    the entry has to say when it actually is. */}
															{item.entry.startTime !== slot && (
																<span className="schedule-export-grid-entry-time">
																	{item.entry.startTime} - {item.entry.endTime}
																</span>
															)}
															<span>{getEntrySecondary(item.entry, fixturesById)}</span>
															<strong>{getEntryLabel(item.entry, fixturesById)}</strong>
															{getEntryOfficials(item.entry) && (
																<span style={{ color: 'dodgerblue' }}>{getEntryOfficials(item.entry)}</span>
															)}
														</div>
													))
												)}
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
function ScheduleExportListPages({ schedule, day, fixturesById, tournamentName, tournamentId, divisions = [], layout }) {
	const { rows: entries, rowsPerPage, isNaturalBreak } = getPrintRowsForDay('list', schedule, day);
	const pages = chunkAtBreaks(entries, resolveRowBreaks({ layout, day, rows: entries, rowsPerPage, isNaturalBreak }));

	return pages.map((pageEntries, pageIndex) => (
		<div key={`${day.id}-${pageIndex}`} className="schedule-export-page" data-export-page="true">
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
						{getEntryOfficials(entry) && <div style={{ color: 'dodgerblue' }}>{getEntryOfficials(entry)}</div>}
						<div>{getEntrySecondary(entry, fixturesById)}</div>
					</div>
				))}
			</div>
		</div>
	));
}
