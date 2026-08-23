import { describe, it, expect } from 'vitest';
import {
	SCHEDULE_VERSION,
	DEFAULT_SCHEDULE_START,
	DEFAULT_SCHEDULE_END,
	DEFAULT_SLOT_MINUTES,
	createScheduleId,
	parseDateOnly,
	formatDateIso,
	formatDateLabel,
	normaliseTournamentDays,
	timeToMinutes,
	minutesToTime,
	addMinutesToTime,
	compareTimes,
	isTimeRangeValid,
	rangesOverlap,
	sortScheduleEntries,
	normaliseFixtures,
	extractPoolKey,
	buildFixtureIndex,
	getScheduledFixtureIds,
	getUnscheduledFixtures,
	buildCourtList,
	buildEmptySchedule,
	normaliseSchedule,
	getScheduleForTournament,
	createFixtureEntry,
	createBreakEntry,
	findEntryConflict,
	validateScheduleEntry,
	upsertScheduleEntry,
	removeScheduleEntry,
	getCourtName,
	getDayEntries,
	calculateScheduledStats,
	getDayBounds,
	getSlotMinutes,
	buildTimeSlots,
	buildGridRowTimes,
	getEntryRowPlacement,
	getEntrySlotSpan,
	serialiseScheduleForSave,
} from '../src/utils/scheduleUtils';

function entry(overrides = {}) {
	return {
		id: 'entry-1',
		type: 'fixture',
		day: '2026-08-01',
		courtId: 'court-1',
		startTime: '09:00',
		endTime: '10:00',
		fixtureId: 'f1',
		title: '',
		officials: '',
		notes: '',
		...overrides,
	};
}

function schedule(overrides = {}) {
	return {
		version: SCHEDULE_VERSION,
		days: [{ id: 'day-1', date: '2026-08-01', label: 'Day 1' }],
		courts: [{ id: 'court-1', name: 'Court 1' }],
		entries: [],
		settings: {
			dayStartTime: DEFAULT_SCHEDULE_START,
			dayEndTime: DEFAULT_SCHEDULE_END,
			slotMinutes: DEFAULT_SLOT_MINUTES,
		},
		...overrides,
	};
}

describe('createScheduleId', () => {
	it('prefixes the id and keeps successive ids distinct', () => {
		const first = createScheduleId('entry');
		const second = createScheduleId('entry');

		expect(first.startsWith('entry_')).toBe(true);
		expect(first).not.toBe(second);
	});

	it('defaults the prefix', () => {
		expect(createScheduleId().startsWith('schedule_')).toBe(true);
	});
});

// These helpers deliberately work in local time, not UTC: a tournament day is
// the organiser's calendar day.
describe('parseDateOnly', () => {
	it('reads an ISO date string at local midnight', () => {
		const parsed = parseDateOnly('2026-08-01');

		expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual([2026, 7, 1]);
		expect([parsed.getHours(), parsed.getMinutes()]).toEqual([0, 0]);
	});

	it('takes the leading date from a full timestamp, ignoring the time', () => {
		const parsed = parseDateOnly('2026-08-01T23:45:00.000Z');

		expect(formatDateIso(parsed)).toBe('2026-08-01');
	});

	it('strips the time from a Date', () => {
		const parsed = parseDateOnly(new Date(2026, 7, 1, 22, 30));

		expect(formatDateIso(parsed)).toBe('2026-08-01');
		expect(parsed.getHours()).toBe(0);
	});

	it('falls back to Date parsing for a non-ISO string', () => {
		expect(formatDateIso(parseDateOnly('August 1, 2026'))).toBe('2026-08-01');
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['an empty string', ''],
		['an unparseable string', 'not a date'],
		['a number', 12345],
	])('returns null for %s', (_label, value) => {
		expect(parseDateOnly(value)).toBeNull();
	});
});

describe('formatDateIso', () => {
	it('zero-pads month and day', () => {
		expect(formatDateIso(new Date(2026, 0, 5))).toBe('2026-01-05');
	});

	it('returns an empty string for no date', () => {
		expect(formatDateIso(null)).toBe('');
		expect(formatDateIso(undefined)).toBe('');
	});
});

describe('formatDateLabel', () => {
	it('renders a readable label', () => {
		// Locale-dependent, so assert the parts rather than an exact string.
		const label = formatDateLabel('2026-08-01');

		expect(label).toMatch(/Aug/);
		expect(label).toMatch(/1/);
	});

	it('returns the original value when it cannot be parsed', () => {
		expect(formatDateLabel('not a date')).toBe('not a date');
	});

	it('returns an empty string for nothing', () => {
		expect(formatDateLabel(null)).toBe('');
	});
});

describe('normaliseTournamentDays', () => {
	it('expands a start and end into one entry per day, inclusive', () => {
		const days = normaliseTournamentDays('2026-08-01', '2026-08-03');

		expect(days.map((day) => day.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
		expect(days.map((day) => day.label)).toEqual(['Day 1', 'Day 2', 'Day 3']);
	});

	it('produces a single day when start and end are the same', () => {
		expect(normaliseTournamentDays('2026-08-01', '2026-08-01')).toHaveLength(1);
	});

	it('treats a missing end date as a one-day tournament', () => {
		expect(normaliseTournamentDays('2026-08-01', null).map((day) => day.date)).toEqual(['2026-08-01']);
	});

	it('crosses a month boundary', () => {
		expect(normaliseTournamentDays('2026-01-31', '2026-02-01').map((day) => day.date)).toEqual([
			'2026-01-31',
			'2026-02-01',
		]);
	});

	// Renaming a day must survive a re-normalisation, or the organiser's edit is
	// lost every time the schedule is rebuilt.
	it('keeps the id and label of a day that already existed', () => {
		const existing = [{ id: 'day-keep', date: '2026-08-02', label: 'Finals Day' }];
		const days = normaliseTournamentDays('2026-08-01', '2026-08-02', existing);

		expect(days[1]).toEqual({ id: 'day-keep', date: '2026-08-02', label: 'Finals Day' });
		expect(days[0].label).toBe('Day 1');
	});

	it('drops an existing day that falls outside the new range', () => {
		const existing = [{ id: 'day-old', date: '2026-07-30', label: 'Old' }];

		expect(normaliseTournamentDays('2026-08-01', '2026-08-01', existing).map((d) => d.date)).toEqual(['2026-08-01']);
	});

	it('returns an empty range when there are no dates and no existing days', () => {
		expect(normaliseTournamentDays(null, null)).toEqual([]);
	});

	it('falls back to the existing days when there are no dates', () => {
		const existing = [{ date: '2026-08-01' }, { id: 'kept', date: '2026-08-02', label: 'Named' }];
		const days = normaliseTournamentDays(null, null, existing);

		expect(days).toHaveLength(2);
		expect(days[0].label).toBe('Day 1');
		expect(days[1]).toEqual({ id: 'kept', date: '2026-08-02', label: 'Named' });
		expect(days[0].id).toMatch(/^day_/);
	});

	it('returns nothing when the end date precedes the start', () => {
		expect(normaliseTournamentDays('2026-08-03', '2026-08-01')).toEqual([]);
	});
});

describe('time arithmetic', () => {
	describe('timeToMinutes', () => {
		it.each([
			['00:00', 0],
			['09:00', 540],
			['09:30', 570],
			['23:59', 1439],
		])('converts %s', (time, expected) => {
			expect(timeToMinutes(time)).toBe(expected);
		});

		it('reads an hour with no minutes part', () => {
			expect(timeToMinutes('9')).toBe(540);
		});

		it.each([
			['an empty string', ''],
			['null', null],
			['undefined', undefined],
			['a number', 900],
		])('returns 0 for %s', (_label, value) => {
			expect(timeToMinutes(value)).toBe(0);
		});
	});

	describe('minutesToTime', () => {
		it.each([
			[0, '00:00'],
			[540, '09:00'],
			[570, '09:30'],
			[1439, '23:59'],
		])('converts %i', (minutes, expected) => {
			expect(minutesToTime(minutes)).toBe(expected);
		});

		it('clamps a negative value to midnight', () => {
			expect(minutesToTime(-30)).toBe('00:00');
		});

		it('runs past 24 hours rather than wrapping', () => {
			expect(minutesToTime(1500)).toBe('25:00');
		});
	});

	describe('addMinutesToTime', () => {
		it('adds within the hour and across it', () => {
			expect(addMinutesToTime('09:00', 30)).toBe('09:30');
			expect(addMinutesToTime('09:45', 30)).toBe('10:15');
		});

		it('subtracts a negative amount, clamping at midnight', () => {
			expect(addMinutesToTime('09:00', -30)).toBe('08:30');
			expect(addMinutesToTime('00:15', -30)).toBe('00:00');
		});
	});

	describe('compareTimes', () => {
		it('orders earlier before later and reports equality as zero', () => {
			expect(compareTimes('09:00', '10:00')).toBeLessThan(0);
			expect(compareTimes('10:00', '09:00')).toBeGreaterThan(0);
			expect(compareTimes('09:00', '09:00')).toBe(0);
		});
	});

	describe('isTimeRangeValid', () => {
		it('requires the end to be strictly after the start', () => {
			expect(isTimeRangeValid('09:00', '10:00')).toBe(true);
			expect(isTimeRangeValid('09:00', '09:00')).toBe(false);
			expect(isTimeRangeValid('10:00', '09:00')).toBe(false);
		});
	});

	describe('rangesOverlap', () => {
		it('detects a partial overlap from either side', () => {
			expect(rangesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true);
			expect(rangesOverlap('09:30', '10:30', '09:00', '10:00')).toBe(true);
		});

		it('detects containment', () => {
			expect(rangesOverlap('09:00', '12:00', '10:00', '11:00')).toBe(true);
			expect(rangesOverlap('10:00', '11:00', '09:00', '12:00')).toBe(true);
		});

		// Back-to-back slots must not count as clashing, or nothing could ever be
		// scheduled consecutively on one court.
		it('treats touching ranges as not overlapping', () => {
			expect(rangesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
			expect(rangesOverlap('10:00', '11:00', '09:00', '10:00')).toBe(false);
		});

		it('treats disjoint ranges as not overlapping', () => {
			expect(rangesOverlap('09:00', '10:00', '14:00', '15:00')).toBe(false);
		});
	});
});

describe('sortScheduleEntries', () => {
	it('orders by day, then time, then court, then id', () => {
		const entries = [
			entry({ id: 'e4', day: '2026-08-02', startTime: '09:00' }),
			entry({ id: 'e3', day: '2026-08-01', startTime: '10:00', courtId: 'court-1' }),
			entry({ id: 'e2', day: '2026-08-01', startTime: '09:00', courtId: 'court-2' }),
			entry({ id: 'e1', day: '2026-08-01', startTime: '09:00', courtId: 'court-1' }),
		];

		expect(sortScheduleEntries(entries).map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
	});

	it('breaks a full tie on id', () => {
		const entries = [entry({ id: 'zz' }), entry({ id: 'aa' })];

		expect(sortScheduleEntries(entries).map((e) => e.id)).toEqual(['aa', 'zz']);
	});

	it('sorts an unassigned court before a named one, from either input order', () => {
		const namedFirst = [entry({ id: 'e2', courtId: 'court-1' }), entry({ id: 'e1', courtId: null })];
		const unassignedFirst = [entry({ id: 'e1', courtId: null }), entry({ id: 'e2', courtId: 'court-1' })];

		expect(sortScheduleEntries(namedFirst).map((e) => e.id)).toEqual(['e1', 'e2']);
		expect(sortScheduleEntries(unassignedFirst).map((e) => e.id)).toEqual(['e1', 'e2']);
	});

	it('does not mutate the array it was given', () => {
		const entries = [entry({ id: 'b' }), entry({ id: 'a' })];
		sortScheduleEntries(entries);

		expect(entries.map((e) => e.id)).toEqual(['b', 'a']);
	});

	it('handles an empty list and no argument', () => {
		expect(sortScheduleEntries([])).toEqual([]);
		expect(sortScheduleEntries()).toEqual([]);
	});
});

describe('normaliseFixtures', () => {
	it('accepts either naming the payload might use for teams', () => {
		const [snake, camel, home] = normaliseFixtures([
			{ id: 'f1', team_1: 'Aces', team_2: 'Bears' },
			{ id: 'f2', team1: 'Cubs', team2: 'Ducks' },
			{ id: 'f3', home_team: 'Eagles', away_team: 'Foxes' },
		]);

		expect([snake.team1, snake.team2]).toEqual(['Aces', 'Bears']);
		expect([camel.team1, camel.team2]).toEqual(['Cubs', 'Ducks']);
		expect([home.team1, home.team2]).toEqual(['Eagles', 'Foxes']);
	});

	it('falls back to TBD for an unbound team', () => {
		const [fixture] = normaliseFixtures([{ id: 'f1' }]);

		expect([fixture.team1, fixture.team2]).toEqual(['TBD', 'TBD']);
	});

	it('numbers a fixture by its position when it carries no match number', () => {
		const fixtures = normaliseFixtures([{ id: 'f1' }, { id: 'f2', match_no: 9 }, { id: 'f3' }]);

		expect(fixtures.map((f) => f.matchNo)).toEqual([1, 9, 3]);
	});

	it('generates an id when the fixture has none', () => {
		expect(normaliseFixtures([{ team1: 'Aces' }])[0].id).toMatch(/^fixture_/);
	});

	it('prefers an explicit group over one derived from the round', () => {
		expect(normaliseFixtures([{ id: 'f1', round: 'Pool Play', group: 'Group C' }])[0].poolKey).toBe('Group C');
	});

	it('builds a lowercase search string from teams, round and match number', () => {
		const [fixture] = normaliseFixtures([{ id: 'f1', team1: 'Aces', team2: 'Bears', round: 'Group A', match_no: 3 }]);

		expect(fixture.searchText).toBe('aces bears group a 3');
	});

	it('keeps the fields it was given', () => {
		expect(normaliseFixtures([{ id: 'f1', status: 'LIVE', division_id: 'div-1' }])[0]).toMatchObject({
			status: 'LIVE',
			division_id: 'div-1',
		});
	});

	it('returns nothing for no fixtures', () => {
		expect(normaliseFixtures()).toEqual([]);
	});
});

describe('extractPoolKey', () => {
	it.each([
		['Group A', 'Group A'],
		['Pool B', 'Pool B'],
		['group c', 'group c'],
		['Round 1 - Group D', 'Group D'],
	])('picks the group out of %s', (round, expected) => {
		expect(extractPoolKey(round)).toBe(expected);
	});

	// A knockout round is not a pool, so court affinity must not bind to it.
	it.each(['Quarterfinals', 'Semifinals', 'Finals'])('returns null for %s', (round) => {
		expect(extractPoolKey(round)).toBeNull();
	});

	// Recording what it does, not what it ought to. "Playoff" contains none of
	// quarter/semi/final, so the third-place match falls through and becomes its
	// own pool key. scheduleGenerator.js does recognise the round by name for
	// ordering, so the two disagree about whether it is a knockout. Harmless
	// today — a tournament has one such match, and court affinity only pays off
	// across several sharing a key — but it is a real inconsistency.
	it('does not recognise the third-place playoff as a knockout round', () => {
		expect(extractPoolKey('3rd Place Playoff')).toBe('3rd Place Playoff');
	});

	it('returns the round itself when it is neither a pool nor a knockout', () => {
		expect(extractPoolKey('League')).toBe('League');
	});

	it('returns null for nothing', () => {
		expect(extractPoolKey(null)).toBeNull();
		expect(extractPoolKey('')).toBeNull();
	});
});

describe('buildFixtureIndex', () => {
	it('keys fixtures by id', () => {
		expect(buildFixtureIndex([{ id: 'f1', team1: 'Aces' }])).toEqual({ f1: { id: 'f1', team1: 'Aces' } });
	});

	it('returns an empty object for no fixtures', () => {
		expect(buildFixtureIndex()).toEqual({});
	});
});

describe('scheduled and unscheduled fixtures', () => {
	const withEntries = schedule({
		entries: [
			entry({ id: 'e1', fixtureId: 'f1' }),
			entry({ id: 'e2', type: 'break', fixtureId: null, title: 'Lunch' }),
		],
	});

	it('collects only the fixture entries that name a fixture', () => {
		expect([...getScheduledFixtureIds(withEntries)]).toEqual(['f1']);
	});

	it('ignores a fixture entry with no fixture id', () => {
		const broken = schedule({ entries: [entry({ fixtureId: null })] });

		expect(getScheduledFixtureIds(broken).size).toBe(0);
	});

	it('returns the fixtures not yet placed', () => {
		const fixtures = [{ id: 'f1' }, { id: 'f2' }];

		expect(getUnscheduledFixtures(withEntries, fixtures).map((f) => f.id)).toEqual(['f2']);
	});

	it('returns every fixture when nothing is scheduled', () => {
		expect(getUnscheduledFixtures(schedule(), [{ id: 'f1' }])).toHaveLength(1);
	});
});

describe('buildCourtList', () => {
	it('numbers courts from one, unrestricted by default', () => {
		expect(buildCourtList(2)).toEqual([
			{ id: 'court-1', name: 'Court 1', divisions: [] },
			{ id: 'court-2', name: 'Court 2', divisions: [] },
		]);
	});

	it('keeps a renamed court that already existed', () => {
		const existing = [{ id: 'court-1', name: 'Centre Court' }];

		expect(buildCourtList(2, existing)[0]).toEqual({ id: 'court-1', name: 'Centre Court', divisions: [] });
	});

	// Reuse is by index, so a restriction on the existing court at that index must
	// carry through rather than being dropped.
	it('preserves the divisions of an existing court it reuses by index', () => {
		const existing = [{ id: 'court-1', name: 'Centre Court', divisions: ['div-1', 'div-2'] }];

		expect(buildCourtList(1, existing)[0]).toEqual({
			id: 'court-1',
			name: 'Centre Court',
			divisions: ['div-1', 'div-2'],
		});
	});

	it('drops courts beyond the requested count', () => {
		const existing = [{ id: 'court-1', name: 'A' }, { id: 'court-2', name: 'B' }];

		expect(buildCourtList(1, existing)).toHaveLength(1);
	});

	it('returns nothing for a count of zero', () => {
		expect(buildCourtList(0)).toEqual([]);
	});
});

describe('buildEmptySchedule', () => {
	it('starts with the default settings and no courts or entries', () => {
		const built = buildEmptySchedule({ startDate: '2026-08-01', endDate: '2026-08-02' });

		expect(built).toMatchObject({
			version: SCHEDULE_VERSION,
			courts: [],
			entries: [],
			settings: {
				dayStartTime: DEFAULT_SCHEDULE_START,
				dayEndTime: DEFAULT_SCHEDULE_END,
				slotMinutes: DEFAULT_SLOT_MINUTES,
			},
		});
		expect(built.days).toHaveLength(2);
	});
});

describe('normaliseSchedule', () => {
	const dates = { startDate: '2026-08-01', endDate: '2026-08-01' };

	it('returns an empty schedule when there is nothing stored', () => {
		expect(normaliseSchedule(null, dates)).toMatchObject({ courts: [], entries: [] });
	});

	it('keeps stored courts and fills in a missing name', () => {
		const raw = { courts: [{ id: 'c1', name: 'Centre' }, {}] };

		expect(normaliseSchedule(raw, dates).courts).toEqual([
			{ id: 'c1', name: 'Centre', divisions: [] },
			{ id: 'court-2', name: 'Court 2', divisions: [] },
		]);
	});

	// An old saved schedule has no divisions key on any court; it must load as
	// unrestricted rather than undefined.
	it('normalises a court with no divisions key to an empty restriction', () => {
		const raw = { courts: [{ id: 'c1', name: 'Centre' }] };

		expect(normaliseSchedule(raw, dates).courts[0].divisions).toEqual([]);
	});

	it('keeps a stored division restriction on a court', () => {
		const raw = { courts: [{ id: 'c1', name: 'Centre', divisions: ['div-1'] }] };

		expect(normaliseSchedule(raw, dates).courts[0]).toEqual({
			id: 'c1',
			name: 'Centre',
			divisions: ['div-1'],
		});
	});

	it('treats a non-array courts value as no courts', () => {
		expect(normaliseSchedule({ courts: 'nope' }, dates).courts).toEqual([]);
	});

	// A half-written entry cannot be drawn, so it is dropped rather than rendered
	// somewhere arbitrary.
	it('discards entries missing an id, day, or either time', () => {
		const raw = {
			entries: [
				entry({ id: 'good' }),
				{ ...entry({ id: 'no-day' }), day: undefined },
				{ ...entry({ id: 'no-start' }), startTime: undefined },
				{ ...entry({ id: 'no-end' }), endTime: undefined },
				{ ...entry(), id: undefined },
			],
		};

		expect(normaliseSchedule(raw, dates).entries.map((e) => e.id)).toEqual(['good']);
	});

	it('coerces an unknown entry type to fixture, and keeps break', () => {
		const raw = {
			entries: [entry({ id: 'a', type: 'nonsense' }), entry({ id: 'b', type: 'break' })],
		};
		const entries = normaliseSchedule(raw, dates).entries;

		expect(entries.find((e) => e.id === 'a').type).toBe('fixture');
		expect(entries.find((e) => e.id === 'b').type).toBe('break');
	});

	it('defaults the optional text fields and the court', () => {
		const raw = { entries: [{ id: 'e1', day: '2026-08-01', startTime: '09:00', endTime: '10:00' }] };

		expect(normaliseSchedule(raw, dates).entries[0]).toEqual({
			id: 'e1',
			type: 'fixture',
			day: '2026-08-01',
			courtId: null,
			startTime: '09:00',
			endTime: '10:00',
			fixtureId: null,
			title: '',
			officials: '',
			notes: '',
		});
	});

	it('returns entries in sorted order', () => {
		const raw = {
			entries: [entry({ id: 'late', startTime: '14:00' }), entry({ id: 'early', startTime: '09:00' })],
		};

		expect(normaliseSchedule(raw, dates).entries.map((e) => e.id)).toEqual(['early', 'late']);
	});

	it('keeps stored settings and falls back for the ones absent', () => {
		const raw = { settings: { dayStartTime: '08:00', slotMinutes: 45 } };

		expect(normaliseSchedule(raw, dates).settings).toEqual({
			dayStartTime: '08:00',
			dayEndTime: DEFAULT_SCHEDULE_END,
			slotMinutes: 45,
		});
	});

	it('falls back when slotMinutes is unusable', () => {
		expect(normaliseSchedule({ settings: { slotMinutes: 'abc' } }, dates).settings.slotMinutes).toBe(
			DEFAULT_SLOT_MINUTES
		);
		expect(normaliseSchedule({ settings: { slotMinutes: 0 } }, dates).settings.slotMinutes).toBe(
			DEFAULT_SLOT_MINUTES
		);
	});

	it('keeps a stored version and defaults a missing one', () => {
		expect(normaliseSchedule({ version: 7 }, dates).version).toBe(7);
		expect(normaliseSchedule({}, dates).version).toBe(SCHEDULE_VERSION);
	});
});

describe('getScheduleForTournament', () => {
	it('reads either naming for the tournament dates', () => {
		expect(getScheduleForTournament({ start_date: '2026-08-01', end_date: '2026-08-02' }).days).toHaveLength(2);
		expect(getScheduleForTournament({ startDate: '2026-08-01', endDate: '2026-08-03' }).days).toHaveLength(3);
	});

	it('treats a tournament with only a start date as one day long', () => {
		expect(getScheduleForTournament({ startDate: '2026-08-01' }).days).toHaveLength(1);
	});

	it('returns an empty schedule for a tournament with no schedule', () => {
		expect(getScheduleForTournament({ startDate: '2026-08-01' }).entries).toEqual([]);
	});

	it('tolerates being called with nothing', () => {
		expect(getScheduleForTournament()).toMatchObject({ days: [], entries: [] });
	});
});

describe('entry construction', () => {
	it('builds a fixture entry', () => {
		const built = createFixtureEntry({
			day: '2026-08-01',
			courtId: 'court-1',
			startTime: '09:00',
			endTime: '10:00',
			fixtureId: 'f1',
			officials: 'Ref A',
		});

		expect(built).toMatchObject({
			type: 'fixture',
			day: '2026-08-01',
			courtId: 'court-1',
			fixtureId: 'f1',
			officials: 'Ref A',
			title: '',
			notes: '',
		});
		expect(built.id).toMatch(/^entry_/);
	});

	it('builds a break entry, which belongs to no court by default', () => {
		const built = createBreakEntry({ day: '2026-08-01', startTime: '12:00', endTime: '13:00', title: 'Lunch' });

		expect(built).toMatchObject({
			type: 'break',
			courtId: null,
			fixtureId: null,
			title: 'Lunch',
			officials: '',
		});
	});

	it('allows a break to be pinned to one court', () => {
		const built = createBreakEntry({
			day: '2026-08-01',
			startTime: '12:00',
			endTime: '13:00',
			title: 'Repairs',
			courtId: 'court-2',
		});

		expect(built.courtId).toBe('court-2');
	});
});

describe('findEntryConflict', () => {
	const existing = entry({ id: 'existing', startTime: '09:00', endTime: '10:00', courtId: 'court-1' });

	it('finds an overlap on the same court and day', () => {
		const candidate = entry({ id: 'new', startTime: '09:30', endTime: '10:30' });

		expect(findEntryConflict([existing], candidate)?.id).toBe('existing');
	});

	it('allows a back-to-back slot on the same court', () => {
		const candidate = entry({ id: 'new', startTime: '10:00', endTime: '11:00' });

		expect(findEntryConflict([existing], candidate)).toBeUndefined();
	});

	it('allows the same time on a different court', () => {
		const candidate = entry({ id: 'new', courtId: 'court-2' });

		expect(findEntryConflict([existing], candidate)).toBeUndefined();
	});

	it('allows the same time on a different day', () => {
		const candidate = entry({ id: 'new', day: '2026-08-02' });

		expect(findEntryConflict([existing], candidate)).toBeUndefined();
	});

	// An all-courts break blocks every court, and a new all-courts entry is
	// blocked by anything already there.
	it('treats an entry on no particular court as occupying all of them', () => {
		const allCourts = entry({ id: 'break', type: 'break', courtId: null });

		expect(findEntryConflict([allCourts], entry({ id: 'new', courtId: 'court-9' }))?.id).toBe('break');
		expect(findEntryConflict([existing], entry({ id: 'new', courtId: null }))?.id).toBe('existing');
	});

	it('ignores the entry being edited', () => {
		expect(findEntryConflict([existing], entry({ id: 'existing' }), 'existing')).toBeUndefined();
	});
});

describe('validateScheduleEntry', () => {
	const base = schedule();

	it('accepts a well-formed fixture entry', () => {
		expect(validateScheduleEntry(base, entry())).toBe('');
	});

	it('accepts a well-formed break', () => {
		expect(validateScheduleEntry(base, entry({ type: 'break', fixtureId: null, title: 'Lunch' }))).toBe('');
	});

	it.each([
		['a missing day', { day: '' }, 'Choose a schedule day.'],
		['a missing start time', { startTime: '' }, 'Start time and end time are required.'],
		['a missing end time', { endTime: '' }, 'Start time and end time are required.'],
		['an end before the start', { startTime: '10:00', endTime: '09:00' }, 'End time must be after the start time.'],
		['a zero-length range', { startTime: '09:00', endTime: '09:00' }, 'End time must be after the start time.'],
		['a fixture with no fixture chosen', { fixtureId: null }, 'Select a fixture to schedule.'],
	])('rejects %s', (_label, overrides, message) => {
		expect(validateScheduleEntry(base, entry(overrides))).toBe(message);
	});

	it('rejects a break with no title, including a blank one', () => {
		const asBreak = (title) => entry({ type: 'break', fixtureId: null, title });

		expect(validateScheduleEntry(base, asBreak(''))).toBe('Enter a break title.');
		expect(validateScheduleEntry(base, asBreak('   '))).toBe('Enter a break title.');
		expect(validateScheduleEntry(base, asBreak(undefined))).toBe('Enter a break title.');
	});

	it('rejects an overlapping entry', () => {
		const occupied = schedule({ entries: [entry({ id: 'existing' })] });

		expect(validateScheduleEntry(occupied, entry({ id: 'new', startTime: '09:30', endTime: '10:30' }))).toBe(
			'That timeslot overlaps an existing schedule entry.'
		);
	});

	it('allows an entry to be saved over itself', () => {
		const occupied = schedule({ entries: [entry({ id: 'existing' })] });

		expect(validateScheduleEntry(occupied, entry({ id: 'existing' }), 'existing')).toBe('');
	});
});

describe('upsertScheduleEntry', () => {
	it('appends a new entry and keeps the list sorted', () => {
		const base = schedule({ entries: [entry({ id: 'late', startTime: '14:00' })] });
		const next = upsertScheduleEntry(base, entry({ id: 'early', startTime: '09:00' }));

		expect(next.entries.map((e) => e.id)).toEqual(['early', 'late']);
	});

	it('replaces an entry with the same id rather than duplicating it', () => {
		const base = schedule({ entries: [entry({ id: 'e1', notes: 'before' })] });
		const next = upsertScheduleEntry(base, entry({ id: 'e1', notes: 'after' }));

		expect(next.entries).toHaveLength(1);
		expect(next.entries[0].notes).toBe('after');
	});

	it('leaves the other entries alone when replacing one', () => {
		const base = schedule({
			entries: [
				entry({ id: 'keep-early', startTime: '09:00', notes: 'untouched' }),
				entry({ id: 'target', startTime: '11:00', notes: 'before' }),
				entry({ id: 'keep-late', startTime: '14:00', notes: 'untouched' }),
			],
		});

		const next = upsertScheduleEntry(base, entry({ id: 'target', startTime: '11:00', notes: 'after' }));

		expect(next.entries).toHaveLength(3);
		expect(next.entries.map((e) => e.notes)).toEqual(['untouched', 'after', 'untouched']);
	});

	it('does not mutate the schedule it was given', () => {
		const base = schedule();
		upsertScheduleEntry(base, entry());

		expect(base.entries).toEqual([]);
	});
});

describe('removeScheduleEntry', () => {
	it('removes the named entry and leaves the rest', () => {
		const base = schedule({ entries: [entry({ id: 'e1' }), entry({ id: 'e2' })] });

		expect(removeScheduleEntry(base, 'e1').entries.map((e) => e.id)).toEqual(['e2']);
	});

	it('is a no-op for an id that is not there', () => {
		const base = schedule({ entries: [entry({ id: 'e1' })] });

		expect(removeScheduleEntry(base, 'nope').entries).toHaveLength(1);
	});

	it('does not mutate the schedule it was given', () => {
		const base = schedule({ entries: [entry({ id: 'e1' })] });
		removeScheduleEntry(base, 'e1');

		expect(base.entries).toHaveLength(1);
	});
});

describe('getCourtName', () => {
	const base = schedule();

	it('names a known court', () => {
		expect(getCourtName(base, 'court-1')).toBe('Court 1');
	});

	it('describes no court as all courts', () => {
		expect(getCourtName(base, null)).toBe('All Courts');
		expect(getCourtName(base, undefined)).toBe('All Courts');
	});

	it('reports a court that is not in the list', () => {
		expect(getCourtName(base, 'court-99')).toBe('Unassigned Court');
	});
});

describe('getDayEntries', () => {
	it('returns one day in time order', () => {
		const base = schedule({
			entries: [
				entry({ id: 'late', startTime: '14:00' }),
				entry({ id: 'early', startTime: '09:00' }),
				entry({ id: 'other-day', day: '2026-08-02' }),
			],
		});

		expect(getDayEntries(base, '2026-08-01').map((e) => e.id)).toEqual(['early', 'late']);
	});

	it('returns nothing for a day with no entries', () => {
		expect(getDayEntries(schedule(), '2026-12-25')).toEqual([]);
	});
});

describe('calculateScheduledStats', () => {
	it('counts fixture entries, not breaks', () => {
		const base = schedule({
			entries: [entry({ id: 'e1' }), entry({ id: 'e2', type: 'break' })],
		});

		expect(calculateScheduledStats(base, [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }])).toEqual({
			days: 1,
			courts: 1,
			scheduledFixtures: 1,
			totalFixtures: 3,
			unscheduledFixtures: 2,
		});
	});

	it('never reports a negative outstanding count', () => {
		const base = schedule({ entries: [entry({ id: 'e1' }), entry({ id: 'e2' })] });

		expect(calculateScheduledStats(base, [{ id: 'f1' }]).unscheduledFixtures).toBe(0);
	});
});

describe('getDayBounds', () => {
	it('uses the configured day when nothing is scheduled', () => {
		expect(getDayBounds(schedule())).toEqual({
			start: DEFAULT_SCHEDULE_START,
			end: DEFAULT_SCHEDULE_END,
		});
	});

	// It used to widen to contain them, which made the axis a function of its own
	// contents: placing an entry moved every row below it.
	it('does not widen to contain an entry outside the configured day', () => {
		const base = schedule({
			entries: [entry({ id: 'early', startTime: '07:00', endTime: '08:00' }), entry({ id: 'late', startTime: '19:00', endTime: '20:00' })],
		});

		expect(getDayBounds(base)).toEqual({
			start: DEFAULT_SCHEDULE_START,
			end: DEFAULT_SCHEDULE_END,
		});
	});

	it('does not narrow to the entries when they sit inside the configured day', () => {
		const base = schedule({ entries: [entry({ startTime: '11:00', endTime: '12:00' })] });

		expect(getDayBounds(base)).toEqual({
			start: DEFAULT_SCHEDULE_START,
			end: DEFAULT_SCHEDULE_END,
		});
	});

	it('falls back to the defaults when the settings are blank', () => {
		const base = schedule({ settings: { dayStartTime: '', dayEndTime: '', slotMinutes: 30 } });

		expect(getDayBounds(base)).toEqual({
			start: DEFAULT_SCHEDULE_START,
			end: DEFAULT_SCHEDULE_END,
		});
	});
});

describe('getSlotMinutes', () => {
	it('reads the configured slot length', () => {
		expect(getSlotMinutes(schedule({ settings: { slotMinutes: 20 } }))).toBe(20);
	});

	it('falls back to the default when it is missing or unusable', () => {
		expect(getSlotMinutes(schedule({ settings: {} }))).toBe(DEFAULT_SLOT_MINUTES);
		expect(getSlotMinutes(schedule({ settings: { slotMinutes: 0 } }))).toBe(DEFAULT_SLOT_MINUTES);
	});
});

describe('buildTimeSlots', () => {
	it('steps from the start up to but not including the end', () => {
		expect(buildTimeSlots('09:00', '11:00', 30)).toEqual(['09:00', '09:30', '10:00', '10:30']);
	});

	it('returns nothing when the range is empty or inverted', () => {
		expect(buildTimeSlots('09:00', '09:00', 30)).toEqual([]);
		expect(buildTimeSlots('11:00', '09:00', 30)).toEqual([]);
	});

	it('emits a final partial step rather than skipping it', () => {
		expect(buildTimeSlots('09:00', '10:15', 30)).toEqual(['09:00', '09:30', '10:00']);
	});
});

// The axis is uniform and depends on the settings alone. It used to add each
// entry's own start and end as extra boundaries, so adding a 09:15 entry inserted
// a 09:15 row: rows of unequal span drawn at equal height, and every reading of
// the time column below it wrong.
describe('buildGridRowTimes', () => {
	it('returns one start time per row, with no closing boundary', () => {
		const base = schedule({ settings: { dayStartTime: '09:00', dayEndTime: '11:00', slotMinutes: 30 } });

		expect(buildGridRowTimes(base, { start: '09:00', end: '11:00' })).toEqual(['09:00', '09:30', '10:00', '10:30']);
	});

	it('does not add a row for an entry that falls between two slots', () => {
		const base = schedule({
			entries: [entry({ startTime: '09:20', endTime: '09:50' })],
			settings: { dayStartTime: '09:00', dayEndTime: '10:00', slotMinutes: 30 },
		});

		expect(buildGridRowTimes(base, { start: '09:00', end: '10:00' })).toEqual(['09:00', '09:30']);
	});

	it('does not add a row for an entry outside the configured day', () => {
		const base = schedule({
			entries: [entry({ startTime: '07:00', endTime: '20:00' })],
			settings: { dayStartTime: '09:00', dayEndTime: '10:00', slotMinutes: 30 },
		});

		expect(buildGridRowTimes(base, { start: '09:00', end: '10:00' })).toEqual(['09:00', '09:30']);
	});

	// A short final row drawn at full height is the fault this replaces, so the
	// last row runs past the configured end instead.
	it('rounds a day that is not a whole number of slots up to a full row', () => {
		const base = schedule({ settings: { dayStartTime: '09:00', dayEndTime: '10:15', slotMinutes: 30 } });

		expect(buildGridRowTimes(base, { start: '09:00', end: '10:15' })).toEqual(['09:00', '09:30', '10:00']);
	});

	it('returns no rows for an empty or inverted day', () => {
		const base = schedule({ settings: { slotMinutes: 30 } });

		expect(buildGridRowTimes(base, { start: '09:00', end: '09:00' })).toEqual([]);
		expect(buildGridRowTimes(base, { start: '11:00', end: '09:00' })).toEqual([]);
	});
});

describe('getEntryRowPlacement', () => {
	const axis = { start: '09:00', slotMinutes: 30, rowCount: 4 }; // 09:00 to 11:00

	it('places an aligned entry on the row its start time labels', () => {
		expect(getEntryRowPlacement(entry({ startTime: '10:00', endTime: '10:30' }), axis)).toEqual({
			rowStart: 3,
			rowSpan: 1,
			snapped: false,
			inDay: true,
		});
	});

	it('spans an entry over every row it covers', () => {
		expect(getEntryRowPlacement(entry({ startTime: '09:00', endTime: '10:30' }), axis)).toMatchObject({
			rowStart: 1,
			rowSpan: 3,
		});
	});

	// The entry's stored times are untouched; the caller marks the block as
	// approximate rather than drawing it at the nearest row and saying nothing.
	it('snaps an unaligned entry outwards to the rows that contain it', () => {
		expect(getEntryRowPlacement(entry({ startTime: '09:20', endTime: '09:50' }), axis)).toEqual({
			rowStart: 1,
			rowSpan: 2,
			snapped: true,
			inDay: true,
		});
	});

	it('reports an entry starting before the day as outside it', () => {
		expect(getEntryRowPlacement(entry({ startTime: '08:30', endTime: '09:30' }), axis).inDay).toBe(false);
	});

	it('reports an entry ending after the day as outside it', () => {
		expect(getEntryRowPlacement(entry({ startTime: '10:30', endTime: '11:30' }), axis).inDay).toBe(false);
	});

	it('reports an entry of no length as outside it', () => {
		expect(getEntryRowPlacement(entry({ startTime: '10:00', endTime: '10:00' }), axis).inDay).toBe(false);
	});

	it('places an entry that ends exactly at the close of the day', () => {
		expect(getEntryRowPlacement(entry({ startTime: '10:30', endTime: '11:00' }), axis)).toMatchObject({
			rowStart: 4,
			rowSpan: 1,
			inDay: true,
		});
	});
});

describe('getEntrySlotSpan', () => {
	it('counts whole slots', () => {
		expect(getEntrySlotSpan(entry({ startTime: '09:00', endTime: '10:00' }), 30)).toBe(2);
	});

	it('rounds a partial slot up, so the entry is never drawn too short', () => {
		expect(getEntrySlotSpan(entry({ startTime: '09:00', endTime: '09:45' }), 30)).toBe(2);
	});

	it('never returns less than one slot', () => {
		expect(getEntrySlotSpan(entry({ startTime: '09:00', endTime: '09:00' }), 30)).toBe(1);
		expect(getEntrySlotSpan(entry({ startTime: '10:00', endTime: '09:00' }), 30)).toBe(1);
	});
});

describe('serialiseScheduleForSave', () => {
	it('emits only the persisted fields, in sorted order', () => {
		const base = schedule({
			entries: [entry({ id: 'late', startTime: '14:00' }), entry({ id: 'early', startTime: '09:00' })],
		});

		const saved = serialiseScheduleForSave(base);

		expect(Object.keys(saved)).toEqual(['version', 'days', 'courts', 'entries', 'settings']);
		expect(saved.entries.map((e) => e.id)).toEqual(['early', 'late']);
		expect(Object.keys(saved.entries[0])).toEqual([
			'id',
			'type',
			'day',
			'courtId',
			'startTime',
			'endTime',
			'fixtureId',
			'title',
			'officials',
			'notes',
		]);
	});

	it('drops anything extra that was hanging off an entry', () => {
		const base = schedule({ entries: [{ ...entry(), transient: 'ui-only' }] });

		expect(serialiseScheduleForSave(base).entries[0].transient).toBeUndefined();
	});

	it('keeps days and courts to their persisted fields', () => {
		const base = schedule({
			days: [{ id: 'day-1', date: '2026-08-01', label: 'Day 1', extra: true }],
			courts: [{ id: 'court-1', name: 'Court 1', divisions: ['div-1'], extra: true }],
		});
		const saved = serialiseScheduleForSave(base);

		expect(saved.days[0]).toEqual({ id: 'day-1', date: '2026-08-01', label: 'Day 1' });
		expect(saved.courts[0]).toEqual({ id: 'court-1', name: 'Court 1', divisions: ['div-1'] });
	});

	it('defaults a court with no divisions key to an empty restriction', () => {
		const base = schedule({ courts: [{ id: 'court-1', name: 'Court 1' }] });

		expect(serialiseScheduleForSave(base).courts[0]).toEqual({ id: 'court-1', name: 'Court 1', divisions: [] });
	});

	// A restricted court has to survive normalise → serialise unchanged, or the
	// restriction would drift on every save.
	it('round-trips a court restriction through normaliseSchedule unchanged', () => {
		const base = schedule({ courts: [{ id: 'court-1', name: 'Court 1', divisions: ['div-1', 'div-2'] }] });
		const once = serialiseScheduleForSave(base);
		const twice = serialiseScheduleForSave(
			normaliseSchedule(once, { startDate: '2026-08-01', endDate: '2026-08-01' })
		);

		expect(once.courts[0]).toEqual({ id: 'court-1', name: 'Court 1', divisions: ['div-1', 'div-2'] });
		expect(twice).toEqual(once);
	});

	// Round-tripping must be stable, or every save would look like a change.
	it('survives a round trip through normaliseSchedule unchanged', () => {
		const base = schedule({ entries: [entry({ id: 'e1' })] });
		const once = serialiseScheduleForSave(base);
		const twice = serialiseScheduleForSave(
			normaliseSchedule(once, { startDate: '2026-08-01', endDate: '2026-08-01' })
		);

		expect(twice).toEqual(once);
	});
});
