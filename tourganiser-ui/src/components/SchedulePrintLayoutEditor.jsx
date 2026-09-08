import { useMemo } from 'react';
import {
	getPageStartRows,
	getPrintRowsForDay,
	getPrintableDays,
	materialisePrintLayout,
} from '../utils/schedulePrintLayout';
import {
	chunkAtBreaks,
	courtBreakIndices,
	formatDateLabel,
	getCourtName,
	getEntryDivisionStyle,
	getEntryLabel,
} from '../utils/scheduleUtils';

// Where the printed schedule's pages break, edited by clicking a gutter.
//
// Pure and props-only, the same shape ScheduleExportView.jsx documents for the
// rendering layer, and for the same reason: it is used two ways. The live print
// route gives it the full width of the page and saves what it produces; the
// schedule maker's inspector panel gives it a narrow column and stages what it
// produces into the modal's own unsaved schedule. Neither is a special case
// here — the component reads (type, schedule, fixturesById, layout) and calls
// onChange with a complete layout, and the caller decides what that means.
//
// A layout of null is not a blank slate: materialisePrintLayout turns it into
// the smart default first, so the first click on a gutter adjusts a finished
// arrangement rather than starting one. See docs/schedule.md.
export default function SchedulePrintLayoutEditor({ type, schedule, fixturesById, layout, onChange }) {
	// The explicit form of whatever is currently in force, which is what every
	// control below reads and writes. Recomputed rather than held in state: the
	// caller owns the layout, and a copy here could disagree with it.
	const effective = useMemo(() => materialisePrintLayout({ type, schedule, layout }), [type, schedule, layout]);

	const days = useMemo(() => getPrintableDays(schedule), [schedule]);

	const courtGroups = useMemo(
		() => chunkAtBreaks(schedule.courts, courtBreakIndices(schedule.courts, effective.courtBreaks)),
		[schedule.courts, effective.courtBreaks],
	);

	const pageCount = days.reduce((total, day) => total + (effective.rowBreaksByDay[day.id]?.length ?? 0) + 1, 0);
	const totalPages = type === 'grid' ? pageCount * courtGroups.length : pageCount;

	const toggleRowBreak = (dayId, index) => {
		const current = effective.rowBreaksByDay[dayId] ?? [];
		const next = current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b);

		onChange({ ...effective, rowBreaksByDay: { ...effective.rowBreaksByDay, [dayId]: next } });
	};

	const toggleCourtBreak = (courtId) => {
		const current = effective.courtBreaks;
		const next = current.includes(courtId) ? current.filter((value) => value !== courtId) : [...current, courtId];

		// Kept in schedule order rather than click order, so the saved array
		// reads the same way the printed pages come out.
		onChange({
			...effective,
			courtBreaks: schedule.courts.filter((court) => next.includes(court.id)).map((court) => court.id),
		});
	};

	const setOrientation = (orientation) => onChange({ ...effective, orientation });

	// Reset means "forget what was saved", which is what a null layout already
	// means everywhere else — materialisePrintLayout turns it back into the
	// smart default on the next render.
	const handleReset = () => onChange(null);

	return (
		<div className="print-layout-editor">
			<div className="print-layout-editor-toolbar">
				<div className="print-layout-editor-orientation" role="group" aria-label="Paper orientation">
					{['portrait', 'landscape'].map((orientation) => (
						<button
							key={orientation}
							type="button"
							className="print-layout-editor-choice"
							aria-pressed={effective.orientation === orientation}
							onClick={() => setOrientation(orientation)}>
							{orientation === 'portrait' ? 'Portrait' : 'Landscape'}
						</button>
					))}
				</div>

				<p className="print-layout-editor-count">
					{totalPages} page{totalPages === 1 ? '' : 's'}
					{type === 'grid' && courtGroups.length > 1 && ` · ${courtGroups.length} court groups`}
				</p>

				<button type="button" className="print-layout-editor-reset" onClick={handleReset}>
					Reset to smart default
				</button>
			</div>

			{type === 'grid' && schedule.courts.length > 1 && (
				<CourtBreakStrip courts={schedule.courts} courtBreaks={effective.courtBreaks} onToggle={toggleCourtBreak} />
			)}

			{days.length === 0 && <p className="print-layout-editor-empty">No days are enabled for scheduling, so there is nothing to print.</p>}

			{days.map((day) => (
				<DayBreakEditor
					key={day.id}
					type={type}
					schedule={schedule}
					day={day}
					fixturesById={fixturesById}
					breaks={effective.rowBreaksByDay[day.id] ?? []}
					onToggle={(index) => toggleRowBreak(day.id, index)}
				/>
			))}
		</div>
	);
}

// Column grouping, schedule-wide rather than per day — a court group is a set
// of columns, and the same set is used on every day's pages. Rendered as the
// court names in order with a toggle between each adjacent pair, so what the
// organiser clicks is the boundary itself rather than a court that happens to
// start one.
function CourtBreakStrip({ courts, courtBreaks, onToggle }) {
	return (
		<div className="print-layout-courts">
			<span className="print-layout-courts-label">Court groups</span>
			<div className="print-layout-courts-strip">
				{courts.map((court, index) => (
					<div key={court.id} className="print-layout-courts-item">
						{index > 0 && (
							<button
								type="button"
								className="print-layout-court-gutter"
								onClick={() => onToggle(court.id)}
								aria-pressed={courtBreaks.includes(court.id)}
								title={courtBreaks.includes(court.id) ? 'Keep these courts on one page' : 'Start a new page group here'}
								aria-label={
									courtBreaks.includes(court.id)
										? `Remove the column break before ${court.name}`
										: `Add a column break before ${court.name}`
								}>
								<span aria-hidden="true">{courtBreaks.includes(court.id) ? '│' : '+'}</span>
							</button>
						)}
						<span className="print-layout-courts-name">{court.name}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// One day's rows, with a gutter between each pair. The grid form is a real
// table of courts across time so the organiser can see what a break would cut
// through; the list form is the same rows the printed list shows.
function DayBreakEditor({ type, schedule, day, fixturesById, breaks, onToggle }) {
	const { rows, entries } = useMemo(() => getPrintRowsForDay(type, schedule, day), [type, schedule, day]);
	const pages = chunkAtBreaks(rows, breaks);
	const pageStarts = getPageStartRows(pages);

	return (
		<section className="print-layout-day">
			{/* A div, deliberately, not a <header>. App.css styles the bare element
			    as the site's own fixed navigation bar — position: fixed, full
			    width, 80px tall, --main-color, z-index above everything — so a
			    <header> anywhere in the app becomes a blue slab pinned over the
			    top of the page. Used here it covered this route's toolbar
			    entirely, Save button included. Same trap as `main`; see
			    docs/architecture.md's frontend traps. */}
			<div className="print-layout-day-head">
				<h4>{day.label}</h4>
				<span>{formatDateLabel(day.date)}</span>
				<span className="print-layout-day-pages">
					{pages.length} page{pages.length === 1 ? '' : 's'}
				</span>
			</div>

			<div className="print-layout-scroller">
				{type === 'grid' && (
					<div className="print-layout-grid-head">
						<span className="print-layout-grid-time">Time</span>
						{schedule.courts.map((court) => (
							<span key={court.id} className="print-layout-grid-cell">
								{court.name}
							</span>
						))}
					</div>
				)}

				{pages.map((pageRows, pageIndex) => {
					const pageStart = pageStarts[pageIndex];

					return (
						<div key={pageIndex} className="print-layout-page">
							{pageIndex > 0 && (
								<button
									type="button"
									className="print-layout-gutter is-break"
									onClick={() => onToggle(pageStart)}
									aria-label={`Remove the page break before ${describeRow(type, rows[pageStart], schedule)}`}>
									Page break · click to remove
								</button>
							)}

							{pageRows.map((row, localIndex) => {
								const rowIndex = pageStart + localIndex;

								return (
									<div key={rowIndex}>
										{localIndex > 0 && (
											<button
												type="button"
												className="print-layout-gutter"
												onClick={() => onToggle(rowIndex)}
												aria-label={`Add a page break before ${describeRow(type, row, schedule)}`}>
												<span aria-hidden="true">Break here</span>
											</button>
										)}

										{type === 'grid' ? (
											<GridPreviewRow
												schedule={schedule}
												slot={row}
												rowIndex={rowIndex}
												entries={entries}
												fixturesById={fixturesById}
											/>
										) : (
											<ListPreviewRow entry={row} schedule={schedule} fixturesById={fixturesById} />
										)}
									</div>
								);
							})}
						</div>
					);
				})}
			</div>
		</section>
	);
}

function describeRow(type, row, schedule) {
	if (type === 'grid') return row ?? 'this row';

	return row ? `${row.startTime} ${getCourtName(schedule, row.courtId)}` : 'this row';
}

// The same placement arithmetic the printed page uses (getEntryRowPlacement,
// resolved once per day in getPrintRowsForDay), read here only to show what a
// slot holds — a break's consequence is what the organiser is judging.
function GridPreviewRow({ schedule, slot, rowIndex, entries, fixturesById }) {
	return (
		<div className="print-layout-grid-row">
			<span className="print-layout-grid-time">{slot}</span>
			{schedule.courts.map((court) => {
				const placed = entries.find((item) => item.entry.courtId === court.id && item.rowStart === rowIndex + 1);
				const spanning = entries.find(
					(item) =>
						item.entry.courtId === null && item.rowStart <= rowIndex + 1 && item.rowStart + item.rowSpan > rowIndex + 1,
				);
				const shown = placed ?? spanning;

				return (
					<span
						key={court.id}
						className="print-layout-grid-cell"
						style={shown ? getEntryDivisionStyle(shown.entry, fixturesById) : undefined}>
						{shown ? getEntryLabel(shown.entry, fixturesById) : ''}
					</span>
				);
			})}
		</div>
	);
}

function ListPreviewRow({ entry, schedule, fixturesById }) {
	return (
		<div className="print-layout-list-row" style={getEntryDivisionStyle(entry, fixturesById)}>
			<span>
				{entry.startTime} - {entry.endTime}
			</span>
			<span>{getCourtName(schedule, entry.courtId)}</span>
			<span>{getEntryLabel(entry, fixturesById)}</span>
		</div>
	);
}
