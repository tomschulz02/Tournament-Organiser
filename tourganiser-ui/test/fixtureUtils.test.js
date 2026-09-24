import { describe, it, expect } from 'vitest';
import {
	ALL,
	EMPTY_FILTERS,
	flattenFixtures,
	indexById,
	matchesFixtureFilters,
	hasFixtureFilter,
	distinct,
	distinctStatuses,
	formatResult,
	setsWon,
	setScores,
	orderedStages,
	PRELIMINARY_STAGE,
	PLAYOFFS_STAGE,
} from '../src/components/tournament/fixtureUtils';

function filters(overrides = {}) {
	return { ...EMPTY_FILTERS, ...overrides };
}

describe('flattenFixtures', () => {
	it('stamps each fixture with its division name', () => {
		const divisions = [
			{ id: 'div-1', name: 'Division A', fixtures: [{ id: 'f1', match_no: 1 }] },
			{ id: 'div-2', name: 'Division B', fixtures: [{ id: 'f2', match_no: 2 }] },
		];

		expect(flattenFixtures(divisions).map((f) => [f.id, f.division_name])).toEqual([
			['f1', 'Division A'],
			['f2', 'Division B'],
		]);
	});

	// The point of the flattened list: match 12 of one division sits next to
	// match 12 of another, rather than the divisions sitting in blocks.
	it('orders across the whole tournament rather than per division', () => {
		const divisions = [
			{ name: 'A', fixtures: [{ id: 'a1', match_no: 1 }, { id: 'a3', match_no: 3 }] },
			{ name: 'B', fixtures: [{ id: 'b2', match_no: 2 }, { id: 'b4', match_no: 4 }] },
		];

		expect(flattenFixtures(divisions).map((f) => f.id)).toEqual(['a1', 'b2', 'a3', 'b4']);
	});

	// Matches the backend's own `match_no || 0` convention.
	it('sorts a fixture with no match number first, from either input order', () => {
		const numberedFirst = [{ name: 'A', fixtures: [{ id: 'numbered', match_no: 1 }, { id: 'unnumbered' }] }];
		const unnumberedFirst = [{ name: 'A', fixtures: [{ id: 'unnumbered' }, { id: 'numbered', match_no: 1 }] }];

		expect(flattenFixtures(numberedFirst).map((f) => f.id)).toEqual(['unnumbered', 'numbered']);
		expect(flattenFixtures(unnumberedFirst).map((f) => f.id)).toEqual(['unnumbered', 'numbered']);
	});

	it('tolerates a division with no fixtures array, and no divisions at all', () => {
		expect(flattenFixtures([{ name: 'Empty' }])).toEqual([]);
		expect(flattenFixtures([])).toEqual([]);
		expect(flattenFixtures()).toEqual([]);
	});

	it('copies rather than mutating the fixtures it was given', () => {
		const fixture = { id: 'f1', match_no: 1 };
		const divisions = [{ name: 'Division A', fixtures: [fixture] }];

		flattenFixtures(divisions);

		expect(fixture).toEqual({ id: 'f1', match_no: 1 });
		expect(fixture.division_name).toBeUndefined();
	});
});

describe('indexById', () => {
	it('keys fixtures by id', () => {
		const one = { id: 'f1' };
		const index = indexById([one, { id: 'f2' }]);

		expect(index.get('f1')).toBe(one);
		expect(index.size).toBe(2);
	});

	it('returns an empty map for no fixtures', () => {
		expect(indexById().size).toBe(0);
	});
});

describe('matchesFixtureFilters', () => {
	const fixture = {
		id: 'f1',
		division_id: 'div-1',
		round: 'Pool Play',
		status: 'COMPLETED',
		team1: 'Aces',
		team2: 'Bears',
	};

	it('passes a fixture when nothing is narrowed', () => {
		expect(matchesFixtureFilters(fixture, EMPTY_FILTERS)).toBe(true);
	});

	it('rejects a missing fixture rather than throwing', () => {
		expect(matchesFixtureFilters(undefined, EMPTY_FILTERS)).toBe(false);
		expect(matchesFixtureFilters(null, EMPTY_FILTERS)).toBe(false);
	});

	it.each([
		['division', { divisionId: 'div-1' }, { divisionId: 'div-2' }],
		['round', { round: 'Pool Play' }, { round: 'Finals' }],
		['status', { status: 'COMPLETED' }, { status: 'UPCOMING' }],
	])('filters on %s', (_label, matching, notMatching) => {
		expect(matchesFixtureFilters(fixture, filters(matching))).toBe(true);
		expect(matchesFixtureFilters(fixture, filters(notMatching))).toBe(false);
	});

	it('matches a team name case-insensitively, on either side', () => {
		expect(matchesFixtureFilters(fixture, filters({ team: 'aces' }))).toBe(true);
		expect(matchesFixtureFilters(fixture, filters({ team: 'BEARS' }))).toBe(true);
		expect(matchesFixtureFilters(fixture, filters({ team: 'Cubs' }))).toBe(false);
	});

	it('matches on part of a team name', () => {
		expect(matchesFixtureFilters(fixture, filters({ team: 'ce' }))).toBe(true);
	});

	it('ignores a team query that is only whitespace', () => {
		expect(matchesFixtureFilters(fixture, filters({ team: '   ' }))).toBe(true);
	});

	it('requires every active filter to match, not just one', () => {
		expect(matchesFixtureFilters(fixture, filters({ divisionId: 'div-1', round: 'Finals' }))).toBe(false);
		expect(matchesFixtureFilters(fixture, filters({ divisionId: 'div-1', team: 'Aces' }))).toBe(true);
	});
});

describe('hasFixtureFilter', () => {
	it('is false for the empty filter set', () => {
		expect(hasFixtureFilter(EMPTY_FILTERS)).toBe(false);
	});

	it.each([
		['divisionId', { divisionId: 'div-1' }],
		['round', { round: 'Finals' }],
		['status', { status: 'LIVE' }],
		['team', { team: 'Aces' }],
	])('is true when %s is set', (_label, overrides) => {
		expect(hasFixtureFilter(filters(overrides))).toBe(true);
	});

	// day and court describe a slot, not a fixture. Narrowing by them must not
	// hide the breaks, which belong to the timetable.
	it.each([
		['day', { day: '2026-08-01' }],
		['courtId', { courtId: 'court-1' }],
	])('is false when only %s is set, since that describes a slot', (_label, overrides) => {
		expect(hasFixtureFilter(filters(overrides))).toBe(false);
	});

	it('ignores a team query that is only whitespace', () => {
		expect(hasFixtureFilter(filters({ team: '  ' }))).toBe(false);
	});

	it('treats the ALL sentinel as not narrowed', () => {
		expect(hasFixtureFilter(filters({ divisionId: ALL, round: ALL, status: ALL }))).toBe(false);
	});
});

describe('distinct', () => {
	it('removes duplicates while keeping first-seen order', () => {
		expect(distinct(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
	});

	it('drops falsy values', () => {
		expect(distinct(['a', '', null, undefined, 0, 'b'])).toEqual(['a', 'b']);
	});

	it('returns nothing for an empty list', () => {
		expect(distinct([])).toEqual([]);
	});
});

describe('distinctStatuses', () => {
	it('keys on the enum and labels with the server display form', () => {
		expect(
			distinctStatuses([
				{ status: 'COMPLETED', statusLabel: 'Completed' },
				{ status: 'UPCOMING', statusLabel: 'Upcoming' },
			])
		).toEqual([
			{ value: 'COMPLETED', label: 'Completed' },
			{ value: 'UPCOMING', label: 'Upcoming' },
		]);
	});

	it('keeps the first label seen for a status', () => {
		expect(
			distinctStatuses([
				{ status: 'LIVE', statusLabel: 'Live' },
				{ status: 'LIVE', statusLabel: 'In Progress' },
			])
		).toEqual([{ value: 'LIVE', label: 'Live' }]);
	});

	it('falls back to the enum when the server sent no label', () => {
		expect(distinctStatuses([{ status: 'CANCELLED' }])).toEqual([{ value: 'CANCELLED', label: 'CANCELLED' }]);
	});

	it('returns nothing for no fixtures', () => {
		expect(distinctStatuses()).toEqual([]);
	});
});

describe('formatResult', () => {
	it('joins set pairs with a comma', () => {
		expect(formatResult([[21, 15], [18, 21], [15, 12]])).toBe('21-15, 18-21, 15-12');
	});

	it('formats a single set', () => {
		expect(formatResult([[21, 15]])).toBe('21-15');
	});

	it.each([
		['an empty array', []],
		['null', null],
		['undefined', undefined],
		['a non-array', 'not a result'],
	])('returns null for %s', (_label, value) => {
		expect(formatResult(value)).toBeNull();
	});
});

describe('setsWon', () => {
	it('counts the sets each team took', () => {
		expect(setsWon([[25, 21], [19, 25], [25, 23]])).toEqual([2, 1]);
	});

	it('counts a single set', () => {
		expect(setsWon([[21, 15]])).toEqual([1, 0]);
	});

	// docs/tournament-rules.md, and applyFixtureToStandings agrees.
	it('counts a drawn set for neither team', () => {
		expect(setsWon([[20, 20]])).toEqual([0, 0]);
		expect(setsWon([[25, 20], [20, 20]])).toEqual([1, 0]);
	});

	it.each([
		['an empty array', []],
		['null', null],
		['undefined', undefined],
		['a non-array', 'not a result'],
	])('returns null for %s, rather than zeroes', (_label, value) => {
		expect(setsWon(value)).toBeNull();
	});
});

describe('setScores', () => {
	it('reads a result by team rather than by set', () => {
		expect(setScores([[25, 21], [19, 25], [25, 23]])).toEqual([
			[25, 19, 25],
			[21, 25, 23],
		]);
	});

	it('reads a single set', () => {
		expect(setScores([[21, 15]])).toEqual([[21], [15]]);
	});

	it.each([
		['an empty array', []],
		['null', null],
		['undefined', undefined],
		['a non-array', 'not a result'],
	])('returns null for %s', (_label, value) => {
		expect(setScores(value)).toBeNull();
	});
});

describe('fixture stages', () => {
	// Two divisions with different depths of knockout, so the order has to come
	// from each round's distance to the final rather than from one division.
	const divisions = [
		{
			id: 'd1',
			name: 'Open',
			state: {
				rounds: [
					{ name: 'Pool Play', type: 'roundRobin' },
					{ name: 'Quarterfinals', type: 'knockout' },
					{ name: 'Semifinals', type: 'knockout' },
					{ name: 'Finals', type: 'knockout' },
				],
			},
			fixtures: [
				{ id: 'fin', match_no: 1, division_id: 'd1', round: 'Finals' },
				{ id: 'bronze', match_no: 2, division_id: 'd1', round: '3rd Place Playoff' },
				{ id: 'p5', match_no: 3, division_id: 'd1', round: 'Semifinals · Places 5-8' },
				{ id: 'sf', match_no: 4, division_id: 'd1', round: 'Semifinals' },
				{ id: 'qf', match_no: 5, division_id: 'd1', round: 'Quarterfinals' },
				{ id: 'poolA', match_no: 6, division_id: 'd1', round: 'Pool Play · Pool A', pool: 'Pool A' },
				{ id: 'poolB', match_no: 7, division_id: 'd1', round: 'Pool Play · Pool B', pool: 'Pool B' },
			],
		},
		{
			id: 'd2',
			name: 'League',
			state: {
				rounds: [
					{ name: 'Round Robin (Leg 1)', type: 'roundRobin' },
					{ name: 'Round Robin (Leg 2)', type: 'roundRobin' },
					{ name: 'Finals', type: 'knockout' },
				],
			},
			fixtures: [
				{ id: 'leg1', match_no: 8, division_id: 'd2', round: 'Round Robin (Leg 1)' },
				{ id: 'leg2', match_no: 9, division_id: 'd2', round: 'Round Robin (Leg 2)' },
				{ id: 'd2fin', match_no: 10, division_id: 'd2', round: 'Finals' },
			],
		},
	];
	const fixtures = flattenFixtures(divisions);
	const stageOf = (id) => fixtures.find((f) => f.id === id).stage;

	it('puts every pool and round-robin leg in the Preliminary Round', () => {
		expect(['poolA', 'poolB', 'leg1', 'leg2'].map(stageOf)).toEqual(Array(4).fill(PRELIMINARY_STAGE));
	});

	it('puts every placement match in the Playoffs', () => {
		expect(['bronze', 'p5'].map(stageOf)).toEqual([PLAYOFFS_STAGE, PLAYOFFS_STAGE]);
	});

	it('keeps knockout rounds under their own name', () => {
		expect(['qf', 'sf', 'fin', 'd2fin'].map(stageOf)).toEqual(['Quarterfinals', 'Semifinals', 'Finals', 'Finals']);
	});

	it('orders the stages the way the tournament runs, not by match number', () => {
		expect(orderedStages(fixtures)).toEqual([PRELIMINARY_STAGE, 'Quarterfinals', 'Semifinals', 'Finals', PLAYOFFS_STAGE]);
	});

	it('places a round no division names after the knockouts, before the playoffs', () => {
		const unknown = flattenFixtures([
			{ id: 'd', name: 'D', state: { rounds: [] }, fixtures: [
				{ id: 'x', match_no: 1, division_id: 'd', round: '3rd Place Playoff' },
				{ id: 'y', match_no: 2, division_id: 'd', round: 'Friendly' },
			] },
		]);

		expect(orderedStages(unknown)).toEqual(['Friendly', PLAYOFFS_STAGE]);
	});

	it('filters by stage, so one choice covers every pool', () => {
		const visible = fixtures.filter((fixture) => matchesFixtureFilters(fixture, filters({ round: PRELIMINARY_STAGE })));

		expect(visible.map((f) => f.id)).toEqual(['poolA', 'poolB', 'leg1', 'leg2']);
	});
});
