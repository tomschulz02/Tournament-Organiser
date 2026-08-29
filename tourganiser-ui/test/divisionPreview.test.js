import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { knockoutRounds, poolMembership, previewBracket } from '../src/components/create/divisionPreview.js';

// The client's half of the shared expectation fixture.
//
// divisionPreview.js is a deliberate port of server generation, recorded in
// docs/decisions.md. Both packages assert against this one file and neither
// imports the other's code, so a change on either side turns only its own suite
// red — and names the input that broke.
//
// Nothing here derives its expectations. The fixture is the shared truth; a test
// that computed the answer would prove nothing about the other side.
const expectations = JSON.parse(readFileSync(new URL('../../shared/division-structure.json', import.meta.url), 'utf8'));

describe('poolMembership against the shared expectation fixture', () => {
	expectations.pools.forEach((expectation) => {
		it(`draws ${expectation.label}`, () => {
			expect(poolMembership(expectation.teams, expectation.pools)).toEqual(expectation.membership);
		});
	});
});

describe('knockoutRounds against the shared expectation fixture', () => {
	expectations.knockouts.forEach((expectation) => {
		it(`shapes the knockout for ${expectation.label}`, () => {
			const rounds = knockoutRounds(expectation.qualifiers);

			expect(rounds.map((round) => round.name)).toEqual(expectation.rounds.map((round) => round.name));
			expect(rounds.map((round) => round.groups)).toEqual(expectation.rounds.map((round) => round.groups));

			// A group of fewer than two is a bye and generates no fixture.
			expect(rounds.map((round) => round.groups.filter((group) => group.length >= 2).length)).toEqual(
				expectation.rounds.map((round) => round.matches),
			);
		});
	});
});

describe('previewBracket against the shared expectation fixture', () => {
	expectations.knockouts.forEach((expectation) => {
		it(`draws ${expectation.rounds.length} rounds for ${expectation.label}`, () => {
			const bracket = previewBracket(expectation.qualifiers);

			expect(bracket.map((round) => round.name)).toEqual(expectation.rounds.map((round) => round.name));
			expect(bracket.map((round) => round.matches.length)).toEqual(
				expectation.rounds.map((round) => round.matches),
			);
		});

		// sources is what BracketView's own feed-ordering (groupByFeed) reads to
		// lay a round out in the order the next round actually requires — without
		// it every round falls back to its own construction order, which is wrong
		// whenever match numbering and rendering order diverge. Pinned against the
		// fixture the same way groups and matches are, so a change to either the
		// round shape or the source arithmetic turns this red.
		it(`sources each match correctly for ${expectation.label}`, () => {
			const bracket = previewBracket(expectation.qualifiers);

			expect(bracket.map((round) => round.matches.map((match) => match.sources))).toEqual(
				expectation.rounds.map((round) => round.sources),
			);
		});
	});
});

// The shape BracketView reads, which the fixture does not describe: it states
// what the rules produce, not how the preview presents it.
describe('previewBracket', () => {
	it('puts the third place playoff first in the Finals round and flags it', () => {
		const finals = previewBracket(4).at(-1);

		expect(finals.name).toBe('Finals');
		expect(finals.matches[0].isPlacementMatch).toBe(true);
		expect(finals.matches[0].participants.map((participant) => participant.name)).toEqual(['Rank 3', 'Rank 4']);
		expect(finals.matches[1].isPlacementMatch).toBe(false);
		expect(finals.matches[1].participants.map((participant) => participant.name)).toEqual(['Rank 1', 'Rank 2']);
	});

	it('gives every participant a placeholder, since no team has been drawn', () => {
		const matches = previewBracket(8).flatMap((round) => round.matches);

		expect(matches.every((match) => match.participants.every((participant) => participant.id === null))).toBe(true);
		expect(matches.every((match) => match.participants.every((participant) => participant.placeholder))).toBe(true);
		expect(matches.every((match) => match.result.length === 0 && match.winner === null)).toBe(true);
		expect(matches.every((match) => match.status === 'UPCOMING')).toBe(true);
	});

	it('numbers the rounds after Pool Play, and keeps every match id distinct', () => {
		const bracket = previewBracket(6);
		const ids = bracket.flatMap((round) => round.matches.map((match) => match.id));

		expect(bracket.map((round) => round.roundIndex)).toEqual([1, 2, 3]);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('produces nothing for a qualifier count that is not a bracket', () => {
		expect(previewBracket(1)).toEqual([]);
		expect(previewBracket(0)).toEqual([]);
		expect(previewBracket('')).toEqual([]);
		expect(previewBracket(undefined)).toEqual([]);
	});
});

describe('poolMembership', () => {
	it('falls back to one pool while the configuration field is empty', () => {
		// The number input hands back 0 for a blank, and the review still has to
		// draw something.
		expect(poolMembership(3, 0)).toEqual([[0, 1, 2]]);
		expect(poolMembership(3, NaN)).toEqual([[0, 1, 2]]);
	});

	it('is empty for a division with no teams yet', () => {
		expect(poolMembership(0, 2)).toEqual([[], []]);
	});
});
