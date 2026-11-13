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
        updateStateRankingRules: vi.fn(),
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
const { rulesFromBasis } = await import("../../../src/utils/standings.js");
const { dbMock, resetDbMock, clientSql } = await import("../../helpers/dbMock.js");

const MATCH_WINS = rulesFromBasis("MATCHES_WON");
const SET_WINS = { method: "wins", wins: "sets", tiebreakers: ["POINT_DIFFERENCE", "HEAD_TO_HEAD"] };
const CUSTOM_POINTS = {
    method: "points",
    points: { straightWin: 4, decidingWin: 3, decidingLoss: 1, straightLoss: 0 },
    tiebreakers: []
};

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

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: SET_WINS }))
            .rejects.toMatchObject({ code: "DIVISION_NOT_FOUND" });
    });

    it("refuses anyone but the organiser", async () => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-2", { rankingRules: SET_WINS }))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(divisionsRepository.updateStateRankingRules).not.toHaveBeenCalled();
    });
});

describe("ranking rules", () => {
    it.each([
        ["wins", SET_WINS],
        ["points", CUSTOM_POINTS]
    ])("stores %s rules in state with no rebuild", async (_, rules) => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: rules }))
            .resolves.toEqual({ divisionId: "div-1", rankingRules: rules, placementDepth: null });

        expect(divisionsRepository.updateStateRankingRules).toHaveBeenCalledWith("div-1", rules);
        expect(divisionsRepository.updateStateRounds).not.toHaveBeenCalled();
        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
    });

    it("stores the validated shape, not whatever else was sent", async () => {
        await divisionService.updateDivisionSettings("div-1", "user-1", {
            rankingRules: { ...SET_WINS, points: CUSTOM_POINTS.points, extra: true }
        });

        expect(divisionsRepository.updateStateRankingRules).toHaveBeenCalledWith("div-1", SET_WINS);
    });

    // Not gated like the knockout: it changes how standings are read, nothing more.
    it("is changeable once the tournament is well under way", async () => {
        use(storedDivision({ currentRound: 2 }));

        await divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: SET_WINS });

        expect(divisionsRepository.updateStateRankingRules).toHaveBeenCalledWith("div-1", SET_WINS);
    });

    it.each([
        ["a basis name", "SETS_WON"],
        ["null", null],
        ["an unknown method", { method: "draws", tiebreakers: [] }],
        ["seeding as a decider", { ...SET_WINS, tiebreakers: ["SEEDING"] }],
        ["points above ten", { ...CUSTOM_POINTS, points: { ...CUSTOM_POINTS.points, straightWin: 11 } }]
    ])("refuses %s", async (_, rules) => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: rules }))
            .rejects.toMatchObject({ code: "INVALID_RANKING_RULES", status: 400 });
        expect(divisionsRepository.updateStateRankingRules).not.toHaveBeenCalled();
    });

    // Saving is what makes state authoritative, so rules equal to the ones the
    // basis stands for are still written the first time.
    it("writes rules that match the derived ones when none are stored yet", async () => {
        await divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: MATCH_WINS });

        expect(divisionsRepository.updateStateRankingRules).toHaveBeenCalledWith("div-1", MATCH_WINS);
    });

    it("writes nothing when the rules are unchanged or absent", async () => {
        const stored = storedDivision();
        stored.division.state.rankingRules = SET_WINS;
        use(stored);

        await divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: SET_WINS });
        await divisionService.updateDivisionSettings("div-1", "user-1", {});
        await divisionService.updateDivisionSettings("div-1", "user-1");

        expect(divisionsRepository.updateStateRankingRules).not.toHaveBeenCalled();
    });

    it("no longer accepts a ranking basis, and never writes the column", async () => {
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingBasis: "SETS_WON" }))
            .resolves.toEqual({ divisionId: "div-1", rankingRules: MATCH_WINS, placementDepth: null });

        expect(divisionsRepository.updateRankingBasis).not.toHaveBeenCalled();
        expect(divisionsRepository.updateStateRankingRules).not.toHaveBeenCalled();
    });

    it("returns the rules in force: stored ones, else those the basis stands for", async () => {
        use(storedDivision({ overrides: { ranking_basis: "FIVB_POINTS" } }));
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", {}))
            .resolves.toEqual({ divisionId: "div-1", rankingRules: rulesFromBasis("FIVB_POINTS"), placementDepth: null });

        const stored = storedDivision({ overrides: { ranking_basis: "FIVB_POINTS" } });
        stored.division.state.rankingRules = SET_WINS;
        use(stored);
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", {}))
            .resolves.toEqual({ divisionId: "div-1", rankingRules: SET_WINS, placementDepth: null });
    });

    it("reads a row the default never reached as match wins", async () => {
        use(storedDivision({ overrides: { ranking_basis: null, placement_depth: undefined } }));

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", {}))
            .resolves.toEqual({ divisionId: "div-1", rankingRules: MATCH_WINS, placementDepth: null });
    });
});

describe("placement depth", () => {
    it("adds the placement fixtures and keeps every existing knockout fixture's id", async () => {
        const stored = storedDivision();
        use(stored);
        const knockoutIds = stored.rows.filter((row) => row.round !== "Pool Play").map((row) => row.id);

        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 7 }))
            .resolves.toEqual({ divisionId: "div-1", rankingRules: MATCH_WINS, placementDepth: 7 });

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

    it("writes ranking rules sent alongside it in the same transaction", async () => {
        await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: "5", rankingRules: SET_WINS });

        expect(divisionsRepository.updateStateRankingRules).toHaveBeenCalledWith("div-1", SET_WINS, dbMock.client);
        expect(divisionsRepository.updatePlacementDepth).toHaveBeenCalledWith("div-1", 5, dbMock.client);
    });

    describe("final only", () => {
        it("removes the 3rd-place playoff and leaves the final alone in its round", async () => {
            const stored = storedDivision();
            use(stored);
            const playoff = stored.rows.find((row) => row.round === "3rd Place Playoff");
            const kept = stored.rows.filter((row) => row.round !== "Pool Play" && row !== playoff).map((row) => row.id);

            await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 1 }))
                .resolves.toEqual({ divisionId: "div-1", rankingRules: MATCH_WINS, placementDepth: 1 });

            // Every other knockout fixture keeps its id, the final included.
            expect(fixturesRepository.updateFixtureSlot.mock.calls.map((call) => call[0])).toEqual(kept);
            expect(fixturesRepository.updateFixtureSlot.mock.calls.at(-1).slice(2, 5)).toEqual(["Finals", "Rank 1", "Rank 2"]);
            expect(fixturesRepository.createFixture).not.toHaveBeenCalled();
            expect(fixturesRepository.deleteByIds).toHaveBeenCalledWith([playoff.id], dbMock.client);

            const rounds = divisionsRepository.updateStateRounds.mock.calls[0][1];
            expect(rounds.at(-1)).toMatchObject({ name: "Finals", groups: [[0, 1]], totalGames: 1 });
            expect(rounds.at(-1).fixtures).toEqual([kept.at(-1)]);
            expect(divisionsRepository.updatePlacementDepth).toHaveBeenCalledWith("div-1", 1, dbMock.client);
        });

        it("takes the playoff's slot out of the schedule", async () => {
            const stored = storedDivision();
            use(stored);
            const playoff = stored.rows.find((row) => row.round === "3rd Place Playoff");
            const final = stored.rows.find((row) => row.round === "Finals");
            tournamentRepository.getScheduleForUpdate.mockResolvedValue({
                entries: [{ fixtureId: playoff.id }, { fixtureId: final.id }]
            });

            await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 1 });

            const [, schedule] = tournamentRepository.updateSchedule.mock.calls[0];
            expect(schedule.entries).toEqual([{ fixtureId: final.id }]);
        });

        it("brings the playoff back when cleared, keeping the final's id", async () => {
            const stored = storedDivision({ depth: 1 });
            use(stored);
            expect(stored.rows.some((row) => row.round === "3rd Place Playoff")).toBe(false);
            const final = stored.rows.find((row) => row.round === "Finals");

            await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: null });

            expect(fixturesRepository.createFixture.mock.calls.map((call) => call[7])).toEqual(["3rd Place Playoff"]);
            expect(fixturesRepository.updateFixtureSlot.mock.calls.at(-1)[0]).toBe(final.id);
            expect(divisionsRepository.updateStateRounds.mock.calls[0][1].at(-1).groups).toEqual([[2, 3], [0, 1]]);
        });

        it("moves straight to a played-for depth, which always has the playoff", async () => {
            use(storedDivision({ depth: 1 }));

            await divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 5 });

            expect(fixturesRepository.createFixture.mock.calls.map((call) => call[7])).toEqual([
                "Semifinals · Places 5-8",
                "Semifinals · Places 5-8",
                "3rd Place Playoff",
                "Finals · 5th Place"
            ]);
        });

        it("is refused once the knockout stage has started", async () => {
            use(storedDivision({ currentRound: 1 }));

            await expect(divisionService.updateDivisionSettings("div-1", "user-1", { placementDepth: 1 }))
                .rejects.toMatchObject({ code: "KNOCKOUT_ALREADY_STARTED" });
        });
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
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: SET_WINS, placementDepth: 4 }))
            .rejects.toMatchObject({ code: "INVALID_PLACEMENT_DEPTH" });
        await expect(divisionService.updateDivisionSettings("div-1", "user-1", { rankingRules: "x", placementDepth: 5 }))
            .rejects.toMatchObject({ code: "INVALID_RANKING_RULES" });
        expect(divisionsRepository.updateStateRankingRules).not.toHaveBeenCalled();
        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
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

    it("accepts final only for a knockout with semifinals, as a number or a string", () => {
        const four = { type: "Classic", state: createClassicState(TEAMS, TEAMS.length, 2, 4) };

        expect(readPlacementDepth(four, 1)).toBe(1);
        expect(readPlacementDepth(four, "1")).toBe(1);
    });

    // Two teams go straight into the Finals round: there are no semifinal
    // losers to leave unplayed, so there is nothing for "final only" to remove.
    it("refuses final only for a two-team knockout", () => {
        const two = { type: "Classic", state: createClassicState(TEAMS, TEAMS.length, 2, 2) };

        expect(() => readPlacementDepth(two, 1)).toThrow(expect.objectContaining({ code: "INVALID_PLACEMENT_DEPTH" }));
    });

    it("reads a missing currentRound as the first round", () => {
        const state = createClassicState(TEAMS, TEAMS.length, 2, 8);
        delete state.currentRound;

        expect(readPlacementDepth({ type: "Classic", state }, 5)).toBe(5);
    });
});
