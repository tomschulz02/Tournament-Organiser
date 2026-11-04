import { describe, it, expect } from 'vitest';
import {
	chunkAtBreaks,
	computeSmartDefaultCourtBreaks,
	computeSmartDefaultRowBreaks,
	courtBreakIndices,
	normalisePrintLayouts,
	normaliseSchedule,
	getDayEntries,
	pruneStalePrintLayout,
	serialisePrintLayouts,
	serialiseScheduleForSave,
} from '../src/utils/scheduleUtils';
import {
	COURTS_PER_GROUP,
	getBlockTier,
	getGridPrintScale,
	getGridRowsForDay,
	getMinimumGridScale,
	getPageBlocks,
	getPageStartRows,
	getPrintRowsForDay,
	MAX_MM_PER_MINUTE,
	MIN_MM_PER_MINUTE,
	PRINT_GRID_HEIGHT_MM,
	PRINT_LIST_ROWS_PER_PAGE,
	materialisePrintLayout,
	resolveCourtBreaks,
	resolveRowBreaks,
} from '../src/utils/schedulePrintLayout';

// The printed schedule's page breaks — the `print` key of tournaments.schedule
// and the chunking it drives. See docs/schedule.md.
//
// The load-bearing case throughout is the difference between three absences: a
// layout that was never saved, a day the layout has never seen, and a day
// saved deliberately as one page. Getting those confused would either lose an
// organiser's arrangement or refuse to let them ask for one page.

const DAY = { id: 'day_1', date: '2026-09-12', label: 'Day 1' };

function scheduleWith(overrides = {}) {
	return {
		version: 1,
		days: [DAY],
		courts: [
			{ id: 'court-1', name: 'Court 1', divisions: [] },
			{ id: 'court-2', name: 'Court 2', divisions: [] },
		],
		entries: [],
		settings: { dayStartTime: '09:00', dayEndTime: '18:00', slotMinutes: 30 },
		print: { grid: null, list: null },
		...overrides,
	};
}

describe('normalisePrintLayouts', () => {
	it('reads absence as no saved layout for either type', () => {
		expect(normalisePrintLayouts(undefined)).toEqual({ grid: null, list: null });
		expect(normalisePrintLayouts(null)).toEqual({ grid: null, list: null });
	});

	it('falls back to the type default orientation when the stored one is not a real orientation', () => {
		expect(normalisePrintLayouts({ grid: {} }).grid.orientation).toBe('landscape');
		expect(normalisePrintLayouts({ list: {} }).list.orientation).toBe('portrait');
		expect(normalisePrintLayouts({ grid: { orientation: 'sideways' } }).grid.orientation).toBe('landscape');
	});

	it('keeps a stored orientation', () => {
		expect(normalisePrintLayouts({ grid: { orientation: 'portrait' } }).grid.orientation).toBe('portrait');
	});

	it('gives the list no court breaks however the payload was written', () => {
		expect(normalisePrintLayouts({ list: { courtBreaks: ['court-2'] } }).list.courtBreaks).toEqual([]);
		expect(normalisePrintLayouts({ grid: { courtBreaks: ['court-2'] } }).grid.courtBreaks).toEqual(['court-2']);
	});

	it('drops row 0, non-integers and duplicates, and sorts what is left', () => {
		const layout = normalisePrintLayouts({ grid: { rowBreaksByDay: { day_1: [9, 0, 4, 4, 'x', -2, 9] } } });

		expect(layout.grid.rowBreaksByDay.day_1).toEqual([4, 9]);
	});

	it('preserves an empty break array, which means "one page" rather than "no answer"', () => {
		const layout = normalisePrintLayouts({ grid: { rowBreaksByDay: { day_1: [] } } });

		expect(layout.grid.rowBreaksByDay.day_1).toEqual([]);
	});

	it('ignores a day whose breaks are not an array at all', () => {
		expect(normalisePrintLayouts({ grid: { rowBreaksByDay: { day_1: 4 } } }).grid.rowBreaksByDay).toEqual({});
	});
});

describe('serialisePrintLayouts', () => {
	it('writes null when neither type has been saved', () => {
		expect(serialisePrintLayouts({ grid: null, list: null })).toBeNull();
		expect(serialisePrintLayouts(null)).toBeNull();
	});

	it('round-trips a saved layout through normalise unchanged', () => {
		const stored = {
			grid: { orientation: 'portrait', courtBreaks: ['court-2'], rowBreaksByDay: { day_1: [4] } },
			list: null,
		};

		expect(serialisePrintLayouts(normalisePrintLayouts(stored))).toEqual(stored);
	});

	it('never writes court breaks onto the list layout', () => {
		const serialised = serialisePrintLayouts({ list: { orientation: 'portrait', rowBreaksByDay: {}, courtBreaks: ['court-2'] } });

		expect(serialised.list.courtBreaks).toBeUndefined();
	});
});

describe('the print key through a whole schedule', () => {
	it('normalises an old schedule that predates the key to no saved layout', () => {
		const schedule = normaliseSchedule(
			{ version: 1, days: [], courts: [], entries: [], settings: {} },
			{ startDate: '2026-09-12', endDate: '2026-09-12' },
		);

		expect(schedule.print).toEqual({ grid: null, list: null });
	});

	it('survives a save/load round trip', () => {
		const saved = serialiseScheduleForSave(
			scheduleWith({ print: { grid: { orientation: 'landscape', courtBreaks: [], rowBreaksByDay: { day_1: [3] } }, list: null } }),
		);
		const reloaded = normaliseSchedule(saved, { startDate: '2026-09-12', endDate: '2026-09-12' });

		expect(reloaded.print.grid.rowBreaksByDay.day_1).toEqual([3]);
		expect(reloaded.print.list).toBeNull();
	});
});

describe('chunkAtBreaks', () => {
	it('splits at each break, treating a break as the first row of the next chunk', () => {
		expect(chunkAtBreaks([0, 1, 2, 3, 4, 5], [2, 4])).toEqual([
			[0, 1],
			[2, 3],
			[4, 5],
		]);
	});

	it('returns one chunk when there are no breaks', () => {
		expect(chunkAtBreaks([0, 1, 2], [])).toEqual([[0, 1, 2]]);
	});

	it('yields one empty chunk for an empty list, keeping the one-page-per-day floor', () => {
		expect(chunkAtBreaks([], [2])).toEqual([[]]);
	});

	it('ignores a break past the end rather than producing an empty trailing page', () => {
		expect(chunkAtBreaks([0, 1], [5])).toEqual([[0, 1]]);
	});

	it('ignores a break at row 0 and sorts and de-duplicates the rest', () => {
		expect(chunkAtBreaks([0, 1, 2, 3], [3, 0, 1, 1])).toEqual([[0], [1, 2], [3]]);
	});
});

describe('computeSmartDefaultRowBreaks', () => {
	it('reproduces the fixed page size when no natural break test is given', () => {
		expect(computeSmartDefaultRowBreaks(18, 7)).toEqual([7, 14]);
	});

	it('produces no breaks for a day that fits on one page', () => {
		expect(computeSmartDefaultRowBreaks(7, 7)).toEqual([]);
		expect(computeSmartDefaultRowBreaks(0, 7)).toEqual([]);
	});

	it('moves a break earlier to reach a natural one, but never later', () => {
		// Natural only at 6, one row inside the window below the target of 7.
		expect(computeSmartDefaultRowBreaks(14, 7, (index) => index === 6)).toEqual([6, 13]);
	});

	it('leaves the break at the target when nothing natural is within the window', () => {
		expect(computeSmartDefaultRowBreaks(14, 7, (index) => index === 2)).toEqual([7]);
	});

	it('refuses a page size that is not a positive integer', () => {
		expect(computeSmartDefaultRowBreaks(18, 0)).toEqual([]);
	});
});

describe('court breaks', () => {
	it('defaults to a break every COURTS_PER_GROUP courts, named by the court that starts each group', () => {
		const courts = Array.from({ length: 19 }, (_, index) => ({ id: `court-${index + 1}` }));

		expect(computeSmartDefaultCourtBreaks(courts, COURTS_PER_GROUP)).toEqual(['court-7', 'court-13', 'court-19']);
	});

	it('leaves a schedule of six courts or fewer in one group, as before this existed', () => {
		const courts = Array.from({ length: 6 }, (_, index) => ({ id: `court-${index + 1}` }));

		expect(computeSmartDefaultCourtBreaks(courts, COURTS_PER_GROUP)).toEqual([]);
	});

	it('turns court ids into indices, ignoring one that names no court', () => {
		const courts = [{ id: 'court-1' }, { id: 'court-2' }, { id: 'court-3' }];

		expect(courtBreakIndices(courts, ['court-3', 'court-gone'])).toEqual([2]);
	});

	it('ignores a break naming the first court, which cannot start a second group', () => {
		expect(courtBreakIndices([{ id: 'court-1' }, { id: 'court-2' }], ['court-1'])).toEqual([]);
	});
});

describe('resolveRowBreaks', () => {
	const rows = Array.from({ length: 18 }, (_, index) => index);

	it('uses the smart default when no layout is saved', () => {
		expect(resolveRowBreaks({ layout: null, day: DAY, rows, rowsPerPage: 7 })).toEqual([7, 14]);
	});

	it('uses the smart default for a day the saved layout has never seen', () => {
		const layout = { rowBreaksByDay: { day_other: [2] } };

		expect(resolveRowBreaks({ layout, day: DAY, rows, rowsPerPage: 7 })).toEqual([7, 14]);
	});

	it('honours a saved empty array as "one page", not as "nothing saved"', () => {
		const layout = { rowBreaksByDay: { day_1: [] } };

		expect(resolveRowBreaks({ layout, day: DAY, rows, rowsPerPage: 7 })).toEqual([]);
	});

	it('honours saved breaks verbatim', () => {
		const layout = { rowBreaksByDay: { day_1: [3] } };

		expect(resolveRowBreaks({ layout, day: DAY, rows, rowsPerPage: 7 })).toEqual([3]);
	});
});

describe('resolveCourtBreaks', () => {
	it('falls back to the default grouping with no layout', () => {
		expect(resolveCourtBreaks(scheduleWith(), null)).toEqual([]);
	});

	it('honours a saved empty array rather than re-deriving the default', () => {
		const courts = Array.from({ length: 19 }, (_, index) => ({ id: `court-${index + 1}`, name: `Court ${index + 1}` }));

		expect(resolveCourtBreaks(scheduleWith({ courts }), { courtBreaks: [] })).toEqual([]);
	});
});

describe('getPageStartRows', () => {
	it('gives each page the global row it starts at', () => {
		expect(getPageStartRows([[0, 1], [2], [3, 4, 5]])).toEqual([0, 2, 3]);
	});

	it('handles a single empty page', () => {
		expect(getPageStartRows([[]])).toEqual([0]);
	});
});

describe('getPrintRowsForDay', () => {
	it('gives the grid the day axis rows, and the list the day entries', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'e1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:30', fixtureId: 'f1' },
			],
		});

		// 09:00 to 18:00 in 30-minute slots.
		expect(getPrintRowsForDay('grid', schedule, DAY).rows).toHaveLength(18);
		expect(getPrintRowsForDay('list', schedule, DAY).rows).toHaveLength(1);
	});

	it('treats a grid row as natural to break before when nothing crosses its line', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'e1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:45', fixtureId: 'f1' },
			],
		});
		const { isNaturalBreak } = getPrintRowsForDay('grid', schedule, DAY);

		// The match crosses the 09:30 line at the top of row 1, and ends before row 2.
		expect(isNaturalBreak(1)).toBe(false);
		expect(isNaturalBreak(2)).toBe(true);
	});

	it('does not count a match ending exactly on the line as crossing it', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'e1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:30', fixtureId: 'f1' },
			],
		});

		expect(getPrintRowsForDay('grid', schedule, DAY).isNaturalBreak(1)).toBe(true);
	});

	it('treats a venue-wide break as crossing the lines inside it', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'b1', type: 'break', day: '2026-09-12', courtId: null, startTime: '12:15', endTime: '12:45', title: 'Lunch' },
			],
		});

		// 09:00 + 7 rows of 30 minutes is the 12:30 line.
		expect(getPrintRowsForDay('grid', schedule, DAY).isNaturalBreak(7)).toBe(false);
	});

	it('holds as many rows as the minimum scale allows', () => {
		const expected = Math.floor(PRINT_GRID_HEIGHT_MM.landscape / MIN_MM_PER_MINUTE / 30);

		expect(getPrintRowsForDay('grid', scheduleWith(), DAY).rowsPerPage).toBe(expected);
	});

	it('holds more rows on a portrait sheet', () => {
		const landscape = getPrintRowsForDay('grid', scheduleWith(), DAY, 'landscape').rowsPerPage;
		const portrait = getPrintRowsForDay('grid', scheduleWith(), DAY, 'portrait').rowsPerPage;

		expect(portrait).toBeGreaterThan(landscape);
	});

	it('holds fewer rows when a short match needs more room', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'e1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:20', fixtureId: 'f1' },
			],
		});

		expect(getPrintRowsForDay('grid', schedule, DAY).rowsPerPage).toBeLessThan(
			getPrintRowsForDay('grid', scheduleWith(), DAY).rowsPerPage,
		);
	});

	it('does not let a venue-wide break shrink the page', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'b1', type: 'break', day: '2026-09-12', courtId: null, startTime: '12:00', endTime: '12:10', title: 'Toss' },
			],
		});

		expect(getPrintRowsForDay('grid', schedule, DAY).rowsPerPage).toBe(getPrintRowsForDay('grid', scheduleWith(), DAY).rowsPerPage);
	});

	it('gives the list a page budget for each orientation', () => {
		expect(getPrintRowsForDay('list', scheduleWith(), DAY).rowsPerPage).toBe(PRINT_LIST_ROWS_PER_PAGE.portrait);
		expect(getPrintRowsForDay('list', scheduleWith(), DAY, 'landscape').rowsPerPage).toBe(PRINT_LIST_ROWS_PER_PAGE.landscape);
	});

	it('treats a list row as natural to break before when it starts a new time', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'e1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:30', fixtureId: 'f1' },
				{ id: 'e2', type: 'fixture', day: '2026-09-12', courtId: 'court-2', startTime: '09:00', endTime: '09:30', fixtureId: 'f2' },
				{ id: 'e3', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:30', endTime: '10:00', fixtureId: 'f3' },
			],
		});
		const { isNaturalBreak } = getPrintRowsForDay('list', schedule, DAY);

		// Splitting the two 09:00 fixtures is not natural; starting 09:30 is.
		expect(isNaturalBreak(1)).toBe(false);
		expect(isNaturalBreak(2)).toBe(true);
	});
});

describe('getGridRowsForDay', () => {
	const entry = (id, startTime, endTime) => ({ id, type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime, endTime, fixtureId: id });

	it('places entries in minutes from the start of the day', () => {
		const schedule = scheduleWith({ entries: [entry('e1', '09:10', '09:35')] });
		const [placed] = getGridRowsForDay(schedule, DAY).entries;

		expect(placed.startOffset).toBe(10);
		expect(placed.endOffset).toBe(35);
	});

	it('returns an entry outside the day separately rather than losing it', () => {
		const schedule = scheduleWith({ entries: [entry('e1', '18:30', '19:00'), entry('e2', '09:00', '09:30')] });
		const { entries, outsideEntries } = getGridRowsForDay(schedule, DAY);

		expect(entries.map((item) => item.entry.id)).toEqual(['e2']);
		expect(outsideEntries.map((item) => item.id)).toEqual(['e1']);
	});
});

describe('getMinimumGridScale', () => {
	const item = (startOffset, endOffset, type = 'fixture') => ({ entry: { type }, startOffset, endOffset });

	it('uses the minimum with nothing on the day', () => {
		expect(getMinimumGridScale([])).toBe(MIN_MM_PER_MINUTE);
	});

	it('uses the minimum when every match is long enough', () => {
		expect(getMinimumGridScale([item(0, 50)])).toBe(MIN_MM_PER_MINUTE);
	});

	it('rises for a short match', () => {
		expect(getMinimumGridScale([item(0, 50), item(50, 75)])).toBeGreaterThan(MIN_MM_PER_MINUTE);
	});

	it('is capped, so a five-minute match does not demand a page per hour', () => {
		expect(getMinimumGridScale([item(0, 5)])).toBe(0.6);
	});

	it('ignores breaks', () => {
		expect(getMinimumGridScale([item(0, 5, 'break')])).toBe(MIN_MM_PER_MINUTE);
	});
});

describe('getGridPrintScale', () => {
	const pages = (...lengths) => lengths.map((length) => Array.from({ length }));

	it('fills the sheet with the longest page', () => {
		const scale = getGridPrintScale({ pages: pages(8, 4), slotMinutes: 60, orientation: 'landscape' });

		expect(scale).toBeCloseTo(PRINT_GRID_HEIGHT_MM.landscape / 480);
	});

	it('still fits the sheet when a saved layout puts a long day on one page', () => {
		const scale = getGridPrintScale({ pages: pages(36), slotMinutes: 30, orientation: 'landscape' });

		expect(scale * 36 * 30).toBeCloseTo(PRINT_GRID_HEIGHT_MM.landscape);
		expect(scale).toBeLessThan(MIN_MM_PER_MINUTE);
	});

	it('leaves room for anything else the page has to hold', () => {
		const scale = getGridPrintScale({ pages: pages(36), slotMinutes: 30, orientation: 'landscape', reservedMm: 20 });

		expect(scale * 36 * 30).toBeCloseTo(PRINT_GRID_HEIGHT_MM.landscape - 20);
	});

	it('stops growing on a short day', () => {
		expect(getGridPrintScale({ pages: pages(2), slotMinutes: 30, orientation: 'portrait' })).toBe(MAX_MM_PER_MINUTE);
	});

	it('survives a day with no rows', () => {
		expect(getGridPrintScale({ pages: pages(0), slotMinutes: 30, orientation: 'landscape' })).toBe(MAX_MM_PER_MINUTE);
	});
});

describe('getPageBlocks', () => {
	const item = (id, startOffset, endOffset) => ({ entry: { id }, startOffset, endOffset });
	const page = { startOffset: 60, endOffset: 120 };

	it('measures a block from the top of its page', () => {
		expect(getPageBlocks([item('a', 70, 95)], page)).toEqual([
			{ entry: { id: 'a' }, top: 10, length: 25, continuesFromPrevious: false, continuesToNext: false },
		]);
	});

	it('leaves out entries wholly on other pages, including ones touching the edge', () => {
		expect(getPageBlocks([item('a', 0, 60), item('b', 120, 150)], page)).toEqual([]);
	});

	it('clips a match crossing the top of the page and marks it', () => {
		expect(getPageBlocks([item('a', 45, 90)], page)).toEqual([
			{ entry: { id: 'a' }, top: 0, length: 30, continuesFromPrevious: true, continuesToNext: false },
		]);
	});

	it('clips a match crossing the foot of the page and marks it', () => {
		expect(getPageBlocks([item('a', 100, 150)], page)).toEqual([
			{ entry: { id: 'a' }, top: 40, length: 20, continuesFromPrevious: false, continuesToNext: true },
		]);
	});

	it('shows a match spanning a whole page on that page', () => {
		const [block] = getPageBlocks([item('a', 30, 150)], page);

		expect(block).toMatchObject({ top: 0, length: 60, continuesFromPrevious: true, continuesToNext: true });
	});
});

describe('getBlockTier', () => {
	it('says less as a block gets shorter', () => {
		expect(getBlockTier(25)).toBe('tall');
		expect(getBlockTier(14)).toBe('full');
		expect(getBlockTier(10)).toBe('compact');
		expect(getBlockTier(5)).toBe('minimal');
	});
});

describe('materialisePrintLayout', () => {
	it('turns no layout into an explicit one matching the smart default', () => {
		const layout = materialisePrintLayout({ type: 'grid', schedule: scheduleWith(), layout: null });

		expect(layout.orientation).toBe('landscape');
		expect(layout.courtBreaks).toEqual([]);
		// Nine hours at the minimum scale fits one landscape sheet.
		expect(layout.rowBreaksByDay.day_1).toEqual([]);
	});

	it('takes its default breaks from the layout orientation', () => {
		const longDay = scheduleWith({ settings: { dayStartTime: '08:00', dayEndTime: '20:00', slotMinutes: 30 } });
		const { rowsPerPage } = getPrintRowsForDay('grid', longDay, DAY, 'landscape');

		expect(materialisePrintLayout({ type: 'grid', schedule: longDay, layout: null }).rowBreaksByDay.day_1).toEqual([rowsPerPage]);

		const portrait = materialisePrintLayout({ type: 'grid', schedule: longDay, layout: { orientation: 'portrait' } });

		expect(portrait.orientation).toBe('portrait');
		expect(portrait.rowBreaksByDay.day_1).toEqual([]);
	});

	it('gives the list no court breaks', () => {
		const courts = Array.from({ length: 19 }, (_, index) => ({ id: `court-${index + 1}`, name: `Court ${index + 1}` }));
		const layout = materialisePrintLayout({ type: 'list', schedule: scheduleWith({ courts }), layout: null });

		expect(layout.courtBreaks).toEqual([]);
	});

	it('drops a day the schedule no longer has, because it rebuilds from the days that exist', () => {
		const layout = materialisePrintLayout({
			type: 'grid',
			schedule: scheduleWith(),
			layout: { rowBreaksByDay: { day_1: [3], day_gone: [2] } },
		});

		expect(Object.keys(layout.rowBreaksByDay)).toEqual(['day_1']);
	});

	it('skips a disabled day entirely', () => {
		const schedule = scheduleWith({ days: [{ ...DAY, enabled: false }] });

		expect(materialisePrintLayout({ type: 'grid', schedule, layout: null }).rowBreaksByDay).toEqual({});
	});
});

describe('pruneStalePrintLayout', () => {
	const layout = {
		orientation: 'landscape',
		courtBreaks: ['court-2', 'court-gone'],
		rowBreaksByDay: { day_1: [3], day_gone: [2] },
	};

	it('reports nothing for an absent layout', () => {
		expect(pruneStalePrintLayout(null, { dayIds: [], courtIds: [] })).toEqual({ layout: null, dropped: false });
	});

	it('drops breaks naming a missing day or court and says that it did', () => {
		const result = pruneStalePrintLayout(layout, { dayIds: ['day_1'], courtIds: ['court-1', 'court-2'] });

		expect(result.dropped).toBe(true);
		expect(result.layout.rowBreaksByDay).toEqual({ day_1: [3] });
		expect(result.layout.courtBreaks).toEqual(['court-2']);
	});

	it('reports no drop when everything still resolves', () => {
		const result = pruneStalePrintLayout(
			{ orientation: 'landscape', courtBreaks: ['court-2'], rowBreaksByDay: { day_1: [3] } },
			{ dayIds: ['day_1'], courtIds: ['court-1', 'court-2'] },
		);

		expect(result.dropped).toBe(false);
	});
});

// The printed list view reads its rows through getDayEntries, which used to
// sort by time alone — so two matches at the same time came out in whatever
// order they were stored in, and the printed list could disagree with the grid
// printed beside it.
describe('getDayEntries court ordering', () => {
	it('orders same-time entries by court position, with a schedule-wide break first', () => {
		const courts = Array.from({ length: 11 }, (_, index) => ({ id: `court-${index + 1}`, name: `Court ${index + 1}` }));
		const schedule = scheduleWith({
			courts,
			entries: [
				{ id: 'c10', type: 'fixture', day: '2026-09-12', courtId: 'court-10', startTime: '09:00', endTime: '09:30', fixtureId: 'f1' },
				{ id: 'c2', type: 'fixture', day: '2026-09-12', courtId: 'court-2', startTime: '09:00', endTime: '09:30', fixtureId: 'f2' },
				{ id: 'lunch', type: 'break', day: '2026-09-12', courtId: null, startTime: '09:00', endTime: '09:30', title: 'Lunch' },
				{ id: 'c1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:30', fixtureId: 'f3' },
			],
		});

		expect(getDayEntries(schedule, '2026-09-12').map((e) => e.id)).toEqual(['lunch', 'c1', 'c2', 'c10']);
	});

	it('still orders by time before court', () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'later', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '10:00', endTime: '10:30', fixtureId: 'f1' },
				{ id: 'earlier', type: 'fixture', day: '2026-09-12', courtId: 'court-2', startTime: '09:00', endTime: '09:30', fixtureId: 'f2' },
			],
		});

		expect(getDayEntries(schedule, '2026-09-12').map((e) => e.id)).toEqual(['earlier', 'later']);
	});
});
