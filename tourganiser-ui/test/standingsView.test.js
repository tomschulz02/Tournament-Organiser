import { describe, it, expect } from 'vitest';
import {
	qualifierCount,
	poolCut,
	recentForm,
	divisionStages,
	defaultStage,
} from '../src/components/tournament/standingsView';

const pools = { name: 'Pool Play', type: 'roundRobin', groups: [[0, 1, 2], [3, 4, 5], [6, 7, 8]] };
const quarters = { name: 'Quarterfinals', type: 'knockout', groups: [[0, 7], [1, 6], [2, 5], [3, 4]] };
const semis = { name: 'Semifinals', type: 'knockout', groups: [[0, 3], [1, 2]] };

describe('qualifierCount', () => {
	it('is one past the largest index the next round references', () => {
		expect(qualifierCount(quarters)).toBe(8);
		expect(qualifierCount({ groups: [[0], [2, 1]] })).toBe(3);
	});

	it('is zero for a missing round or one without groups', () => {
		expect(qualifierCount(undefined)).toBe(0);
		expect(qualifierCount({ groups: 'nope' })).toBe(0);
		expect(qualifierCount({ groups: [null, ['x']] })).toBe(0);
	});
});

describe('poolCut', () => {
	it('guarantees floor(qualifiers / pools) places and counts the best runners-up', () => {
		const cut = poolCut({ rounds: [pools, quarters] }, 0, 3);
		expect(cut).toMatchObject({ nextRoundName: 'Quarterfinals', qualifiers: 8, guaranteed: 2, extra: 2, qualified: null });
	});

	it('uses the confirmed results once the round has progressed', () => {
		const done = { ...pools, results: ['a', 'b', null, 'c'] };
		expect([...poolCut({ rounds: [done, quarters] }, 0, 3).qualified]).toEqual(['a', 'b', 'c']);
	});

	it('uses the proposal while the round is ready to progress', () => {
		expect([...poolCut({ rounds: [pools, quarters] }, 0, 3, ['x', null, 'y']).qualified]).toEqual(['x', 'y']);
		expect(poolCut({ rounds: [pools, quarters] }, 0, 3, []).qualified).toBeNull();
	});

	it('draws no line when the next round is not a knockout', () => {
		const leg = { name: 'Leg 2', type: 'roundRobin', groups: [[0, 1]] };
		expect(poolCut({ rounds: [pools, leg] }, 0, 1)).toBeNull();
		expect(poolCut({ rounds: [pools] }, 0, 3)).toBeNull();
		expect(poolCut({ rounds: [] }, 0, 3)).toBeNull();
		expect(poolCut(null, 0, 3)).toBeNull();
	});

	it('draws no line without pools or qualifiers', () => {
		expect(poolCut({ rounds: [pools, quarters] }, 0, 0)).toBeNull();
		expect(poolCut({ rounds: [pools, { type: 'knockout', groups: [] }] }, 0, 3)).toBeNull();
	});
});

describe('recentForm', () => {
	const fixtures = [
		{ match_no: 3, status: 'COMPLETED', team_1_id: 'a', team_2_id: 'c', result: [[25, 20], [20, 25], [15, 10]] },
		{ match_no: 1, status: 'COMPLETED', team_1_id: 'b', team_2_id: 'a', result: [[25, 20], [25, 20]] },
		{ match_no: 2, status: 'LIVE', team_1_id: 'a', team_2_id: 'd', result: [[25, 20]] },
		{ match_no: 4, status: 'COMPLETED', team_1_id: 'd', team_2_id: 'a', result: [] },
		{ match_no: 5, status: 'COMPLETED', team_1_id: 'a', team_2_id: 'e', result: [[25, 20], [20, 25]] },
		{ match_no: 6, status: 'COMPLETED', team_1_id: 'e', team_2_id: 'a', result: [[10, 25], [12, 25]] },
		{ status: 'COMPLETED', team_1_id: 'x', team_2_id: 'y', result: [[25, 1]] },
	];

	it('reads W and L from completed fixtures in match order, newest last', () => {
		expect(recentForm(fixtures, 'a')).toEqual(['L', 'W', 'W']);
		expect(recentForm(fixtures, 'b')).toEqual(['W']);
	});

	it('keeps only the most recent results', () => {
		expect(recentForm(fixtures, 'a', 2)).toEqual(['W', 'W']);
	});

	it('is empty for a team without results or no fixtures', () => {
		expect(recentForm(fixtures, 'z')).toEqual([]);
		expect(recentForm(undefined, 'a')).toEqual([]);
	});
});

describe('divisionStages', () => {
	const done = (round) => ({ status: 'COMPLETED', round: round.name });
	const classic = (currentRound, fixtures = []) => ({
		state: { rounds: [pools, quarters, semis], currentRound },
		fixtures,
	});
	const content = { groups: true, groupsPlayed: true, knockout: true, rankings: false };

	it('lists pools, knockout and rankings for a classic division', () => {
		const stages = divisionStages(classic(0), { ...content, groupsPlayed: false });
		expect(stages.map((stage) => [stage.id, stage.label, stage.status, stage.available])).toEqual([
			['groups', 'Pools', 'idle', true],
			['knockout', 'Knockout', 'idle', true],
			['rankings', 'Final rankings', 'idle', false],
		]);
	});

	it('marks pools in progress, then done with the knockout ready to start', () => {
		expect(divisionStages(classic(0), content)[0].status).toBe('live');

		const ready = divisionStages(classic(0, [done(pools)]), content);
		expect(ready.map((stage) => stage.status)).toEqual(['done', 'ready', 'idle']);
	});

	it('marks the knockout in progress once it is the current round, and all done at the end', () => {
		expect(divisionStages(classic(2), content).map((stage) => stage.status)).toEqual(['done', 'live', 'idle']);
		expect(divisionStages(classic(2), { ...content, rankings: true }).map((stage) => [stage.status, stage.available])).toEqual([
			['done', true],
			['done', true],
			['done', true],
		]);
	});

	it('names a division without a knockout a league', () => {
		const league = { state: { rounds: [{ ...pools, groups: [[0, 1, 2]] }], currentRound: 0 }, fixtures: [] };
		expect(divisionStages(league, { groups: true, groupsPlayed: true }).map((stage) => [stage.label, stage.status])).toEqual([
			['League', 'live'],
			['Final rankings', 'idle'],
		]);
		expect(divisionStages(league, { groups: true, rankings: true })[0].status).toBe('done');
	});

	it('falls back on what can be rendered when state holds no rounds', () => {
		expect(divisionStages({ state: {} }, { groups: true }).map((stage) => stage.id)).toEqual(['groups', 'rankings']);
		expect(divisionStages({}, { knockout: true }).map((stage) => stage.id)).toEqual(['knockout', 'rankings']);
		expect(divisionStages(null, { rankings: true }).map((stage) => stage.id)).toEqual(['rankings']);
		expect(divisionStages(null, {})).toEqual([]);
	});
});

describe('defaultStage', () => {
	it('opens on rankings once they exist, else the stage being played, else the first', () => {
		expect(defaultStage([{ id: 'groups', available: true, status: 'done' }, { id: 'rankings', available: true }])).toBe('rankings');
		expect(
			defaultStage([
				{ id: 'groups', available: true, status: 'done' },
				{ id: 'knockout', available: true, status: 'live' },
				{ id: 'rankings', available: false },
			]),
		).toBe('knockout');
		expect(defaultStage([{ id: 'groups', available: true, status: 'idle' }, { id: 'knockout', available: true, status: 'idle' }])).toBe(
			'groups',
		);
		expect(defaultStage([{ id: 'rankings', available: false }])).toBeNull();
	});
});
