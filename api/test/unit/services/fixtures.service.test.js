import { describe, it, expect, beforeEach, vi } from "vitest";

const uuidState = vi.hoisted(() => ({ next: 0 }));

vi.mock("uuid", () => ({ v4: () => `uuid-${++uuidState.next}` }));

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: {
        createFixture: vi.fn(),
        getFixtureWithOwner: vi.fn(),
        updateResult: vi.fn(),
        countCompletedInRounds: vi.fn()
    }
}));

vi.mock("../../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        getStateForUpdate: vi.fn(),
        updateStateRounds: vi.fn(),
        touchDivision: vi.fn()
    }
}));

const {
    fixtureService,
    generateFixtures,
    generateRoundRobinFixtures,
    generateKnockoutFixtures,
    rotateGroupTeams,
    getFixturesForRound,
    validateSets,
    deriveStatus,
    roundHolding,
    fixtureRoundsOf
} = await import("../../../src/services/fixtures.service.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { dbMock, resetDbMock, clientSql } = await import("../../helpers/dbMock.js");
const { makeRound, makeFixture, makeState } = await import("../../helpers/fixtures.js");

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
    fixturesRepository.createFixture.mockReset();
    fixturesRepository.getFixtureWithOwner.mockReset();
    fixturesRepository.updateResult.mockReset();
    fixturesRepository.countCompletedInRounds.mockReset().mockResolvedValue(0);
    divisionsRepository.getStateForUpdate.mockReset().mockResolvedValue(makeState());
    divisionsRepository.updateStateRounds.mockReset();
    divisionsRepository.touchDivision.mockReset();
});

describe("rotateGroupTeams", () => {
    it("leaves the group untouched for the first round", () => {
        expect(rotateGroupTeams(["a", "b", "c", "d"], 1)).toEqual(["a", "b", "c", "d"]);
    });

    it("holds the first team fixed and rotates the rest", () => {
        // The circle method: one team stays put, everyone else moves round.
        expect(rotateGroupTeams(["a", "b", "c", "d"], 2)).toEqual(["a", "d", "b", "c"]);
        expect(rotateGroupTeams(["a", "b", "c", "d"], 3)).toEqual(["a", "c", "d", "b"]);
    });
});

describe("getFixturesForRound", () => {
    it("pairs the ends inwards", () => {
        expect(getFixturesForRound(["a", "b", "c", "d"], 1)).toEqual([["a", "d"], ["b", "c"]]);
    });

    it("adds a BYE to an odd group so one team sits out", () => {
        expect(getFixturesForRound(["a", "b", "c"], 1)).toEqual([["a", "BYE"], ["b", "c"]]);
    });

    it("gives an empty group a single BYE and therefore no pairings", () => {
        expect(getFixturesForRound([], 1)).toEqual([]);
    });

    it("produces only a BYE pairing for a group of one", () => {
        expect(getFixturesForRound(["a"], 1)).toEqual([["a", "BYE"]]);
    });
});

describe("generateRoundRobinFixtures", () => {
    it("produces every pairing exactly once for an even group", () => {
        const round = makeRound({ name: "Pool Play", groups: [["a", "b", "c", "d"]] });

        const { fixtures, matchNo } = generateRoundRobinFixtures(1, round);

        expect(fixtures).toHaveLength(6);
        expect(matchNo).toBe(7);
        expect(fixtures.map((fixture) => [fixture.team1, fixture.team2])).toEqual([
            ["a", "d"], ["b", "c"],
            ["a", "c"], ["d", "b"],
            ["a", "b"], ["c", "d"]
        ]);
        expect(fixtures.every((fixture) => fixture.round === "Pool Play")).toBe(true);
        expect(fixtures.every((fixture) => fixture.placeholder1 === false && fixture.placeholder2 === false)).toBe(true);
    });

    it("skips the BYE pairings of an odd group", () => {
        const round = makeRound({ groups: [["a", "b", "c"]] });

        const { fixtures } = generateRoundRobinFixtures(1, round);

        expect(fixtures).toHaveLength(3);
        expect(fixtures.some((fixture) => fixture.team1 === "BYE" || fixture.team2 === "BYE")).toBe(false);
    });

    it("interleaves match numbers across pools, round by round", () => {
        const round = makeRound({ groups: [["a", "b"], ["c", "d"]] });

        const { fixtures } = generateRoundRobinFixtures(1, round);

        expect(fixtures.map((fixture) => [fixture.matchNo, fixture.team1, fixture.team2])).toEqual([
            [1, "a", "b"],
            [2, "c", "d"]
        ]);
    });

    it("produces nothing when there are no groups", () => {
        const round = makeRound({ groups: [] });

        expect(generateRoundRobinFixtures(1, round)).toEqual({ fixtures: [], matchNo: 1 });
    });
});

describe("generateKnockoutFixtures", () => {
    it("creates one fixture per pairing, flagging positional entries as placeholders", () => {
        const round = makeRound({ name: "Semifinals", type: "knockout", groups: [[0, 3], [1, 2]] });

        const { fixtures, matchNo } = generateKnockoutFixtures(5, round);

        expect(matchNo).toBe(7);
        expect(fixtures).toEqual([
            { id: "uuid-1", matchNo: 5, team1: 0, team2: 3, round: "Semifinals", placeholder1: true, placeholder2: true },
            { id: "uuid-2", matchNo: 6, team1: 1, team2: 2, round: "Semifinals", placeholder1: true, placeholder2: true }
        ]);
    });

    it("names the first group of the Finals round as the third-place playoff", () => {
        const round = makeRound({ name: "Finals", type: "knockout", groups: [[2, 3], [0, 1]] });

        const { fixtures } = generateKnockoutFixtures(1, round);

        expect(fixtures.map((fixture) => fixture.round)).toEqual(["3rd Place Playoff", "Finals"]);
    });

    it("skips single-team groups, which are byes into the next round", () => {
        const round = makeRound({ name: "Round of 6", type: "knockout", groups: [[0], [1], [2, 5], [3, 4]] });

        const { fixtures } = generateKnockoutFixtures(1, round);

        expect(fixtures).toHaveLength(2);
        expect(fixtures.map((fixture) => fixture.matchNo)).toEqual([1, 2]);
    });

    it("does not flag real team ids as placeholders", () => {
        const round = makeRound({ name: "Finals", type: "knockout", groups: [["team-a", "team-b"]] });

        const { fixtures } = generateKnockoutFixtures(1, round);

        expect(fixtures[0]).toMatchObject({ placeholder1: false, placeholder2: false });
    });
});

describe("generateFixtures", () => {
    it("numbers matches continuously across rounds and returns a flat fixture list", () => {
        const rounds = [
            makeRound({ name: "Pool Play", groups: [["a", "b"]] }),
            makeRound({ name: "Finals", type: "knockout", groups: [[0, 1]] })
        ];

        const result = generateFixtures(rounds);

        expect(result.fixtures.map((fixture) => fixture.matchNo)).toEqual([1, 2]);
        expect(result.rounds).toBe(rounds);
    });

    // Was bug 9. No generator matched, so `result` stayed undefined and the next
    // line read matchNo off it — a TypeError the controllers could only turn
    // into a 500, rather than a named 400.
    it("names the failure when no generator handles the round type", () => {
        expect(() => generateFixtures([makeRound({ type: "swiss" })]))
            .toThrow(expect.objectContaining({ code: "UNSUPPORTED_ROUND_TYPE", status: 400 }));
    });

    it("reports which round type it could not handle", () => {
        try {
            generateFixtures([makeRound({ type: "swiss" })]);
            expect.unreachable("generateFixtures should have thrown");
        } catch (error) {
            expect(error.details).toEqual({ type: "swiss" });
        }
    });

    it("writes the fixture ids and game count back onto each round", () => {
        const rounds = [makeRound({ name: "Pool Play", groups: [["a", "b", "c", "d"]] })];

        generateFixtures(rounds);

        expect(rounds[0].fixtures).toHaveLength(6);
        expect(rounds[0].totalGames).toBe(6);
    });

    it("mutates the rounds it is given, so calling it twice double-counts", () => {
        const rounds = [makeRound({ name: "Pool Play", groups: [["a", "b"]] })];

        generateFixtures(rounds);
        generateFixtures(rounds);

        expect(rounds[0].totalGames).toBe(2);
        expect(rounds[0].fixtures).toHaveLength(2);
    });

    it("throws on a round whose type it does not recognise", () => {
        // Currently a bare TypeError from reading .matchNo of undefined.
        // test/known-bugs asserts the named error this should raise instead.
        expect(() => generateFixtures([makeRound({ type: "swiss" })])).toThrow();
    });
});

describe("fixtureService.createFixture", () => {
    it("stores real team ids when both teams are known", async () => {
        await fixtureService.createFixture("div-1", {
            id: "f1",
            matchNo: 3,
            team1: "team-a",
            team2: "team-b",
            round: "Pool Play",
            placeholder1: false,
            placeholder2: false
        });

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f1", "div-1", 3, "team-a", "team-b", undefined, null, "Pool Play", dbMock.instance
        );
    });

    it("converts positional entries into Rank labels and leaves the team columns unset", async () => {
        await fixtureService.createFixture("div-1", {
            id: "f2",
            matchNo: 9,
            team1: 0,
            team2: 3,
            round: "Semifinals",
            placeholder1: true,
            placeholder2: true
        });

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f2", "div-1", 9, undefined, undefined, "Rank 1", "Rank 4", "Semifinals", dbMock.instance
        );
    });

    it("handles one placeholder and one real team", async () => {
        await fixtureService.createFixture("div-1", {
            id: "f3",
            matchNo: 4,
            team1: "team-a",
            team2: 1,
            round: "Semifinals",
            placeholder1: false,
            placeholder2: true
        });

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f3", "div-1", 4, "team-a", undefined, undefined, "Rank 2", "Semifinals", dbMock.instance
        );
    });

    it("forwards the transaction client, so the insert joins the caller's transaction", async () => {
        // The client used to be accepted and dropped, so fixture inserts ran on
        // the pool while the rest of creation was inside a transaction.
        const client = { query: vi.fn() };

        await fixtureService.createFixture("div-1", { id: "f4", matchNo: 1, team1: "a", team2: "b", round: "R" }, client);

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f4", "div-1", 1, "a", "b", undefined, null, "R", client
        );
    });

    it("lets a repository failure propagate untouched", async () => {
        // It used to be rethrown as new Error(error), which stringified it and
        // discarded the cause the middleware needs for its log.
        const failure = new Error("Failed to create fixture", { cause: new Error("duplicate key") });
        fixturesRepository.createFixture.mockRejectedValueOnce(failure);

        await expect(
            fixtureService.createFixture("div-1", { id: "f5", matchNo: 1, team1: "a", team2: "b", round: "R" })
        ).rejects.toBe(failure);
    });
});

// --- recording a result ----------------------------------------------------

describe("validateSets", () => {
    it("treats an absent list as no sets at all, which clears the result", () => {
        expect(validateSets(undefined)).toEqual([]);
        expect(validateSets(null)).toEqual([]);
        expect(validateSets([])).toEqual([]);
    });

    it("accepts pairs of non-negative integers, including a shutout", () => {
        expect(validateSets([[21, 15], [0, 21]])).toEqual([[21, 15], [0, 21]]);
    });

    it.each([
        ["a list that is not a list", "21-15"],
        ["a set that is not a pair", [[21]]],
        ["a set with three scores", [[21, 15, 9]]],
        ["a negative score", [[21, -1]]],
        ["a fractional score", [[21.5, 15]]],
        ["a numeric string", [["21", 15]]],
        ["a null score", [[21, null]]],
        ["a set that is not an array", [{ team1: 21, team2: 15 }]]
    ])("rejects %s", (_label, sets) => {
        expect(() => validateSets(sets)).toThrowError(
            expect.objectContaining({ code: "INVALID_SCORE", status: 400 })
        );
    });
});

describe("deriveStatus", () => {
    // The client sends scores and an intent, never a status.
    it("is UPCOMING with no sets, whatever the intent", () => {
        expect(deriveStatus([], false)).toBe("UPCOMING");
        expect(deriveStatus([], true)).toBe("UPCOMING");
    });

    it("is LIVE once a set is recorded and the match is not ended", () => {
        expect(deriveStatus([[21, 15]], false)).toBe("LIVE");
    });

    it("is COMPLETED when the organiser ends it", () => {
        expect(deriveStatus([[21, 15], [21, 18]], true)).toBe("COMPLETED");
    });

    it("is CANCELLED for a single 0-0 set, the convention the modal has always described", () => {
        expect(deriveStatus([[0, 0]], true)).toBe("CANCELLED");
    });

    it("is COMPLETED for 0-0 that is not the only set, and LIVE for an unfinished 0-0", () => {
        expect(deriveStatus([[0, 0], [21, 15]], true)).toBe("COMPLETED");
        expect(deriveStatus([[0, 0]], false)).toBe("LIVE");
    });
});

describe("the third-place playoff exception", () => {
    // Its fixtures carry their own round name while living inside Finals.
    it("maps a third-place fixture onto the Finals round", () => {
        expect(roundHolding("3rd Place Playoff")).toBe("Finals");
        expect(roundHolding("Pool Play")).toBe("Pool Play");
    });

    it("counts both names towards Finals, and only its own name elsewhere", () => {
        expect(fixtureRoundsOf("Finals")).toEqual(["Finals", "3rd Place Playoff"]);
        expect(fixtureRoundsOf("Semifinals")).toEqual(["Semifinals"]);
    });
});

describe("fixtureService.updateResult", () => {
    function owned(overrides = {}) {
        return makeFixture({
            id: "f1",
            division_id: "div-1",
            round: "Pool Play",
            team_1: "t1",
            team_2: "t2",
            created_by: "user-1",
            tournament_id: "tour-1",
            ...overrides
        });
    }

    beforeEach(() => {
        fixturesRepository.getFixtureWithOwner.mockResolvedValue(owned());
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            makeState({ rounds: [makeRound({ name: "Pool Play", totalGames: 4 })] })
        );
    });

    it("names the not-found condition rather than returning null", async () => {
        fixturesRepository.getFixtureWithOwner.mockResolvedValue(null);

        await expect(fixtureService.updateResult("f1", "user-1", [[21, 15]], true))
            .rejects.toMatchObject({ code: "FIXTURE_NOT_FOUND", status: 404 });
        expect(fixturesRepository.updateResult).not.toHaveBeenCalled();
    });

    it("refuses a signed-in user who does not own the tournament", async () => {
        await expect(fixtureService.updateResult("f1", "user-2", [[21, 15]], true))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(fixturesRepository.updateResult).not.toHaveBeenCalled();
    });

    it.each([
        ["team one", { team_1: null }],
        ["team two", { team_2: null }]
    ])("refuses a fixture whose %s is still a placeholder", async (_label, overrides) => {
        fixturesRepository.getFixtureWithOwner.mockResolvedValue(owned(overrides));

        await expect(fixtureService.updateResult("f1", "user-1", [[21, 15]], true))
            .rejects.toMatchObject({ code: "FIXTURE_NOT_READY", status: 400 });
        expect(fixturesRepository.updateResult).not.toHaveBeenCalled();
    });

    it("rejects a malformed score before opening a transaction", async () => {
        await expect(fixtureService.updateResult("f1", "user-1", [[21, -1]], true))
            .rejects.toMatchObject({ code: "INVALID_SCORE", status: 400 });

        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
        expect(fixturesRepository.updateResult).not.toHaveBeenCalled();
    });

    it("splits the sets into the two parallel arrays the columns hold", async () => {
        await fixtureService.updateResult("f1", "user-1", [[21, 15], [18, 21]], false);

        expect(fixturesRepository.updateResult).toHaveBeenCalledWith(
            "f1", [[21, 18], [15, 21]], "LIVE", dbMock.client
        );
    });

    it.each([
        ["LIVE", [[21, 15]], false],
        ["COMPLETED", [[21, 15], [21, 18]], true],
        ["CANCELLED", [[0, 0]], true],
        ["UPCOMING", [], true]
    ])("derives %s rather than accepting one", async (status, sets, finished) => {
        const result = await fixtureService.updateResult("f1", "user-1", sets, finished);

        expect(result.status).toBe(status);
        expect(fixturesRepository.updateResult.mock.calls[0][2]).toBe(status);
    });

    it("finishes the match only on a literal true", async () => {
        // Anything else leaves it in progress, which is the recoverable side.
        for (const finished of ["true", 1, {}, undefined]) {
            fixturesRepository.updateResult.mockClear();
            await fixtureService.updateResult("f1", "user-1", [[21, 15]], finished);

            expect(fixturesRepository.updateResult.mock.calls[0][2]).toBe("LIVE");
        }
    });

    it("writes the result and the count in one transaction", async () => {
        fixturesRepository.countCompletedInRounds.mockResolvedValue(3);

        const result = await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
        expect(result).toEqual({ id: "f1", status: "COMPLETED", completedGames: 3 });
    });

    it("recounts from the rows rather than incrementing, so an edit cannot double-count", async () => {
        // The stored value is overwritten with what the fixtures actually say,
        // even when it was already wrong.
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            makeState({ rounds: [makeRound({ name: "Pool Play", totalGames: 4, completedGames: 99 })] })
        );
        fixturesRepository.countCompletedInRounds.mockResolvedValue(2);

        await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        const [divisionId, rounds] = divisionsRepository.updateStateRounds.mock.calls[0];
        expect(divisionId).toBe("div-1");
        expect(rounds[0].completedGames).toBe(2);
    });

    it("counts the round the fixture is in, and leaves every other round alone", async () => {
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            makeState({
                rounds: [
                    makeRound({ name: "Pool Play", completedGames: 1 }),
                    makeRound({ name: "Semifinals", type: "knockout", completedGames: 7 })
                ]
            })
        );
        fixturesRepository.countCompletedInRounds.mockResolvedValue(4);

        await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(fixturesRepository.countCompletedInRounds)
            .toHaveBeenCalledWith("div-1", ["Pool Play"], dbMock.client);

        const [, rounds] = divisionsRepository.updateStateRounds.mock.calls[0];
        expect(rounds.map((round) => round.completedGames)).toEqual([4, 7]);
    });

    it("counts a third-place result against the Finals round, under both names", async () => {
        fixturesRepository.getFixtureWithOwner.mockResolvedValue(owned({ round: "3rd Place Playoff" }));
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            makeState({
                rounds: [makeRound({ name: "Pool Play" }), makeRound({ name: "Finals", type: "knockout" })]
            })
        );
        fixturesRepository.countCompletedInRounds.mockResolvedValue(2);

        await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(fixturesRepository.countCompletedInRounds)
            .toHaveBeenCalledWith("div-1", ["Finals", "3rd Place Playoff"], dbMock.client);

        const [, rounds] = divisionsRepository.updateStateRounds.mock.calls[0];
        expect(rounds[1].completedGames).toBe(2);
    });

    it("still records the result when the fixture's round is not in state", async () => {
        // A malformed division, not a bad request. The score is not lost over it.
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            makeState({ rounds: [makeRound({ name: "Some Other Round" })] })
        );

        const result = await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(result).toEqual({ id: "f1", status: "COMPLETED", completedGames: null });
        expect(fixturesRepository.updateResult).toHaveBeenCalled();
        expect(divisionsRepository.updateStateRounds).not.toHaveBeenCalled();
    });

    // The state write is what normally moves the division's stamp, and this
    // path skips it — but the result was still written and the view shows it,
    // so the tournament's ETag has to move or readers keep their cached page.
    it("stamps the division even when the state write is skipped", async () => {
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            makeState({ rounds: [makeRound({ name: "Some Other Round" })] })
        );

        await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(divisionsRepository.touchDivision).toHaveBeenCalledWith("div-1", dbMock.client);
    });

    it("does not stamp separately when the state write already did", async () => {
        await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(divisionsRepository.updateStateRounds).toHaveBeenCalled();
        expect(divisionsRepository.touchDivision).not.toHaveBeenCalled();
    });

    it.each([
        ["a division with no state at all", null],
        ["state whose rounds key is not a list", { teams: [], rounds: "nope", currentRound: 0 }],
        ["state that is a string of nonsense", "{ not json"]
    ])("records the result anyway given %s", async (_label, state) => {
        divisionsRepository.getStateForUpdate.mockResolvedValue(state);

        const result = await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(result.completedGames).toBeNull();
        expect(fixturesRepository.updateResult).toHaveBeenCalled();
    });

    it("reads state that arrives as a JSON string", async () => {
        divisionsRepository.getStateForUpdate.mockResolvedValue(
            JSON.stringify({ teams: [], rounds: [{ name: "Pool Play", completedGames: 0 }], currentRound: 0 })
        );
        fixturesRepository.countCompletedInRounds.mockResolvedValue(1);

        const result = await fixtureService.updateResult("f1", "user-1", [[21, 15]], true);

        expect(result.completedGames).toBe(1);
    });

    it("rolls back and propagates when the count fails, leaving neither write applied", async () => {
        const failure = new Error("Failed to count completed fixtures");
        fixturesRepository.countCompletedInRounds.mockRejectedValueOnce(failure);

        await expect(fixtureService.updateResult("f1", "user-1", [[21, 15]], true)).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(divisionsRepository.updateStateRounds).not.toHaveBeenCalled();
    });

    it("rolls back when writing the result itself fails", async () => {
        const failure = new Error("Failed to update fixture");
        fixturesRepository.updateResult.mockRejectedValueOnce(failure);

        await expect(fixtureService.updateResult("f1", "user-1", [[21, 15]], true)).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(divisionsRepository.getStateForUpdate).not.toHaveBeenCalled();
    });
});
