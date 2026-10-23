import { describe, it, expect, beforeEach, vi } from "vitest";

// divisionService.updateDivisionSettings — the Settings page's per-division
// controls. Its own suite because the placement-depth half redraws a knockout
// against real generated fixtures, which the mocks in divisions.service.test.js
// are not shaped for.

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        getDivisionWithOwner: vi.fn(),
        updateRankingBasis: vi.fn(),
        updatePlacementDepth: vi.fn(),
        getFixturesByDivisionId: vi.fn(),
        updateStateRounds: vi.fn()
    }
}));

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: {
        createFixture: vi.fn(),
        updateFixtureSlot: vi.fn(),
        deleteByIds: vi.fn()
    }
}));

vi.mock("../../../src/repositories/tournament.repository.js", () => ({
    tournamentRepository: {
        getScheduleForUpdate: vi.fn(),
        updateSchedule: vi.fn()
    }
}));

const { divisionService, createClassicState, createLeagueState, readPlacementDepth } =
    await import("../../../src/services/divisions.service.js");
const { generateFixtures } = await import("../../../src/services/fixtures.service.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { tournamentRepository } = await import("../../../src/repositories/tournament.repository.js");
const { dbMock, resetDbMock, clientSql } = await import("../../helpers/dbMock.js");

const TEAMS = Array.from({ length: 12 }, (_, index) => `t${index}`);

// A Classic division as it is stored: 12 teams, 2 pools, 8 into the knockout,
// fixtures generated from the same state, at whatever depth it was built with.
function storedDivision({ depth = null, currentRound = 0, overrides = {} } = {}) {
    const state = createClassicState(TEAMS, TEAMS.length, 2, 8, depth);
    const generated = generateFixtures(state.rounds);
    state.rounds = generated.rounds;
    state.currentRound = currentRound;
    state.color = "accent-4";

    const rows = generated.fixtures.map((fixture) => ({
        id: fixture.id,
        match_no: fixture.matchNo,
        round: fixture.round
    }));

    return {
        division: {
            id: "div-1",
            tournament_id: "tour-1",
            type: "Classic",
            state,
            ranking_basis: "MATCHES_WON",
            placement_depth: depth,
            created_by: "user-1",
            ...overrides
        },
        rows
    };
}

function use({ division, rows }) {
    divisionsRepository.getDivisionWithOwner.mockResolvedValue(division);
    divisionsRepository.getFixturesByDivisionId.mockResolvedValue(rows);
}

beforeEach(() => {
    resetDbMock();
    Object.values(divisionsRepository).forEach((fn) => fn.mockReset());
    Object.values(fixturesRepository).forEach((fn) => fn.mockReset());
    tournamentRepository.getScheduleForUpdate.mockReset().mockResolvedValue(null);
    tournamentRepository.updateSchedule.mockReset();
    use(storedDivision());
});

describe("access", () => {
    it("reports a division that does not exist", async () => {
        divisionsRepository.getDivisionWithOwner.mockResolvedValue(null);

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: "SETS_WON" }))
            .rejects.toMatchObject({ code: "DIVISION_NOT_FOUND" });
    });

    it("refuses anyone but the organiser", async () => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-2", { rankingBasis: "SETS_WON" }))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(divisionsRepository.updateRankingBasis).not.toHaveBeenCalled();
    });
});

describe("ranking basis", () => {
    it.each(["FIVB_POINTS", "SIMPLIFIED_POINTS", "SETS_WON"])("stores %s with no rebuild", async (basis) => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: basis }))
            .resolves.toEqual({ divisionId: "div-1", rankingBasis: basis, placementDepth: null });

        expect(divisionsRepository.updateRankingBasis).toHaveBeenCalledWith("div-1", basis);
        expect(divisionsRepository.updateStateRounds).not.toHaveBeenCalled();
        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
    });

    // Not gated like the knockout: it changes how standings are read, nothing more.
    it("is changeable once the tournament is well under way", async () => {
        use(storedDivision({ currentRound: 2 }));

        await divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: "SETS_WON" });

        expect(divisionsRepository.updateRankingBasis).toHaveBeenCalledWith("div-1", "SETS_WON");
    });

    it.each(["POINTS", "", null, 3])("refuses %p", async (basis) => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: basis }))
            .rejects.toMatchObject({ code: "INVALID_RANKING_BASIS", status: 400 });
        expect(divisionsRepository.updateRankingBasis).not.toHaveBeenCalled();
    });

    it("writes nothing when the value is unchanged or absent", async () => {
        await divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: "MATCHES_WON" });
        await divisionService.updateDivisionSettings("div-1", "user-1", {});
        await divisionService.updateDivisionSettings("div-1", "user-1");

        expect(divisionsRepository.updateRankingBasis).not.toHaveBeenCalled();
    });

    it("reads a row the default never reached as matches won", async () => {
        use(storedDivision({ overrides: { ranking_basis: null, placement_depth: undefined } }));

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", {}))
            .resolves.toEqual({ divisionId: "div-1", rankingBasis: "MATCHES_WON", placementDepth: null });
    });
});

describe("placement depth", () => {
    it("adds the placement fixtures and keeps every existing knockout fixture's id", async () => {
        const stored = storedDivision();
        use(stored);
        const knockoutIds = stored.rows.filter((row) => row.round !== "Pool Play").map((row) => row.id);

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 7 }))
            .resolves.toEqual({ divisionId: "div-1", rankingBasis: "MATCHES_WON", placementDepth: 7 });

        // Quarterfinals, semifinals, bronze and final: moved, never recreated.
        expect(fixturesRepository.updateFixtureSlot.mock.calls.map((call) => call[0])).toEqual(knockoutIds);
        // Two placement semifinals, the 5th and the 7th place matches.
        expect(fixturesRepository.createFixture.mock.calls.map((call) => call[7])).toEqual([
            "Semifinals · Places 5-8",
            "Semifinals · Places 5-8",
            "Finals · 5th Place",
            "Finals · 7th Place"
        ]);
        expect(fixturesRepository.deleteByIds).toHaveBeenCalledWith([], dbMock.client);
        expect(divisionsRepository.updatePlacementDepth).toHaveBeenCalledWith("div-1", 7, dbMock.client);
        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
    });

    it("numbers the knockout on from the pool, in round order", async () => {
        const stored = storedDivision();
        use(stored);
        const poolCount = stored.rows.filter((row) => row.round === "Pool Play").length;

        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 7 });

        const moved = fixturesRepository.updateFixtureSlot.mock.calls.map(([, matchNo, round]) => [matchNo, round]);
        const created = fixturesRepository.createFixture.mock.calls.map((call) => [call[2], call[7]]);
        const all = [...moved, ...created].sort((a, b) => a[0] - b[0]);

        expect(all.map(([matchNo]) => matchNo)).toEqual(Array.from({ length: 12 }, (_, index) => poolCount + 1 + index));
        expect(all.map(([, round]) => round)).toEqual([
            "Quarterfinals", "Quarterfinals", "Quarterfinals", "Quarterfinals",
            "Semifinals", "Semifinals", "Semifinals · Places 5-8", "Semifinals · Places 5-8",
            "3rd Place Playoff", "Finals", "Finals · 5th Place", "Finals · 7th Place"
        ]);
    });

    it("redraws only the knockout rounds, keeping pool play and the rest of state", async () => {
        const stored = storedDivision();
        use(stored);
        const pool = stored.division.state.rounds[0];

        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 5 });

        const [divisionId, rounds, client] = divisionsRepository.updateStateRounds.mock.calls[0];
        expect(divisionId).toBe("div-1");
        expect(client).toBe(dbMock.client);
        expect(rounds[0]).toBe(pool);
        expect(rounds.at(-1).groups).toEqual([[4, 5], [0, 1], [2, 3]]);
        // The kept ids are the ones state points at.
        const semifinalIds = stored.rows.filter((row) => row.round === "Semifinals").map((row) => row.id);
        expect(rounds[2].fixtures.slice(0, 2)).toEqual(semifinalIds);
    });

    it("drops the placement fixtures a shallower depth no longer needs, and repairs the schedule", async () => {
        const stored = storedDivision({ depth: 7 });
        use(stored);
        const seventh = stored.rows.find((row) => row.round === "Finals · 7th Place").id;
        tournamentRepository.getScheduleForUpdate.mockResolvedValue({
            entries: [{ fixtureId: seventh }, { fixtureId: null }]
        });

        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 5 });

        expect(fixturesRepository.deleteByIds).toHaveBeenCalledWith([seventh], dbMock.client);
        expect(fixturesRepository.createFixture).not.toHaveBeenCalled();
        expect(tournamentRepository.updateSchedule).toHaveBeenCalledWith(
            "tour-1", { entries: [{ fixtureId: null }] }, dbMock.client
        );
    });

    it("clears back to the final and 3rd-place playoff with null", async () => {
        use(storedDivision({ depth: 5 }));

        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: null });

        expect(fixturesRepository.deleteByIds.mock.calls[0][0]).toHaveLength(3);
        expect(divisionsRepository.updatePlacementDepth).toHaveBeenCalledWith("div-1", null, dbMock.client);
    });

    it("writes a ranking basis sent alongside it in the same transaction", async () => {
        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: "5", rankingBasis: "SETS_WON" });

        expect(divisionsRepository.updateRankingBasis).toHaveBeenCalledWith("div-1", "SETS_WON", dbMock.client);
        expect(divisionsRepository.updatePlacementDepth).toHaveBeenCalledWith("div-1", 5, dbMock.client);
    });

    it("does nothing when the depth is unchanged", async () => {
        use(storedDivision({ depth: 5 }));

        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 5 });

        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
    });

    it("rolls back a failed redraw", async () => {
        const failure = new Error("insert failed");
        fixturesRepository.createFixture.mockRejectedValueOnce(failure);

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 7 })).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(divisionsRepository.updatePlacementDepth).not.toHaveBeenCalled();
    });

    it.each([4, 6, 3, 9, 0, -5, 5.5, "seven", true])("refuses %p for an eight-team knockout", async (depth) => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: depth }))
            .rejects.toMatchObject({ code: "INVALID_PLACEMENT_DEPTH", status: 400 });
        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
    });

    it("refuses once the knockout stage has started", async () => {
        use(storedDivision({ currentRound: 1 }));

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 5 }))
            .rejects.toMatchObject({ code: "KNOCKOUT_ALREADY_STARTED", status: 409 });
    });

    it("validates both settings before writing either", async () => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: "SETS_WON", placementDepth: 4 }))
            .rejects.toMatchObject({ code: "INVALID_PLACEMENT_DEPTH" });
        expect(divisionsRepository.updateRankingBasis).not.toHaveBeenCalled();
    });
});

describe("readPlacementDepth", () => {
    it("is refused for a League, which has no knockout stage", () => {
        const league = { type: "League", state: createLeagueState(TEAMS, TEAMS.length) };

        expect(() => readPlacementDepth(league, 5)).toThrow(expect.objectContaining({ code: "PLACEMENT_NOT_AVAILABLE" }));
    });

    it("is refused for a Classic division with no knockout, or no state at all", () => {
        const poolOnly = { type: "Classic", state: createClassicState(TEAMS, TEAMS.length, 2, 0) };

        expect(() => readPlacementDepth(poolOnly, 5)).toThrow(expect.objectContaining({ code: "PLACEMENT_NOT_AVAILABLE" }));
        expect(() => readPlacementDepth({ type: "Classic", state: null }, 5))
            .toThrow(expect.objectContaining({ code: "PLACEMENT_NOT_AVAILABLE" }));
    });

    it("accepts the knockout's own team count when it is odd", () => {
        const seven = { type: "Classic", state: createClassicState(TEAMS, TEAMS.length, 2, 7) };

        expect(readPlacementDepth(seven, 7)).toBe(7);
    });

    it("reads a missing currentRound as the first round", () => {
        const state = createClassicState(TEAMS, TEAMS.length, 2, 8);
        delete state.currentRound;

        expect(readPlacementDepth({ type: "Classic", state }, 5)).toBe(5);
    });
});
