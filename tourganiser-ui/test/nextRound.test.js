import { describe, it, expect } from 'vitest';
import { nextRoundFixtures } from '../src/components/tournament/nextRound';

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('nextRoundFixtures', () => {
	it('pairs the teams at each group position, in group order', () => {
		expect(nextRoundFixtures([[0, 3], [1, 2]], ids)).toEqual([
			{ type: 'match', team1Id: 'a', team2Id: 'd', label: null },
			{ type: 'match', team1Id: 'b', team2Id: 'c', label: null },
		]);
	});

	it('reads positions against the reordered list it is given', () => {
		expect(nextRoundFixtures([[0, 1]], ['d', 'a'])).toEqual([
			{ type: 'match', team1Id: 'd', team2Id: 'a', label: null },
		]);
	});

	it('treats a one-team group as a bye, or as waiting when it is a placement group', () => {
		expect(nextRoundFixtures([[0], [1, 2]], ids)).toEqual([
			{ type: 'bye', teamId: 'a' },
			{ type: 'match', team1Id: 'b', team2Id: 'c', label: null },
		]);
		expect(nextRoundFixtures([[1, 2], [4]], ids, [{ group: 1, name: 'Semifinals · Places 5-8' }])).toEqual([
			{ type: 'match', team1Id: 'b', team2Id: 'c', label: null },
			{ type: 'waiting', teamId: 'e' },
		]);
	});

	it('labels a placement match with the text after the separator', () => {
		expect(nextRoundFixtures([[0, 1], [4, 5]], ids, [{ group: 1, name: 'Finals · 5th Place' }])[1]).toEqual({
			type: 'match',
			team1Id: 'e',
			team2Id: 'f',
			label: '5th Place',
		});
		expect(nextRoundFixtures([[0, 1]], ids, [{ group: 0 }])[0].label).toBeNull();
	});

	it('gives null for a position past the end of the list (a vacant place)', () => {
		expect(nextRoundFixtures([[0, 9], [8]], ids)).toEqual([
			{ type: 'match', team1Id: 'a', team2Id: null, label: null },
			{ type: 'bye', teamId: null },
		]);
	});

	it('skips empty and malformed groups', () => {
		expect(nextRoundFixtures([[], null, ['x'], [0, 'y'], [0, 1]], ids)).toEqual([
			{ type: 'match', team1Id: 'a', team2Id: 'b', label: null },
		]);
	});

	it('returns nothing without a groups array, and tolerates a null placement list', () => {
		expect(nextRoundFixtures(undefined, ids)).toEqual([]);
		expect(nextRoundFixtures(null, ids)).toEqual([]);
		expect(nextRoundFixtures([[0, 1]], ids, null)).toHaveLength(1);
	});
});
