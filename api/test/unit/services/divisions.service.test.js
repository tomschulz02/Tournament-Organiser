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
        createDivision: vi.fn(),
        getDivisionWithOwner: vi.fn(),
        getTeamsByIds: vi.fn(),
        updateTeam: vi.fn(),
        touchDivision: vi.fn(),
        deleteTeamsByIds: vi.fn(),
        deleteDivision: vi.fn(),
        getDivisionsByTournamentId: vi.fn(),
        replaceState: vi.fn(),
        updateTeamOrder: vi.fn()
    }
}));

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: {
        createFixture: vi.fn(),
        getResults: vi.fn(),
        deleteByDivisionId: vi.fn()
    }
}));

vi.mock("../../../src/repositories/tournament.repository.js", () => ({
    tournamentRepository: {
        getScheduleForUpdate: vi.fn(),
        updateSchedule: vi.fn()
    }
}));

const {
    divisionService,
    generateDivisionDetails,
    createLeagueState,
    createClassicState,
    populateGroups,
    validateTeamNames,
    readTeamEntries,
    formatOf,
    toCount,
    validateStructure
} = await import("../../../src/services/divisions.service.js");
const { generateFixtures } = await import("../../../src/services/fixtures.service.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { tournamentRepository } = await import("../../../src/repositories/tournament.repository.js");
const { dbMock, resetDbMock, clientSql } = await import("../../helpers/dbMock.js");

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
    divisionsRepository.createTeam.mockReset();
    divisionsRepository.createDivision.mockReset();
    divisionsRepository.getDivisionWithOwner.mockReset();
    divisionsRepository.getTeamsByIds.mockReset();
    divisionsRepository.updateTeam.mockReset();
    divisionsRepository.deleteTeamsByIds.mockReset();
    divisionsRepository.deleteDivision.mockReset();
    divisionsRepository.getDivisionsByTournamentId.mockReset();
    divisionsRepository.replaceState.mockReset();
    divisionsRepository.updateTeamOrder.mockReset();
    fixturesRepository.createFixture.mockReset();
    fixturesRepository.getResults.mockReset();
    fixturesRepository.getResults.mockResolvedValue([]);
    fixturesRepository.deleteByDivisionId.mockReset();
    fixturesRepository.deleteByDivisionId.mockResolvedValue([]);
    tournamentRepository.getScheduleForUpdate.mockReset();
    tournamentRepository.getScheduleForUpdate.mockResolvedValue(null);
    tournamentRepository.updateSchedule.mockReset();
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

// The submission rules, shared by creation and editing so the two cannot drift
// apart on what a valid team list is.
describe("validateTeamNames", () => {
    it("returns the trimmed names", () => {
        expect(validateTeamNames([{ name: " Aces " }, { name: "Bears" }])).toEqual(["Aces", "Bears"]);
    });

    it("rejects anything that is not a list", () => {
        expect(() => validateTeamNames(undefined)).toThrow("Missing required fields");
        expect(() => validateTeamNames("Aces")).toThrow("Missing required fields");
    });

    it("rejects an entry carrying no name", () => {
        expect(() => validateTeamNames([{ name: "Aces" }, { name: "  " }])).toThrow("Missing required fields");
        expect(() => validateTeamNames([{ name: "Aces" }, {}])).toThrow("Missing required fields");
        expect(() => validateTeamNames([{ name: "Aces" }, null])).toThrow("Missing required fields");
    });

    it("rejects the same name twice, trimmed and case-insensitively", () => {
        expect(() => validateTeamNames([{ name: "Aces" }, { name: " aces " }]))
            .toThrow("A team appears more than once");
    });

    it("accepts an empty list, which is a division with no teams yet", () => {
        expect(validateTeamNames([])).toEqual([]);
    });
});

describe("readTeamEntries", () => {
    it("marks a team with no id as new and keeps the rest by id", () => {
        expect(readTeamEntries([{ id: "t1", name: "Aces" }, { name: "Bears" }], ["t1"]))
            .toEqual([{ id: "t1", name: "Aces" }, { id: null, name: "Bears" }]);
    });

    it("refuses an id the division does not already hold", () => {
        // Otherwise the request could name a team out of somebody else's division.
        expect(() => readTeamEntries([{ id: "other", name: "Aces" }], ["t1"]))
            .toThrow("A team does not belong to this division");
    });

    it("refuses the same id twice", () => {
        expect(() => readTeamEntries([{ id: "t1", name: "Aces" }, { id: "t1", name: "Bears" }], ["t1"]))
            .toThrow("A team appears more than once");
    });
});

describe("formatOf", () => {
    it("maps the stored display name back to the generation key", () => {
        expect(formatOf("Classic")).toBe("classic");
        expect(formatOf("League")).toBe("league");
    });

    it("refuses a type generation cannot rebuild", () => {
        expect(() => formatOf("Single Elimination")).toThrow("This format is not supported");
    });
});

describe("toCount", () => {
    it("accepts an integer or its decimal string", () => {
        expect(toCount(2)).toBe(2);
        expect(toCount("2")).toBe(2);
        expect(toCount(" 0 ")).toBe(0);
    });

    it("treats anything else as absent", () => {
        expect(toCount(undefined)).toBeNull();
        expect(toCount(null)).toBeNull();
        expect(toCount(1.5)).toBeNull();
        expect(toCount("two")).toBeNull();
        expect(toCount("-1")).toBeNull();
    });
});

describe("validateStructure", () => {
    it("accepts a group count the teams can fill and a qualifier count they can supply", () => {
        expect(() => validateStructure(2, 4, 8)).not.toThrow();
        expect(() => validateStructure(8, 0, 8)).not.toThrow();
    });

    it("refuses a missing or impossible group count", () => {
        expect(() => validateStructure(null, 0, 8)).toThrow("The group and qualifier counts do not fit");
        expect(() => validateStructure(0, 0, 8)).toThrow("The group and qualifier counts do not fit");
        expect(() => validateStructure(9, 0, 8)).toThrow("The group and qualifier counts do not fit");
    });

    it("refuses a missing qualifier count, or more qualifiers than teams", () => {
        expect(() => validateStructure(2, null, 8)).toThrow("The group and qualifier counts do not fit");
        expect(() => validateStructure(2, 9, 8)).toThrow("The group and qualifier counts do not fit");
    });
});

describe("divisionService.updateDivision", () => {
    const STORED = ["t1", "t2", "t3", "t4"];

    const division = (overrides = {}) => ({
        id: "div-1",
        tournament_id: "tour-1",
        name: "Division A",
        type: "Classic",
        state: { teams: [...STORED], rounds: [], currentRound: 0 },
        created_by: "user-1",
        tournament_status: "Not Started",
        ...overrides
    });

    const storedTeams = () => [
        { id: "t1", name: "Aces" },
        { id: "t2", name: "Bears" },
        { id: "t3", name: "Cubs" },
        { id: "t4", name: "Ducks" }
    ];

    // The same four teams, sent back unchanged.
    const unchanged = () => storedTeams().map((team) => ({ id: team.id, name: team.name }));

    const body = (teams, overrides = {}) => ({ teams, num_groups: 2, knockout_teams: 2, ...overrides });

    beforeEach(() => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(division());
        divisionsRepository.getTeamsByIds.mockResolvedValue(storedTeams());
    });

    describe("authorisation", () => {
        it("reports a division that does not exist", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(null);

            await expect(divisionService.updateDivision("div-1", "user-1", body(unchanged())))
                .rejects.toMatchObject({ code: "DIVISION_NOT_FOUND", status: 404 });
        });

        it("refuses somebody else's division", async () => {
            await expect(divisionService.updateDivision("div-1", "user-2", body(unchanged())))
                .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });

            expect(divisionsRepository.updateTeam).not.toHaveBeenCalled();
        });

        it("validates the submitted list before deciding what to do with it", async () => {
            await expect(divisionService.updateDivision("div-1", "user-1", body([{ id: "t1", name: " " }])))
                .rejects.toMatchObject({ code: "MISSING_FIELDS", status: 400 });

            await expect(divisionService.updateDivision("div-1", "user-1", body([
                { id: "t1", name: "Aces" },
                { id: "t2", name: "aces" }
            ]))).rejects.toMatchObject({ code: "DUPLICATE_TEAM", status: 400 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
        });

        it("treats a missing body as a missing team list", async () => {
            await expect(divisionService.updateDivision("div-1", "user-1"))
                .rejects.toMatchObject({ code: "MISSING_FIELDS", status: 400 });
        });
    });

    describe("the rename path", () => {
        it("writes only the names that moved, in one transaction", async () => {
            const teams = unchanged();
            teams[1].name = "Bulls";
            teams[3].name = "Drakes";

            const result = await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(divisionsRepository.updateTeam).toHaveBeenCalledTimes(2);
            expect(divisionsRepository.updateTeam)
                .toHaveBeenNthCalledWith(1, "t2", "Bulls", dbMock.client);
            expect(divisionsRepository.updateTeam)
                .toHaveBeenNthCalledWith(2, "t4", "Drakes", dbMock.client);
            expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);

            expect(result).toMatchObject({ divisionId: "div-1", rebuilt: false, renamed: 2 });
        });

        // A rename writes only to `teams`, which carries no last_update and has
        // no trigger. Without this stamp the tournament view's ETag would not
        // move and every reader would keep being served the old names from
        // cache. See src/utils/etag.js.
        it("stamps the division so the cached tournament view is invalidated", async () => {
            const teams = unchanged();
            teams[0].name = "Angels";

            await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(divisionsRepository.touchDivision).toHaveBeenCalledWith("div-1", dbMock.client);
        });

        it("does not stamp the division when no name actually moved", async () => {
            await divisionService.updateDivision("div-1", "user-1", body(unchanged()));

            expect(divisionsRepository.touchDivision).not.toHaveBeenCalled();
            expect(divisionsRepository.updateTeam).not.toHaveBeenCalled();
        });

        it("leaves fixtures, state and the schedule alone", async () => {
            const teams = unchanged();
            teams[0].name = "Angels";

            await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
            expect(divisionsRepository.replaceState).not.toHaveBeenCalled();
            expect(tournamentRepository.updateSchedule).not.toHaveBeenCalled();
        });

        it("writes nothing at all when the list comes back unchanged", async () => {
            const result = await divisionService.updateDivision("div-1", "user-1", body(unchanged()));

            expect(divisionsRepository.updateTeam).not.toHaveBeenCalled();
            expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
            expect(result).toMatchObject({ rebuilt: false, renamed: 0 });
        });

        it("trims the submitted name before comparing it", async () => {
            const teams = unchanged();
            teams[0].name = "  Aces  ";

            const result = await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(result.renamed).toBe(0);
        });

        it("is allowed once the tournament is under way", async () => {
            // A name has no bearing on results, so there is no reason to forbid
            // fixing a typo mid-tournament.
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ tournament_status: "Ongoing" }));

            const teams = unchanged();
            teams[0].name = "Angels";

            await expect(divisionService.updateDivision("div-1", "user-1", body(teams))).resolves.toMatchObject({
                rebuilt: false,
                renamed: 1
            });
            expect(fixturesRepository.getResults).not.toHaveBeenCalled();
        });

        it("leaves the stored order alone, since nothing moved", async () => {
            const teams = unchanged();
            teams[0].name = "Angels";

            await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(divisionsRepository.updateTeamOrder).not.toHaveBeenCalled();
        });
    });

    // The seeding. A reordered list satisfies sameSet exactly — every entry
    // carries a known id and the count matches — so it used to route to
    // renameTeams, which never touches state.teams: the request succeeded and
    // changed nothing. It now redraws pools and fixtures from the new order,
    // the same as a rebuild, because seed order is what the serpentine draw
    // uses to place teams into pools.
    describe("the reorder path", () => {
        const reordered = () => {
            const teams = unchanged();
            // t3 to the front. Two positions move, so this cannot pass by a
            // comparison that only looks at the first entry.
            teams.unshift(teams.splice(2, 1)[0]);

            return teams;
        };

        it("writes state.teams in the submitted order and redraws pools and fixtures", async () => {
            fixturesRepository.deleteByDivisionId.mockResolvedValue(["f1", "f2"]);

            const result = await divisionService.updateDivision("div-1", "user-1", body(reordered()));

            expect(fixturesRepository.deleteByDivisionId).toHaveBeenCalledWith("div-1", dbMock.client);

            const [divisionId, state, numTeams] = divisionsRepository.replaceState.mock.calls[0];
            expect(divisionId).toBe("div-1");
            expect(state.teams).toEqual(["t3", "t1", "t2", "t4"]);
            expect(numTeams).toBe(4);

            expect(fixturesRepository.createFixture).toHaveBeenCalled();
            expect(divisionsRepository.updateTeam).not.toHaveBeenCalled();
            expect(divisionsRepository.deleteTeamsByIds).not.toHaveBeenCalled();
            expect(divisionsRepository.createTeam).not.toHaveBeenCalled();

            expect(result).toMatchObject({ divisionId: "div-1", rebuilt: false, reordered: true, renamed: 0 });
            expect(result.teams.map((team) => team.id)).toEqual(["t3", "t1", "t2", "t4"]);
            expect(result.fixtures).toBeGreaterThan(0);
        });

        // replaceState writes to `divisions`, which does carry last_update, so
        // the stamp rides on that statement rather than on touchDivision.
        it("moves the division's stamp through the state write itself", async () => {
            await divisionService.updateDivision("div-1", "user-1", body(reordered()));

            expect(divisionsRepository.touchDivision).not.toHaveBeenCalled();
        });

        it("applies a rename in the same request, and in one transaction", async () => {
            const teams = reordered();
            teams[0].name = "Cardinals";

            const result = await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(divisionsRepository.updateTeam).toHaveBeenCalledWith("t3", "Cardinals", dbMock.client);
            expect(divisionsRepository.replaceState.mock.calls[0][1].teams).toEqual(["t3", "t1", "t2", "t4"]);
            expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
            expect(result).toMatchObject({ reordered: true, renamed: 1 });
        });

        it("rolls back when the state write fails", async () => {
            const failure = new Error("Failed to replace division state");
            divisionsRepository.replaceState.mockRejectedValueOnce(failure);

            await expect(divisionService.updateDivision("div-1", "user-1", body(reordered())))
                .rejects.toBe(failure);

            expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        });

        // Seeding is the final tiebreak in the ranking chain, so reordering it
        // after results exist would retroactively change who qualified. The same
        // gate team editing already uses — see docs/decisions.md.
        it("refuses a tournament that has already started", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ tournament_status: "Ongoing" }));

            await expect(divisionService.updateDivision("div-1", "user-1", body(reordered())))
                .rejects.toMatchObject({ code: "TOURNAMENT_ALREADY_STARTED", status: 409 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
            expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
        });

        // A reorder now discards and regenerates fixtures the same way a
        // rebuild does, so it needs the same no-results gate — otherwise a
        // completed result's fixture id could be deleted out from under it.
        it("refuses a division that already holds a result", async () => {
            fixturesRepository.getResults.mockResolvedValue([{ id: "f1" }]);

            await expect(divisionService.updateDivision("div-1", "user-1", body(reordered())))
                .rejects.toMatchObject({ code: "DIVISION_HAS_RESULTS", status: 409 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
            expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
        });

        it("refuses a structure the team count cannot support", async () => {
            await expect(divisionService.updateDivision("div-1", "user-1", body(reordered(), { num_groups: 9 })))
                .rejects.toMatchObject({ code: "INVALID_STRUCTURE", status: 400 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
        });

        it("treats a null status as Not Started", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ tournament_status: null }));

            await expect(divisionService.updateDivision("div-1", "user-1", body(reordered())))
                .resolves.toMatchObject({ reordered: true });
        });

        it("is a reorder rather than a rebuild, so no team is created or removed", async () => {
            await divisionService.updateDivision("div-1", "user-1", body(unchanged().reverse()));

            expect(divisionsRepository.createTeam).not.toHaveBeenCalled();
            expect(divisionsRepository.deleteTeamsByIds).not.toHaveBeenCalled();
        });
    });

    describe("the rebuild gate", () => {
        const removed = () => unchanged().slice(0, 3);

        it("refuses a tournament that has already started", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ tournament_status: "Ongoing" }));

            await expect(divisionService.updateDivision("div-1", "user-1", body(removed(), { num_groups: 1 })))
                .rejects.toMatchObject({ code: "TOURNAMENT_ALREADY_STARTED", status: 409 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
        });

        it("refuses a division that already holds a result", async () => {
            // Two checks, because a status can simply be wrong and a completed
            // fixture cannot.
            fixturesRepository.getResults.mockResolvedValue([{ id: "f1" }]);

            await expect(divisionService.updateDivision("div-1", "user-1", body(removed(), { num_groups: 1 })))
                .rejects.toMatchObject({ code: "DIVISION_HAS_RESULTS", status: 409 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
        });

        it("treats a null status as Not Started", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ tournament_status: null }));

            await expect(divisionService.updateDivision("div-1", "user-1", body(removed(), { num_groups: 1 })))
                .resolves.toMatchObject({ rebuilt: true });
        });

        it("refuses a structure the new team count cannot support", async () => {
            await expect(divisionService.updateDivision("div-1", "user-1", body(removed(), { num_groups: 4 })))
                .rejects.toMatchObject({ code: "INVALID_STRUCTURE", status: 400 });

            await expect(divisionService.updateDivision("div-1", "user-1", body(removed(), { knockout_teams: 4 })))
                .rejects.toMatchObject({ code: "INVALID_STRUCTURE", status: 400 });

            expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
        });

        it("refuses a division whose stored format it cannot regenerate", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ type: "Single Elimination" }));

            await expect(divisionService.updateDivision("div-1", "user-1", body(removed(), { num_groups: 1 })))
                .rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT", status: 400 });
        });
    });

    describe("the rebuild path", () => {
        it("removes a team and regenerates the division around the rest", async () => {
            const teams = unchanged().slice(0, 3);
            fixturesRepository.deleteByDivisionId.mockResolvedValue(["f1", "f2"]);

            const result = await divisionService.updateDivision("div-1", "user-1", body(teams, { num_groups: 1 }));

            // Fixtures first: they reference the team rows the next step removes.
            expect(fixturesRepository.deleteByDivisionId).toHaveBeenCalledWith("div-1", dbMock.client);
            expect(divisionsRepository.deleteTeamsByIds).toHaveBeenCalledWith(["t4"], dbMock.client);
            expect(divisionsRepository.createTeam).not.toHaveBeenCalled();

            const [, state, numTeams] = divisionsRepository.replaceState.mock.calls[0];
            expect(state.teams).toEqual(["t1", "t2", "t3"]);
            expect(state.currentRound).toBe(0);
            expect(numTeams).toBe(3);

            expect(fixturesRepository.createFixture).toHaveBeenCalled();
            expect(result).toMatchObject({
                divisionId: "div-1",
                rebuilt: true,
                teams: [
                    { id: "t1", name: "Aces" },
                    { id: "t2", name: "Bears" },
                    { id: "t3", name: "Cubs" }
                ]
            });
        });

        it("adds a team, giving it a new id and putting it in the pool", async () => {
            const teams = [...unchanged(), { name: "Eagles" }];

            const result = await divisionService.updateDivision("div-1", "user-1", body(teams));

            expect(divisionsRepository.createTeam)
                .toHaveBeenCalledWith("uuid-1", "Eagles", "div-1", dbMock.client);
            expect(divisionsRepository.deleteTeamsByIds).toHaveBeenCalledWith([], dbMock.client);

            const [, state] = divisionsRepository.replaceState.mock.calls[0];
            expect(state.teams).toEqual(["t1", "t2", "t3", "t4", "uuid-1"]);
            expect(state.rounds[0].groups.flat()).toContain("uuid-1");
            expect(result.teams.at(-1)).toEqual({ id: "uuid-1", name: "Eagles" });
        });

        it("applies a rename among the surviving teams", async () => {
            const teams = unchanged().slice(0, 3);
            teams[0].name = "Angels";

            await divisionService.updateDivision("div-1", "user-1", body(teams, { num_groups: 1 }));

            expect(divisionsRepository.updateTeam)
                .toHaveBeenCalledWith("t1", "Angels", dbMock.client);
        });

        it("does the whole thing in one transaction", async () => {
            await divisionService.updateDivision(
                "div-1",
                "user-1",
                body(unchanged().slice(0, 3), { num_groups: 1 })
            );

            expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
            expect(dbMock.client.release).toHaveBeenCalledOnce();
        });

        it("rolls the whole thing back when any part of it fails", async () => {
            const failure = new Error("Failed to replace division state");
            divisionsRepository.replaceState.mockRejectedValueOnce(failure);

            await expect(divisionService.updateDivision(
                "div-1",
                "user-1",
                body(unchanged().slice(0, 3), { num_groups: 1 })
            )).rejects.toBe(failure);

            expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        });

        it("treats a division whose state holds no team list as having none", async () => {
            divisionsRepository.getDivisionWithOwner.mockResolvedValue(division({ state: null }));

            const result = await divisionService.updateDivision(
                "div-1",
                "user-1",
                body([{ name: "Eagles" }], { num_groups: 1, knockout_teams: 0 })
            );

            expect(divisionsRepository.deleteTeamsByIds).toHaveBeenCalledWith([], dbMock.client);
            expect(result.teams).toEqual([{ id: "uuid-1", name: "Eagles" }]);
        });

        it("generates the structure before opening the transaction", async () => {
            // An unsupported qualifier count is a rejection, not something the
            // database should have to undo.
            await expect(divisionService.updateDivision(
                "div-1",
                "user-1",
                body(unchanged().slice(0, 3), { num_groups: 1, knockout_teams: 99 })
            )).rejects.toMatchObject({ code: "INVALID_STRUCTURE" });

            expect(clientSql()).toEqual([]);
        });
    });

    describe("the schedule repair", () => {
        // The full stored shape, per docs/handover-phase4-scheduling.md and
        // scheduleUtils.js. Written out rather than reduced to the two fields the
        // repair reads, because the client's normaliseSchedule silently drops any
        // entry missing id, day, startTime or endTime — an entry this code
        // mangled would vanish on the next load with nothing reporting it.
        const entry = (id, fixtureId, overrides = {}) => ({
            id,
            type: fixtureId === null ? "break" : "fixture",
            day: "2026-08-01",
            courtId: "court-1",
            startTime: "09:00",
            endTime: "09:30",
            fixtureId,
            title: "",
            officials: "",
            notes: "",
            ...overrides
        });

        const schedule = () => ({
            version: 1,
            days: [{ id: "day-1", date: "2026-08-01", label: "Day 1" }],
            courts: [{ id: "court-1", name: "Court 1" }],
            entries: [
                entry("e1", "f1"),
                // A break carries fixtureId: null, and courtId: null means it
                // spans every court.
                entry("e2", null, { courtId: null, startTime: "12:00", endTime: "13:00", title: "Lunch" }),
                entry("e3", "other-division", { startTime: "13:00", endTime: "13:30" })
            ],
            settings: { dayStartTime: "09:00", dayEndTime: "18:00", slotMinutes: 30 }
        });

        const rebuild = () =>
            divisionService.updateDivision(
                "div-1",
                "user-1",
                body(unchanged().slice(0, 3), { num_groups: 1 })
            );

        it("drops the entries for deleted fixtures and keeps everything else", async () => {
            fixturesRepository.deleteByDivisionId.mockResolvedValue(["f1", "f2"]);
            tournamentRepository.getScheduleForUpdate.mockResolvedValue(schedule());

            const result = await rebuild();

            const [tournamentId, written, client] = tournamentRepository.updateSchedule.mock.calls[0];
            expect(tournamentId).toBe("tour-1");
            expect(client).toBe(dbMock.client);

            // The break survives, and so does the other division's placement —
            // each one whole, not merely present. An entry that came back
            // without its day or times would be dropped on the next read.
            expect(written.entries).toEqual([schedule().entries[1], schedule().entries[2]]);

            // Repaired, never nulled: everything outside entries is carried
            // across untouched, including the courts and slot settings the grid
            // positions against.
            expect(written).toMatchObject({
                version: 1,
                days: schedule().days,
                courts: schedule().courts,
                settings: schedule().settings
            });

            expect(result.scheduleEntriesRemoved).toBe(1);
        });

        it("writes nothing when no entry pointed at a deleted fixture", async () => {
            fixturesRepository.deleteByDivisionId.mockResolvedValue(["f9"]);
            tournamentRepository.getScheduleForUpdate.mockResolvedValue(schedule());

            expect((await rebuild()).scheduleEntriesRemoved).toBe(0);
            expect(tournamentRepository.updateSchedule).not.toHaveBeenCalled();
        });

        it("skips the read entirely when the division had no fixtures", async () => {
            fixturesRepository.deleteByDivisionId.mockResolvedValue([]);

            expect((await rebuild()).scheduleEntriesRemoved).toBe(0);
            expect(tournamentRepository.getScheduleForUpdate).not.toHaveBeenCalled();
        });

        it("does nothing when the tournament has no schedule, or an empty one", async () => {
            fixturesRepository.deleteByDivisionId.mockResolvedValue(["f1"]);

            tournamentRepository.getScheduleForUpdate.mockResolvedValue(null);
            expect((await rebuild()).scheduleEntriesRemoved).toBe(0);

            tournamentRepository.getScheduleForUpdate.mockResolvedValue({ entries: [] });
            expect((await rebuild()).scheduleEntriesRemoved).toBe(0);

            expect(tournamentRepository.updateSchedule).not.toHaveBeenCalled();
        });
    });
});

describe("divisionService.deleteDivision", () => {
    const owned = (overrides = {}) => ({
        id: "div-1",
        tournament_id: "tour-1",
        name: "Division A",
        type: "Classic",
        state: { teams: ["t1", "t2"] },
        created_by: "user-1",
        tournament_status: "Not Started",
        ...overrides
    });

    // Two divisions, so the last-division rule is satisfied by default.
    const twoDivisions = [{ id: "div-1" }, { id: "div-2" }];

    beforeEach(() => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(owned());
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue(twoDivisions);
    });

    it("deletes the fixtures first, then the division, in one transaction", async () => {
        fixturesRepository.deleteByDivisionId.mockResolvedValue(["f1", "f2", "f3"]);

        const result = await divisionService.deleteDivision("div-1", "user-1");

        expect(result).toEqual({
            divisionId: "div-1",
            tournamentId: "tour-1",
            fixturesRemoved: 3,
            scheduleEntriesRemoved: 0
        });

        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();

        // Both on the transaction's client, and the fixtures before the row —
        // after the cascade their ids are gone, and they are the only thing the
        // schedule repair can match on.
        expect(fixturesRepository.deleteByDivisionId).toHaveBeenCalledWith("div-1", dbMock.client);
        expect(divisionsRepository.deleteDivision).toHaveBeenCalledWith("div-1", dbMock.client);
        expect(fixturesRepository.deleteByDivisionId.mock.invocationCallOrder[0])
            .toBeLessThan(divisionsRepository.deleteDivision.mock.invocationCallOrder[0]);
    });

    // The team rows go by cascade — teams.division_id REFERENCES divisions(id)
    // ON DELETE CASCADE. Deleting them by hand would be a second way to get it
    // wrong.
    it("does not delete the team rows itself", async () => {
        await divisionService.deleteDivision("div-1", "user-1");

        expect(divisionsRepository.deleteTeamsByIds).not.toHaveBeenCalled();
    });

    // The check most likely to be skipped: easy to get right for the division
    // being removed, easy to get wrong for the ones that stay.
    it("drops only the removed division's schedule entries", async () => {
        const entry = (id, fixtureId, overrides = {}) => ({
            id,
            type: fixtureId === null ? "break" : "fixture",
            day: "2026-08-01",
            courtId: "court-1",
            startTime: "09:00",
            endTime: "09:30",
            fixtureId,
            title: "",
            officials: "",
            notes: "",
            ...overrides
        });

        const schedule = {
            version: 1,
            days: [{ id: "day-1", date: "2026-08-01", label: "Day 1" }],
            courts: [{ id: "court-1", name: "Court 1" }],
            entries: [
                entry("e1", "f1"),
                entry("e2", null, { courtId: null, startTime: "12:00", endTime: "13:00", title: "Lunch" }),
                entry("e3", "other-division", { startTime: "13:00", endTime: "13:30" })
            ],
            settings: { dayStartTime: "09:00", dayEndTime: "18:00", slotMinutes: 30 }
        };

        fixturesRepository.deleteByDivisionId.mockResolvedValue(["f1", "f2"]);
        tournamentRepository.getScheduleForUpdate.mockResolvedValue(schedule);

        const result = await divisionService.deleteDivision("div-1", "user-1");

        const [tournamentId, written, client] = tournamentRepository.updateSchedule.mock.calls[0];
        expect(tournamentId).toBe("tour-1");
        expect(client).toBe(dbMock.client);

        // The break and the other division's placement survive whole — same day,
        // same court, same times.
        expect(written.entries).toEqual([schedule.entries[1], schedule.entries[2]]);
        expect(written).toMatchObject({
            version: 1,
            days: schedule.days,
            courts: schedule.courts,
            settings: schedule.settings
        });
        expect(result.scheduleEntriesRemoved).toBe(1);
    });

    it("refuses an unknown division", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(null);

        await expect(divisionService.deleteDivision("div-1", "user-1"))
            .rejects.toMatchObject({ code: "DIVISION_NOT_FOUND", status: 404 });
        expect(clientSql()).toEqual([]);
    });

    it("refuses a division belonging to somebody else's tournament", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(owned({ created_by: "user-2" }));

        await expect(divisionService.deleteDivision("div-1", "user-1"))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(clientSql()).toEqual([]);
    });

    // Removing a division from a running tournament leaves a schedule and a set
    // of standings describing a tournament that no longer exists.
    it.each(["Ongoing", "Finished"])("refuses removal from a %s tournament", async (status) => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(owned({ tournament_status: status }));

        await expect(divisionService.deleteDivision("div-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_ALREADY_STARTED", status: 409 });
        expect(divisionsRepository.deleteDivision).not.toHaveBeenCalled();
    });

    it("treats a null tournament status as Not Started", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(owned({ tournament_status: null }));

        await divisionService.deleteDivision("div-1", "user-1");

        expect(divisionsRepository.deleteDivision).toHaveBeenCalledOnce();
    });

    // A tournament cannot be created without a division, so it should not be
    // reducible to zero afterwards either.
    it("refuses to remove the last division", async () => {
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue([{ id: "div-1" }]);

        await expect(divisionService.deleteDivision("div-1", "user-1"))
            .rejects.toMatchObject({ code: "LAST_DIVISION", status: 409 });
        expect(clientSql()).toEqual([]);
        expect(fixturesRepository.deleteByDivisionId).not.toHaveBeenCalled();
    });
});
