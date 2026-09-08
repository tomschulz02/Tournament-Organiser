import { describe, it, expect } from 'vitest';
import {
	chunkAtBreaks,
	computeSmartDefaultCourtBreaks,
	computeSmartDefaultRowBreaks,
	courtBreakIndices,
	normalisePrintLayouts,
	normaliseSchedule,
	pruneStalePrintLayout,
	serialisePrintLayouts,
	serialiseScheduleForSave,
} from '../src/utils/scheduleUtils';
import {
	COURTS_PER_GROUP,
	getPageStartRows,
	getPrintRowsForDay,
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

	it("treats a grid row as natural to break before when the row above it is empty", () => {
		const schedule = scheduleWith({
			entries: [
				{ id: 'e1', type: 'fixture', day: '2026-09-12', courtId: 'court-1', startTime: '09:00', endTime: '09:30', fixtureId: 'f1' },
			],
		});
		const { isNaturalBreak } = getPrintRowsForDay('grid', schedule, DAY);

		// Row 0 is occupied, so breaking before row 1 would cut across it.
		expect(isNaturalBreak(1)).toBe(false);
		expect(isNaturalBreak(2)).toBe(true);
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

describe('materialisePrintLayout', () => {
	it('turns no layout into an explicit one matching the smart default', () => {
		const layout = materialisePrintLayout({ type: 'grid', schedule: scheduleWith(), layout: null });

		expect(layout.orientation).toBe('landscape');
		expect(layout.courtBreaks).toEqual([]);
		expect(layout.rowBreaksByDay.day_1).toEqual([7, 14]);
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
