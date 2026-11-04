import {
	buildGridRowTimes,
	computeSmartDefaultCourtBreaks,
	computeSmartDefaultRowBreaks,
	DEFAULT_PRINT_ORIENTATION,
	getDayBounds,
	getDayEntries,
	getEntryDayPlacement,
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

// How many list rows one printed A4 page holds, measured against real PDF output with
// every row at its tallest: a long team name and officials.
//
// Deliberately conservative: the safe failure mode is a page that breaks a little
// early and prints with some blank space at the foot, not one that overflows.
// Since 2026-09-08 this is only the *default* page size: an organiser can move any
// break, and a saved layout's breaks are used verbatim.
export const PRINT_LIST_ROWS_PER_PAGE = { landscape: 12, portrait: 18 };

// The printed grid draws time to scale, in millimetres, so a match is the height of
// the time it takes. These are the sheet's numbers, measured against real PDF output.
//
// The height left for the time grid on one A4 sheet, after the @page margin (see
// utils/scheduleExportDocument.jsx) and the page's header and court names.
export const PRINT_GRID_HEIGHT_MM = { landscape: 145, portrait: 228 };

// The least a default page may use. It gives a 50-minute match room for its time,
// teams and round. A default page is cut short rather than go below this.
export const MIN_MM_PER_MINUTE = 0.26;

// Short matches need two lines, which can raise that minimum. Capped, because
// matches of a few minutes would otherwise demand a page per hour.
const TWO_LINE_BLOCK_MM = 8.6;
const MAX_REQUIRED_MM_PER_MINUTE = 0.6;

// The most a page may use. A short day leaves blank paper rather than enormous blocks.
export const MAX_MM_PER_MINUTE = 0.5;

// What a block of a given height has room to say.
const TALL_BLOCK_MM = 20;
const FULL_BLOCK_MM = 12.6;

// The ceiling on how many courts share one grid table by default. Past this a
// single table of columns stops being readable — 19 courts in one row was the
// reported case. 6 is inside the 4-6 range asked for, chosen as the ceiling so
// a 6-court or smaller tournament (the common case) is completely unaffected:
// one court group, identical output to before this existed.
export const COURTS_PER_GROUP = 6;

// The day's own grid rows and the entries placed against them, resolved once.
// The same fixed axis the schedule maker's board uses, so the printed page puts an
// entry at the time the organiser saw it at.
//
// An entry outside the day's hours has nowhere on that axis to be drawn. It is
// returned separately so the page can list it rather than lose it.
export function getGridRowsForDay(schedule, day) {
	const dayBounds = getDayBounds(schedule);
	const allSlots = buildGridRowTimes(schedule, dayBounds);
	const slotMinutes = getSlotMinutes(schedule);
	const axis = { start: dayBounds.start, slotMinutes, rowCount: allSlots.length };
	const located = getDayEntries(schedule, day.date).map((entry) => ({
		entry,
		...getEntryRowPlacement(entry, axis),
		...getEntryDayPlacement(entry, axis),
	}));

	return {
		slots: allSlots,
		slotMinutes,
		entries: located.filter((item) => item.inDay),
		outsideEntries: located.filter((item) => !item.inDay).map((item) => item.entry),
	};
}

// A grid page reads best when no match is cut in two — so a break before row
// `index` is natural when nothing crosses the line at the top of that row.
export function makeGridNaturalBreakTest(entries, slotMinutes) {
	return (index) => {
		const line = index * slotMinutes;

		return !entries.some((item) => item.startOffset < line && item.endOffset > line);
	};
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

// The least millimetres per minute this day's shortest match can live with. Breaks
// don't count: a break is one line across the page, whatever its length.
export function getMinimumGridScale(entries) {
	const lengths = entries.filter((item) => item.entry.type !== 'break').map((item) => item.endOffset - item.startOffset);
	if (lengths.length === 0) return MIN_MM_PER_MINUTE;

	const required = TWO_LINE_BLOCK_MM / Math.min(...lengths);

	return Math.max(MIN_MM_PER_MINUTE, Math.min(required, MAX_REQUIRED_MM_PER_MINUTE));
}

// How many grid rows a default page holds.
export function getGridRowsPerPage({ entries, slotMinutes, orientation }) {
	const minutesPerPage = PRINT_GRID_HEIGHT_MM[orientation] / getMinimumGridScale(entries);

	return Math.max(1, Math.floor(minutesPerPage / slotMinutes));
}

// Millimetres per minute for a whole day's pages, so a match is the same height
// wherever it falls. Set by the day's longest page, which therefore fills its
// sheet. A saved layout can ask for more on one page than the default would allow;
// it still fits the sheet, and the blocks say less. See getBlockTier.
//
// reservedMm is height a page needs for something else, such as the list of entries
// outside the day's hours.
export function getGridPrintScale({ pages, slotMinutes, orientation, reservedMm = 0 }) {
	const longestPage = Math.max(1, ...pages.map((page) => page.length));

	return Math.min(MAX_MM_PER_MINUTE, (PRINT_GRID_HEIGHT_MM[orientation] - reservedMm) / (longestPage * slotMinutes));
}

// The entries one page shows, measured from the top of that page. A match crossing
// a page break appears on both pages, clipped to each, and says so.
export function getPageBlocks(entries, { startOffset, endOffset }) {
	return entries
		.filter((item) => item.startOffset < endOffset && item.endOffset > startOffset)
		.map((item) => {
			const from = Math.max(item.startOffset, startOffset);
			const to = Math.min(item.endOffset, endOffset);

			return {
				entry: item.entry,
				top: from - startOffset,
				length: to - from,
				continuesFromPrevious: item.startOffset < startOffset,
				continuesToNext: item.endOffset > endOffset,
			};
		});
}

// What a block has room to say. 'tall' and 'full' are time, teams, officials and
// round, and only 'tall' can wrap a long round name onto a second line. 'compact' is
// time and teams; 'minimal' is teams alone.
export function getBlockTier(heightMm) {
	if (heightMm >= TALL_BLOCK_MM) return 'tall';
	if (heightMm >= FULL_BLOCK_MM) return 'full';
	if (heightMm >= TWO_LINE_BLOCK_MM) return 'compact';

	return 'minimal';
}

// The rows one day contributes to a layout of this type: grid slot times, or the
// day's entries, along with everything needed to break them into pages.
export function getPrintRowsForDay(type, schedule, day, orientation = DEFAULT_PRINT_ORIENTATION[type]) {
	if (type === 'grid') {
		const { slots, slotMinutes, entries, outsideEntries } = getGridRowsForDay(schedule, day);

		return {
			rows: slots,
			slotMinutes,
			entries,
			outsideEntries,
			rowsPerPage: getGridRowsPerPage({ entries, slotMinutes, orientation }),
			isNaturalBreak: makeGridNaturalBreakTest(entries, slotMinutes),
		};
	}

	const entries = getDayEntries(schedule, day.date);

	return {
		rows: entries,
		entries,
		rowsPerPage: PRINT_LIST_ROWS_PER_PAGE[orientation],
		isNaturalBreak: makeListNaturalBreakTest(entries),
	};
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
	const orientation = layout?.orientation || DEFAULT_PRINT_ORIENTATION[type];

	getPrintableDays(schedule).forEach((day) => {
		const { rows, rowsPerPage, isNaturalBreak } = getPrintRowsForDay(type, schedule, day, orientation);

		rowBreaksByDay[day.id] = resolveRowBreaks({ layout, day, rows, rowsPerPage, isNaturalBreak });
	});

	return {
		orientation,
		courtBreaks: type === 'grid' ? resolveCourtBreaks(schedule, layout) : [],
		rowBreaksByDay,
	};
}
