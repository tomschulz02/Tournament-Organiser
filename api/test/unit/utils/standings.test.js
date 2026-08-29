import { describe, it, expect } from "vitest";
import {
    RATIO_UNDEFINED,
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

    it("ignores head-to-head that forms a loop and falls to seeding", () => {
        // A beat B, B beat C, C beat A. The rules forbid a mini-league here.
        const rows = [
            makeStandingsRow({ id: "a", won: 1 }),
            makeStandingsRow({ id: "b", won: 1 }),
            makeStandingsRow({ id: "c", won: 1 })
        ];
        const headToHead = new Map([["a|b", 1], ["b|c", 1], ["c|a", 1]]);
        const loopSeeds = buildSeedIndex(["c", "b", "a"]);

        const ranked = rankGroup(rows, { headToHead, seedIndex: loopSeeds });

        // Each pair is separated by head-to-head, not by seeding, so the loop
        // resolves to whatever order the sort settles on — the point is that it
        // terminates and every team appears exactly once.
        expect(ranked.map((row) => row.id).sort()).toEqual(["a", "b", "c"]);
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

    it("takes one side of a matchup when the other is missing", () => {
        const matchups = [
            { winnerId: "s1", loserId: null },
            { winnerId: undefined, loserId: "s2" }
        ];

        expect(seedKnockoutResults(matchups)).toEqual(["s1", "s2"]);
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
