import { describe, it, expect, beforeEach, vi } from "vitest";

const uuidState = vi.hoisted(() => ({ next: 0 }));

vi.mock("uuid", () => ({ v4: () => `uuid-${++uuidState.next}` }));

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        createTeam: vi.fn(),
        createDivision: vi.fn()
    }
}));

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: { createFixture: vi.fn() }
}));

const {
    divisionService,
    generateDivisionDetails,
    createLeagueState,
    createClassicState,
    populateGroups
} = await import("../../../src/services/divisions.service.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { dbMock, resetDbMock, clientSql } = await import("../../helpers/dbMock.js");

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
    divisionsRepository.createTeam.mockReset();
    divisionsRepository.createDivision.mockReset();
    fixturesRepository.createFixture.mockReset();
});

describe("populateGroups", () => {
    it("distributes teams in a serpentine, so each group gets a spread of seeds", () => {
        expect(populateGroups(2, ["a", "b", "c", "d", "e", "f", "g", "h"]))
            .toEqual([["a", "d", "e", "h"], ["b", "c", "f", "g"]]);
    });

    it("puts one team in each group when there are as many groups as teams", () => {
        expect(populateGroups(4, ["a", "b", "c", "d"])).toEqual([["a"], ["b"], ["c"], ["d"]]);
    });

    it("leaves trailing groups short when the teams do not divide evenly", () => {
        expect(populateGroups(2, ["a", "b", "c", "d", "e"])).toEqual([["a", "d", "e"], ["b", "c"]]);
    });

    it("accepts a numeric string for the group count", () => {
        expect(populateGroups("2", ["a", "b"])).toEqual([["a"], ["b"]]);
    });

    it("returns nothing when asked for no groups", () => {
        expect(populateGroups(0, ["a", "b"])).toEqual([]);
    });
});

describe("createLeagueState", () => {
    it("builds a single round-robin round sized n(n-1)/2", () => {
        const state = createLeagueState(["a", "b", "c", "d"], 4);

        expect(state.teams).toEqual(["a", "b", "c", "d"]);
        expect(state.currentRound).toBe(0);
        expect(state.rounds).toHaveLength(1);
        expect(state.rounds[0]).toMatchObject({
            name: "Round robin",
            type: "roundRobin",
            results: [],
            totalGames: 6,
            completedGames: 0,
            fixtures: []
        });
    });

    it("wraps the team list in an extra array level", () => {
        // groups should be [teams] — one pool holding the team ids. It is
        // currently [[teams]], which downstream code filters away to nothing.
        // test/known-bugs asserts the intended shape.
        expect(createLeagueState(["a", "b"], 2).rounds[0].groups).toEqual([[["a", "b"]]]);
    });
});

describe("createClassicState", () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];

    it("always opens with a round-robin pool stage", () => {
        const state = createClassicState(eight, 8, 2, 0);

        expect(state.rounds).toHaveLength(1);
        expect(state.rounds[0]).toMatchObject({
            name: "Pool Play",
            type: "roundRobin",
            results: [],
            totalGames: 0,
            completedGames: 0,
            fixtures: []
        });
        expect(state.rounds[0].groups).toEqual([["a", "d", "e", "h"], ["b", "c", "f", "g"]]);
    });

    it("reproduces the worked example in docs/division-state.md", () => {
        const state = createClassicState(eight, 8, 2, 4);

        expect(state.rounds.map((round) => round.name)).toEqual(["Pool Play", "Semifinals", "Finals"]);
        expect(state.rounds[1]).toMatchObject({ type: "knockout", groups: [[0, 3], [1, 2]] });
        // Index 0 of the Finals round is the bronze match.
        expect(state.rounds[2]).toMatchObject({ type: "knockout", groups: [[2, 3], [0, 1]] });
    });

    it("names larger rounds by size and smaller ones conventionally", () => {
        const state = createClassicState(eight, 8, 2, 16);

        expect(state.rounds.map((round) => round.name))
            .toEqual(["Pool Play", "Round of 16", "Quarterfinals", "Semifinals", "Finals"]);
    });

    it("adds a preliminary round when the qualifier count is not a power of two", () => {
        const state = createClassicState(eight, 8, 2, 6);

        expect(state.rounds.map((round) => round.name))
            .toEqual(["Pool Play", "Round of 6", "Semifinals", "Finals"]);
        // Seeds 1 and 2 go straight through as single-team groups; the other four play.
        expect(state.rounds[1].groups).toEqual([[0], [1], [2, 5], [3, 4]]);
    });

    it("creates no knockout rounds when nobody qualifies", () => {
        expect(createClassicState(eight, 8, 2, 0).rounds).toHaveLength(1);
        expect(createClassicState(eight, 8, 2, 1).rounds).toHaveLength(1);
    });
});

describe("generateDivisionDetails", () => {
    it("builds a Classic division", () => {
        const division = generateDivisionDetails("classic", ["a", "b", "c", "d"], 4, 2, 2);

        expect(division.type).toBe("Classic");
        expect(division.state.rounds.map((round) => round.name)).toEqual(["Pool Play", "Finals"]);
    });

    it("builds a League division", () => {
        const division = generateDivisionDetails("league", ["a", "b"], 2);

        expect(division.type).toBe("League");
        expect(division.state.rounds[0].name).toBe("Round robin");
    });

    it("defaults to one group and no qualifiers", () => {
        const division = generateDivisionDetails("classic", ["a", "b"], 2);

        expect(division.state.rounds).toHaveLength(1);
        expect(division.state.rounds[0].groups).toEqual([["a", "b"]]);
    });

    it("rejects the elimination formats as not yet implemented", () => {
        expect(() => generateDivisionDetails("single_elim", ["a"], 1)).toThrow("FORMAT_NOT_IMPLEMENTED");
        expect(() => generateDivisionDetails("double_elim", ["a"], 1)).toThrow("FORMAT_NOT_IMPLEMENTED");
    });

    it("rejects an unknown format", () => {
        expect(() => generateDivisionDetails("swiss", ["a"], 1)).toThrow("UNSUPPORTED_FORMAT");
    });
});

describe("divisionService.createDivision", () => {
    const details = () => ({
        name: "Division A",
        type: "classic",
        teams: ["Aces", "Bears", "Cubs", "Ducks"],
        num_teams: 4,
        num_groups: 2,
        knockout_teams: 2
    });

    beforeEach(() => {
        divisionsRepository.createTeam
            .mockResolvedValueOnce("team-1")
            .mockResolvedValueOnce("team-2")
            .mockResolvedValueOnce("team-3")
            .mockResolvedValueOnce("team-4");
    });

    it("commits a transaction and returns the new division id", async () => {
        const divisionId = await divisionService.createDivision(details(), "tour-1", "user-1");

        expect(divisionId).toBe("uuid-1");
        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    it("stores the division with the generated state and every fixture", async () => {
        await divisionService.createDivision(details(), "tour-1", "user-1");

        expect(divisionsRepository.createDivision).toHaveBeenCalledOnce();
        const [divisionId, tournamentId, division, userId, client] =
            divisionsRepository.createDivision.mock.calls[0];

        expect({ divisionId, tournamentId, userId }).toEqual({
            divisionId: "uuid-1",
            tournamentId: "tour-1",
            userId: "user-1"
        });
        expect(client).toBe(dbMock.client);
        expect(division).toMatchObject({ name: "Division A", num_teams: 4, type: "Classic" });
        expect(division.state.teams).toEqual(["team-1", "team-2", "team-3", "team-4"]);

        // Two pools of two teams (one fixture each), plus the final and the
        // third-place playoff that createClassicState always unshifts in front
        // of it — even here, where only two teams qualify.
        expect(fixturesRepository.createFixture).toHaveBeenCalledTimes(4);
    });

    it("creates every team without passing it a name or a division", async () => {
        // createTeam() is invoked with no arguments, so every row is inserted
        // with an undefined name. test/known-bugs asserts the intended call.
        await divisionService.createDivision(details(), "tour-1", "user-1");

        expect(divisionsRepository.createTeam).toHaveBeenCalledTimes(4);
        expect(divisionsRepository.createTeam.mock.calls.every((call) => call.length === 0)).toBe(true);
    });

    it("rolls back and rethrows the original failure when storing the division fails", async () => {
        // Rethrown by identity: new Error(error) used to stringify it, losing
        // both the cause and the error's own type.
        const failure = new Error("Failed to create division", { cause: new Error("duplicate key") });
        divisionsRepository.createDivision.mockRejectedValueOnce(failure);

        await expect(divisionService.createDivision(details(), "tour-1", "user-1")).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    it("rolls back when a fixture insert fails, rather than leaving it unhandled", async () => {
        // The fixture inserts used to run in an unawaited forEach, so a rejection
        // escaped the transaction entirely.
        const failure = new Error("Failed to create fixture");
        fixturesRepository.createFixture.mockRejectedValueOnce(failure);

        await expect(divisionService.createDivision(details(), "tour-1", "user-1")).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    it("still releases the client when the rollback itself fails", async () => {
        divisionsRepository.createDivision.mockRejectedValueOnce(new Error("DATABASE_ERROR"));
        dbMock.client.query.mockImplementation(async (sql) => {
            if (sql === "ROLLBACK") throw new Error("CONNECTION_LOST");
            return { rows: [], rowCount: 0 };
        });

        await expect(divisionService.createDivision(details(), "tour-1", "user-1"))
            .rejects.toThrow("CONNECTION_LOST");

        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    it("rolls back when the division format is not supported", async () => {
        await expect(
            divisionService.createDivision({ ...details(), type: "swiss" }, "tour-1", "user-1")
        ).rejects.toThrow("UNSUPPORTED_FORMAT");

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
    });
});
