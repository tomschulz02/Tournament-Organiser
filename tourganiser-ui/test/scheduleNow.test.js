import { describe, it, expect } from 'vitest';
import {
	scheduleClock,
	todaysSlots,
	currentSlot,
	nextSlot,
	slotsMissingResults,
	onCourtNow,
	dayTimeline,
	foldFinishedGroups,
} from '../src/components/tournament/scheduleNow';

// Two days, two courts. Day 1 has slots at 09:00 and 10:00 (court 2 runs a
// longer match at 10:00) and a lunch break; day 2 has one slot.
const schedule = {
	days: [
		{ id: 'd1', date: '2026-09-19', label: 'Day 1', enabled: true },
		{ id: 'd2', date: '2026-09-20', label: 'Day 2', enabled: true },
	],
	courts: [
		{ id: 'c1', name: 'Court 1' },
		{ id: 'c2', name: 'Court 2' },
	],
	entries: [
		{ id: 'e4', type: 'fixture', day: '2026-09-19', courtId: 'c2', startTime: '10:00', endTime: '11:15', fixtureId: 'f4' },
		{ id: 'e1', type: 'fixture', day: '2026-09-19', courtId: 'c1', startTime: '09:00', endTime: '10:00', fixtureId: 'f1' },
		{ id: 'e2', type: 'fixture', day: '2026-09-19', courtId: 'c2', startTime: '09:00', endTime: '10:00', fixtureId: 'f2' },
		{ id: 'e3', type: 'fixture', day: '2026-09-19', courtId: 'c1', startTime: '10:00', endTime: '11:00', fixtureId: 'f3' },
		{ id: 'b1', type: 'break', day: '2026-09-19', courtId: null, startTime: '12:00', endTime: '13:00', fixtureId: null },
		{ id: 'e5', type: 'fixture', day: '2026-09-20', courtId: 'c1', startTime: '09:00', endTime: '10:00', fixtureId: 'f5' },
		// Scheduled, then its fixture was deleted.
		{ id: 'e6', type: 'fixture', day: '2026-09-19', courtId: 'c1', startTime: '14:00', endTime: '15:00', fixtureId: 'gone' },
	],
};

const fixtures = [
	{ id: 'f1', status: 'COMPLETED' },
	{ id: 'f2', status: 'UPCOMING' },
	{ id: 'f3', status: 'LIVE' },
	{ id: 'f4', status: 'UPCOMING' },
	{ id: 'f5', status: 'UPCOMING' },
];

const at = (time, date = '2026-09-19') => ({ date, time });
const ids = (slot) => slot.matches.map(({ fixture }) => fixture.id);

describe('scheduleClock', () => {
	it('reads the local date and a zero-padded time from a Date', () => {
		expect(scheduleClock(new Date(2026, 8, 19, 9, 5))).toEqual({ date: '2026-09-19', time: '09:05' });
		expect(scheduleClock(new Date(2026, 11, 1, 14, 30))).toEqual({ date: '2026-12-01', time: '14:30' });
	});
});

describe('todaysSlots', () => {
	it("groups today's fixture entries by start time, in court order, without breaks or deleted fixtures", () => {
		const slots = todaysSlots(schedule, fixtures, at('08:00'));

		expect(slots.map((slot) => slot.startTime)).toEqual(['09:00', '10:00']);
		expect(ids(slots[0])).toEqual(['f1', 'f2']);
		expect(ids(slots[1])).toEqual(['f3', 'f4']);
	});

	it('ends a slot when its longest match does', () => {
		const [first, second] = todaysSlots(schedule, fixtures, at('08:00'));

		expect(first.endTime).toBe('10:00');
		expect(second.endTime).toBe('11:15');
	});

	it('uses only the day that falls on now', () => {
		expect(todaysSlots(schedule, fixtures, at('08:00', '2026-09-20')).map(ids)).toEqual([['f5']]);
	});

	it('is empty with no schedule, no entries, or no tournament day today', () => {
		expect(todaysSlots(null, fixtures, at('09:30'))).toEqual([]);
		expect(todaysSlots({ days: schedule.days, entries: [] }, fixtures, at('09:30'))).toEqual([]);
		expect(todaysSlots(schedule, fixtures, at('09:30', '2026-09-18'))).toEqual([]);
		expect(todaysSlots(schedule, [], at('09:30'))).toEqual([]);
		expect(todaysSlots(schedule, null, at('09:30'))).toEqual([]);
		expect(todaysSlots({}, fixtures, at('09:30'))).toEqual([]);
		expect(todaysSlots({ days: schedule.days }, fixtures, at('09:30'))).toEqual([]);
		expect(todaysSlots(schedule, fixtures, undefined)).toEqual([]);
	});
});

describe('currentSlot and nextSlot', () => {
	it('before play starts: nothing current, the first slot next', () => {
		expect(currentSlot(schedule, fixtures, at('08:30'))).toBeNull();
		expect(nextSlot(schedule, fixtures, at('08:30')).startTime).toBe('09:00');
	});

	it('during a slot: that slot is current, the following one next', () => {
		expect(currentSlot(schedule, fixtures, at('09:00')).startTime).toBe('09:00');
		expect(currentSlot(schedule, fixtures, at('09:59')).startTime).toBe('09:00');
		expect(nextSlot(schedule, fixtures, at('09:30')).startTime).toBe('10:00');
	});

	it('hands over at the boundary and keeps a slot current until its longest match ends', () => {
		expect(currentSlot(schedule, fixtures, at('10:00')).startTime).toBe('10:00');
		expect(currentSlot(schedule, fixtures, at('11:10')).startTime).toBe('10:00');
		expect(currentSlot(schedule, fixtures, at('11:15'))).toBeNull();
	});

	it('after the last slot: nothing current or next', () => {
		expect(currentSlot(schedule, fixtures, at('16:00'))).toBeNull();
		expect(nextSlot(schedule, fixtures, at('10:30'))).toBeNull();
	});

	it('on a day with no play, and with no schedule, both are null', () => {
		expect(currentSlot(schedule, fixtures, at('09:30', '2026-09-21'))).toBeNull();
		expect(nextSlot(schedule, fixtures, at('08:00', '2026-09-21'))).toBeNull();
		expect(currentSlot(undefined, fixtures, at('09:30'))).toBeNull();
		expect(nextSlot(undefined, fixtures, at('08:00'))).toBeNull();
	});
});

describe('slotsMissingResults', () => {
	it('is empty before any slot has finished', () => {
		expect(slotsMissingResults(schedule, fixtures, at('08:00'))).toEqual([]);
		expect(slotsMissingResults(schedule, fixtures, at('09:45'))).toEqual([]);
	});

	it('lists a finished slot with only its unresolved fixtures', () => {
		const missing = slotsMissingResults(schedule, fixtures, at('10:30'));

		expect(missing).toHaveLength(1);
		expect(missing[0].startTime).toBe('09:00');
		expect(missing[0].missing.map((fixture) => fixture.id)).toEqual(['f2']);
	});

	it('does not count a slot still being played, and counts it once its longest match ends', () => {
		expect(slotsMissingResults(schedule, fixtures, at('11:00')).map((slot) => slot.startTime)).toEqual(['09:00']);
		expect(slotsMissingResults(schedule, fixtures, at('11:15')).map((slot) => slot.startTime)).toEqual([
			'09:00',
			'10:00',
		]);
	});

	it('treats completed and cancelled matches as resolved', () => {
		const resolved = fixtures.map((fixture) => ({
			...fixture,
			status: fixture.id === 'f2' ? 'CANCELLED' : 'COMPLETED',
		}));

		expect(slotsMissingResults(schedule, resolved, at('16:00'))).toEqual([]);
	});

	it('is empty on a day with no play and with no schedule', () => {
		expect(slotsMissingResults(schedule, fixtures, at('16:00', '2026-09-21'))).toEqual([]);
		expect(slotsMissingResults(null, fixtures, at('16:00'))).toEqual([]);
	});
});

describe('onCourtNow', () => {
	const fixtureIds = (cards) => cards.map(({ fixture }) => fixture.id);

	it("is the current slot's matches in court order, finished ones included", () => {
		const done = fixtures.map((fixture) => (fixture.id === 'f2' ? { ...fixture, status: 'COMPLETED' } : fixture));

		expect(fixtureIds(onCourtNow(schedule, done, at('09:30')))).toEqual(['f1', 'f2']);
		expect(onCourtNow(schedule, done, at('09:30'))[0].entry.courtId).toBe('c1');
	});

	it('adds a LIVE match from an earlier slot that overran', () => {
		const overran = fixtures.map((fixture) => (fixture.id === 'f2' ? { ...fixture, status: 'LIVE' } : fixture));

		// f2 (court 2, 09:00) is still live in the 10:00 slot; court 1 sorts first.
		expect(fixtureIds(onCourtNow(schedule, overran, at('10:10')))).toEqual(['f3', 'f2', 'f4']);
	});

	it('between slots and after play shows only overrunning LIVE matches', () => {
		expect(fixtureIds(onCourtNow(schedule, fixtures, at('11:30')))).toEqual(['f3']);
		expect(onCourtNow(schedule, fixtures, at('08:00'))).toEqual([]);
	});

	it('without slots today falls back to LIVE fixtures by match number, with no entry', () => {
		const live = [
			{ id: 'x2', status: 'LIVE', match_no: 7 },
			{ id: 'x1', status: 'LIVE', match_no: 3 },
			{ id: 'x3', status: 'UPCOMING', match_no: 1 },
			{ id: 'x4', status: 'LIVE' },
		];

		expect(onCourtNow(null, live, at('09:30'))).toEqual([
			{ entry: null, fixture: live[3] },
			{ entry: null, fixture: live[1] },
			{ entry: null, fixture: live[0] },
		]);
		expect(fixtureIds(onCourtNow(schedule, live, at('09:30', '2026-09-21')))).toEqual(['x4', 'x1', 'x2']);
		expect(onCourtNow(null, null, at('09:30'))).toEqual([]);
	});
});

describe('dayTimeline', () => {
	const states = (rows) => rows.map((row) => [row.startTime, ...row.cells.map((cell) => cell.state)]);

	it('gives one row per slot and one cell per court', () => {
		expect(states(dayTimeline(schedule, fixtures, at('08:00')))).toEqual([
			['09:00', 'done', 'upcoming'],
			['10:00', 'live', 'upcoming'],
		]);
	});

	it('marks an unresolved match missing once its slot has finished', () => {
		expect(states(dayTimeline(schedule, fixtures, at('11:20')))).toEqual([
			['09:00', 'done', 'missing'],
			['10:00', 'live', 'missing'],
		]);
	});

	it('marks cancelled as done, an empty court as free, and carries the fixture', () => {
		const withCancel = fixtures.map((fixture) => (fixture.id === 'f2' ? { ...fixture, status: 'CANCELLED' } : fixture));
		const threeCourts = { ...schedule, courts: [...schedule.courts, { id: 'c3', name: 'Court 3' }] };
		const [first] = dayTimeline(threeCourts, withCancel, at('16:00'));

		expect(first.cells.map((cell) => cell.state)).toEqual(['done', 'done', 'free']);
		expect(first.cells[0].fixture.id).toBe('f1');
		expect(first.cells[2].fixture).toBeNull();
	});

	it('is empty with no schedule or no play today', () => {
		expect(dayTimeline(null, fixtures, at('09:30'))).toEqual([]);
		expect(dayTimeline(schedule, fixtures, at('09:30', '2026-09-21'))).toEqual([]);
	});
});

describe('foldFinishedGroups', () => {
	const match = (status, endTime = '10:00') => ({ type: 'fixture', endTime, fixture: { status } });
	const lunch = (endTime) => ({ type: 'break', endTime, fixture: null });
	const group = (startTime, ...entries) => ({ startTime, entries });
	const shape = (segments) => segments.map((s) => (s.type === 'fold' ? `fold ${s.startTime}-${s.endTime} ${s.played}` : s.group.startTime));

	it('folds a run of finished slots into one segment ending with its last match', () => {
		const groups = [
			group('08:00', match('COMPLETED', '08:50'), match('CANCELLED', '08:50')),
			group('08:50', match('COMPLETED', '09:40'), match('COMPLETED', '09:55')),
			group('09:40', match('LIVE', '10:30'), match('COMPLETED', '10:30')),
			group('10:30', match('UPCOMING', '11:20')),
		];

		expect(shape(foldFinishedGroups(groups))).toEqual(['fold 08:00-09:55 4', '09:40', '10:30']);
	});

	it('folds separate runs separately and leaves open slots alone', () => {
		const groups = [
			group('08:00', match('COMPLETED')),
			group('09:00', match('UPCOMING')),
			group('10:00', match('COMPLETED', '11:00')),
		];

		expect(shape(foldFinishedGroups(groups))).toEqual(['fold 08:00-10:00 1', '09:00', 'fold 10:00-11:00 1']);
	});

	it('folds a break between two finished slots into the run, but not at its edge', () => {
		const between = [group('11:00', match('COMPLETED', '12:00')), group('12:00', lunch('13:00')), group('13:00', match('COMPLETED', '14:00'))];
		const edge = [group('11:00', match('COMPLETED', '12:00')), group('12:00', lunch('13:00')), group('13:00', match('UPCOMING', '14:00'))];
		const first = [group('07:30', lunch('08:00')), group('08:00', match('COMPLETED', '09:00'))];

		expect(shape(foldFinishedGroups(between))).toEqual(['fold 11:00-14:00 2']);
		expect(shape(foldFinishedGroups(edge))).toEqual(['fold 11:00-12:00 1', '12:00', '13:00']);
		expect(shape(foldFinishedGroups(first))).toEqual(['07:30', 'fold 08:00-09:00 1']);
	});

	it('keeps the folded groups, and returns nothing for no groups', () => {
		const groups = [group('08:00', match('COMPLETED')), group('09:00', match('COMPLETED'))];

		expect(foldFinishedGroups(groups)[0].groups).toEqual(groups);
		expect(foldFinishedGroups([])).toEqual([]);
	});
});
