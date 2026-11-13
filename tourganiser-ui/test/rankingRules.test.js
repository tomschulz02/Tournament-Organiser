import { describe, it, expect } from 'vitest';
import {
	POINT_PRESETS,
	describeRules,
	knockoutOf,
	matchPoints,
	moveTiebreaker,
	ordinal,
	placementLadder,
	placementMatchCount,
	placementOptions,
	rulesOf,
	samePoints,
	tiebreakerLabel,
	withMethod,
} from '../src/utils/rankingRules.js';

const FIVB = POINT_PRESETS[0].points;
const WINS = { method: 'wins', wins: 'matches', tiebreakers: ['SET_RATIO', 'POINT_RATIO', 'HEAD_TO_HEAD'] };

// A knockout round as createClassicState draws it: one-team groups for byes,
// then the matches. Only the group sizes matter here.
const round = (name, byes, matches, placement = 0) => ({
	name,
	type: 'knockout',
	groups: [
		...Array.from({ length: byes }, (_, index) => [index]),
		...Array.from({ length: matches }, (_, index) => [byes + index, byes + 2 * matches - 1 - index]),
		...Array.from({ length: placement }, () => [90, 91]),
	],
	...(placement ? { placement: Array.from({ length: placement }, (_, index) => ({ group: byes + matches + index })) } : {}),
});
const pool = { name: 'Pool Play', type: 'roundRobin', groups: [['a', 'b']] };
const classic = (knockoutRounds, currentRound = 0) => ({
	type: 'Classic',
	state: { rounds: [pool, ...knockoutRounds], currentRound },
});
const finals = { name: 'Finals', type: 'knockout', groups: [[2, 3], [0, 1]] };

const eight = classic([round('Quarterfinals', 0, 4), round('Semifinals', 0, 2), finals]);
const seven = classic([round('Round of 7', 1, 3), round('Semifinals', 0, 2), finals]);
const twelve = classic([round('Round of 12', 4, 4), round('Quarterfinals', 0, 4), round('Semifinals', 0, 2), finals]);
const sixteen = classic([round('Round of 16', 0, 8), round('Quarterfinals', 0, 4), round('Semifinals', 0, 2), finals]);

describe('rulesOf', () => {
	it('reads the rules the payload sends, and match wins when it sends none', () => {
		const rules = { method: 'wins', wins: 'sets', tiebreakers: [] };

		expect(rulesOf({ ranking_rules: rules })).toBe(rules);
		expect(rulesOf({})).toEqual(WINS);
		expect(rulesOf(null)).toEqual(WINS);
	});
});

describe('editing rules', () => {
	it('switches method, keeping the deciders and starting from FIVB or match wins', () => {
		const points = withMethod({ ...WINS, tiebreakers: ['SETS_WON'] }, 'points');

		expect(points).toEqual({ method: 'points', points: FIVB, tiebreakers: ['SETS_WON'] });
		expect(withMethod(points, 'wins')).toEqual({ method: 'wins', wins: 'matches', tiebreakers: ['SETS_WON'] });
		expect(withMethod(points, 'points')).toBe(points);
	});

	it('tells a preset from edited numbers', () => {
		expect(samePoints(FIVB, { ...FIVB })).toBe(true);
		expect(samePoints(FIVB, { ...FIVB, straightLoss: 1 })).toBe(false);
		expect(samePoints(FIVB, undefined)).toBe(false);
	});

	it('moves a decider and leaves the list alone when the move is out of range', () => {
		const list = ['A', 'B', 'C'];

		expect(moveTiebreaker(list, 2, 0)).toEqual(['C', 'A', 'B']);
		expect(moveTiebreaker(list, 0, 1)).toEqual(['B', 'A', 'C']);
		expect(moveTiebreaker(list, 0, -1)).toBe(list);
		expect(moveTiebreaker(list, 2, 3)).toBe(list);
		expect(moveTiebreaker(list, 1, 1)).toBe(list);
		expect(list).toEqual(['A', 'B', 'C']);
	});
});

describe('matchPoints', () => {
	it('adds up a row from its scorelines, as the server does', () => {
		const row = { setOutcomes: { '3-0': 1, '3-1': 1, '3-2': 1, '2-3': 1, '1-3': 1, '0-3': 1 } };

		expect(matchPoints(row, FIVB)).toBe(3 + 3 + 2 + 1);
		expect(matchPoints(row, { straightWin: 5, decidingWin: 4, decidingLoss: 2, straightLoss: 1 })).toBe(5 + 5 + 4 + 2 + 1 + 1);
	});

	it('counts a single-set match as straight, and a row with no scorelines as nothing', () => {
		expect(matchPoints({ setOutcomes: { '1-0': 2 } }, FIVB)).toBe(6);
		expect(matchPoints({}, FIVB)).toBe(0);
		expect(matchPoints(undefined, FIVB)).toBe(0);
	});
});

describe('describeRules', () => {
	it('names the method and the deciders in order, ending on seeding', () => {
		expect(describeRules(WINS)).toBe('Ranked by matches won, then set ratio, then point ratio, then head-to-head, then seeding.');
		expect(describeRules({ method: 'wins', wins: 'sets', tiebreakers: [] })).toBe('Ranked by sets won, then seeding.');
		expect(describeRules({ method: 'points', points: FIVB, tiebreakers: ['POINT_DIFFERENCE'] })).toBe(
			'Ranked by match points (3·2·1·0), then point difference, then seeding.',
		);
	});

	it('shows a decider it does not know by its key', () => {
		expect(tiebreakerLabel('SET_RATIO')).toBe('Set ratio');
		expect(tiebreakerLabel('NEW_ONE')).toBe('NEW_ONE');
	});
});

describe('ordinal', () => {
	it.each([
		[1, '1st'],
		[2, '2nd'],
		[3, '3rd'],
		[4, '4th'],
		[11, '11th'],
		[12, '12th'],
		[13, '13th'],
		[21, '21st'],
	])('%i is %s', (value, expected) => {
		expect(ordinal(value)).toBe(expected);
	});
});

describe('knockoutOf', () => {
	it('is null without a knockout stage', () => {
		expect(knockoutOf({ type: 'League', state: { rounds: [pool] } })).toBeNull();
		expect(knockoutOf({ type: 'Classic', state: { rounds: [pool] } })).toBeNull();
		expect(knockoutOf({ type: 'Classic' })).toBeNull();
		expect(knockoutOf(null)).toBeNull();
	});

	it('reads the size, the tiers knocked out before the semifinals, and whether it has started', () => {
		expect(knockoutOf(eight)).toEqual({ teams: 8, hasSemifinals: true, tiers: [{ first: 5, size: 4 }], started: false });
		expect(knockoutOf(seven).tiers).toEqual([{ first: 5, size: 3 }]);
		expect(knockoutOf(twelve)).toMatchObject({ teams: 12, tiers: [{ first: 9, size: 4 }, { first: 5, size: 4 }] });
		expect(knockoutOf(classic([round('Semifinals', 0, 2), finals], 1))).toEqual({ teams: 4, hasSemifinals: true, tiers: [], started: true });
	});

	// Its Finals round holds the playoff too, so it references four ranks.
	it('reads a two-team knockout as two teams with no semifinals', () => {
		expect(knockoutOf(classic([finals]))).toMatchObject({ teams: 2, hasSemifinals: false, tiers: [] });
	});

	it('ignores placement groups already drawn into a round', () => {
		const withPlacement = classic([round('Quarterfinals', 0, 4), round('Semifinals', 0, 2, 2), finals]);

		expect(knockoutOf(withPlacement)).toMatchObject({ teams: 8, tiers: [{ first: 5, size: 4 }] });
	});

	it('reads a final-only knockout the same way', () => {
		const finalOnly = classic([round('Semifinals', 0, 2), { name: 'Finals', type: 'knockout', groups: [[0, 1]] }]);

		expect(knockoutOf(finalOnly)).toMatchObject({ teams: 4, hasSemifinals: true });
	});
});

// The counts the server's own suite generates: api/test/unit/services/
// placementMatches.test.js, "teams, pools, knockout teams, depth, fixtures".
describe('placementMatchCount', () => {
	it.each([
		['eight', eight, 7, 4],
		['eight', eight, 5, 3],
		['seven', seven, 7, 2],
		['seven', seven, 5, 2],
		['twelve', twelve, 11, 8],
		['twelve', twelve, 9, 7],
		['sixteen', sixteen, 15, 16],
		['sixteen', sixteen, 9, 11],
		['eight', eight, null, 0],
		['eight', eight, 1, 0],
	])('a knockout of %s at depth %s has %i placement matches', (_, division, depth, expected) => {
		expect(placementMatchCount(knockoutOf(division), depth)).toBe(expected);
	});

	it('counts one match for a tier of two', () => {
		const six = classic([round('Round of 6', 2, 2), round('Semifinals', 0, 2), finals]);

		expect(placementMatchCount(knockoutOf(six), 5)).toBe(1);
	});
});

describe('placement options and ladder', () => {
	it('offers the final only, the default, then each odd place to the knockout size', () => {
		expect(placementOptions(knockoutOf(eight))).toEqual([
			{ depth: 1, label: '1st' },
			{ depth: null, label: '3rd' },
			{ depth: 5, label: '5th' },
			{ depth: 7, label: '7th' },
		]);
		expect(placementOptions(knockoutOf(classic([round('Semifinals', 0, 2), finals]))).map((option) => option.label)).toEqual(['1st', '3rd']);
	});

	it('marks what a depth plays for, and what it adds', () => {
		expect(placementLadder(knockoutOf(eight), 5, 12)).toEqual([
			{ place: '1st', state: 'played', label: 'Final', badge: 'Always', isDefault: false },
			{ place: '3rd', state: 'played', label: '3rd-place match', badge: 'Default', isDefault: true },
			{ place: '5th', state: 'played', label: '5th-place match', badge: '+3 matches', isDefault: false },
			{ place: '7th', state: 'ranked', label: 'Not played, ranked by the tiebreak deciders', badge: null, isDefault: false },
			{ place: '9th+', state: 'pool', label: 'Ranked by pool results', badge: null, isDefault: false },
		]);
	});

	it('plays only the final at depth 1, and the final and 3rd place by default', () => {
		const states = (depth) => placementLadder(knockoutOf(eight), depth, 8).map((row) => row.state);

		expect(states(1)).toEqual(['played', 'ranked', 'ranked', 'ranked']);
		expect(states(null)).toEqual(['played', 'played', 'ranked', 'ranked']);
		expect(states(7)).toEqual(['played', 'played', 'played', 'played']);
	});

	it('says so when a place needs no match of its own, and counts a single match in the singular', () => {
		const ladder = placementLadder(knockoutOf(seven), 7, 7);

		expect(ladder.at(-1)).toMatchObject({ place: '7th', state: 'played', label: 'Decided by the 5th-place matches', badge: null });
		expect(placementLadder(knockoutOf(eight), 7).at(-1).badge).toBe('+1 match');
	});
});
