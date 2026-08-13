import { describe, it, expect } from 'vitest';
import { generateAutomaticSchedule } from '../src/utils/scheduleGenerator';

// The generator is heuristic, so these assert the rules it must not break —
// round order, no double-booking, breaks preserved — rather than pinning an
// exact layout. Where a preference is asserted (court affinity, rest windows)
// the case is built so only one outcome can satisfy it.

const DATES = { startDate: '2026-08-01', endDate: '2026-08-01' };

function fixture(id, overrides = {}) {
	return {
		id,
		division_id: 'div-1',
		round: 'Pool Play',
		team1: `${id}-home`,
		team2: `${id}-away`,
		...overrides,
	};
}

function division(id, roundNames, overrides = {}) {
	return {
		id,
		state: { rounds: roundNames.map((name) => ({ name })) },
		...overrides,
	};
}

function generate(overrides = {}) {
	return generateAutomaticSchedule({
		baseSchedule: null,
		fixtures: [],
		divisions: [],
		...DATES,
		courtCount: 2,
		dailyStartTime: '09:00',
		dailyEndTime: '17:00',
		fixtureDurationMinutes: 60,
		...overrides,
	});
}

function entriesFor(schedule, fixtureId) {
	return schedule.entries.find((entry) => entry.fixtureId === fixtureId);
}

function courtOf(schedule, fixtureId) {
	return entriesFor(schedule, fixtureId).courtId;
}

function startOf(schedule, fixtureId) {
	return entriesFor(schedule, fixtureId).startTime;
}

function lastEnd(schedule) {
	return schedule.entries.reduce((latest, entry) => (entry.endTime > latest ? entry.endTime : latest), '');
}

// The generator names the constraint that blocked a fixture rather than blaming
// capacity for everything, so an organiser knows whether to add a court, extend
// the day, or shorten matches. Kept here as builders so a wording change is one
// edit rather than eight.
const WARNINGS = {
	court: (n) =>
		`${n} ${n === 1 ? 'fixture' : 'fixtures'} could not be scheduled: every court is booked for the whole day. Add a court, extend the day, or shorten matches.`,
	team: (n) =>
		`${n} ${n === 1 ? 'fixture' : 'fixtures'} could not be scheduled: the teams involved are already playing in every remaining slot. Add a court or extend the day.`,
	round: (n) =>
		`${n} ${n === 1 ? 'fixture' : 'fixtures'} could not be scheduled: no free slot is left once the earlier rounds of the same division have finished. Extend the day or add another day.`,
	rest: (n) =>
		`${n} ${n === 1 ? 'fixture' : 'fixtures'} could not be scheduled: the only free slots would leave a team playing two matches back to back. Add a court or extend the day.`,
};

describe('input validation', () => {
	it.each([
		['no courts', { courtCount: 0 }],
		['no duration', { fixtureDurationMinutes: 0 }],
		['a non-numeric duration', { fixtureDurationMinutes: 'abc' }],
		['an end time before the start', { dailyStartTime: '17:00', dailyEndTime: '09:00' }],
		['a zero-length day', { dailyStartTime: '09:00', dailyEndTime: '09:00' }],
	])('refuses to generate with %s', (_label, overrides) => {
		const fixtures = [fixture('f1')];
		const result = generate({ fixtures, ...overrides });

		expect(result.warnings).toEqual(['Enter valid court, time, and duration values before generating the schedule.']);
		expect(result.unscheduledFixtures).toBe(fixtures);
	});

	it('returns the base schedule untouched when it refuses', () => {
		const base = { version: 1, days: [], courts: [], entries: [], settings: {} };

		expect(generate({ baseSchedule: base, courtCount: 0 }).schedule).toBe(base);
	});
});

describe('placing fixtures', () => {
	it('schedules every fixture when there is capacity', () => {
		const fixtures = [fixture('f1'), fixture('f2'), fixture('f3')];
		const { schedule, unscheduledFixtures, warnings } = generate({ fixtures });

		expect(unscheduledFixtures).toEqual([]);
		expect(warnings).toEqual([]);
		expect(schedule.entries.filter((e) => e.type === 'fixture')).toHaveLength(3);
	});

	it('never puts two fixtures on the same court at the same time', () => {
		const fixtures = Array.from({ length: 8 }, (_, i) => fixture(`f${i + 1}`));
		const { schedule } = generate({ fixtures });

		const slots = schedule.entries.map((e) => `${e.day}_${e.courtId}_${e.startTime}`);
		expect(new Set(slots).size).toBe(slots.length);
	});

	it('gives each entry the requested duration', () => {
		const { schedule } = generate({ fixtures: [fixture('f1')], fixtureDurationMinutes: 90 });
		const entry = entriesFor(schedule, 'f1');

		expect(entry.startTime).toBe('09:00');
		expect(entry.endTime).toBe('10:30');
	});

	it('keeps every entry inside the configured day', () => {
		const fixtures = Array.from({ length: 6 }, (_, i) => fixture(`f${i + 1}`));
		const { schedule } = generate({ fixtures, dailyStartTime: '10:00', dailyEndTime: '14:00' });

		schedule.entries.forEach((entry) => {
			expect(entry.startTime >= '10:00').toBe(true);
			expect(entry.endTime <= '14:00').toBe(true);
		});
	});

	// Capacity here is 2 courts x 2 hours / 60 min = 4 slots for 6 fixtures.
	it('reports the fixtures it could not place instead of dropping them', () => {
		const fixtures = Array.from({ length: 6 }, (_, i) => fixture(`f${i + 1}`));
		const { schedule, unscheduledFixtures, warnings } = generate({
			fixtures,
			dailyStartTime: '09:00',
			dailyEndTime: '11:00',
		});

		expect(schedule.entries).toHaveLength(4);
		expect(unscheduledFixtures).toHaveLength(2);
		// The warning names the constraint rather than always blaming capacity —
		// here capacity really is the answer, and the tests below cover the cases
		// where it is not. See docs/schedule.md.
		expect(warnings).toEqual([WARNINGS.court(2)]);
	});

	it('words the warning for a single fixture', () => {
		const fixtures = Array.from({ length: 3 }, (_, i) => fixture(`f${i + 1}`));
		const { warnings } = generate({ fixtures, courtCount: 1, dailyStartTime: '09:00', dailyEndTime: '11:00' });

		expect(warnings).toEqual([WARNINGS.court(1)]);
	});

	it('spreads across the tournament days it was given', () => {
		const fixtures = Array.from({ length: 4 }, (_, i) => fixture(`f${i + 1}`));
		const { schedule, unscheduledFixtures } = generate({
			fixtures,
			startDate: '2026-08-01',
			endDate: '2026-08-02',
			courtCount: 1,
			dailyStartTime: '09:00',
			dailyEndTime: '11:00',
		});

		expect(unscheduledFixtures).toEqual([]);
		expect(new Set(schedule.entries.map((e) => e.day)).size).toBe(2);
	});

	it('returns the courts it was asked for', () => {
		expect(generate({ courtCount: 3 }).schedule.courts).toEqual([
			{ id: 'court-1', name: 'Court 1' },
			{ id: 'court-2', name: 'Court 2' },
			{ id: 'court-3', name: 'Court 3' },
		]);
	});

	it('records the generation settings on the schedule', () => {
		const { schedule } = generate({ dailyStartTime: '08:00', dailyEndTime: '20:00', fixtureDurationMinutes: 45 });

		expect(schedule.settings).toMatchObject({
			dayStartTime: '08:00',
			dayEndTime: '20:00',
			slotMinutes: 45,
		});
	});

	it('returns entries in chronological order', () => {
		const fixtures = Array.from({ length: 5 }, (_, i) => fixture(`f${i + 1}`));
		const { schedule } = generate({ fixtures, startDate: '2026-08-01', endDate: '2026-08-02' });

		const keys = schedule.entries.map((e) => `${e.day}_${e.startTime}_${e.courtId}`);
		expect(keys).toEqual([...keys].sort());
	});

	it('is deterministic across runs over the same input', () => {
		const build = () => Array.from({ length: 6 }, (_, i) => fixture(`f${i + 1}`));
		const first = generate({ fixtures: build() }).schedule.entries;
		const second = generate({ fixtures: build() }).schedule.entries;

		expect(second.map((e) => [e.fixtureId, e.day, e.startTime, e.courtId])).toEqual(
			first.map((e) => [e.fixtureId, e.day, e.startTime, e.courtId])
		);
	});
});

describe('existing entries', () => {
	function baseWithBreak() {
		return {
			version: 1,
			days: [{ id: 'day-1', date: '2026-08-01', label: 'Day 1' }],
			courts: [{ id: 'court-1', name: 'Court 1' }],
			entries: [
				{
					id: 'lunch',
					type: 'break',
					day: '2026-08-01',
					courtId: null,
					startTime: '12:00',
					endTime: '13:00',
					title: 'Lunch',
				},
			],
			settings: { dayStartTime: '09:00', dayEndTime: '17:00', slotMinutes: 60 },
		};
	}

	it('keeps a break and schedules nothing over it', () => {
		const fixtures = Array.from({ length: 8 }, (_, i) => fixture(`f${i + 1}`));
		const { schedule } = generate({ baseSchedule: baseWithBreak(), fixtures });

		expect(schedule.entries.some((e) => e.id === 'lunch')).toBe(true);
		schedule.entries
			.filter((e) => e.type === 'fixture')
			.forEach((entry) => {
				const clashes = entry.startTime < '13:00' && entry.endTime > '12:00';
				expect(clashes).toBe(false);
			});
	});

	it('discards previous fixture placements and reschedules from scratch', () => {
		const base = baseWithBreak();
		base.entries.push({
			id: 'stale',
			type: 'fixture',
			day: '2026-08-01',
			courtId: 'court-1',
			startTime: '15:00',
			endTime: '16:00',
			fixtureId: 'f1',
		});

		const { schedule } = generate({ baseSchedule: base, fixtures: [fixture('f1')] });

		expect(schedule.entries.some((e) => e.id === 'stale')).toBe(false);
		expect(schedule.entries.filter((e) => e.fixtureId === 'f1')).toHaveLength(1);
	});

	it('keeps a court renamed by the organiser', () => {
		const base = baseWithBreak();
		base.courts = [{ id: 'court-1', name: 'Centre Court' }];

		expect(generate({ baseSchedule: base, courtCount: 2 }).schedule.courts[0].name).toBe('Centre Court');
	});

	// A break on one court — resurfacing it, say — blocks that court only. An
	// all-courts break is the other case, covered above.
	it('blocks only the court a pinned break names', () => {
		const base = baseWithBreak();
		base.entries = [
			{
				id: 'repairs',
				type: 'break',
				day: '2026-08-01',
				courtId: 'court-1',
				startTime: '09:00',
				endTime: '10:00',
				title: 'Repairs',
			},
		];

		const { schedule } = generate({ baseSchedule: base, fixtures: [fixture('f1')], courtCount: 2 });
		const placed = entriesFor(schedule, 'f1');

		expect(placed.startTime).toBe('09:00');
		expect(placed.courtId).toBe('court-2');
	});

	it('sorts a break with no court alongside the fixtures it shares a slot with', () => {
		const base = baseWithBreak();
		base.entries = [
			{
				id: 'ceremony',
				type: 'break',
				day: '2026-08-01',
				courtId: null,
				startTime: '09:00',
				endTime: '10:00',
				title: 'Opening',
			},
		];

		const { schedule } = generate({ baseSchedule: base, fixtures: [fixture('f1')], courtCount: 2 });

		expect(schedule.entries[0].id).toBe('ceremony');
		expect(schedule.entries.map((e) => e.startTime)).toEqual([...schedule.entries.map((e) => e.startTime)].sort());
	});
});

// The rule the server also enforces on write: a round cannot begin until the
// round feeding it has finished. A semifinal in an early slot on a later court
// looks plausible and is unplayable.
describe('the round-order constraint', () => {
	const divisions = [division('div-1', ['Pool Play', 'Semifinals', 'Finals'])];

	it('starts no semifinal before every pool match has finished', () => {
		const fixtures = [
			fixture('sf1', { round: 'Semifinals' }),
			fixture('sf2', { round: 'Semifinals' }),
			fixture('p1', { round: 'Pool Play' }),
			fixture('p2', { round: 'Pool Play' }),
			fixture('p3', { round: 'Pool Play' }),
		];

		const { schedule } = generate({ fixtures, divisions });
		const poolEnd = Math.max(
			...schedule.entries.filter((e) => ['p1', 'p2', 'p3'].includes(e.fixtureId)).map((e) => e.endTime.replace(':', ''))
		);
		const semiStart = Math.min(
			...schedule.entries.filter((e) => ['sf1', 'sf2'].includes(e.fixtureId)).map((e) => e.startTime.replace(':', ''))
		);

		expect(semiStart).toBeGreaterThanOrEqual(poolEnd);
	});

	// One court, two days, 09:00-11:00 — four slots for three fixtures. The two
	// pool matches fill day one, so the only slots left for the final are on day
	// two, which is the point: the barrier has to be compared as a day-and-time
	// instant, not a time of day.
	it('holds the constraint across days', () => {
		const fixtures = [
			fixture('f1', { round: 'Finals' }),
			fixture('p1', { round: 'Pool Play' }),
			fixture('p2', { round: 'Pool Play' }),
		];

		const { schedule, unscheduledFixtures } = generate({
			fixtures,
			divisions,
			startDate: '2026-08-01',
			endDate: '2026-08-02',
			courtCount: 1,
			dailyStartTime: '09:00',
			dailyEndTime: '11:00',
		});

		expect(unscheduledFixtures).toEqual([]);

		const instant = (e) => `${e.day}T${e.startTime}`;
		const finalEntry = entriesFor(schedule, 'f1');
		const poolEntries = schedule.entries.filter((e) => e.fixtureId.startsWith('p'));

		expect(poolEntries).toHaveLength(2);
		expect(finalEntry.day).toBe('2026-08-02');
		poolEntries.forEach((pool) => {
			expect(instant(finalEntry) >= `${pool.day}T${pool.endTime}`).toBe(true);
		});
	});

	// Two divisions running in parallel is correct and desirable; the barrier
	// must never become tournament-wide.
	it('does not let one division hold another back', () => {
		const twoDivisions = [
			division('div-1', ['Pool Play', 'Finals']),
			division('div-2', ['Pool Play', 'Finals']),
		];
		const fixtures = [
			fixture('a-pool', { division_id: 'div-1', round: 'Pool Play' }),
			fixture('a-final', { division_id: 'div-1', round: 'Finals' }),
			fixture('b-pool', { division_id: 'div-2', round: 'Pool Play' }),
		];

		const { schedule } = generate({ fixtures, divisions: twoDivisions, courtCount: 2 });

		// div-2's pool match is free to run at the same time as div-1's final.
		expect(entriesFor(schedule, 'b-pool').startTime).toBe('09:00');
	});

	// The playoff carries its own round name while belonging to the Finals round.
	it('treats the third-place playoff as part of the finals round', () => {
		const fixtures = [
			fixture('bronze', { round: '3rd Place Playoff' }),
			fixture('p1', { round: 'Pool Play' }),
			fixture('p2', { round: 'Pool Play' }),
		];

		const { schedule } = generate({ fixtures, divisions, courtCount: 2 });
		const bronze = entriesFor(schedule, 'bronze');
		const pools = schedule.entries.filter((e) => e.fixtureId.startsWith('p'));

		pools.forEach((pool) => {
			expect(bronze.startTime >= pool.endTime).toBe(true);
		});
	});

	// "Unordered" — constrains nothing and is constrained by nothing, which is
	// how the server's validator treats it too.
	it('does not constrain a fixture whose round is not in the division state', () => {
		const fixtures = [fixture('mystery', { round: 'Exhibition' }), fixture('p1', { round: 'Pool Play' })];

		const { schedule, unscheduledFixtures } = generate({ fixtures, divisions, courtCount: 2 });

		expect(unscheduledFixtures).toEqual([]);
		expect(entriesFor(schedule, 'mystery')).toBeDefined();
	});

	it('does not constrain fixtures when no divisions were supplied', () => {
		const fixtures = [fixture('sf1', { round: 'Semifinals' }), fixture('p1', { round: 'Pool Play' })];

		const { schedule } = generate({ fixtures, divisions: [], courtCount: 2 });

		expect(schedule.entries).toHaveLength(2);
	});
});

describe('court affinity', () => {
	// REWRITTEN 2026-08-13, and it now asserts the opposite of what it used to.
	//
	// It was "keeps a pool on the court its first match used", written when the
	// weights made affinity worth ninety slots of delay. docs/schedule.md puts
	// court affinity LAST and finishing early FIRST, so a pool that can run two
	// matches at once does, and the schedule ends an hour sooner. Do not restore
	// the old expectation without changing the priority order first.
	it('moves a pool onto a second court rather than waiting for its own', () => {
		const fixtures = [
			fixture('a1', { round: 'Group A', team1: 'A1', team2: 'A2' }),
			fixture('a2', { round: 'Group A', team1: 'A3', team2: 'A4' }),
			fixture('a3', { round: 'Group A', team1: 'A5', team2: 'A6' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 2 });

		expect(new Set(schedule.entries.map((e) => e.courtId)).size).toBe(2);
		// Three one-hour matches on two courts finish at 11:00. Held to one court
		// for the sake of affinity they would have finished at 12:00.
		expect(lastEnd(schedule)).toBe('11:00');
	});

	// Where affinity is meant to decide: one team plays all three, so the times
	// are forced and the court is the only thing still open.
	it('keeps a pool on its established court once the time is settled', () => {
		const fixtures = [
			fixture('a1', { round: 'Group A', team1: 'Aces', team2: 'A2' }),
			fixture('a2', { round: 'Group A', team1: 'Aces', team2: 'A3' }),
			fixture('a3', { round: 'Group A', team1: 'Aces', team2: 'A4' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 2 });

		expect(new Set(schedule.entries.map((e) => e.courtId)).size).toBe(1);
		expect(schedule.entries.map((e) => e.startTime)).toEqual(['09:00', '11:00', '13:00']);
	});

	// Nothing to key affinity on, so it must simply not apply rather than throw
	// or bind everything to one court.
	it('places a fixture with neither a pool nor a round', () => {
		const fixtures = [
			{ id: 'bare1', division_id: 'div-1', team1: 'Aces', team2: 'Bears' },
			{ id: 'bare2', division_id: 'div-1', team1: 'Cubs', team2: 'Ducks' },
		];

		const { schedule, unscheduledFixtures } = generate({ fixtures, courtCount: 2 });

		expect(unscheduledFixtures).toEqual([]);
		expect(schedule.entries).toHaveLength(2);
	});

	// Unchanged in intent, rebuilt so affinity is what the case turns on. Each
	// division has one team playing both its matches, so the second match's time
	// is forced and only its court is still open — under the old weights the
	// fixtures had distinct teams and affinity was strong enough to hold them
	// back, which it no longer is.
	// Every key the generator builds — teams, pools, changeovers — is scoped to
	// the division, so a fixture without one must still resolve to something
	// rather than throwing.
	it('places a fixture that names no division', () => {
		const fixtures = [
			{ id: 'x1', round: 'Group A', team1: 'X1', team2: 'X2' },
			{ id: 'x2', round: 'Group A', team1: 'X3', team2: 'X4' },
		];

		const { schedule, unscheduledFixtures } = generate({ fixtures, courtCount: 2 });

		expect(unscheduledFixtures).toEqual([]);
		expect(schedule.entries).toHaveLength(2);
	});

	it('scopes affinity to the division, so two Pool As do not share a court', () => {
		const fixtures = [
			fixture('a1', { division_id: 'div-1', round: 'Group A', team1: 'A-Anchor', team2: 'A2' }),
			fixture('a2', { division_id: 'div-1', round: 'Group A', team1: 'A-Anchor', team2: 'A3' }),
			fixture('b1', { division_id: 'div-2', round: 'Group A', team1: 'B-Anchor', team2: 'B2' }),
			fixture('b2', { division_id: 'div-2', round: 'Group A', team1: 'B-Anchor', team2: 'B3' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 2 });

		expect(courtOf(schedule, 'a1')).toBe(courtOf(schedule, 'a2'));
		expect(courtOf(schedule, 'b1')).toBe(courtOf(schedule, 'b2'));
		expect(courtOf(schedule, 'a1')).not.toBe(courtOf(schedule, 'b1'));
	});
});

// docs/schedule.md: one slot of rest is a hard constraint, not a preference. The
// generator this replaced scored it, so a slot could outbid it — and under
// pressure it regularly did.
describe('the rest minimum', () => {
	it('never places a team in two consecutive slots', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
			fixture('f3', { team1: 'Aces', team2: 'Ducks' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 3 });

		expect(schedule.entries.map((e) => e.startTime)).toEqual(['09:00', '11:00', '13:00']);
	});

	// Fixtures are not placed in time order — within a round each takes the
	// earliest slot left, so one placed later can land before one placed earlier.
	// Checking rest only backwards would let that pair end up back to back: f3
	// would take 10:00 and hand Cubs 10:00-11:00 followed by f2 at 11:00.
	it('keeps the rest when a later placement lands before an earlier one', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
			fixture('f3', { team1: 'Cubs', team2: 'Ducks' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 1 });

		expect(startOf(schedule, 'f1')).toBe('09:00');
		expect(startOf(schedule, 'f2')).toBe('11:00');
		expect(startOf(schedule, 'f3')).toBe('13:00');
	});

	// A3: do not quietly relax a hard constraint to fit everything in.
	it('leaves a fixture unplaced rather than removing the rest between two matches', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
		];

		const { schedule, unscheduledFixtures, warnings } = generate({
			fixtures,
			courtCount: 1,
			dailyStartTime: '09:00',
			dailyEndTime: '11:00',
		});

		expect(schedule.entries).toHaveLength(1);
		expect(unscheduledFixtures.map((f) => f.id)).toEqual(['f2']);
		expect(warnings).toEqual([WARNINGS.rest(1)]);
	});
});

// An unbound knockout slot carries a placeholder, not a team. Team exclusivity
// is a hard constraint now rather than a penalty a slot could outscore, so
// conflating two divisions' "Rank 1" — or two semifinals' "TBD" — would forbid
// them from ever running at once and report them unschedulable.
describe('unbound knockout fixtures', () => {
	it('lets two semifinals waiting on the pools run at the same time', () => {
		const fixtures = [
			{ id: 'sf1', division_id: 'div-1', round: 'Semifinals', team1: 'TBD', team2: 'TBD' },
			{ id: 'sf2', division_id: 'div-1', round: 'Semifinals', team1: 'TBD', team2: 'TBD' },
		];

		const { schedule, unscheduledFixtures } = generate({ fixtures, courtCount: 2 });

		expect(unscheduledFixtures).toEqual([]);
		expect(schedule.entries.map((e) => e.startTime)).toEqual(['09:00', '09:00']);
	});

	it('treats a rank placeholder as unbound rather than as a team name', () => {
		const placeholders = (id, divisionId) => ({
			id,
			division_id: divisionId,
			round: 'Finals',
			team1: 'Rank 1',
			team2: 'Rank 2',
			team_1_placeholder: 'Rank 1',
			team_2_placeholder: 'Rank 2',
		});

		const { schedule } = generate({
			fixtures: [placeholders('f1', 'div-1'), placeholders('f2', 'div-2')],
			courtCount: 2,
		});

		expect(schedule.entries.map((e) => e.startTime)).toEqual(['09:00', '09:00']);
	});

	// The other half of the same rule: a bound team still constrains, and two
	// divisions that happen to share a team name still do not collide.
	it('still separates two matches once their teams are bound', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 2 });

		expect(schedule.entries.map((e) => e.startTime)).toEqual(['09:00', '11:00']);
	});
});

// Every objective below the first is only ever consulted on a tie, so the order
// has to be visible in the outcome rather than buried in weights.
describe('the lexicographic objective', () => {
	it('resolves a slot that ties on every objective by court order', () => {
		const { schedule } = generate({ fixtures: [fixture('f1'), fixture('f2')], courtCount: 3 });

		expect(schedule.entries.map((e) => e.courtId)).toEqual(['court-1', 'court-2']);
	});

	// Affinity cannot be what decides this: every fixture is in a different pool,
	// so no pool has an established court by the time the second row is placed.
	// Only the changeover objective distinguishes the two courts at 10:00.
	it('keeps a court on one division rather than swapping between them', () => {
		const fixtures = [
			fixture('a1', { division_id: 'div-1', round: 'Group A', team1: 'A1', team2: 'A2' }),
			fixture('b1', { division_id: 'div-2', round: 'Group C', team1: 'B1', team2: 'B2' }),
			fixture('a2', { division_id: 'div-1', round: 'Group B', team1: 'A3', team2: 'A4' }),
			fixture('b2', { division_id: 'div-2', round: 'Group D', team1: 'B3', team2: 'B4' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 2 });

		expect(courtOf(schedule, 'a1')).toBe(courtOf(schedule, 'a2'));
		expect(courtOf(schedule, 'b1')).toBe(courtOf(schedule, 'b2'));
		expect(courtOf(schedule, 'a1')).not.toBe(courtOf(schedule, 'b1'));
	});
});

// A3 again, from the organiser's side: being told "capacity" when the real
// blocker was the rest minimum sends them to add a court that will not help.
describe('warnings name the constraint', () => {
	it('names the round order when a free court was too early to use', () => {
		const fixtures = [
			fixture('p1', { round: 'Pool Play' }),
			fixture('p2', { round: 'Pool Play' }),
			fixture('f1', { round: 'Finals' }),
		];

		// Three courts and one slot: the third court is free, and the final may
		// not start until pool play has finished, which is when the day ends.
		const { unscheduledFixtures, warnings } = generate({
			fixtures,
			divisions: [division('div-1', ['Pool Play', 'Finals'])],
			courtCount: 3,
			dailyStartTime: '09:00',
			dailyEndTime: '10:00',
		});

		expect(unscheduledFixtures.map((f) => f.id)).toEqual(['f1']);
		expect(warnings).toEqual([WARNINGS.round(1)]);
	});

	it('names the team clash when a court was free but the teams were not', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
		];

		const { warnings } = generate({
			fixtures,
			courtCount: 2,
			dailyStartTime: '09:00',
			dailyEndTime: '10:00',
		});

		expect(warnings).toEqual([WARNINGS.team(1)]);
	});

	// A day with no room for even one match produces no candidate slots at all,
	// so there is no constraint to have failed and capacity is the true answer.
	it('falls back to capacity when there was no slot to refuse', () => {
		const { schedule, unscheduledFixtures, warnings } = generate({
			fixtures: [fixture('f1')],
			dailyStartTime: '09:00',
			dailyEndTime: '10:00',
			fixtureDurationMinutes: 90,
		});

		expect(schedule.entries).toEqual([]);
		expect(unscheduledFixtures.map((f) => f.id)).toEqual(['f1']);
		expect(warnings).toEqual([WARNINGS.court(1)]);
	});

	it('reports each constraint once, however many fixtures it blocked', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
			fixture('f3', { team1: 'Aces', team2: 'Ducks' }),
		];

		const { warnings } = generate({
			fixtures,
			courtCount: 2,
			dailyStartTime: '09:00',
			dailyEndTime: '10:00',
		});

		expect(warnings).toEqual([WARNINGS.team(2)]);
	});
});

describe('team rest windows', () => {
	// A team cannot be in two places at once. Anything else is a preference; this
	// is arithmetic.
	it('never overlaps two fixtures involving the same team', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
			fixture('f3', { team1: 'Aces', team2: 'Ducks' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 3 });
		const times = schedule.entries.map((e) => [e.startTime, e.endTime]).sort();

		for (let i = 1; i < times.length; i += 1) {
			expect(times[i][0] >= times[i - 1][1]).toBe(true);
		}
	});

	it('prefers a gap to a back-to-back match for the same team', () => {
		const fixtures = [
			fixture('f1', { team1: 'Aces', team2: 'Bears' }),
			fixture('f2', { team1: 'Aces', team2: 'Cubs' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 1 });
		const [first, second] = schedule.entries.sort((a, b) => a.startTime.localeCompare(b.startTime));
		const gapMinutes =
			Number(second.startTime.slice(0, 2)) * 60 +
			Number(second.startTime.slice(3)) -
			(Number(first.endTime.slice(0, 2)) * 60 + Number(first.endTime.slice(3)));

		expect(gapMinutes).toBeGreaterThan(0);
	});

	// A team's previous match being on an earlier day is not a short rest at all,
	// so it must not be penalised the way a same-day gap is.
	it('does not penalise a team whose previous match was on an earlier day', () => {
		const fixtures = [
			fixture('day1', { team1: 'Aces', team2: 'Bears' }),
			fixture('day2', { team1: 'Aces', team2: 'Cubs' }),
		];

		const { schedule, unscheduledFixtures } = generate({
			fixtures,
			startDate: '2026-08-01',
			endDate: '2026-08-02',
			courtCount: 1,
			dailyStartTime: '09:00',
			dailyEndTime: '10:00',
		});

		expect(unscheduledFixtures).toEqual([]);

		// One slot per day, so Aces necessarily plays on both days, and the
		// second placement is scored against a previous day rather than a gap.
		const days = schedule.entries.map((e) => e.day).sort();
		expect(days).toEqual(['2026-08-01', '2026-08-02']);
		schedule.entries.forEach((e) => expect(e.startTime).toBe('09:00'));
	});

	// Two divisions may both have a "Team A"; keying rest on the name alone would
	// treat them as one team and space them out for no reason.
	it('distinguishes same-named teams in different divisions by id', () => {
		const fixtures = [
			fixture('f1', { division_id: 'div-1', team1: 'Team A', team2: 'Team B', team_1_id: 'd1-a', team_2_id: 'd1-b' }),
			fixture('f2', { division_id: 'div-2', team1: 'Team A', team2: 'Team B', team_1_id: 'd2-a', team_2_id: 'd2-b' }),
		];

		const { schedule } = generate({ fixtures, courtCount: 2 });

		// Different teams entirely, so nothing stops them running concurrently.
		expect(schedule.entries[0].startTime).toBe('09:00');
		expect(schedule.entries[1].startTime).toBe('09:00');
	});
});
