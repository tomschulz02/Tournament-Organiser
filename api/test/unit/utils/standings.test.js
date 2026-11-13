import { describe, it, expect } from "vitest";
import {
    RATIO_UNDEFINED,
    RANKING_BASES,
    TIEBREAKERS,
    primaryScore,
    rankingRulesOf,
    readRankingRules,
    rulesFromBasis,
    applyFixtureToStandings,
    buildHeadToHeadMap,
    buildSeedIndex,
    compareTeams,
    computeRatios,
    createStandingsRow,
    describeQualifierSlot,
    isCountableFixture,
    rankGroup,
    seedAcrossGroups,
    seedKnockoutResults
} from "../../../src/utils/standings.js";
import { makeNormalisedFixture, makeStandingsRow } from "../../helpers/fixtures.js";

// The rules under test are specified in docs/tournament-rules.md.

describe("createStandingsRow", () => {
    it("uses the team's id and name", () => {
        const row = createStandingsRow({ id: "t1", name: "Aces" }, "fallback");

        expect(row).toEqual({
            id: "t1",
            name: "Aces",
            played: 0,
            won: 0,
            lost: 0,
            setsWon: 0,
            setsLost: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            setOutcomes: {},
            setsRatio: 0,
            pointsRatio: 0
        });
    });

    it("falls back to the supplied id and TBD when there is no team", () => {
        const row = createStandingsRow(null, "fallback");

        expect(row.id).toBe("fallback");
        expect(row.name).toBe("TBD");
    });

    it("also falls back on empty-string id and name, because the guard is ||", () => {
        const row = createStandingsRow({ id: "", name: "" }, "fallback");

        expect(row.id).toBe("fallback");
        expect(row.name).toBe("TBD");
    });

    it("falls back when the team is undefined", () => {
        expect(createStandingsRow(undefined, "fallback").id).toBe("fallback");
    });
});

describe("applyFixtureToStandings", () => {
    function pair() {
        return [createStandingsRow({ id: "one", name: "One" }), createStandingsRow({ id: "two", name: "Two" })];
    }

    it("awards the match to the team that won more sets", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [18, 21], [21, 19]]);

        expect(one).toMatchObject({ played: 1, won: 1, lost: 0, setsWon: 2, setsLost: 1, pointsFor: 60, pointsAgainst: 55 });
        expect(two).toMatchObject({ played: 1, won: 0, lost: 1, setsWon: 1, setsLost: 2, pointsFor: 55, pointsAgainst: 60 });
    });

    it("awards the match to team two when team two wins more sets", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[15, 21], [18, 21]]);

        expect(one).toMatchObject({ won: 0, lost: 1, setsWon: 0, setsLost: 2 });
        expect(two).toMatchObject({ won: 1, lost: 0, setsWon: 2, setsLost: 0 });
    });

    it("counts the points of a drawn set but awards the set to neither team", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 21]]);

        expect(one).toMatchObject({ played: 1, won: 0, lost: 0, setsWon: 0, setsLost: 0, pointsFor: 21, pointsAgainst: 21 });
        expect(two).toMatchObject({ played: 1, won: 0, lost: 0, setsWon: 0, setsLost: 0, pointsFor: 21, pointsAgainst: 21 });
    });

    it("records a match as played but won by nobody when the set counts are level", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [15, 21]]);

        expect(one).toMatchObject({ played: 1, won: 0, lost: 0, setsWon: 1, setsLost: 1 });
        expect(two).toMatchObject({ played: 1, won: 0, lost: 0, setsWon: 1, setsLost: 1 });
    });

    it("still counts an appearance when the result holds no sets", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, []);

        expect(one).toMatchObject({ played: 1, won: 0, lost: 0, setsWon: 0, pointsFor: 0 });
        expect(two).toMatchObject({ played: 1, won: 0, lost: 0, setsWon: 0, pointsFor: 0 });
    });

    it("records the scoreline against both teams, each from its own perspective", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [18, 21], [21, 19]]);

        expect(one.setOutcomes).toEqual({ "2-1": 1 });
        expect(two.setOutcomes).toEqual({ "1-2": 1 });
    });

    it("accumulates repeat scorelines", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [21, 18]]);
        applyFixtureToStandings(one, two, [[21, 15], [21, 18]]);
        applyFixtureToStandings(one, two, [[21, 15], [18, 21], [21, 19]]);

        expect(one.setOutcomes).toEqual({ "2-0": 2, "2-1": 1 });
        expect(two.setOutcomes).toEqual({ "0-2": 2, "1-2": 1 });
    });

    it("keys a best-of-five scoreline the same way, with no assumed match format", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [15, 21], [21, 18], [17, 21], [15, 12]]);

        expect(one.setOutcomes).toEqual({ "3-2": 1 });
        expect(two.setOutcomes).toEqual({ "2-3": 1 });
    });

    it("records no scoreline when the set counts are level", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [15, 21]]);

        expect(one.setOutcomes).toEqual({});
        expect(two.setOutcomes).toEqual({});
    });

    it("counts every recorded scoreline exactly once per match played", () => {
        const [one, two] = pair();

        applyFixtureToStandings(one, two, [[21, 15], [21, 18]]);
        applyFixtureToStandings(one, two, [[15, 21], [18, 21]]);

        const total = (row) => Object.values(row.setOutcomes).reduce((sum, count) => sum + count, 0);

        expect(total(one)).toBe(one.played);
        expect(total(two)).toBe(two.played);
    });

});

describe("computeRatios", () => {
    it("divides when the denominator is positive", () => {
        const row = computeRatios(makeStandingsRow({ setsWon: 6, setsLost: 3, pointsFor: 100, pointsAgainst: 80 }));

        expect(row.setsRatio).toBe(2);
        expect(row.pointsRatio).toBe(1.25);
    });

    it("returns the undefined sentinel when a team has won without losing", () => {
        const row = computeRatios(makeStandingsRow({ setsWon: 4, setsLost: 0, pointsFor: 84, pointsAgainst: 0 }));

        expect(row.setsRatio).toBe(RATIO_UNDEFINED);
        expect(row.pointsRatio).toBe(RATIO_UNDEFINED);
    });

    it("returns zero, not undefined, for a team with nothing recorded", () => {
        const row = computeRatios(makeStandingsRow());

        expect(row.setsRatio).toBe(0);
        expect(row.pointsRatio).toBe(0);
    });

    it("returns the row it was given", () => {
        const row = makeStandingsRow();

        expect(computeRatios(row)).toBe(row);
    });
});

describe("isCountableFixture", () => {
    it("counts a completed fixture that has a result", () => {
        expect(isCountableFixture(makeNormalisedFixture({ result: [[21, 15]] }))).toBe(true);
    });

    it("ignores a fixture that is not completed", () => {
        expect(isCountableFixture(makeNormalisedFixture({ status: "UPCOMING", result: [[21, 15]] }))).toBe(false);
    });

    it("ignores a cancelled fixture — a cancelled match never happened", () => {
        expect(isCountableFixture(makeNormalisedFixture({ status: "CANCELLED", result: [[21, 15]] }))).toBe(false);
    });

    it("ignores a completed fixture whose result is not an array", () => {
        expect(isCountableFixture(makeNormalisedFixture({ result: null }))).toBe(false);
    });

    it("ignores a completed fixture with an empty result", () => {
        expect(isCountableFixture(makeNormalisedFixture({ result: [] }))).toBe(false);
    });
});

describe("buildHeadToHeadMap", () => {
    it("records one win per completed fixture, keyed winner|loser", () => {
        const map = buildHeadToHeadMap([
            makeNormalisedFixture({ team_1_id: "a", team_2_id: "b", result: [[21, 15]] })
        ]);

        expect(map.get("a|b")).toBe(1);
        expect(map.has("b|a")).toBe(false);
    });

    it("credits team two when team two wins", () => {
        const map = buildHeadToHeadMap([
            makeNormalisedFixture({ team_1_id: "a", team_2_id: "b", result: [[15, 21]] })
        ]);

        expect(map.get("b|a")).toBe(1);
    });

    it("accumulates repeat meetings", () => {
        const map = buildHeadToHeadMap([
            makeNormalisedFixture({ team_1_id: "a", team_2_id: "b", result: [[21, 15]] }),
            makeNormalisedFixture({ team_1_id: "a", team_2_id: "b", result: [[21, 18]] })
        ]);

        expect(map.get("a|b")).toBe(2);
    });

    it("skips fixtures that do not count", () => {
        const map = buildHeadToHeadMap([
            makeNormalisedFixture({ status: "UPCOMING", team_1_id: "a", team_2_id: "b", result: [[21, 15]] })
        ]);

        expect(map.size).toBe(0);
    });

    it("skips a fixture where the set counts are level", () => {
        const map = buildHeadToHeadMap([
            makeNormalisedFixture({ team_1_id: "a", team_2_id: "b", result: [[21, 15], [15, 21], [20, 20]] })
        ]);

        expect(map.size).toBe(0);
    });

    it("skips a fixture with a missing participant id", () => {
        const map = buildHeadToHeadMap([
            makeNormalisedFixture({ team_1_id: "a", team_2_id: null, result: [[21, 15]] }),
            makeNormalisedFixture({ team_1_id: null, team_2_id: "b", result: [[21, 15]] })
        ]);

        expect(map.size).toBe(0);
    });
});

describe("buildSeedIndex", () => {
    it("maps team id to seeding position, index 0 being the top seed", () => {
        const index = buildSeedIndex(["a", "b", "c"]);

        expect(index.get("a")).toBe(0);
        expect(index.get("c")).toBe(2);
    });

    it("tolerates a missing list", () => {
        expect(buildSeedIndex(undefined).size).toBe(0);
        expect(buildSeedIndex(null).size).toBe(0);
    });
});

describe("compareTeams", () => {
    const seedIndex = buildSeedIndex(["a", "b"]);

    it("ranks by matches won first", () => {
        const a = makeStandingsRow({ id: "a", won: 1 });
        const b = makeStandingsRow({ id: "b", won: 3 });

        expect(compareTeams(a, b, { seedIndex })).toBeGreaterThan(0);
        expect(compareTeams(b, a, { seedIndex })).toBeLessThan(0);
    });

    it("falls to set ratio when wins are level", () => {
        const a = makeStandingsRow({ id: "a", won: 2, setsRatio: 1.5 });
        const b = makeStandingsRow({ id: "b", won: 2, setsRatio: 3 });

        expect(compareTeams(a, b, { seedIndex })).toBeGreaterThan(0);
    });

    it("falls to point ratio when wins and set ratio are level", () => {
        const a = makeStandingsRow({ id: "a", won: 2, setsRatio: 2, pointsRatio: 1.1 });
        const b = makeStandingsRow({ id: "b", won: 2, setsRatio: 2, pointsRatio: 1.4 });

        expect(compareTeams(a, b, { seedIndex })).toBeGreaterThan(0);
    });

    it("ranks an undefined set ratio above a defined one", () => {
        const a = makeStandingsRow({ id: "a", won: 2, setsRatio: RATIO_UNDEFINED });
        const b = makeStandingsRow({ id: "b", won: 2, setsRatio: 9 });

        expect(compareTeams(a, b, { seedIndex })).toBe(-1);
        expect(compareTeams(b, a, { seedIndex })).toBe(1);
    });

    it("treats two undefined set ratios as level and moves on", () => {
        const a = makeStandingsRow({ id: "a", won: 2, setsRatio: RATIO_UNDEFINED, pointsRatio: 1 });
        const b = makeStandingsRow({ id: "b", won: 2, setsRatio: RATIO_UNDEFINED, pointsRatio: 2 });

        expect(compareTeams(a, b, { seedIndex })).toBeGreaterThan(0);
    });

    it("ranks an undefined point ratio above a defined one", () => {
        const a = makeStandingsRow({ id: "a", won: 2, pointsRatio: RATIO_UNDEFINED });
        const b = makeStandingsRow({ id: "b", won: 2, pointsRatio: 5 });

        expect(compareTeams(a, b, { seedIndex })).toBe(-1);
        expect(compareTeams(b, a, { seedIndex })).toBe(1);
    });

    it("treats two undefined point ratios as level and moves on", () => {
        const a = makeStandingsRow({ id: "a", won: 2, pointsRatio: RATIO_UNDEFINED });
        const b = makeStandingsRow({ id: "b", won: 2, pointsRatio: RATIO_UNDEFINED });

        // Nothing else separates them, so seeding decides: "a" is seed 0.
        expect(compareTeams(a, b, { seedIndex })).toBeLessThan(0);
    });

    it("falls to head-to-head when the ratios are level", () => {
        const a = makeStandingsRow({ id: "a", won: 2 });
        const b = makeStandingsRow({ id: "b", won: 2 });
        const headToHead = new Map([["b|a", 1]]);

        expect(compareTeams(a, b, { headToHead, seedIndex })).toBeGreaterThan(0);
    });

    // Q4: a 3-way head-to-head cycle falls through to seeding for the whole
    // tied group, rather than resolving each pair independently — which used
    // to produce a non-transitive comparator whose result depended on
    // Array.sort's own implementation instead of the rules.
    it("ignores head-to-head that forms a loop and falls to seeding, for the whole tied group", () => {
        // A beat B, B beat C, C beat A. The rules forbid a mini-league here.
        const rows = [
            makeStandingsRow({ id: "a", won: 1 }),
            makeStandingsRow({ id: "b", won: 1 }),
            makeStandingsRow({ id: "c", won: 1 })
        ];
        const headToHead = new Map([["a|b", 1], ["b|c", 1], ["c|a", 1]]);
        const loopSeeds = buildSeedIndex(["c", "b", "a"]);

        const ranked = rankGroup(rows, { headToHead, seedIndex: loopSeeds });

        // The cycle means head-to-head decides nothing for any pair in this
        // group, so seeding alone orders all three: c, then b, then a.
        expect(ranked.map((row) => row.id)).toEqual(["c", "b", "a"]);
    });

    // A larger group where only a sub-cycle among some of the tied teams
    // exists still has to fall through entirely, per Q4 — a partial order is
    // not enough to trust head-to-head for any pair in the tier.
    it("falls through a four-team tie to seeding when three of them cycle", () => {
        const rows = [
            makeStandingsRow({ id: "a", won: 1 }),
            makeStandingsRow({ id: "b", won: 1 }),
            makeStandingsRow({ id: "c", won: 1 }),
            makeStandingsRow({ id: "d", won: 1 })
        ];
        // a beat b, b beat c, c beat a (a cycle); d beat everyone else cleanly.
        const headToHead = new Map([
            ["a|b", 1], ["b|c", 1], ["c|a", 1],
            ["d|a", 1], ["d|b", 1], ["d|c", 1]
        ]);
        const seedIndex = buildSeedIndex(["d", "c", "b", "a"]);

        const ranked = rankGroup(rows, { headToHead, seedIndex });

        expect(ranked.map((row) => row.id)).toEqual(["d", "c", "b", "a"]);
    });

    // A tied pair still resolves by head-to-head as before — only a group of
    // three or more can cycle.
    it("still resolves a tied pair by head-to-head, untouched by the cycle fix", () => {
        const rows = [
            makeStandingsRow({ id: "a", won: 1 }),
            makeStandingsRow({ id: "b", won: 1 })
        ];
        const headToHead = new Map([["b|a", 1]]);
        const seedIndex = buildSeedIndex(["a", "b"]);

        expect(rankGroup(rows, { headToHead, seedIndex }).map((row) => row.id)).toEqual(["b", "a"]);
    });

    it("falls to seeding when nothing else separates two teams", () => {
        const a = makeStandingsRow({ id: "a", won: 2 });
        const b = makeStandingsRow({ id: "b", won: 2 });

        expect(compareTeams(a, b, { seedIndex })).toBe(-1);
    });

    it("does not rank on setOutcomes — it is a counter, not a sixth criterion", () => {
        // Level on every criterion in the chain and differing only in how their
        // wins were scored, so seeding has to be what decides them.
        const a = makeStandingsRow({ id: "a", won: 2, setOutcomes: { "2-0": 2 } });
        const b = makeStandingsRow({ id: "b", won: 2, setOutcomes: { "2-1": 2 } });

        expect(compareTeams(a, b, { seedIndex })).toBe(-1);
        expect(compareTeams(b, a, { seedIndex })).toBe(1);
    });

    it("cannot separate two unseeded teams", () => {
        const a = makeStandingsRow({ id: "unknown-a", won: 2 });
        const b = makeStandingsRow({ id: "unknown-b", won: 2 });

        expect(compareTeams(a, b, { seedIndex })).toBe(0);
    });

    it("works with no context supplied at all", () => {
        const a = makeStandingsRow({ id: "a", won: 3 });
        const b = makeStandingsRow({ id: "b", won: 1 });

        expect(compareTeams(a, b)).toBeLessThan(0);
    });
});

describe("rankGroup", () => {
    it("returns a new array and leaves the input untouched", () => {
        const rows = [
            makeStandingsRow({ id: "a", won: 1 }),
            makeStandingsRow({ id: "b", won: 3 })
        ];

        const ranked = rankGroup(rows, { seedIndex: buildSeedIndex(["a", "b"]) });

        expect(ranked).not.toBe(rows);
        expect(ranked.map((row) => row.id)).toEqual(["b", "a"]);
        expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
    });
});

describe("seedAcrossGroups", () => {
    const seedIndex = buildSeedIndex(["a1", "b1", "a2", "b2", "a3"]);

    it("orders by pool position first: all winners, then all runners-up", () => {
        const groupA = [
            makeStandingsRow({ id: "a1", won: 3 }),
            makeStandingsRow({ id: "a2", won: 1 })
        ];
        const groupB = [
            makeStandingsRow({ id: "b1", won: 2 }),
            makeStandingsRow({ id: "b2", won: 0 })
        ];

        expect(seedAcrossGroups([groupA, groupB], seedIndex).map((row) => row.id))
            .toEqual(["a1", "b1", "a2", "b2"]);
    });

    it("ignores head-to-head across pools", () => {
        // b1 beat a1 head to head, but they are in different pools and both won
        // three matches, so seeding decides and a1 (seed 0) stays ahead.
        const groupA = [makeStandingsRow({ id: "a1", won: 3 })];
        const groupB = [makeStandingsRow({ id: "b1", won: 3 })];

        expect(seedAcrossGroups([groupA, groupB], seedIndex).map((row) => row.id))
            .toEqual(["a1", "b1"]);
    });

    it("handles pools of uneven size without leaving holes", () => {
        const groupA = [
            makeStandingsRow({ id: "a1", won: 3 }),
            makeStandingsRow({ id: "a2", won: 2 }),
            makeStandingsRow({ id: "a3", won: 1 })
        ];
        const groupB = [makeStandingsRow({ id: "b1", won: 3 })];

        expect(seedAcrossGroups([groupA, groupB], seedIndex).map((row) => row.id))
            .toEqual(["a1", "b1", "a2", "a3"]);
    });

    it("returns an empty list when there are no pools", () => {
        expect(seedAcrossGroups([], seedIndex)).toEqual([]);
    });
});

describe("describeQualifierSlot", () => {
    it("maps an even split to pool letter and 1-based tier position", () => {
        // 2 pools of 4, 4 qualifiers -> cleanTiers = 2, both tiers clean.
        expect(describeQualifierSlot(0, [4, 4], 4)).toEqual({ groupIndex: 0, position: 1 });
        expect(describeQualifierSlot(1, [4, 4], 4)).toEqual({ groupIndex: 1, position: 1 });
        expect(describeQualifierSlot(2, [4, 4], 4)).toEqual({ groupIndex: 0, position: 2 });
        expect(describeQualifierSlot(3, [4, 4], 4)).toEqual({ groupIndex: 1, position: 2 });
    });

    it("skips pools too small to have an entry at a position, for uneven pools", () => {
        // 3 pools sized 3/2/2, 9 "qualifiers" -> cleanTiers = 3.
        // Position 0 and 1: every pool has an entry (A,B,C each twice).
        // Position 2: only pool A (size 3) has a third entry; B and C are skipped.
        expect(describeQualifierSlot(0, [3, 2, 2], 9)).toEqual({ groupIndex: 0, position: 1 });
        expect(describeQualifierSlot(1, [3, 2, 2], 9)).toEqual({ groupIndex: 1, position: 1 });
        expect(describeQualifierSlot(2, [3, 2, 2], 9)).toEqual({ groupIndex: 2, position: 1 });
        expect(describeQualifierSlot(3, [3, 2, 2], 9)).toEqual({ groupIndex: 0, position: 2 });
        expect(describeQualifierSlot(4, [3, 2, 2], 9)).toEqual({ groupIndex: 1, position: 2 });
        expect(describeQualifierSlot(5, [3, 2, 2], 9)).toEqual({ groupIndex: 2, position: 2 });
        expect(describeQualifierSlot(6, [3, 2, 2], 9)).toEqual({ groupIndex: 0, position: 3 });
        expect(describeQualifierSlot(7, [3, 2, 2], 9)).toBeNull();
    });

    it("returns null for an index in a tier that isn't clean", () => {
        // 4 pools of 3, 10 qualifiers -> cleanTiers = floor(10/4) = 2, so only
        // the first two tiers (indices 0-7) are pool-derived.
        expect(describeQualifierSlot(7, [3, 3, 3, 3], 10)).toEqual({ groupIndex: 3, position: 2 });
        expect(describeQualifierSlot(8, [3, 3, 3, 3], 10)).toBeNull();
        expect(describeQualifierSlot(9, [3, 3, 3, 3], 10)).toBeNull();
    });

    it("returns null for non-integer or missing input", () => {
        expect(describeQualifierSlot(null, [4, 4], 4)).toBeNull();
        expect(describeQualifierSlot(1.5, [4, 4], 4)).toBeNull();
        expect(describeQualifierSlot(0, [], 4)).toBeNull();
        expect(describeQualifierSlot(0, null, 4)).toBeNull();
    });
});

describe("seedKnockoutResults", () => {
    const seedIndex = buildSeedIndex(["s0", "s1", "s2", "s3"]);

    it("puts every winner before every loser, each half in seeding order", () => {
        const matchups = [
            { winnerId: "s3", loserId: "s0" },
            { winnerId: "s1", loserId: "s2" }
        ];

        // [w1, w2, l1, l2] so the next round can express bronze as [2, 3].
        expect(seedKnockoutResults(matchups)).toEqual(["s3", "s1", "s0", "s2"]);
    });

    // Changed with review 4.1: a missing side used to be skipped, closing the gap
    // and moving every later place along. The next round indexes these places,
    // so a side nobody fills holds null.
    it("keeps a place empty when one side of a match is missing", () => {
        const matchups = [
            { winnerId: "s1", loserId: null },
            { winnerId: undefined, loserId: "s2" }
        ];

        expect(seedKnockoutResults(matchups)).toEqual(["s1", null, null, "s2"]);
    });

    it("gives a bye a winner place and no loser place", () => {
        const matchups = [
            { winnerId: "s0", loserId: null, bye: true },
            { winnerId: "s1", loserId: "s2" }
        ];

        expect(seedKnockoutResults(matchups)).toEqual(["s0", "s1", "s2"]);
    });

    // Both teams out of a cancelled match: past every place the next round reads,
    // so they are ranked as eliminated without taking anyone's place.
    it("puts the teams out of a match that sent nobody on after the losers", () => {
        const matchups = [
            { winnerId: null, loserId: null, withdrawnIds: ["s0", "s3"] },
            { winnerId: "s1", loserId: "s2" }
        ];

        expect(seedKnockoutResults(matchups)).toEqual([null, "s1", null, "s2", "s0", "s3"]);
    });

    it("sorts unseeded teams last", () => {
        const matchups = [
            { winnerId: "unseeded", loserId: "s3" },
            { winnerId: "s0", loserId: "s2" }
        ];

        expect(seedKnockoutResults(matchups)).toEqual(["unseeded", "s0", "s3", "s2"]);
    });

    it("keeps a stable order when unseeded teams appear on either side of a comparison", () => {
        const matchups = [
            { winnerId: "u1", loserId: "u2" },
            { winnerId: "s0", loserId: "s3" },
            { winnerId: "u3", loserId: "s1" }
        ];

        const ordered = seedKnockoutResults(matchups);

        expect(ordered.slice(0, 3)).toEqual(["u1", "s0", "u3"]);
        expect(ordered.slice(3)).toEqual(["u2", "s3", "s1"]);
    });

    it("returns an empty list when no matches were played", () => {
        expect(seedKnockoutResults([])).toEqual([]);
    });
});

describe("primaryScore and the ranking basis", () => {
    // setOutcomes is keyed by the scoreline from the team's own side.
    const row = (setOutcomes, extra = {}) => makeStandingsRow({ setOutcomes, ...extra });

    it("is matches won by default and for an unrecognised basis", () => {
        expect(primaryScore(row({}, { won: 3 }))).toBe(3);
        expect(primaryScore(row({}, { won: 3 }), rulesFromBasis("MATCHES_WON"))).toBe(3);
        expect(primaryScore(row({}, { won: 3 }), rulesFromBasis("SOMETHING_ELSE"))).toBe(3);
    });

    it("is total sets won for SETS_WON", () => {
        expect(primaryScore(row({}, { setsWon: 7 }), rulesFromBasis("SETS_WON"))).toBe(7);
    });

    it("scores FIVB points: 3 for a clear win, 2 for a deciding-set win, 1 for a deciding-set loss", () => {
        const outcomes = { "3-0": 1, "3-1": 1, "3-2": 1, "2-3": 1, "1-3": 1, "0-3": 1 };

        expect(primaryScore(row(outcomes), rulesFromBasis("FIVB_POINTS"))).toBe(3 + 3 + 2 + 1);
    });

    it("scores simplified points: 2 for any win, 1 for a deciding-set loss", () => {
        const outcomes = { "2-0": 2, "2-1": 1, "1-2": 1, "0-2": 1 };

        expect(primaryScore(row(outcomes), rulesFromBasis("SIMPLIFIED_POINTS"))).toBe(2 * 2 + 2 + 1);
    });

    it("treats a single-set match as won outright, not in a deciding set", () => {
        expect(primaryScore(row({ "1-0": 1 }), rulesFromBasis("FIVB_POINTS"))).toBe(3);
        expect(primaryScore(row({ "0-1": 1 }), rulesFromBasis("SIMPLIFIED_POINTS"))).toBe(0);
    });

    it("reads a row with no setOutcomes as no points", () => {
        expect(primaryScore(row(undefined), rulesFromBasis("FIVB_POINTS"))).toBe(0);
    });

    it("lists the four bases the Settings page offers", () => {
        expect(RANKING_BASES).toEqual(["MATCHES_WON", "FIVB_POINTS", "SIMPLIFIED_POINTS", "SETS_WON"]);
    });

    // The whole feature: the same rows, sorted differently, with nothing rebuilt.
    // P won three matches, all 3-2, and lost one 0-3. Q won two 3-0 and lost two
    // 2-3. More wins for P; more of everything else for Q.
    const p = makeStandingsRow({ id: "p", won: 3, lost: 1, setsWon: 9, setsLost: 9, setOutcomes: { "3-2": 3, "0-3": 1 } });
    const q = makeStandingsRow({ id: "q", won: 2, lost: 2, setsWon: 10, setsLost: 6, setOutcomes: { "3-0": 2, "2-3": 2 } });
    [p, q].forEach(computeRatios);
    const order = (basis) => rankGroup([p, q], { rules: rulesFromBasis(basis) }).map((team) => team.id);

    it.each([
        [undefined, ["p", "q"]],
        ["MATCHES_WON", ["p", "q"]],
        // FIVB: P 2 + 2 + 2 = 6, Q 3 + 3 + 1 + 1 = 8.
        ["FIVB_POINTS", ["q", "p"]],
        // Sets won: P 9, Q 10.
        ["SETS_WON", ["q", "p"]],
        // Simplified: 6 apiece, so the unchanged chain behind it decides — set
        // ratio, P 1.0 against Q 1.67.
        ["SIMPLIFIED_POINTS", ["q", "p"]]
    ])("ranks by %s", (basis, expected) => {
        expect(order(basis)).toEqual(expected);
    });

    it("carries the basis into cross-pool seeding", () => {
        const e = makeStandingsRow({ id: "e", won: 2, setsWon: 6, setsLost: 0, setOutcomes: { "3-0": 2 } });
        const f = makeStandingsRow({ id: "f", won: 1, lost: 1, setsWon: 7, setsLost: 3, setOutcomes: { "3-0": 1, "4-3": 1 } });
        [e, f].forEach(computeRatios);

        expect(seedAcrossGroups([[e], [f]], new Map()).map((row) => row.id)).toEqual(["e", "f"]);
        expect(seedAcrossGroups([[e], [f]], new Map(), 0, rulesFromBasis("SETS_WON")).map((row) => row.id)).toEqual(["f", "e"]);
    });
});

describe("ranking rules", () => {
    const defaults = ["SET_RATIO", "POINT_RATIO", "HEAD_TO_HEAD"];

    it("maps each ranking basis onto rules", () => {
        expect(rulesFromBasis("MATCHES_WON")).toEqual({ method: "wins", wins: "matches", tiebreakers: defaults });
        expect(rulesFromBasis("SETS_WON")).toEqual({ method: "wins", wins: "sets", tiebreakers: defaults });
        expect(rulesFromBasis("FIVB_POINTS")).toEqual({
            method: "points",
            points: { straightWin: 3, decidingWin: 2, decidingLoss: 1, straightLoss: 0 },
            tiebreakers: defaults
        });
        expect(rulesFromBasis("SIMPLIFIED_POINTS")).toEqual({
            method: "points",
            points: { straightWin: 2, decidingWin: 2, decidingLoss: 1, straightLoss: 0 },
            tiebreakers: defaults
        });
        expect(rulesFromBasis()).toEqual(rulesFromBasis("MATCHES_WON"));
    });

    it("hands out a fresh decider list each time", () => {
        rulesFromBasis().tiebreakers.push("SETS_WON");

        expect(rulesFromBasis().tiebreakers).toEqual(defaults);
    });

    it("lists the deciders an organiser may choose, without seeding", () => {
        expect(TIEBREAKERS).toEqual([
            "SET_RATIO", "POINT_RATIO", "HEAD_TO_HEAD", "SET_DIFFERENCE", "POINT_DIFFERENCE", "POINTS_SCORED", "SETS_WON"
        ]);
    });

    describe("readRankingRules", () => {
        const points = { straightWin: 3, decidingWin: 2, decidingLoss: 1, straightLoss: 0 };

        it("accepts wins rules and drops anything extra", () => {
            expect(readRankingRules({ method: "wins", wins: "sets", points, tiebreakers: ["SETS_WON"], other: 1 }))
                .toEqual({ method: "wins", wins: "sets", tiebreakers: ["SETS_WON"] });
            expect(readRankingRules({ method: "wins", wins: "matches", tiebreakers: [] }))
                .toEqual({ method: "wins", wins: "matches", tiebreakers: [] });
        });

        it("accepts points rules and drops anything extra", () => {
            expect(readRankingRules({ method: "points", wins: "sets", points: { ...points, draw: 1 }, tiebreakers: defaults }))
                .toEqual({ method: "points", points, tiebreakers: defaults });
        });

        it.each([
            ["nothing", undefined],
            ["null", null],
            ["a string", "wins"],
            ["no deciders", { method: "wins", wins: "matches" }],
            ["an unknown method", { method: "draws", tiebreakers: [] }],
            ["an unknown kind of win", { method: "wins", wins: "points", tiebreakers: [] }],
            ["an unknown decider", { method: "wins", wins: "matches", tiebreakers: ["COIN_TOSS"] }],
            ["seeding in the list", { method: "wins", wins: "matches", tiebreakers: ["SEEDING"] }],
            ["a repeated decider", { method: "wins", wins: "matches", tiebreakers: ["SETS_WON", "SETS_WON"] }],
            ["points with no numbers", { method: "points", tiebreakers: [] }],
            ["points that are not an object", { method: "points", points: 3, tiebreakers: [] }],
            ["a missing number", { method: "points", points: { straightWin: 3, decidingWin: 2, decidingLoss: 1 }, tiebreakers: [] }],
            ["a fraction", { method: "points", points: { ...points, decidingWin: 1.5 }, tiebreakers: [] }],
            ["a negative number", { method: "points", points: { ...points, straightLoss: -1 }, tiebreakers: [] }],
            ["a number above ten", { method: "points", points: { ...points, straightWin: 11 }, tiebreakers: [] }]
        ])("refuses %s", (_, value) => {
            expect(readRankingRules(value)).toBeNull();
        });
    });

    describe("rankingRulesOf", () => {
        it.each(RANKING_BASES)("derives the rules from %s when none are stored", (basis) => {
            expect(rankingRulesOf({ ranking_basis: basis, state: { teams: [] } })).toEqual(rulesFromBasis(basis));
        });

        it("is match wins for a division with no basis, no state, or nothing at all", () => {
            expect(rankingRulesOf({ ranking_basis: null })).toEqual(rulesFromBasis("MATCHES_WON"));
            expect(rankingRulesOf(undefined)).toEqual(rulesFromBasis("MATCHES_WON"));
        });

        it("returns the stored rules ahead of the basis", () => {
            const stored = { method: "wins", wins: "sets", tiebreakers: ["POINTS_SCORED"] };

            expect(rankingRulesOf({ ranking_basis: "FIVB_POINTS", state: { rankingRules: stored } })).toEqual(stored);
        });

        it("falls back to the basis when the stored rules are not valid", () => {
            expect(rankingRulesOf({ ranking_basis: "SETS_WON", state: { rankingRules: { method: "x" } } }))
                .toEqual(rulesFromBasis("SETS_WON"));
        });
    });

    it("scores custom points, including a number for a straight loss", () => {
        const rules = { method: "points", points: { straightWin: 5, decidingWin: 4, decidingLoss: 2, straightLoss: 1 }, tiebreakers: [] };
        const outcomes = { "2-0": 1, "2-1": 1, "1-2": 1, "0-2": 2 };

        expect(primaryScore(makeStandingsRow({ setOutcomes: outcomes }), rules)).toBe(5 + 4 + 2 + 1 * 2);
    });

    describe("each decider", () => {
        const wins = (tiebreakers) => ({ method: "wins", wins: "matches", tiebreakers });
        // Seeded low first, so a decider that separated nobody would leave "low"
        // on top.
        const seedIndex = buildSeedIndex(["low", "high"]);
        const order = (tiebreakers, low, high) => rankGroup(
            [makeStandingsRow({ id: "low", ...low }), makeStandingsRow({ id: "high", ...high })].map(computeRatios),
            { seedIndex, rules: wins(tiebreakers) }
        ).map((team) => team.id);

        it.each([
            ["SET_RATIO", { setsWon: 4, setsLost: 4 }, { setsWon: 3, setsLost: 2 }],
            ["POINT_RATIO", { pointsFor: 50, pointsAgainst: 50 }, { pointsFor: 30, pointsAgainst: 20 }],
            ["SET_DIFFERENCE", { setsWon: 6, setsLost: 5 }, { setsWon: 4, setsLost: 2 }],
            ["POINT_DIFFERENCE", { pointsFor: 100, pointsAgainst: 95 }, { pointsFor: 60, pointsAgainst: 40 }],
            ["POINTS_SCORED", { pointsFor: 60 }, { pointsFor: 61 }],
            ["SETS_WON", { setsWon: 3 }, { setsWon: 4 }]
        ])("%s puts the better team first", (key, low, high) => {
            expect(order([key], low, high)).toEqual(["high", "low"]);
            // Without it nothing separates them and seeding decides.
            expect(order([], low, high)).toEqual(["low", "high"]);
        });

        it("applies the deciders in the order given", () => {
            // "low" scored more points; "high" won more sets.
            const low = { pointsFor: 90, setsWon: 3 };
            const high = { pointsFor: 80, setsWon: 5 };

            expect(order(["POINTS_SCORED", "SETS_WON"], low, high)).toEqual(["low", "high"]);
            expect(order(["SETS_WON", "POINTS_SCORED"], low, high)).toEqual(["high", "low"]);
        });
    });

    describe("head-to-head anywhere in the list", () => {
        const wins = (tiebreakers) => ({ method: "wins", wins: "matches", tiebreakers });
        const ids = (rows) => rows.map((row) => row.id);

        // A pair level on wins. "a" has more points scored, "b" won their match.
        const pair = () => [
            makeStandingsRow({ id: "a", won: 1, pointsFor: 60, setsWon: 2 }),
            makeStandingsRow({ id: "b", won: 1, pointsFor: 50, setsWon: 2 })
        ];
        const bBeatA = new Map([["b|a", 1]]);
        const seedIndex = buildSeedIndex(["a", "b", "c", "d"]);

        it("first: decides before anything below it", () => {
            const rules = wins(["HEAD_TO_HEAD", "POINTS_SCORED"]);

            expect(ids(rankGroup(pair(), { headToHead: bBeatA, seedIndex, rules }))).toEqual(["b", "a"]);
        });

        it("last: only reached when everything above it ties", () => {
            const rules = wins(["POINTS_SCORED", "HEAD_TO_HEAD"]);

            expect(ids(rankGroup(pair(), { headToHead: bBeatA, seedIndex, rules }))).toEqual(["a", "b"]);
        });

        it("middle: applies to the teams level above it and hands on to the one below", () => {
            const rules = wins(["SETS_WON", "HEAD_TO_HEAD", "POINTS_SCORED"]);

            // Level on sets won, so head-to-head decides ahead of points scored.
            expect(ids(rankGroup(pair(), { headToHead: bBeatA, seedIndex, rules }))).toEqual(["b", "a"]);
            // They never met: head-to-head separates nobody and points scored does.
            expect(ids(rankGroup(pair(), { seedIndex, rules }))).toEqual(["a", "b"]);
        });

        it("is not used at all when it is not in the list", () => {
            expect(ids(rankGroup(pair(), { headToHead: bBeatA, seedIndex, rules: wins([]) }))).toEqual(["a", "b"]);
        });

        // The worked example in docs/tournament-rules.md.
        const loop = new Map([["a|b", 1], ["b|c", 1], ["c|a", 1], ["a|d", 1], ["b|d", 1], ["c|d", 1]]);
        const pool = () => [
            makeStandingsRow({ id: "a", won: 2, pointsFor: 109, pointsAgainst: 100 }),
            makeStandingsRow({ id: "b", won: 2, pointsFor: 103, pointsAgainst: 100 }),
            makeStandingsRow({ id: "c", won: 2, pointsFor: 112, pointsAgainst: 100 }),
            makeStandingsRow({ id: "d", won: 0, pointsFor: 76, pointsAgainst: 100 })
        ];

        it("skips a loop for that group and carries on with the deciders below it", () => {
            const rules = wins(["HEAD_TO_HEAD", "POINT_DIFFERENCE"]);

            expect(ids(rankGroup(pool(), { headToHead: loop, seedIndex, rules }))).toEqual(["c", "a", "b", "d"]);
        });

        it("uses head-to-head alone when the same three do not loop", () => {
            const rules = wins(["HEAD_TO_HEAD", "POINT_DIFFERENCE"]);
            const noLoop = new Map([["a|b", 1], ["b|c", 1], ["a|c", 1]]);

            expect(ids(rankGroup(pool(), { headToHead: noLoop, seedIndex, rules }))).toEqual(["a", "b", "c", "d"]);
        });

        it("falls to seeding when a loop has nothing below it, as the default order does", () => {
            const rules = wins(["POINT_DIFFERENCE", "HEAD_TO_HEAD"]);
            const level = pool().map((row) => ({ ...row, pointsFor: 100 }));
            const reversed = buildSeedIndex(["d", "c", "b", "a"]);

            expect(ids(rankGroup(level.slice(0, 3), { headToHead: loop, seedIndex: reversed, rules }))).toEqual(["c", "b", "a"]);
        });

        it("only loops among the teams level above it", () => {
            // Sets won splits "c" off first, leaving a pair that cannot loop.
            const rules = wins(["SETS_WON", "HEAD_TO_HEAD"]);
            const rows = pool().slice(0, 3).map((row) => ({ ...row, setsWon: row.id === "c" ? 6 : 4 }));

            expect(ids(rankGroup(rows, { headToHead: loop, seedIndex, rules }))).toEqual(["c", "a", "b"]);
        });

        it("is skipped across pools wherever it sits", () => {
            const rules = wins(["HEAD_TO_HEAD", "POINTS_SCORED"]);
            const [a, b] = pair();

            // No map reaches the cross-pool comparison, so points scored decides.
            expect(ids(seedAcrossGroups([[b], [a]], seedIndex, 0, rules))).toEqual(["a", "b"]);
        });
    });
});
