import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/repositories/tournament.repository.js", () => ({
    tournamentRepository: {
        createTournament: vi.fn(),
        getAllTournaments: vi.fn(),
        getTournamentById: vi.fn(),
        startTournament: vi.fn(),
        endTournament: vi.fn(),
        deleteTournament: vi.fn(),
        updateSchedule: vi.fn(),
        getScheduleForUpdate: vi.fn()
    }
}));

// The validator has its own suite, which owns every rejection rule. Here we only
// care that it is handed the right context and that a rejection stops the write.
vi.mock("../../../src/utils/scheduleValidator.js", () => ({
    validateSchedule: vi.fn()
}));

vi.mock("../../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        getDivisionsByTournamentId: vi.fn(),
        getTeamsByIds: vi.fn()
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
const { validateSchedule } = await import("../../../src/utils/scheduleValidator.js");
const { AppError } = await import("../../../src/errors.js");
const { makeDivision, makeState, makeTournament } = await import("../../helpers/fixtures.js");
const { dbMock, resetDbMock, clientSql } = await import("../../helpers/dbMock.js");

beforeEach(() => {
    resetDbMock();
    vi.mocked(tournamentRepository.createTournament).mockReset();
    vi.mocked(tournamentRepository.getAllTournaments).mockReset();
    vi.mocked(tournamentRepository.getTournamentById).mockReset();
    vi.mocked(tournamentRepository.startTournament).mockReset().mockResolvedValue(undefined);
    vi.mocked(tournamentRepository.endTournament).mockReset().mockResolvedValue(undefined);
    vi.mocked(tournamentRepository.deleteTournament).mockReset().mockResolvedValue(undefined);
    vi.mocked(divisionsRepository.getDivisionsByTournamentId).mockReset();
    vi.mocked(divisionsRepository.getTeamsByIds).mockReset();
    vi.mocked(fixturesRepository.getFixturesByDivisionIds).mockReset();
    vi.mocked(divisionService.createDivision).mockReset();
    vi.mocked(formatTournamentViewPayload).mockReset().mockReturnValue({ formatted: true });
    vi.mocked(tournamentRepository.updateSchedule).mockReset().mockResolvedValue(undefined);
    vi.mocked(tournamentRepository.getScheduleForUpdate).mockReset().mockResolvedValue(null);
    vi.mocked(validateSchedule).mockReset();
});

describe("tournamentService.createTournament", () => {
    const payload = {
        details: { name: "Summer Open", location: "Hall", start_date: "2026-08-01", end_date: "2026-08-03" },
        divisions: [{ name: "Division A" }, { name: "Division B" }]
    };

    it("creates the tournament and then every division, on one client in one transaction", async () => {
        tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });
        divisionService.createDivision.mockResolvedValue("div-1");

        expect(await tournamentService.createTournament(payload, "user-1")).toBe("tour-1");

        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
        expect(tournamentRepository.createTournament)
            .toHaveBeenCalledWith(payload.details, "user-1", dbMock.client);
        expect(divisionService.createDivision).toHaveBeenCalledTimes(2);
        expect(divisionService.createDivision)
            .toHaveBeenNthCalledWith(1, { name: "Division A" }, "tour-1", "user-1", dbMock.client);
        expect(divisionService.createDivision)
            .toHaveBeenNthCalledWith(2, { name: "Division B" }, "tour-1", "user-1", dbMock.client);
    });

    it("creates the divisions one at a time, since a single client cannot run concurrent queries", async () => {
        tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });

        let inFlight = 0;
        let overlapped = false;
        divisionService.createDivision.mockImplementation(async () => {
            inFlight += 1;
            if (inFlight > 1) overlapped = true;
            await Promise.resolve();
            inFlight -= 1;
            return "div-1";
        });

        await tournamentService.createTournament(payload, "user-1");

        expect(overlapped).toBe(false);
    });

    it("rolls the whole creation back when a division fails, rather than deleting afterwards", async () => {
        // The compensating delete is gone: the transaction undoes the tournament
        // row for free, and a hand-written undo could itself fail.
        const failure = new Error("division insert failed");
        tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });
        divisionService.createDivision.mockRejectedValue(failure);

        // The original error propagates untouched, so the middleware sees the
        // real cause rather than a code invented here.
        await expect(tournamentService.createTournament(payload, "user-1")).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
        expect(tournamentRepository.deleteTournament).not.toHaveBeenCalled();
    });

    it("surfaces the real failure when the tournament insert is what failed", async () => {
        // This is the case the compensating delete could not cover: there was no
        // id yet, so deleteTournament(0) threw an invalid-uuid error over the top
        // of the error that actually happened.
        const failure = new Error("tournament insert failed");
        tournamentRepository.createTournament.mockRejectedValue(failure);

        await expect(tournamentService.createTournament(payload, "user-1")).rejects.toBe(failure);

        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(divisionService.createDivision).not.toHaveBeenCalled();
        expect(tournamentRepository.deleteTournament).not.toHaveBeenCalled();
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
        // Membership comes from each division's own state.teams; there is no
        // division_id on a team row. See docs/division-state.md.
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue([
            makeDivision({ id: "div-1", state: makeState({ teams: ["t1", "t2"] }) }),
            makeDivision({ id: "div-2", state: makeState({ teams: ["t3"] }) })
        ]);
        divisionsRepository.getTeamsByIds.mockImplementation(async (teamIds) =>
            teamIds.map((id) => ({ id, name: id.toUpperCase() }))
        );
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
        expect(divisionsRepository.getTeamsByIds).toHaveBeenCalledTimes(2);
        expect(divisionsRepository.getTeamsByIds).toHaveBeenNthCalledWith(1, ["t1", "t2"]);
        expect(divisionsRepository.getTeamsByIds).toHaveBeenNthCalledWith(2, ["t3"]);

        const [args] = vi.mocked(formatTournamentViewPayload).mock.calls[0];
        expect(args.teamsByDivisionId).toBeInstanceOf(Map);
        expect(args.teamsByDivisionId.get("div-1")).toHaveLength(2);
        expect(args.teamsByDivisionId.get("div-2")).toHaveLength(1);
        expect(args.fixturesByDivisionId.get("div-2")).toHaveLength(1);
    });

    it("reads state.teams whether the column arrives parsed or as a string", async () => {
        loadable();
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue([
            makeDivision({ id: "div-1", state: JSON.stringify(makeState({ teams: ["t1"] })) }),
            makeDivision({ id: "div-2", state: null })
        ]);

        await tournamentService.fetchTournamentDetails("tour-1", "user-1");

        expect(divisionsRepository.getTeamsByIds).toHaveBeenNthCalledWith(1, ["t1"]);
        expect(divisionsRepository.getTeamsByIds).toHaveBeenNthCalledWith(2, []);
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

// The three lifecycle actions share their ownership check, so it is asserted
// once for each rather than once in total: getting it wrong on any one of them
// lets a signed-in stranger mutate someone else's tournament.
describe.each([
    ["startTournament"],
    ["endTournament"],
    ["deleteTournament"]
])("tournamentService.%s ownership", (method) => {
    it("names the not-found condition rather than reporting zero rows affected", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(null);

        await expect(tournamentService[method]("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });
        expect(tournamentRepository[method]).not.toHaveBeenCalled();
    });

    it("refuses another user, distinguishably from a missing tournament", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Ongoing" }));

        await expect(tournamentService[method]("tour-1", "user-2"))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(tournamentRepository[method]).not.toHaveBeenCalled();
    });
});

describe("tournamentService.startTournament", () => {
    it("starts a tournament that has not started", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Not Started" }));

        expect(await tournamentService.startTournament("tour-1", "user-1"))
            .toEqual({ id: "tour-1", status: "Ongoing" });
        expect(tournamentRepository.startTournament).toHaveBeenCalledWith("tour-1");
    });

    it("treats a null status as Not Started", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: null }));

        await tournamentService.startTournament("tour-1", "user-1");

        expect(tournamentRepository.startTournament).toHaveBeenCalledWith("tour-1");
    });

    it("refuses a second start rather than silently succeeding", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Ongoing" }));

        await expect(tournamentService.startTournament("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_ALREADY_STARTED", status: 409 });
        expect(tournamentRepository.startTournament).not.toHaveBeenCalled();
    });

    it("refuses to restart a finished tournament", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Finished" }));

        await expect(tournamentService.startTournament("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_FINISHED", status: 409 });
    });
});

describe("tournamentService.endTournament", () => {
    it("ends a tournament that is ongoing", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Ongoing" }));

        expect(await tournamentService.endTournament("tour-1", "user-1"))
            .toEqual({ id: "tour-1", status: "Finished" });
        expect(tournamentRepository.endTournament).toHaveBeenCalledWith("tour-1");
    });

    it("refuses to end a tournament that has not started", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Not Started" }));

        await expect(tournamentService.endTournament("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_NOT_STARTED", status: 409 });
        expect(tournamentRepository.endTournament).not.toHaveBeenCalled();
    });

    it("refuses to end a tournament twice", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Finished" }));

        await expect(tournamentService.endTournament("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_FINISHED", status: 409 });
    });
});

describe("tournamentService.updateSchedule", () => {
    const schedule = { version: 1, entries: [{ id: "entry-1" }, { id: "entry-2" }] };

    function owned() {
        tournamentRepository.getTournamentById.mockResolvedValue(
            makeTournament({ created_by: "user-1", start_date: "2026-08-01", end_date: "2026-08-03" })
        );
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue([makeDivision({ id: "div-1" })]);
        fixturesRepository.getFixturesByDivisionIds.mockResolvedValue([{ id: "f1", division_id: "div-1" }]);
    }

    it("names the not-found condition rather than reporting zero rows affected", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(null);

        await expect(tournamentService.updateSchedule("tour-1", "user-1", schedule))
            .rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });
        expect(tournamentRepository.updateSchedule).not.toHaveBeenCalled();
    });

    it("refuses another user, distinguishably from a missing tournament", async () => {
        owned();

        await expect(tournamentService.updateSchedule("tour-1", "user-2", schedule))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(dbMock.instance.withTransaction).not.toHaveBeenCalled();
        expect(tournamentRepository.updateSchedule).not.toHaveBeenCalled();
    });

    it("validates against the tournament's dates, divisions and fixtures, then writes", async () => {
        owned();

        expect(await tournamentService.updateSchedule("tour-1", "user-1", schedule))
            .toEqual({ id: "tour-1", entries: 2 });

        expect(validateSchedule).toHaveBeenCalledWith(schedule, {
            startDate: "2026-08-01",
            endDate: "2026-08-03",
            divisions: [makeDivision({ id: "div-1" })],
            fixtures: [{ id: "f1", division_id: "div-1" }]
        });
        expect(fixturesRepository.getFixturesByDivisionIds).toHaveBeenCalledWith(["div-1"]);
        expect(tournamentRepository.updateSchedule).toHaveBeenCalledWith("tour-1", schedule, dbMock.client);
        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    // The lock comes first on purpose. A division rebuild repairs this column
    // under the same lock, and reading the fixtures before taking it leaves a
    // window where a committed rebuild is invisible to the validation.
    it("takes the row lock before reading the fixtures it validates against", async () => {
        owned();

        await tournamentService.updateSchedule("tour-1", "user-1", schedule);

        expect(tournamentRepository.getScheduleForUpdate).toHaveBeenCalledWith("tour-1", dbMock.client);
        expect(vi.mocked(tournamentRepository.getScheduleForUpdate).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(fixturesRepository.getFixturesByDivisionIds).mock.invocationCallOrder[0]);
        expect(vi.mocked(validateSchedule).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(tournamentRepository.updateSchedule).mock.invocationCallOrder[0]);
    });

    it("rolls back and writes nothing when the validator refuses", async () => {
        owned();
        const refusal = new AppError("SCHEDULE_COURT_CLASH");
        vi.mocked(validateSchedule).mockImplementation(() => { throw refusal; });

        await expect(tournamentService.updateSchedule("tour-1", "user-1", schedule)).rejects.toBe(refusal);

        expect(tournamentRepository.updateSchedule).not.toHaveBeenCalled();
        expect(clientSql()).toEqual(["BEGIN", "ROLLBACK"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    it("counts nothing when the schedule carries no entries", async () => {
        owned();

        expect(await tournamentService.updateSchedule("tour-1", "user-1", { version: 1 }))
            .toEqual({ id: "tour-1", entries: 0 });
    });
});

describe("tournamentService.deleteTournament", () => {
    // Deliberately permitted from every status, including Ongoing — an organiser
    // whose tournament collapsed halfway through still has to be able to remove
    // it. The client is what makes it deliberate rather than silent.
    it.each(["Not Started", "Ongoing", "Finished"])("deletes a %s tournament", async (status) => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status }));

        expect(await tournamentService.deleteTournament("tour-1", "user-1")).toEqual({ id: "tour-1" });
        expect(tournamentRepository.deleteTournament).toHaveBeenCalledWith("tour-1");
    });
});
