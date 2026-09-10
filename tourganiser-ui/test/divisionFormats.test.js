import { describe, it, expect } from 'vitest';
import {
	MAX_ROUND_ROBIN_LEGS,
	createEmptyDivision,
	gamesPerTeamError,
	validateDivision,
} from '../src/components/create/divisionFormats.js';

// gamesPerTeamError mirrors the realisability check
// api/src/services/fixtures.service.js's generatePartialRoundRobinPairs enforces
// server-side — a g-regular graph on n teams exists iff 0 < g < n - 1 and, when n
// is odd, g is even. See docs/division-state.md.
describe('gamesPerTeamError', () => {
	it('accepts a valid odd g against an even team count', () => {
		expect(gamesPerTeamError(3, 8)).toBeNull();
	});

	it('accepts a valid even g against an odd team count', () => {
		expect(gamesPerTeamError(4, 7)).toBeNull();
	});

	it('rejects an odd g against an odd team count', () => {
		expect(gamesPerTeamError(3, 7)).toMatch(/even number/);
	});

	it('rejects g at or above a full cycle', () => {
		expect(gamesPerTeamError(7, 8)).toMatch(/full round robin/);
		expect(gamesPerTeamError(8, 8)).toMatch(/full round robin/);
	});

	it('rejects a non-positive or non-integer value', () => {
		expect(gamesPerTeamError(0, 8)).toMatch(/Choose/);
		expect(gamesPerTeamError('', 8)).toMatch(/Choose/);
		expect(gamesPerTeamError(2.5, 8)).toMatch(/Choose/);
	});
});

function baseDivision(overrides = {}) {
	return {
		...createEmptyDivision(),
		name: 'Division A',
		type: 'league',
		teams: [{ name: 'Aces' }, { name: 'Bears' }, { name: 'Cubs' }, { name: 'Ducks' }],
		...overrides,
	};
}

describe('validateDivision — League round-robin config', () => {
	it('accepts the default (legs mode, 1 leg) with no error', () => {
		expect(validateDivision(baseDivision())).toEqual({});
	});

	it('accepts a valid leg count', () => {
		expect(validateDivision(baseDivision({ roundRobinLegs: 3 }))).toEqual({});
	});

	it('rejects a leg count below 1', () => {
		const errors = validateDivision(baseDivision({ roundRobinLegs: 0 }));
		expect(errors.roundRobinLegs).toBeTruthy();
	});

	it('rejects a leg count past the ceiling', () => {
		const errors = validateDivision(baseDivision({ roundRobinLegs: MAX_ROUND_ROBIN_LEGS + 1 }));
		expect(errors.roundRobinLegs).toBeTruthy();
	});

	it('accepts a valid limited-mode games-per-team value', () => {
		expect(validateDivision(baseDivision({ roundRobinMode: 'limited', gamesPerTeam: 2 }))).toEqual({});
	});

	it('rejects an invalid limited-mode value, using the parity-aware message', () => {
		// 4 teams, so 2 is the only value below a full cycle (3) — 1 is odd and
		// this team count is even, so 1 should actually be valid; use 3 (a full
		// cycle) to force a rejection unambiguously.
		const errors = validateDivision(baseDivision({ roundRobinMode: 'limited', gamesPerTeam: 3 }));
		expect(errors.gamesPerTeam).toMatch(/full round robin/);
	});

	it('does not validate round-robin fields before there are at least two teams', () => {
		const errors = validateDivision(baseDivision({ teams: [], roundRobinLegs: -1 }));
		expect(errors.roundRobinLegs).toBeUndefined();
	});

	it('does not apply Classic-only pool/knockout errors to a League division', () => {
		const errors = validateDivision(baseDivision({ num_groups: 0, knockout_teams: 0 }));
		expect(errors.num_groups).toBeUndefined();
		expect(errors.knockout_teams).toBeUndefined();
	});
});

describe('validateDivision — Classic is unaffected by the League changes', () => {
	it('still validates num_groups and knockout_teams for a Classic division', () => {
		const division = baseDivision({ type: 'classic', num_groups: 0, knockout_teams: 1 });
		const errors = validateDivision(division);

		expect(errors.num_groups).toBeTruthy();
		expect(errors.knockout_teams).toBeTruthy();
	});

	it('accepts a valid Classic configuration', () => {
		const division = baseDivision({ type: 'classic', num_groups: 2, knockout_teams: 2 });
		expect(validateDivision(division)).toEqual({});
	});
});
