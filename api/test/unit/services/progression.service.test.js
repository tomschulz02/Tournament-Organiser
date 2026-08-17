import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        getDivisionWithOwner: vi.fn(),
        getFixturesByDivisionId: vi.fn(),
        getTeamsByIds: vi.fn(),
        updateRounds: vi.fn()
    }
}));

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: { updateFixtures: vi.fn() }
}));

const {
    progressionService,
    bindFixturesToResults,
    validateConfirmedTeams,
    sameOrder,
    computeRoundResults,
    buildKnockoutOutcomes,
    normalizeState,
    normalizeFixtureResult,
    isRoundComplete,
    hasPlayedFixtures
} = await import("../../../src/services/progression.service.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { makeFixture, makeNormalisedFixture, makeRound, makeState } =
    await import("../../helpers/fixtures.js");

const TEAM_IDS = ["t1", "t2", "t3", "t4"];

function poolRound(overrides = {}) {
    return makeRound({
        name: "Pool Play",
        type: "roundRobin",
        groups: [["t1", "t2"], ["t3", "t4"]],
        ...overrides
    });
}

// The real shape of a Finals round: the 3rd place playoff at group index 0 and
// the final at index 1, so it consumes four ranks. The qualifier count is
// derived from those indices — one past the largest — never stored.
function finalsRound(overrides = {}) {
    return makeRound({
        name: "Finals",
        type: "knockout",
        groups: [[2, 3], [0, 1]],
        fixtures: ["f-bronze", "f-final"],
        ...overrides
    });
}

// A next round that takes only two teams, for the cases about the derived count.
function twoTeamRound(overrides = {}) {
    return finalsRound({ groups: [[0, 1]], fixtures: ["f-final"], ...overrides });
}

// t1 beats t2, t4 beats t3. Cross-pool seeding then gives [t1, t4, t2, t3].
function completedPoolFixtures() {
    return [
        makeFixture({
            id: "f1", match_no: 1, round: "Pool Play", status: "COMPLETED",
            team_1: "t1", team_2: "t2", team_1_result: [21, 21], team_2_result: [15, 18]
        }),
        makeFixture({
            id: "f2", match_no: 2, round: "Pool Play", status: "COMPLETED",
            team_1: "t3", team_2: "t4", team_1_result: [15, 18], team_2_result: [21, 21]
        })
    ];
}

function loadable({ rounds = [poolRound(), finalsRound()], currentRound = 0, fixtures = completedPoolFixtures(), createdBy = "user-1" } = {}) {
    divisionsRepository.getDivisionWithOwner.mockResolvedValue({
        id: "div-1",
        name: "Division A",
        created_by: createdBy,
        state: makeState({ teams: TEAM_IDS, rounds, currentRound })
    });
    divisionsRepository.getFixturesByDivisionId.mockResolvedValue(fixtures);
    divisionsRepository.getTeamsByIds.mockResolvedValue([
        { id: "t1", name: "Aces" },
        { id: "t2", name: "Bears" },
        { id: "t3", name: "Cubs" },
        { id: "t4", name: "Ducks" }
    ]);
}

beforeEach(() => {
    divisionsRepository.getDivisionWithOwner.mockReset();
    divisionsRepository.getFixturesByDivisionId.mockReset();
    divisionsRepository.getTeamsByIds.mockReset();
    divisionsRepository.updateRounds.mockReset();
    fixturesRepository.updateFixtures.mockReset();
});

// --- pure helpers ---------------------------------------------------------

describe("normalizeState", () => {
    it("returns an empty state when there is none", () => {
        expect(normalizeState(null)).toEqual({ teams: [], rounds: [], currentRound: 0 });
        expect(normalizeState(undefined)).toEqual({ teams: [], rounds: [], currentRound: 0 });
    });

    it("parses a JSON string", () => {
        expect(normalizeState('{"teams":["t1"],"rounds":[],"currentRound":1}'))
            .toEqual({ teams: ["t1"], rounds: [], currentRound: 1 });
    });

    it("returns an empty state when the string will not parse", () => {
        expect(normalizeState("{oops")).toEqual({ teams: [], rounds: [], currentRound: 0 });
    });

    it("passes an object through unchanged", () => {
        const state = makeState({ teams: ["t1"] });

        expect(normalizeState(state)).toBe(state);
    });
});

describe("normalizeFixtureResult", () => {
    it("zips the two parallel score columns into set pairs", () => {
        expect(normalizeFixtureResult(makeFixture({ team_1_result: [21, 18], team_2_result: [15, 21] })).result)
            .toEqual([[21, 15], [18, 21]]);
    });

    it("truncates to the shorter column when the two disagree", () => {
        expect(normalizeFixtureResult(makeFixture({ team_1_result: [21, 18], team_2_result: [15] })).result)
            .toEqual([[21, 15]]);
    });

    it("treats an unparseable score as zero", () => {
        expect(normalizeFixtureResult(makeFixture({ team_1_result: ["x"], team_2_result: [null] })).result)
            .toEqual([[0, 0]]);
    });

    it("yields an empty result when the columns are not arrays", () => {
        expect(normalizeFixtureResult(makeFixture()).result).toEqual([]);
    });

    it("keeps the rest of the fixture", () => {
        expect(normalizeFixtureResult(makeFixture({ id: "f9", round: "Finals" })))
            .toMatchObject({ id: "f9", round: "Finals" });
    });
});

describe("isRoundComplete", () => {
    const round = poolRound();

    it("is false when the round has no fixtures", () => {
        expect(isRoundComplete(round, [])).toBe(false);
        expect(isRoundComplete(round, [makeFixture({ round: "Finals" })])).toBe(false);
    });

    it("is true once every fixture is completed", () => {
        expect(isRoundComplete(round, completedPoolFixtures())).toBe(true);
    });

    it("treats a cancelled fixture as settled, because it never happened", () => {
        const fixtures = completedPoolFixtures();
        fixtures[1].status = "CANCELLED";

        expect(isRoundComplete(round, fixtures)).toBe(true);
    });

    it("is false while a fixture is outstanding", () => {
        const fixtures = completedPoolFixtures();
        fixtures[1].status = "UPCOMING";

        expect(isRoundComplete(round, fixtures)).toBe(false);
    });
});

describe("hasPlayedFixtures", () => {
    const round = finalsRound();

    it("is true when a fixture in the round has been completed", () => {
        expect(hasPlayedFixtures(round, [makeFixture({ round: "Finals", status: "COMPLETED" })])).toBe(true);
    });

    it("is true when a fixture in the round is marked LIVE", () => {
        expect(hasPlayedFixtures(round, [makeFixture({ round: "Finals", status: "LIVE" })])).toBe(true);
    });

    it("is false when nothing in the round has started", () => {
        expect(hasPlayedFixtures(round, [makeFixture({ round: "Finals", status: "UPCOMING" })])).toBe(false);
    });

    it("ignores fixtures from other rounds", () => {
        expect(hasPlayedFixtures(round, [makeFixture({ round: "Pool Play", status: "COMPLETED" })])).toBe(false);
    });
});

describe("sameOrder", () => {
    it("compares element by element", () => {
        expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
        expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
        expect(sameOrder(["a"], ["a", "b"])).toBe(false);
    });
});

describe("buildKnockoutOutcomes", () => {
    const round = finalsRound();

    // buildKnockoutOutcomes runs on fixtures that have already been through
    // normalizeFixtureResult, so build them in that shape rather than the
    // fixtures-table shape.
    function knockoutFixture(overrides = {}) {
        return makeNormalisedFixture({
            round: "Finals",
            status: "COMPLETED",
            team_1_id: "t1",
            team_2_id: "t2",
            result: [[21, 15]],
            ...overrides
        });
    }

    it("reports the winner and loser of each match", () => {
        expect(buildKnockoutOutcomes(round, [knockoutFixture()]))
            .toEqual([{ winnerId: "t1", loserId: "t2" }]);
    });

    it("reports team two as the winner when it takes more sets", () => {
        expect(buildKnockoutOutcomes(round, [knockoutFixture({ result: [[15, 21]] })]))
            .toEqual([{ winnerId: "t2", loserId: "t1" }]);
    });

    it("drops a match that ended level, so neither team carries forward", () => {
        expect(buildKnockoutOutcomes(round, [knockoutFixture({ result: [[21, 15], [15, 21], [20, 20]] })]))
            .toEqual([]);
    });

    it("ignores fixtures from other rounds and fixtures that do not count", () => {
        const fixtures = [
            knockoutFixture({ round: "Semifinals" }),
            knockoutFixture({ status: "UPCOMING" })
        ];

        expect(buildKnockoutOutcomes(round, fixtures)).toEqual([]);
    });

    // One entry per group, not per fixture. A one-team group is a bye: the team
    // named at that index in the previous round's results advances, with no loser.
    it("emits the bye team for a one-team group", () => {
        const byeRound = makeRound({ name: "Round of 12", type: "knockout", groups: [[0], [1, 2]] });
        const fixtures = [knockoutFixture({ round: "Round of 12", team_1_id: "t2", team_2_id: "t3" })];

        expect(buildKnockoutOutcomes(byeRound, fixtures, ["t1", "t2", "t3"]))
            .toEqual([
                { winnerId: "t1", loserId: null },
                { winnerId: "t2", loserId: "t3" }
            ]);
    });

    it("emits nothing for a bye whose index names no team", () => {
        const byeRound = makeRound({ name: "Round of 12", type: "knockout", groups: [[9], "nope"] });

        expect(buildKnockoutOutcomes(byeRound, [], ["t1"])).toEqual([]);
    });

    it("accepts a group holding a team id directly", () => {
        const byeRound = makeRound({ name: "Round of 12", type: "knockout", groups: [["t7"]] });

        expect(buildKnockoutOutcomes(byeRound, [])).toEqual([{ winnerId: "t7", loserId: null }]);
    });
});

describe("computeRoundResults", () => {
    const state = makeState({ teams: TEAM_IDS });

    function normalised(fixtures) {
        return fixtures.map(normalizeFixtureResult);
    }

    it("seeds a round-robin round across pools, pool position first", () => {
        const results = computeRoundResults(poolRound(), state, normalised(completedPoolFixtures()));

        // Round-robin rounds carry the full standings row through; only the
        // knockout branch reduces to bare ids.
        expect(results.map((row) => row.id)).toEqual(["t1", "t4", "t2", "t3"]);
        expect(results[0]).toMatchObject({ id: "t1", played: 1, won: 1, setsWon: 2, pointsFor: 42 });
    });

    // Changed with the bye fix: a knockout round's results are now walked from its
    // groups rather than from its fixtures, so the round has to declare them. The
    // power-of-two answer is unchanged, team for team — with no byes, group order
    // and match order are the same thing.
    it("puts knockout winners before knockout losers", () => {
        const round = makeRound({ name: "Semifinals", type: "knockout", groups: [[0, 3], [1, 2]] });
        const fixtures = normalised([
            makeFixture({ match_no: 1, round: "Semifinals", status: "COMPLETED", team_1: "t1", team_2: "t4", team_1_result: [15], team_2_result: [21] }),
            makeFixture({ match_no: 2, round: "Semifinals", status: "COMPLETED", team_1: "t2", team_2: "t3", team_1_result: [21], team_2_result: [15] })
        ]);

        expect(computeRoundResults(round, state, fixtures)).toEqual([
            { id: "t4" }, { id: "t2" }, { id: "t1" }, { id: "t3" }
        ]);
    });

    // A Round of 12: four one-team groups for the teams going straight through,
    // then four matches. Results must be the four bye teams in group order, then
    // the four winners, then the four losers — twelve teams, not eight.
    it("carries bye teams into a knockout round's results", () => {
        const teams = Array.from({ length: 12 }, (_, index) => `k${index + 1}`);
        const twelveState = makeState({ teams });
        // Groups 0-3 are byes on ranks 0-3; groups 4-7 pair ranks 4-11.
        const round = makeRound({
            name: "Round of 12",
            type: "knockout",
            groups: [[0], [1], [2], [3], [4, 11], [5, 10], [6, 9], [7, 8]]
        });
        const fixtures = normalised([4, 5, 6, 7].map((rank, index) =>
            makeFixture({
                match_no: index + 1,
                round: "Round of 12",
                status: "COMPLETED",
                team_1: teams[rank],
                team_2: teams[11 - index],
                team_1_result: [21],
                team_2_result: [15]
            })
        ));

        const results = computeRoundResults(round, twelveState, fixtures, {
            previousResults: teams
        }).map((row) => row.id);

        expect(results).toEqual([
            "k1", "k2", "k3", "k4",
            "k5", "k6", "k7", "k8",
            "k12", "k11", "k10", "k9"
        ]);
    });

    // The Finals round holds the playoff at group index 0 and the final at index 1,
    // and the playoff's own round name is "3rd Place Playoff". Selecting on the
    // round name alone left the cursor a match short.
    it("counts the 3rd place playoff as part of the Finals round", () => {
        const round = finalsRound();
        const fixtures = normalised([
            makeFixture({ match_no: 1, round: "3rd Place Playoff", status: "COMPLETED", team_1: "t2", team_2: "t3", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ match_no: 2, round: "Finals", status: "COMPLETED", team_1: "t1", team_2: "t4", team_1_result: [15], team_2_result: [21] })
        ]);

        expect(computeRoundResults(round, state, fixtures).map((row) => row.id))
            .toEqual(["t2", "t4", "t3", "t1"]);
    });

    // Was bug 1. buildHeadToHeadMap reads team_1_id / team_2_id; progression used
    // to hand it rows straight from the fixtures table, which name those columns
    // team_1 / team_2, so the map was always empty and head-to-head — step 4 of
    // the chain in docs/tournament-rules.md — never fired here.
    it("ranks the winner of a head-to-head above the loser when nothing else separates them", () => {
        const fourTeamState = makeState({ teams: ["t1", "t2", "t3", "t4"] });
        const round = makeRound({ name: "Pool Play", groups: [["t1", "t2", "t3", "t4"]] });

        // t1 and t2 finish level on wins, set ratio and point ratio.
        // t2 beat t1, so t2 must rank higher despite t1 being the better seed.
        const fixtures = normalised([
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t2", team_2: "t1", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t1", team_2: "t3", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t4", team_2: "t2", team_1_result: [21], team_2_result: [15] })
        ]);

        expect(computeRoundResults(round, fourTeamState, fixtures).map((row) => row.id))
            .toEqual(["t4", "t2", "t1", "t3"]);
    });

    it("returns nothing when the round has no groups", () => {
        expect(computeRoundResults(makeRound({ groups: null }), state, [])).toEqual([]);
        expect(computeRoundResults(makeRound({ type: "knockout", groups: null }), state, [])).toEqual([]);
    });

    it("ignores a knockout group entry that names no team", () => {
        const round = makeRound({ name: "Semifinals", type: "knockout", groups: [[null]] });

        expect(computeRoundResults(round, state, [], { previousResults: ["t1"] })).toEqual([]);
    });

    it("orders knockout fixtures that have no match number yet", () => {
        const round = makeRound({ name: "Semifinals", type: "knockout", groups: [[0, 1], [2, 3]] });
        const fixtures = normalised([
            makeFixture({ match_no: null, round: "Semifinals", status: "COMPLETED", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ match_no: null, round: "Semifinals", status: "COMPLETED", team_1: "t3", team_2: "t4", team_1_result: [21], team_2_result: [15] })
        ]);

        expect(computeRoundResults(round, state, fixtures).map((row) => row.id)).toEqual(["t1", "t3", "t2", "t4"]);
    });

    it("ignores non-string entries in a group, and groups that are not arrays", () => {
        const round = poolRound({ groups: [["t1", 7, null], "nope"] });

        expect(computeRoundResults(round, state, []).map((row) => row.id)).toEqual(["t1"]);
    });

    it("ignores fixtures from another round, uncountable fixtures and outsiders", () => {
        const round = poolRound({ groups: [["t1", "t2"]] });
        const fixtures = normalised([
            makeFixture({ round: "Finals", status: "COMPLETED", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "UPCOMING", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t1", team_2: "outsider", team_1_result: [21], team_2_result: [15] })
        ]);

        // Nothing was attributed, so seeding alone decides.
        const results = computeRoundResults(round, state, fixtures);
        expect(results.map((row) => row.id)).toEqual(["t1", "t2"]);
        expect(results.every((row) => row.played === 0)).toBe(true);
    });
});

describe("bindFixturesToResults", () => {
    const confirmed = ["t1", "t4", "t2", "t3"];

    it("binds each placeholder fixture to the teams its indices point at", () => {
        const round = makeRound({ groups: [[2, 3], [0, 1]], fixtures: ["bronze", "gold"] });

        expect(bindFixturesToResults(round, confirmed)).toEqual([
            { id: "bronze", team_1: "t2", team_2: "t3" },
            { id: "gold", team_1: "t1", team_2: "t4" }
        ]);
    });

    it("binds null when an index points past the results", () => {
        const round = makeRound({ groups: [[0, 9], [8, 1]], fixtures: ["gold", "silver"] });

        expect(bindFixturesToResults(round, confirmed)).toEqual([
            { id: "gold", team_1: "t1", team_2: null },
            { id: "silver", team_1: null, team_2: "t4" }
        ]);
    });

    it("skips a group with no fixture to bind", () => {
        const round = makeRound({ groups: [[0, 1], [2, 3]], fixtures: ["gold"] });

        expect(bindFixturesToResults(round, confirmed)).toEqual([{ id: "gold", team_1: "t1", team_2: "t4" }]);
    });

    it("skips groups that are not positional, such as a round-robin pool", () => {
        const round = makeRound({ groups: [["t1", "t2"], "nope"], fixtures: ["a", "b"] });

        expect(bindFixturesToResults(round, confirmed)).toEqual([]);
    });

    // The fixture array is compacted — one-team groups get no fixture — so it is
    // walked with a cursor. Indexing it by group position meant that in a bye round
    // every lookup missed and nothing was ever bound.
    it("skips bye groups without consuming a fixture", () => {
        const round = makeRound({ groups: [[0], [1], [2, 3]], fixtures: ["match"] });

        expect(bindFixturesToResults(round, confirmed)).toEqual([
            { id: "match", team_1: "t2", team_2: "t3" }
        ]);
    });

    it("binds nothing when the round has no groups or no fixtures", () => {
        expect(bindFixturesToResults(makeRound({ groups: null, fixtures: ["a"] }), confirmed)).toEqual([]);
        expect(bindFixturesToResults(makeRound({ groups: [[0, 1]], fixtures: null }), confirmed)).toEqual([]);
    });
});

describe("validateConfirmedTeams", () => {
    const computed = TEAM_IDS.map((id) => ({ id }));
    const nextRound = finalsRound();

    it("accepts and returns a valid list", () => {
        expect(validateConfirmedTeams(TEAM_IDS, computed, nextRound)).toEqual(TEAM_IDS);
    });

    it("accepts the organiser reordering the ranking", () => {
        expect(validateConfirmedTeams(["t4", "t3", "t2", "t1"], computed, nextRound))
            .toEqual(["t4", "t3", "t2", "t1"]);
    });

    it("rejects anything that is not a non-empty array", () => {
        expect(() => validateConfirmedTeams(null, computed, nextRound)).toThrow(expect.objectContaining({ code: "INVALID_RESULTS" }));
        expect(() => validateConfirmedTeams([], computed, nextRound)).toThrow(expect.objectContaining({ code: "INVALID_RESULTS" }));
    });

    it("rejects entries that are not non-empty strings", () => {
        expect(() => validateConfirmedTeams(["t1", 2, "t3", "t4"], computed, nextRound)).toThrow(expect.objectContaining({ code: "INVALID_RESULTS" }));
        expect(() => validateConfirmedTeams(["t1", "", "t3", "t4"], computed, nextRound)).toThrow(expect.objectContaining({ code: "INVALID_RESULTS" }));
    });

    it("rejects the wrong number of teams", () => {
        expect(() => validateConfirmedTeams(["t1", "t2"], computed, nextRound)).toThrow(expect.objectContaining({ code: "WRONG_QUALIFIER_COUNT" }));
    });

    // Changed with part 2: the count comes from the next round's groups, not
    // from a qualifyingTeams key that has never been written.
    it("derives the qualifier count from the next round's groups", () => {
        const limited = twoTeamRound();

        expect(validateConfirmedTeams(["t1", "t4"], computed, limited)).toEqual(["t1", "t4"]);
        expect(() => validateConfirmedTeams(TEAM_IDS, computed, limited)).toThrow(expect.objectContaining({ code: "WRONG_QUALIFIER_COUNT" }));
    });

    it("rejects a duplicated team", () => {
        expect(() => validateConfirmedTeams(["t1", "t1", "t2", "t3"], computed, nextRound)).toThrow(expect.objectContaining({ code: "DUPLICATE_TEAM" }));
    });

    it("rejects a team that did not play the round", () => {
        expect(() => validateConfirmedTeams(["t1", "t2", "t3", "stranger"], computed, nextRound))
            .toThrow(expect.objectContaining({ code: "TEAM_NOT_IN_ROUND" }));
    });
});

// --- getProposal ----------------------------------------------------------

describe("progressionService.getProposal", () => {
    it("returns the default ranking, the qualifiers and the eligible teams", async () => {
        loadable();

        const proposal = await progressionService.getProposal("div-1", "user-1");

        expect(proposal).toMatchObject({
            divisionId: "div-1",
            divisionName: "Division A",
            roundIndex: 0,
            roundName: "Pool Play",
            roundType: "roundRobin",
            isFinalRound: false,
            nextRoundName: "Finals",
            qualifyingTeams: 4
        });
        expect(proposal.computedResults.map((row) => [row.id, row.name])).toEqual([
            ["t1", "Aces"], ["t4", "Ducks"], ["t2", "Bears"], ["t3", "Cubs"]
        ]);
        expect(proposal.qualifiers).toEqual(proposal.computedResults);
        expect(proposal.eligibleTeams).toEqual(proposal.computedResults);
    });

    // Regression guard for the temporal dead zone introduced with part 2:
    // nextRound was read on the computed line and declared below it, so every
    // call threw ReferenceError. This case fails outright before that fix, and
    // it is the derived count — not computedResults.length — that it asserts.
    it("slices the qualifiers to the count derived from the next round's groups", async () => {
        loadable({ rounds: [poolRound(), twoTeamRound()] });

        const proposal = await progressionService.getProposal("div-1", "user-1");

        expect(proposal.qualifyingTeams).toBe(2);
        expect(proposal.computedResults).toHaveLength(4);
        expect(proposal.qualifiers.map((row) => row.id)).toEqual(["t1", "t4"]);
    });

    // Progressing a knockout round reads the previous round's results, because a
    // knockout group holds an index into them rather than a team id — the only way
    // to name the team sitting on a bye.
    it("carries a bye team through when progressing a knockout round", async () => {
        loadable({
            rounds: [
                poolRound({ results: ["t1", "t4", "t2", "t3"] }),
                makeRound({ name: "Semifinals", type: "knockout", groups: [[0], [1, 2]], fixtures: ["f-sf"] }),
                twoTeamRound()
            ],
            currentRound: 1,
            fixtures: [
                ...completedPoolFixtures(),
                makeFixture({
                    id: "f-sf", match_no: 3, round: "Semifinals", status: "COMPLETED",
                    team_1: "t4", team_2: "t2", team_1_result: [21], team_2_result: [15]
                })
            ]
        });

        const proposal = await progressionService.getProposal("div-1", "user-1");

        expect(proposal.computedResults.map((row) => row.id)).toEqual(["t1", "t4", "t2"]);
        expect(proposal.qualifiers.map((row) => row.id)).toEqual(["t1", "t4"]);
    });

    it("flags the final round", async () => {
        loadable({ rounds: [poolRound()] });

        const proposal = await progressionService.getProposal("div-1", "user-1");

        expect(proposal).toMatchObject({ isFinalRound: true, nextRoundName: null, qualifyingTeams: 4 });
    });

    it("names a team Unknown when it is not in the teams table", async () => {
        loadable();
        divisionsRepository.getTeamsByIds.mockResolvedValue([{ id: "t1", name: "Aces" }]);

        const proposal = await progressionService.getProposal("div-1", "user-1");

        expect(proposal.computedResults.map((row) => row.name)).toEqual(["Aces", "Unknown", "Unknown", "Unknown"]);
    });

    it("rejects a division that does not exist", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(null);

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow(expect.objectContaining({ code: "DIVISION_NOT_FOUND" }));
    });

    it("rejects a caller who does not own the tournament", async () => {
        loadable({ createdBy: "someone-else" });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow(expect.objectContaining({ code: "NOT_TOURNAMENT_OWNER" }));
    });

    it("rejects a state whose current round does not exist", async () => {
        loadable({ rounds: [], currentRound: 0 });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow(expect.objectContaining({ code: "ROUND_NOT_FOUND" }));
    });

    it("falls back to round zero when currentRound is not an integer", async () => {
        loadable({ currentRound: "later" });

        expect((await progressionService.getProposal("div-1", "user-1")).roundIndex).toBe(0);
    });

    it("rejects a round that still has unplayed fixtures", async () => {
        const fixtures = completedPoolFixtures();
        fixtures[1].status = "UPCOMING";
        loadable({ fixtures });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow(expect.objectContaining({ code: "ROUND_NOT_COMPLETE" }));
    });

    it("looks up no teams when the state has none", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue({
            id: "div-1",
            name: "Division A",
            created_by: "user-1",
            state: { rounds: [poolRound({ groups: [] })], currentRound: 0 }
        });
        divisionsRepository.getFixturesByDivisionId.mockResolvedValue(completedPoolFixtures());
        divisionsRepository.getTeamsByIds.mockResolvedValue([]);

        await progressionService.getProposal("div-1", "user-1");

        expect(divisionsRepository.getTeamsByIds).toHaveBeenCalledWith([]);
    });

    it("treats a state with no rounds array as having no rounds", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue({
            id: "div-1", name: "Division A", created_by: "user-1", state: { currentRound: 0 }
        });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow(expect.objectContaining({ code: "ROUND_NOT_FOUND" }));
    });
});

// --- commit ---------------------------------------------------------------

describe("progressionService.commit", () => {
    it("writes the confirmed ranking and binds the next round's fixtures", async () => {
        loadable();

        const result = await progressionService.commit("div-1", "user-1", ["t1", "t4", "t2", "t3"]);

        expect(result).toEqual({
            divisionId: "div-1",
            roundIndex: 0,
            nextRoundIndex: 1,
            results: ["t1", "t4", "t2", "t3"],
            fixturesBound: 2,
            amended: false
        });

        const [divisionId, userId, updatedRounds, updatedFixtures, nextRound] =
            divisionsRepository.updateRounds.mock.calls[0];
        expect({ divisionId, userId, updatedFixtures, nextRound })
            .toEqual({ divisionId: "div-1", userId: "user-1", updatedFixtures: null, nextRound: 1 });
        expect(updatedRounds[0]).toMatchObject({
            results: ["t1", "t4", "t2", "t3"],
            computedResults: ["t1", "t4", "t2", "t3"],
            resultsAmended: false
        });
        expect(updatedRounds[1]).toEqual(finalsRound());

        expect(fixturesRepository.updateFixtures).toHaveBeenCalledWith("div-1", [
            { id: "f-bronze", team_1: "t2", team_2: "t3" },
            { id: "f-final", team_1: "t1", team_2: "t4" }
        ]);
    });

    // Was bug 8. The two writes are separate transactions, so their order is the
    // only thing protecting the division from a failure between them. Binding
    // first means a crash leaves the old round with correct fixtures, which a
    // retry just repeats; advancing first would leave the division on a round
    // whose fixtures still hold placeholders.
    it("binds the next round's fixtures before advancing the round", async () => {
        loadable();

        const order = [];
        fixturesRepository.updateFixtures.mockImplementation(async () => {
            order.push("updateFixtures");
        });
        divisionsRepository.updateRounds.mockImplementation(async () => {
            order.push("updateRounds");
        });

        await progressionService.commit("div-1", "user-1", ["t1", "t4", "t2", "t3"]);

        expect(order).toEqual(["updateFixtures", "updateRounds"]);
    });

    it("leaves the round unadvanced when binding the fixtures fails", async () => {
        loadable();
        fixturesRepository.updateFixtures.mockRejectedValue(new Error("bind failed"));

        await expect(progressionService.commit("div-1", "user-1", ["t1", "t4", "t2", "t3"]))
            .rejects.toThrow("bind failed");

        expect(divisionsRepository.updateRounds).not.toHaveBeenCalled();
    });

    it("records that the organiser amended the ranking", async () => {
        loadable();

        const result = await progressionService.commit("div-1", "user-1", ["t4", "t1", "t2", "t3"]);

        expect(result.amended).toBe(true);
        expect(divisionsRepository.updateRounds.mock.calls[0][2][0]).toMatchObject({
            results: ["t4", "t1", "t2", "t3"],
            computedResults: ["t1", "t4", "t2", "t3"],
            resultsAmended: true
        });
    });

    it("writes a bye team into a knockout round's results", async () => {
        loadable({
            rounds: [
                poolRound({ results: ["t1", "t4", "t2", "t3"] }),
                makeRound({ name: "Semifinals", type: "knockout", groups: [[0], [1, 2]], fixtures: ["f-sf"] }),
                twoTeamRound()
            ],
            currentRound: 1,
            fixtures: [
                ...completedPoolFixtures(),
                makeFixture({
                    id: "f-sf", match_no: 3, round: "Semifinals", status: "COMPLETED",
                    team_1: "t4", team_2: "t2", team_1_result: [21], team_2_result: [15]
                })
            ]
        });

        const result = await progressionService.commit("div-1", "user-1", ["t1", "t4"]);

        expect(result.results).toEqual(["t1", "t4"]);
        expect(divisionsRepository.updateRounds.mock.calls[0][2][1].computedResults)
            .toEqual(["t1", "t4", "t2"]);
    });

    it("does not touch the fixtures table when there is nothing to bind", async () => {
        loadable({ rounds: [poolRound(), finalsRound({ groups: [], fixtures: [] })] });

        const result = await progressionService.commit("div-1", "user-1", TEAM_IDS);

        expect(result.fixturesBound).toBe(0);
        expect(fixturesRepository.updateFixtures).not.toHaveBeenCalled();
    });

    it("refuses to progress past the final round", async () => {
        loadable({ rounds: [poolRound()] });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).rejects.toThrow(expect.objectContaining({ code: "NO_NEXT_ROUND" }));
    });

    it("refuses to progress a round that is still being played", async () => {
        const fixtures = completedPoolFixtures();
        fixtures[0].status = "LIVE";
        loadable({ fixtures });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).rejects.toThrow(expect.objectContaining({ code: "ROUND_NOT_COMPLETE" }));
    });

    it("allows a correction while the next round is untouched", async () => {
        loadable({
            rounds: [poolRound({ results: ["t1", "t4", "t2", "t3"] }), finalsRound()],
            fixtures: [...completedPoolFixtures(), makeFixture({ round: "Finals", status: "UPCOMING" })]
        });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).resolves.toBeDefined();
    });

    it("refuses a correction once the next round has been played", async () => {
        loadable({
            rounds: [poolRound({ results: ["t1", "t4", "t2", "t3"] }), finalsRound()],
            fixtures: [...completedPoolFixtures(), makeFixture({ round: "Finals", status: "COMPLETED" })]
        });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS))
            .rejects.toThrow(expect.objectContaining({ code: "NEXT_ROUND_ALREADY_STARTED" }));
    });

    it("rejects an invalid confirmed list before writing anything", async () => {
        loadable();

        await expect(progressionService.commit("div-1", "user-1", ["t1"])).rejects.toThrow(expect.objectContaining({ code: "WRONG_QUALIFIER_COUNT" }));
        expect(divisionsRepository.updateRounds).not.toHaveBeenCalled();
    });

    it("rejects a division the caller does not own", async () => {
        loadable({ createdBy: "someone-else" });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).rejects.toThrow(expect.objectContaining({ code: "NOT_TOURNAMENT_OWNER" }));
    });
});

describe("hasPlayedFixtures: the re-progression guard", () => {
    // Regression guard for a fixed defect. hasPlayedFixtures tests for "LIVE",
    // while tournamentViewFormatter.js used to emit "ONGOING" for the same
    // state, so a round already under way went undetected and a correction
    // could silently discard it. The two vocabularies were merged into the
    // fixture_status enum on 2026-08-08 — see docs/decisions.md.
    it("treats a LIVE fixture as the next round having started", () => {
        const round = makeRound({ name: "Finals" });
        const fixtures = [makeFixture({ round: "Finals", status: "LIVE" })];

        expect(hasPlayedFixtures(round, fixtures)).toBe(true);
    });
});