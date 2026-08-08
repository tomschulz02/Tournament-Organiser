import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/repositories/tournament.repository.js", () => ({
    tournamentRepository: {
        createTournament: vi.fn(),
        getAllTournaments: vi.fn(),
        getTournamentById: vi.fn(),
        deleteTournament: vi.fn()
    }
}));

vi.mock("../../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        getDivisionsByTournamentId: vi.fn(),
        getTeamsByDivisionIds: vi.fn()
    }
}));

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: { getFixturesByDivisionIds: vi.fn() }
}));

vi.mock("../../../src/services/divisions.service.js", () => ({
    divisionService: { createDivision: vi.fn() }
}));

// The formatter has its own suite; here we only care that it is handed the
// right shapes and that its output is passed through.
vi.mock("../../../src/utils/tournamentViewFormatter.js", () => ({
    formatTournamentViewPayload: vi.fn(() => ({ formatted: true }))
}));

const { tournamentService } = await import("../../../src/services/tournaments.service.js");
const { tournamentRepository } = await import("../../../src/repositories/tournament.repository.js");
const { divisionsRepository } = await import("../../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { divisionService } = await import("../../../src/services/divisions.service.js");
const { formatTournamentViewPayload } = await import("../../../src/utils/tournamentViewFormatter.js");
const { makeDivision, makeTournament } = await import("../../helpers/fixtures.js");

beforeEach(() => {
    vi.mocked(tournamentRepository.createTournament).mockReset();
    vi.mocked(tournamentRepository.getAllTournaments).mockReset();
    vi.mocked(tournamentRepository.getTournamentById).mockReset();
    vi.mocked(tournamentRepository.deleteTournament).mockReset().mockResolvedValue(undefined);
    vi.mocked(divisionsRepository.getDivisionsByTournamentId).mockReset();
    vi.mocked(divisionsRepository.getTeamsByDivisionIds).mockReset();
    vi.mocked(fixturesRepository.getFixturesByDivisionIds).mockReset();
    vi.mocked(divisionService.createDivision).mockReset();
    vi.mocked(formatTournamentViewPayload).mockReset().mockReturnValue({ formatted: true });
});

describe("tournamentService.createTournament", () => {
    const payload = {
        details: { name: "Summer Open", location: "Hall", start_date: "2026-08-01", end_date: "2026-08-03" },
        divisions: [{ name: "Division A" }, { name: "Division B" }]
    };

    it("creates the tournament and then every division", async () => {
        tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });
        divisionService.createDivision.mockResolvedValue("div-1");

        expect(await tournamentService.createTournament(payload, "user-1")).toBe("tour-1");

        expect(tournamentRepository.createTournament).toHaveBeenCalledWith(payload.details, "user-1");
        expect(divisionService.createDivision).toHaveBeenCalledTimes(2);
        expect(divisionService.createDivision).toHaveBeenCalledWith({ name: "Division A" }, "tour-1", "user-1");
        expect(tournamentRepository.deleteTournament).not.toHaveBeenCalled();
    });

    it("deletes the tournament again when a division fails, so no half-built tournament survives", async () => {
        const failure = new Error("division insert failed");
        tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });
        divisionService.createDivision.mockRejectedValue(failure);

        // The original error propagates untouched, so the middleware sees the
        // real cause rather than a code invented here.
        await expect(tournamentService.createTournament(payload, "user-1")).rejects.toBe(failure);

        expect(tournamentRepository.deleteTournament).toHaveBeenCalledWith("tour-1", "user-1");
    });

    it("attempts the compensating delete with id 0 when the tournament itself failed", async () => {
        const failure = new Error("tournament insert failed");
        tournamentRepository.createTournament.mockRejectedValue(failure);

        await expect(tournamentService.createTournament(payload, "user-1")).rejects.toBe(failure);

        expect(tournamentRepository.deleteTournament).toHaveBeenCalledWith(0, "user-1");
        expect(divisionService.createDivision).not.toHaveBeenCalled();
    });

    it("does not let a failed compensating delete mask the original failure", async () => {
        const failure = new Error("division insert failed");
        tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });
        divisionService.createDivision.mockRejectedValue(failure);
        tournamentRepository.deleteTournament.mockRejectedValue(new Error("delete failed too"));

        await expect(tournamentService.createTournament(payload, "user-1")).rejects.toBe(failure);
    });
});

describe("tournamentService.fetchTournaments", () => {
    function row(overrides = {}) {
        return {
            id: "tour-1",
            status: "Not Started",
            start_date: new Date("2026-08-01T00:00:00.000Z"),
            end_date: new Date("2026-08-03T00:00:00.000Z"),
            ...overrides
        };
    }

    it("formats the dates and groups by status", async () => {
        tournamentRepository.getAllTournaments.mockResolvedValue([
            row({ id: "a", status: "Not Started" }),
            row({ id: "b", status: "Ongoing" }),
            row({ id: "c", status: "Finished" })
        ]);

        const grouped = await tournamentService.fetchTournaments();

        expect(grouped.upcoming.map((entry) => entry.id)).toEqual(["a"]);
        expect(grouped.ongoing.map((entry) => entry.id)).toEqual(["b"]);
        expect(grouped.completed.map((entry) => entry.id)).toEqual(["c"]);
        expect(grouped.upcoming[0].start_date).toBe("1 August 2026");
        expect(grouped.upcoming[0].end_date).toBe("2026-08-04");
    });

    it("drops a tournament whose status is not one it recognises", async () => {
        tournamentRepository.getAllTournaments.mockResolvedValue([row({ status: "Abandoned" })]);

        expect(await tournamentService.fetchTournaments()).toEqual({ upcoming: [], ongoing: [], completed: [] });
    });

    it("stops processing at the first tournament with no status", async () => {
        // The loop breaks rather than skipping, so "b" is lost as well.
        // test/known-bugs asserts that only the null row should be skipped.
        tournamentRepository.getAllTournaments.mockResolvedValue([
            row({ id: "a", status: "Ongoing" }),
            row({ id: "null-row", status: null }),
            row({ id: "b", status: "Ongoing" })
        ]);

        expect((await tournamentService.fetchTournaments()).ongoing.map((entry) => entry.id)).toEqual(["a"]);
    });

    it("lets a repository failure propagate untouched", async () => {
        const failure = new Error("Failed to fetch tournaments");
        tournamentRepository.getAllTournaments.mockRejectedValue(failure);

        await expect(tournamentService.fetchTournaments()).rejects.toBe(failure);
    });
});

describe("tournamentService.fetchTournamentDetails", () => {
    function loadable() {
        tournamentRepository.getTournamentById.mockResolvedValue(makeTournament({ created_by: "user-1" }));
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue([
            makeDivision({ id: "div-1" }),
            makeDivision({ id: "div-2" })
        ]);
        divisionsRepository.getTeamsByDivisionIds.mockResolvedValue([
            { id: "t1", division_id: "div-1" },
            { id: "t2", division_id: "div-1" },
            { id: "t3", division_id: "div-2" }
        ]);
        fixturesRepository.getFixturesByDivisionIds.mockResolvedValue([{ id: "f1", division_id: "div-2" }]);
    }

    it("names the not-found condition rather than returning null", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(null);

        await expect(tournamentService.fetchTournamentDetails("tour-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });
        expect(divisionsRepository.getDivisionsByTournamentId).not.toHaveBeenCalled();
    });

    it("groups teams and fixtures by division before formatting", async () => {
        loadable();

        const result = await tournamentService.fetchTournamentDetails("tour-1", "user-1");

        expect(result).toEqual({ creator: true, view: { formatted: true } });
        expect(divisionsRepository.getTeamsByDivisionIds).toHaveBeenCalledWith(["div-1", "div-2"]);

        const [args] = vi.mocked(formatTournamentViewPayload).mock.calls[0];
        expect(args.teamsByDivisionId).toBeInstanceOf(Map);
        expect(args.teamsByDivisionId.get("div-1")).toHaveLength(2);
        expect(args.teamsByDivisionId.get("div-2")).toHaveLength(1);
        expect(args.fixturesByDivisionId.get("div-2")).toHaveLength(1);
    });

    it("does not mark an anonymous viewer as the creator", async () => {
        loadable();

        expect((await tournamentService.fetchTournamentDetails("tour-1")).creator).toBe(false);
    });

    it("does not mark another logged-in user as the creator", async () => {
        loadable();

        expect((await tournamentService.fetchTournamentDetails("tour-1", "user-2")).creator).toBe(false);
    });

    it("lets a repository failure propagate untouched", async () => {
        const failure = new Error("Failed to fetch tournament");
        tournamentRepository.getTournamentById.mockRejectedValue(failure);

        await expect(tournamentService.fetchTournamentDetails("tour-1")).rejects.toBe(failure);
    });
});
