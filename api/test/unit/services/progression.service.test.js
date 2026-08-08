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
const { makeFixture, makeRound, makeState } = await import("../../helpers/fixtures.js");

const TEAM_IDS = ["t1", "t2", "t3", "t4"];

function poolRound(overrides = {}) {
    return makeRound({
        name: "Pool Play",
        type: "roundRobin",
        groups: [["t1", "t2"], ["t3", "t4"]],
        ...overrides
    });
}

function finalsRound(overrides = {}) {
    return makeRound({
        name: "Finals",
        type: "knockout",
        groups: [[0, 1]],
        fixtures: ["f-final"],
        ...overrides
    });
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
        fixtures[1].status = "WAITING";

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
        expect(hasPlayedFixtures(round, [makeFixture({ round: "Finals", status: "WAITING" })])).toBe(false);
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

    function knockoutFixture(overrides = {}) {
        return {
            ...makeFixture({ round: "Finals", status: "COMPLETED", team_1: "t1", team_2: "t2", ...overrides }),
            result: overrides.result ?? [[21, 15]]
        };
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
            knockoutFixture({ status: "WAITING" })
        ];

        expect(buildKnockoutOutcomes(round, fixtures)).toEqual([]);
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

    it("puts knockout winners before knockout losers", () => {
        const round = makeRound({ name: "Semifinals", type: "knockout" });
        const fixtures = normalised([
            makeFixture({ round: "Semifinals", status: "COMPLETED", team_1: "t1", team_2: "t4", team_1_result: [15], team_2_result: [21] }),
            makeFixture({ round: "Semifinals", status: "COMPLETED", team_1: "t2", team_2: "t3", team_1_result: [21], team_2_result: [15] })
        ]);

        expect(computeRoundResults(round, state, fixtures)).toEqual([
            { id: "t2" }, { id: "t4" }, { id: "t1" }, { id: "t3" }
        ]);
    });

    it("returns nothing when the round has no groups", () => {
        expect(computeRoundResults(makeRound({ groups: null }), state, [])).toEqual([]);
    });

    it("ignores non-string entries in a group, and groups that are not arrays", () => {
        const round = poolRound({ groups: [["t1", 7, null], "nope"] });

        expect(computeRoundResults(round, state, []).map((row) => row.id)).toEqual(["t1"]);
    });

    it("ignores fixtures from another round, uncountable fixtures and outsiders", () => {
        const round = poolRound({ groups: [["t1", "t2"]] });
        const fixtures = normalised([
            makeFixture({ round: "Finals", status: "COMPLETED", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "WAITING", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] }),
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
        expect(() => validateConfirmedTeams(null, computed, nextRound)).toThrow("INVALID_RESULTS");
        expect(() => validateConfirmedTeams([], computed, nextRound)).toThrow("INVALID_RESULTS");
    });

    it("rejects entries that are not non-empty strings", () => {
        expect(() => validateConfirmedTeams(["t1", 2, "t3", "t4"], computed, nextRound)).toThrow("INVALID_RESULTS");
        expect(() => validateConfirmedTeams(["t1", "", "t3", "t4"], computed, nextRound)).toThrow("INVALID_RESULTS");
    });

    it("rejects the wrong number of teams", () => {
        expect(() => validateConfirmedTeams(["t1", "t2"], computed, nextRound)).toThrow("WRONG_QUALIFIER_COUNT");
    });

    it("honours an explicit qualifier count on the next round", () => {
        const limited = finalsRound({ qualifyingTeams: 2 });

        expect(validateConfirmedTeams(["t1", "t4"], computed, limited)).toEqual(["t1", "t4"]);
        expect(() => validateConfirmedTeams(TEAM_IDS, computed, limited)).toThrow("WRONG_QUALIFIER_COUNT");
    });

    it("rejects a duplicated team", () => {
        expect(() => validateConfirmedTeams(["t1", "t1", "t2", "t3"], computed, nextRound)).toThrow("DUPLICATE_TEAM");
    });

    it("rejects a team that did not play the round", () => {
        expect(() => validateConfirmedTeams(["t1", "t2", "t3", "stranger"], computed, nextRound))
            .toThrow("TEAM_NOT_IN_ROUND");
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

    it("slices the qualifiers when the next round says how many advance", async () => {
        loadable({ rounds: [poolRound(), finalsRound({ qualifyingTeams: 2 })] });

        const proposal = await progressionService.getProposal("div-1", "user-1");

        expect(proposal.qualifyingTeams).toBe(2);
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

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow("DIVISION_NOT_FOUND");
    });

    it("rejects a caller who does not own the tournament", async () => {
        loadable({ createdBy: "someone-else" });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow("NOT_TOURNAMENT_OWNER");
    });

    it("rejects a state whose current round does not exist", async () => {
        loadable({ rounds: [], currentRound: 0 });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow("ROUND_NOT_FOUND");
    });

    it("falls back to round zero when currentRound is not an integer", async () => {
        loadable({ currentRound: "later" });

        expect((await progressionService.getProposal("div-1", "user-1")).roundIndex).toBe(0);
    });

    it("rejects a round that still has unplayed fixtures", async () => {
        const fixtures = completedPoolFixtures();
        fixtures[1].status = "WAITING";
        loadable({ fixtures });

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow("ROUND_NOT_COMPLETE");
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

        await expect(progressionService.getProposal("div-1", "user-1")).rejects.toThrow("ROUND_NOT_FOUND");
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
            fixturesBound: 1,
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
            { id: "f-final", team_1: "t1", team_2: "t4" }
        ]);
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

    it("does not touch the fixtures table when there is nothing to bind", async () => {
        loadable({ rounds: [poolRound(), finalsRound({ groups: [], fixtures: [] })] });

        const result = await progressionService.commit("div-1", "user-1", TEAM_IDS);

        expect(result.fixturesBound).toBe(0);
        expect(fixturesRepository.updateFixtures).not.toHaveBeenCalled();
    });

    it("refuses to progress past the final round", async () => {
        loadable({ rounds: [poolRound()] });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).rejects.toThrow("NO_NEXT_ROUND");
    });

    it("refuses to progress a round that is still being played", async () => {
        const fixtures = completedPoolFixtures();
        fixtures[0].status = "ONGOING";
        loadable({ fixtures });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).rejects.toThrow("ROUND_NOT_COMPLETE");
    });

    it("allows a correction while the next round is untouched", async () => {
        loadable({
            rounds: [poolRound({ results: ["t1", "t4", "t2", "t3"] }), finalsRound()],
            fixtures: [...completedPoolFixtures(), makeFixture({ round: "Finals", status: "WAITING" })]
        });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).resolves.toBeDefined();
    });

    it("refuses a correction once the next round has been played", async () => {
        loadable({
            rounds: [poolRound({ results: ["t1", "t4", "t2", "t3"] }), finalsRound()],
            fixtures: [...completedPoolFixtures(), makeFixture({ round: "Finals", status: "COMPLETED" })]
        });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS))
            .rejects.toThrow("NEXT_ROUND_ALREADY_STARTED");
    });

    it("rejects an invalid confirmed list before writing anything", async () => {
        loadable();

        await expect(progressionService.commit("div-1", "user-1", ["t1"])).rejects.toThrow("WRONG_QUALIFIER_COUNT");
        expect(divisionsRepository.updateRounds).not.toHaveBeenCalled();
    });

    it("rejects a division the caller does not own", async () => {
        loadable({ createdBy: "someone-else" });

        await expect(progressionService.commit("div-1", "user-1", TEAM_IDS)).rejects.toThrow("NOT_TOURNAMENT_OWNER");
    });
});
