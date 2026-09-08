import {
	buildGridRowTimes,
	computeSmartDefaultCourtBreaks,
	computeSmartDefaultRowBreaks,
	DEFAULT_PRINT_ORIENTATION,
	getDayBounds,
	getDayEntries,
	getEntryRowPlacement,
	getSlotMinutes,
} from './scheduleUtils';

// Where the pages of a printed schedule fall, and what one page holds.
//
// Its own module rather than part of ScheduleExportView.jsx, which is where
// this began: three components now read it — the printed pages, the break
// editor, and the page-count indicator that has to agree with both — and a
// file that exports components cannot also export the plain functions they
// share without breaking fast refresh.
//
// Nothing here renders. A row index means the same thing to every reader
// because they all get it from getPrintRowsForDay.

// How many list rows / grid slot-rows one printed A4 page is estimated to
// hold, derived from the row heights already governing rendering (the list
// row's own padding, the grid's min-height: 56px cell) against the @page
// dimensions (utils/scheduleExportDocument.jsx) minus margins and the header's
// own height.
//
// Deliberately conservative: the safe failure mode is a page that breaks a
// little early and prints with some blank space at the foot, not one that
// overflows and silently reintroduces the bug this exists to fix (every
// `.schedule-export-page` forces `break-after: page` in print, so an
// undersized estimate costs whitespace, never a split). Tune these against
// real printed/PDF output if a page comes out badly under- or over-full.
//
// Since 2026-09-08 these are only the *default* page size: an organiser can
// move any break, and a saved layout's breaks are used verbatim.
export const PRINT_LIST_ROWS_PER_PAGE = 14;
export const PRINT_GRID_SLOTS_PER_PAGE = 7;

// The ceiling on how many courts share one grid table by default. Past this a
// single table of columns stops being readable — 19 courts in one row was the
// reported case. 6 is inside the 4-6 range asked for, chosen as the ceiling so
// a 6-court or smaller tournament (the common case) is completely unaffected:
// one court group, identical output to before this existed.
export const COURTS_PER_GROUP = 6;

// The day's own grid rows and the entries placed against them, resolved once.
// The same fixed axis and the same row arithmetic the schedule maker's screen
// uses, so the printed page puts an entry in the row the organiser saw it in.
export function getGridRowsForDay(schedule, day) {
	const dayBounds = getDayBounds(schedule);
	const allSlots = buildGridRowTimes(schedule, dayBounds);
	const axis = { start: dayBounds.start, slotMinutes: getSlotMinutes(schedule), rowCount: allSlots.length };
	const entries = getDayEntries(schedule, day.date)
		.map((entry) => ({ entry, ...getEntryRowPlacement(entry, axis) }))
		.filter((item) => item.inDay);

	return { slots: allSlots, entries };
}

// A grid page reads best when it ends on an empty slot row rather than in the
// middle of a run of matches — so a break before `index` is natural when the
// row above it has nothing on it.
export function makeGridNaturalBreakTest(entries) {
	return (index) => !entries.some((item) => item.rowStart <= index && item.rowStart + item.rowSpan > index);
}

// The list equivalent: a break before `index` is natural when that row starts a
// new time, so a set of simultaneous fixtures is not split across two sheets.
export function makeListNaturalBreakTest(entries) {
	return (index) => entries[index]?.startTime !== entries[index - 1]?.startTime;
}

// A saved break array wins outright, including an empty one — a day saved as
// `[]` prints on one page because that is what was asked for. Only a day the
// layout has never seen falls back to the default. See docs/schedule.md.
export function resolveRowBreaks({ layout, day, rows, rowsPerPage, isNaturalBreak }) {
	const saved = layout?.rowBreaksByDay?.[day.id];

	if (Array.isArray(saved)) return saved;

	return computeSmartDefaultRowBreaks(rows.length, rowsPerPage, isNaturalBreak);
}

export function resolveCourtBreaks(schedule, layout) {
	if (layout && Array.isArray(layout.courtBreaks)) return layout.courtBreaks;

	return computeSmartDefaultCourtBreaks(schedule.courts, COURTS_PER_GROUP);
}

// The days a printed layout covers. A disabled day contributes no pages, the
// same rule the exported pages apply — see docs/schedule.md's Day table.
export function getPrintableDays(schedule) {
	return schedule.days.filter((day) => day.enabled !== false);
}

// The rows one day contributes to a layout of this type: grid slot times, or
// the day's entries, along with everything needed to break them into pages.
export function getPrintRowsForDay(type, schedule, day) {
	if (type === 'grid') {
		const { slots, entries } = getGridRowsForDay(schedule, day);

		return { rows: slots, entries, rowsPerPage: PRINT_GRID_SLOTS_PER_PAGE, isNaturalBreak: makeGridNaturalBreakTest(entries) };
	}

	const entries = getDayEntries(schedule, day.date);

	return { rows: entries, entries, rowsPerPage: PRINT_LIST_ROWS_PER_PAGE, isNaturalBreak: makeListNaturalBreakTest(entries) };
}

// The row each page starts at, without accumulating into a mutable counter
// during render. Page counts are single digits, so the repeated sum costs
// nothing and the result is a plain derivation of its input.
export function getPageStartRows(pages) {
	return pages.map((_, index) => pages.slice(0, index).reduce((total, page) => total + page.length, 0));
}

// Turns a layout (or the absence of one) into an explicit one: every printable
// day carries a real break array and, for the grid, the court breaks are named
// outright. This is what editing starts from — per the design, an organiser
// always adjusts a finished arrangement rather than building one from blank,
// so the first click on a gutter converts the smart default into a saved
// layout that happens to match it.
//
// It also drops anything pointing at a day that no longer exists, because it
// rebuilds rowBreaksByDay from the days that do.
export function materialisePrintLayout({ type, schedule, layout }) {
	const rowBreaksByDay = {};

	getPrintableDays(schedule).forEach((day) => {
		const { rows, rowsPerPage, isNaturalBreak } = getPrintRowsForDay(type, schedule, day);

		rowBreaksByDay[day.id] = resolveRowBreaks({ layout, day, rows, rowsPerPage, isNaturalBreak });
	});

	return {
		orientation: layout?.orientation || DEFAULT_PRINT_ORIENTATION[type],
		courtBreaks: type === 'grid' ? resolveCourtBreaks(schedule, layout) : [],
		rowBreaksByDay,
	};
}
