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
const { generateFixtures } = await import("../../../src/services/fixtures.service.js");
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
    it("builds a single round-robin round with every team in one pool", () => {
        const state = createLeagueState(["a", "b", "c", "d"], 4);

        expect(state.teams).toEqual(["a", "b", "c", "d"]);
        expect(state.currentRound).toBe(0);
        expect(state.rounds).toHaveLength(1);
        expect(state.rounds[0]).toMatchObject({
            name: "Round robin",
            type: "roundRobin",
            groups: [["a", "b", "c", "d"]],
            results: [],
            totalGames: 0,
            completedGames: 0,
            fixtures: []
        });
    });

    it("generates the whole round robin from that pool, counted once", () => {
        // Regression guard, previously known bug 2: groups was [[teams]], so the
        // pool's only member was an array, was paired with the BYE and produced
        // no fixtures at all. totalGames was seeded with n(n-1)/2 underneath
        // that, and generateFixtures adds to the seed — six games would have
        // been reported as twelve.
        const state = createLeagueState(["t1", "t2", "t3", "t4"], 4);
        const { rounds, fixtures } = generateFixtures(state.rounds);

        expect(fixtures).toHaveLength(6);
        expect(rounds[0].fixtures).toHaveLength(6);
        expect(rounds[0].totalGames).toBe(6);
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
        expect(() => generateDivisionDetails("single_elim", ["a"], 1)).toThrow("This format is not available yet");
        expect(() => generateDivisionDetails("double_elim", ["a"], 1)).toThrow("This format is not available yet");
    });

    it("rejects an unknown format", () => {
        expect(() => generateDivisionDetails("swiss", ["a"], 1)).toThrow("This format is not supported");
    });
});

describe("divisionService.createDivision", () => {
    // Teams arrive as objects carrying a name and nothing else. A team belongs
    // to exactly one division, so there is no existing team to reference by id.
    // See TournamentCreation.jsx.
    const details = () => ({
        name: "Division A",
        type: "classic",
        teams: [{ name: "Aces" }, { name: "Bears" }, { name: "Cubs" }, { name: "Ducks" }],
        num_teams: 4,
        num_groups: 2,
        knockout_teams: 2
    });

    // uuid-1 is the division. The four teams take uuid-2 to uuid-5, and the
    // fixtures continue from there.
    const TEAM_IDS = ["uuid-2", "uuid-3", "uuid-4", "uuid-5"];

    it("returns the new division id without owning a transaction of its own", async () => {
        // The caller's transaction is the only one. createTournament opens it and
        // hands the client down; this service neither begins, commits nor
        // releases. See docs/decisions.md.
        const divisionId = await divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client);

        expect(divisionId).toBe("uuid-1");
        expect(clientSql()).toEqual([]);
        expect(dbMock.instance.pool.connect).not.toHaveBeenCalled();
        expect(dbMock.client.release).not.toHaveBeenCalled();
    });

    it("stores the division with the generated state and every fixture", async () => {
        await divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client);

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
        expect(division.state.teams).toEqual(TEAM_IDS);

        // Two pools of two teams (one fixture each), plus the final and the
        // third-place playoff that createClassicState always unshifts in front
        // of it — even here, where only two teams qualify.
        expect(fixturesRepository.createFixture).toHaveBeenCalledTimes(4);
    });

    it("creates each team with its name and its division, on the caller's client", async () => {
        // Regression guard, previously known bug 3: createTeam was called with
        // no arguments at all, inserting a row per team with an undefined name.
        await divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client);

        expect(divisionsRepository.createTeam).toHaveBeenCalledTimes(4);
        expect(divisionsRepository.createTeam)
            .toHaveBeenNthCalledWith(1, TEAM_IDS[0], "Aces", "uuid-1", dbMock.client);
        expect(divisionsRepository.createTeam)
            .toHaveBeenNthCalledWith(2, TEAM_IDS[1], "Bears", "uuid-1", dbMock.client);
    });

    it("stores the division before any of its teams, which reference it", async () => {
        // division_teams_fkey: a team row cannot exist before its division. The
        // teams used to be inserted first, which the mocks here cannot notice —
        // only the ordering can, so it is asserted directly.
        const order = [];
        divisionsRepository.createDivision.mockImplementation(async () => order.push("division"));
        divisionsRepository.createTeam.mockImplementation(async () => order.push("team"));
        fixturesRepository.createFixture.mockImplementation(async () => order.push("fixture"));

        await divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client);

        expect(order[0]).toBe("division");
        // And the fixtures last: fixtures.team_1 and team_2 point at teams.
        expect(order.indexOf("fixture")).toBeGreaterThan(order.lastIndexOf("team"));
    });

    it("creates the teams one at a time, since a single client cannot run concurrent queries", async () => {
        let inFlight = 0;
        let overlapped = false;
        divisionsRepository.createTeam.mockImplementation(async () => {
            inFlight += 1;
            if (inFlight > 1) overlapped = true;
            await Promise.resolve();
            inFlight -= 1;
        });

        await divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client);

        expect(overlapped).toBe(false);
    });

    it("rejects an entry carrying no name", async () => {
        // teams.name is NOT NULL, so this would otherwise surface as a 500.
        await expect(divisionService.createDivision(
            { ...details(), teams: [{ name: "Bears" }, { name: "   " }], num_teams: 2 },
            "tour-1",
            "user-1",
            dbMock.client
        )).rejects.toMatchObject({ code: "MISSING_FIELDS", status: 400 });

        await expect(divisionService.createDivision(
            { ...details(), teams: [{ name: "Bears" }, {}], num_teams: 2 },
            "tour-1",
            "user-1",
            dbMock.client
        )).rejects.toMatchObject({ code: "MISSING_FIELDS", status: 400 });

        expect(divisionsRepository.createTeam).not.toHaveBeenCalled();
    });

    it("rejects the same team name twice, trimmed and case-insensitively", async () => {
        // Two entries resolving to one team would corrupt standings and fixtures.
        await expect(divisionService.createDivision(
            { ...details(), teams: [{ name: "Bears" }, { name: " bears " }], num_teams: 2 },
            "tour-1",
            "user-1",
            dbMock.client
        )).rejects.toMatchObject({ code: "DUPLICATE_TEAM", status: 400 });

        expect(divisionsRepository.createTeam).not.toHaveBeenCalled();
    });

    it("lets the original failure propagate when storing the division fails", async () => {
        // Propagated by identity, for the caller's transaction to roll back:
        // new Error(error) used to stringify it, losing both the cause and the
        // error's own type.
        const failure = new Error("Failed to create division", { cause: new Error("duplicate key") });
        divisionsRepository.createDivision.mockRejectedValueOnce(failure);

        await expect(divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client))
            .rejects.toBe(failure);
    });

    it("lets a fixture failure propagate, rather than leaving it unhandled", async () => {
        // The fixture inserts used to run in an unawaited forEach, so a rejection
        // escaped the transaction entirely.
        const failure = new Error("Failed to create fixture");
        fixturesRepository.createFixture.mockRejectedValueOnce(failure);

        await expect(divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client))
            .rejects.toBe(failure);
    });

    it("creates the fixtures one at a time, since a single client cannot run concurrent queries", async () => {
        let inFlight = 0;
        let overlapped = false;
        fixturesRepository.createFixture.mockImplementation(async () => {
            inFlight += 1;
            if (inFlight > 1) overlapped = true;
            await Promise.resolve();
            inFlight -= 1;
        });

        await divisionService.createDivision(details(), "tour-1", "user-1", dbMock.client);

        expect(fixturesRepository.createFixture).toHaveBeenCalledTimes(4);
        expect(overlapped).toBe(false);
    });

    it("rejects a division format it does not support", async () => {
        await expect(
            divisionService.createDivision({ ...details(), type: "swiss" }, "tour-1", "user-1", dbMock.client)
        ).rejects.toThrow("This format is not supported");
    });
});
