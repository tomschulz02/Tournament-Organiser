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
        getTournamentsByCreator: vi.fn(),
        getTournamentsByIds: vi.fn(),
        startTournament: vi.fn(),
        endTournament: vi.fn(),
        deleteTournament: vi.fn(),
        updateSchedule: vi.fn(),
        getScheduleForUpdate: vi.fn()
    }
}));

vi.mock("../../../src/repositories/users.repository.js", () => ({
    userRepository: {
        getSavedTournaments: vi.fn(),
        joinTournament: vi.fn(),
        unfollowTournament: vi.fn()
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
const { userRepository } = await import("../../../src/repositories/users.repository.js");
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
    vi.mocked(tournamentRepository.getTournamentsByCreator).mockReset();
    vi.mocked(tournamentRepository.getTournamentsByIds).mockReset();
    vi.mocked(userRepository.getSavedTournaments).mockReset();
    vi.mocked(userRepository.joinTournament).mockReset().mockResolvedValue(undefined);
    vi.mocked(userRepository.unfollowTournament).mockReset().mockResolvedValue(undefined);
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

    // Validation runs before the transaction opens, so a rejected field never
    // reaches Postgres and no connection is taken for a request that cannot work.
    describe("input validation", () => {
        function withDetails(overrides) {
            return { ...payload, details: { ...payload.details, ...overrides } };
        }

        // location is varchar(50). A 200-character one used to reach the column
        // and come back as a 500 that named nothing.
        it("refuses an oversized location with a 400 naming the field", async () => {
            await expect(tournamentService.createTournament(withDetails({ location: "a".repeat(200) }), "user-1"))
                .rejects.toMatchObject({
                    code: "FIELD_TOO_LONG",
                    status: 400,
                    details: { field: "location", max: 50, length: 200 }
                });

            expect(clientSql()).toEqual([]);
            expect(tournamentRepository.createTournament).not.toHaveBeenCalled();
        });

        it.each([
            ["name", { name: "a".repeat(101) }, 100],
            ["description", { description: "a".repeat(2001) }, 2000]
        ])("refuses an oversized %s, which the schema does not bound", async (field, overrides, max) => {
            await expect(tournamentService.createTournament(withDetails(overrides), "user-1"))
                .rejects.toMatchObject({ code: "FIELD_TOO_LONG", details: { field, max } });
        });

        it.each([
            ["name", { name: undefined }],
            ["location", { location: undefined }]
        ])("refuses a missing %s, naming it", async (field, overrides) => {
            await expect(tournamentService.createTournament(withDetails(overrides), "user-1"))
                .rejects.toMatchObject({ code: "MISSING_FIELDS", status: 400, details: { field } });
        });

        it("refuses a name that is not a string", async () => {
            await expect(tournamentService.createTournament(withDetails({ name: 42 }), "user-1"))
                .rejects.toMatchObject({ code: "FIELD_INVALID", status: 400, details: { field: "name" } });
        });

        it("accepts a payload with no description at all", async () => {
            tournamentRepository.createTournament.mockResolvedValue({ tournamentId: "tour-1" });

            await expect(tournamentService.createTournament(payload, "user-1")).resolves.toBe("tour-1");
        });

        it("refuses a payload with no details, rather than throwing a TypeError", async () => {
            await expect(tournamentService.createTournament({ divisions: [] }, "user-1"))
                .rejects.toMatchObject({ code: "MISSING_FIELDS", details: { field: "details" } });
        });
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
            start_date: "2026-08-01",
            end_date: "2026-08-03",
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
        expect(grouped.upcoming[0].end_date).toBe("2026-08-03");
    });

    it("drops a tournament whose status is not one it recognises", async () => {
        tournamentRepository.getAllTournaments.mockResolvedValue([row({ status: "Abandoned" })]);

        expect(await tournamentService.fetchTournaments()).toEqual({ upcoming: [], ongoing: [], completed: [] });
    });

    // Was bug 4. The loop used `break` where it meant `continue`, so one row with
    // no status hid every tournament after it.
    it("skips only the tournament with no status", async () => {
        tournamentRepository.getAllTournaments.mockResolvedValue([
            row({ id: "a", status: "Ongoing" }),
            row({ id: "null-row", status: null }),
            row({ id: "b", status: "Ongoing" })
        ]);

        const grouped = await tournamentService.fetchTournaments();

        expect(grouped.ongoing.map((entry) => entry.id)).toEqual(["a", "b"]);
        expect([...grouped.upcoming, ...grouped.completed]).toEqual([]);
    });

    it("lets a repository failure propagate untouched", async () => {
        const failure = new Error("Failed to fetch tournaments");
        tournamentRepository.getAllTournaments.mockRejectedValue(failure);

        await expect(tournamentService.fetchTournaments()).rejects.toBe(failure);
    });
});

describe("tournamentService.getMyTournaments", () => {
    it("formats the dates on the creator's own tournaments", async () => {
        tournamentRepository.getTournamentsByCreator.mockResolvedValue([
            { id: "tour-1", start_date: "2026-08-01", end_date: "2026-08-03" }
        ]);

        const result = await tournamentService.getMyTournaments("user-1");

        expect(tournamentRepository.getTournamentsByCreator).toHaveBeenCalledWith("user-1");
        expect(result).toEqual([{ id: "tour-1", start_date: "1 August 2026", end_date: "2026-08-03" }]);
    });

    it("returns an empty list rather than an error when the caller has created nothing", async () => {
        tournamentRepository.getTournamentsByCreator.mockResolvedValue([]);

        expect(await tournamentService.getMyTournaments("user-1")).toEqual([]);
    });

    it("lets a repository failure propagate untouched", async () => {
        const failure = new Error("connection lost");
        tournamentRepository.getTournamentsByCreator.mockRejectedValue(failure);

        await expect(tournamentService.getMyTournaments("user-1")).rejects.toBe(failure);
    });
});

describe("tournamentService.getSavedTournaments", () => {
    it("resolves the saved ids into tournaments and formats the dates", async () => {
        userRepository.getSavedTournaments.mockResolvedValue([{ tournament_id: "tour-1" }, { tournament_id: "tour-2" }]);
        tournamentRepository.getTournamentsByIds.mockResolvedValue([
            { id: "tour-1", start_date: "2026-08-01", end_date: "2026-08-03" },
            { id: "tour-2", start_date: "2026-09-01", end_date: "2026-09-03" }
        ]);

        const result = await tournamentService.getSavedTournaments("user-1");

        expect(tournamentRepository.getTournamentsByIds).toHaveBeenCalledWith(["tour-1", "tour-2"]);
        expect(result.map((t) => t.id)).toEqual(["tour-1", "tour-2"]);
        expect(result[0].start_date).toBe("1 August 2026");
    });

    it("returns an empty list rather than an error when nothing is saved", async () => {
        userRepository.getSavedTournaments.mockResolvedValue([]);
        tournamentRepository.getTournamentsByIds.mockResolvedValue([]);

        expect(await tournamentService.getSavedTournaments("user-1")).toEqual([]);
        expect(tournamentRepository.getTournamentsByIds).toHaveBeenCalledWith([]);
    });

    it("lets a repository failure propagate untouched", async () => {
        const failure = new Error("connection lost");
        userRepository.getSavedTournaments.mockRejectedValue(failure);

        await expect(tournamentService.getSavedTournaments("user-1")).rejects.toBe(failure);
    });
});

describe("tournamentService.saveTournament", () => {
    it("names the not-found condition rather than saving a row for nothing", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(null);

        await expect(tournamentService.saveTournament("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });
        expect(userRepository.joinTournament).not.toHaveBeenCalled();
    });

    it("saves a tournament that is not already saved", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(makeTournament({ id: "tour-1", created_by: "user-1" }));
        userRepository.getSavedTournaments.mockResolvedValue([{ tournament_id: "tour-9" }]);

        await tournamentService.saveTournament("tour-1", "user-2");

        expect(userRepository.joinTournament).toHaveBeenCalledWith("user-2", "tour-1");
    });

    // saved_tournaments has no unique constraint (docs/known-limitations.md), so
    // this app-level check is what stops a second row for the same pair.
    it("no-ops on an already-saved tournament rather than inserting a duplicate", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(makeTournament({ id: "tour-1", created_by: "user-1" }));
        userRepository.getSavedTournaments.mockResolvedValue([{ tournament_id: "tour-1" }]);

        await tournamentService.saveTournament("tour-1", "user-2");

        expect(userRepository.joinTournament).not.toHaveBeenCalled();
    });

    // The organiser's own tournament already appears on their profile as a
    // created tournament, so saving it too would just double the card up.
    it("refuses the tournament's own creator", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(makeTournament({ id: "tour-1", created_by: "user-1" }));

        await expect(tournamentService.saveTournament("tour-1", "user-1"))
            .rejects.toMatchObject({ code: "CANNOT_SAVE_OWN_TOURNAMENT", status: 409 });
        expect(userRepository.getSavedTournaments).not.toHaveBeenCalled();
        expect(userRepository.joinTournament).not.toHaveBeenCalled();
    });

    it("permits a different signed-in user to save it", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(makeTournament({ id: "tour-1", created_by: "user-1" }));
        userRepository.getSavedTournaments.mockResolvedValue([]);

        await expect(tournamentService.saveTournament("tour-1", "user-2")).resolves.toBeUndefined();
        expect(userRepository.joinTournament).toHaveBeenCalledWith("user-2", "tour-1");
    });
});

describe("tournamentService.unsaveTournament", () => {
    // A DELETE matching zero rows is already a legal no-op, so this needs no
    // existence check of its own.
    it("unsaves without checking whether the tournament was saved", async () => {
        await tournamentService.unsaveTournament("tour-1", "user-1");

        expect(userRepository.unfollowTournament).toHaveBeenCalledWith("user-1", "tour-1");
        expect(tournamentRepository.getTournamentById).not.toHaveBeenCalled();
    });

    it("lets a repository failure propagate untouched", async () => {
        const failure = new Error("connection lost");
        userRepository.unfollowTournament.mockRejectedValue(failure);

        await expect(tournamentService.unsaveTournament("tour-1", "user-1")).rejects.toBe(failure);
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

        // changeKey is the ETag's data half, derived from rows already loaded.
        // The fixtures carry no last_update, so it is null here; buildChangeKey
        // is tested directly in test/unit/utils/etag.test.js.
        expect(result).toEqual({ creator: true, changeKey: null, view: { formatted: true } });
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
        divisionsRepository.getTeamsByIds.mockResolvedValue([]);
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

    it("validates against the tournament's dates, divisions, fixtures and teams, then writes", async () => {
        owned();

        expect(await tournamentService.updateSchedule("tour-1", "user-1", schedule))
            .toEqual({ id: "tour-1", entries: 2 });

        expect(validateSchedule).toHaveBeenCalledWith(schedule, {
            startDate: "2026-08-01",
            endDate: "2026-08-03",
            divisions: [makeDivision({ id: "div-1" })],
            fixtures: [{ id: "f1", division_id: "div-1" }],
            teamsByDivisionId: new Map([["div-1", []]])
        });
        expect(fixturesRepository.getFixturesByDivisionIds).toHaveBeenCalledWith(["div-1"]);
        expect(tournamentRepository.updateSchedule).toHaveBeenCalledWith("tour-1", schedule, dbMock.client);
        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    // The officials rule needs team names, so each division's teams are resolved
    // from its own state.teams and handed to the validator keyed by division.
    it("resolves each division's teams and passes them to the validator", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(
            makeTournament({ created_by: "user-1", start_date: "2026-08-01", end_date: "2026-08-03" })
        );
        divisionsRepository.getDivisionsByTournamentId.mockResolvedValue([
            makeDivision({ id: "div-1", state: makeState({ teams: ["t1", "t2"] }) })
        ]);
        fixturesRepository.getFixturesByDivisionIds.mockResolvedValue([]);
        divisionsRepository.getTeamsByIds.mockResolvedValue([{ id: "t1", name: "Team 1", division_id: "div-1" }]);

        await tournamentService.updateSchedule("tour-1", "user-1", schedule);

        expect(divisionsRepository.getTeamsByIds).toHaveBeenCalledWith(["t1", "t2"]);
        expect(validateSchedule).toHaveBeenCalledWith(
            schedule,
            expect.objectContaining({
                teamsByDivisionId: new Map([["div-1", [{ id: "t1", name: "Team 1", division_id: "div-1" }]]])
            })
        );
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

describe("tournamentService.addDivision", () => {
    const division = {
        name: "Division B",
        type: "classic",
        num_teams: 2,
        teams: [{ name: "Aces" }, { name: "Bears" }]
    };

    // The whole point of the function: it delegates to the same createDivision
    // createTournament calls, so a division added afterwards is indistinguishable
    // from one created with the tournament.
    it("creates the division through divisionService, inside a transaction", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Not Started" }));
        divisionService.createDivision.mockResolvedValue("div-9");

        expect(await tournamentService.addDivision("tour-1", "user-1", division)).toBe("div-9");

        expect(clientSql()).toEqual(["BEGIN", "COMMIT"]);
        expect(dbMock.client.release).toHaveBeenCalledOnce();
    });

    // createDivision writes three tables and has to do it on the transaction's
    // client; the default connection would commit each write on its own.
    it("hands createDivision the transaction's client, not the default connection", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: "Not Started" }));
        divisionService.createDivision.mockResolvedValue("div-9");

        await tournamentService.addDivision("tour-1", "user-1", division);

        expect(divisionService.createDivision)
            .toHaveBeenCalledWith(division, "tour-1", "user-1", dbMock.client);
    });

    it("treats a null status as Not Started", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status: null }));
        divisionService.createDivision.mockResolvedValue("div-9");

        await tournamentService.addDivision("tour-1", "user-1", division);

        expect(divisionService.createDivision).toHaveBeenCalledOnce();
    });

    it("refuses an unknown tournament", async () => {
        tournamentRepository.getTournamentById.mockResolvedValue(null);

        await expect(tournamentService.addDivision("tour-1", "user-1", division))
            .rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });
        expect(divisionService.createDivision).not.toHaveBeenCalled();
    });

    it("refuses a tournament belonging to somebody else", async () => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-2", status: "Not Started" }));

        await expect(tournamentService.addDivision("tour-1", "user-1", division))
            .rejects.toMatchObject({ code: "NOT_TOURNAMENT_OWNER", status: 403 });
        expect(divisionService.createDivision).not.toHaveBeenCalled();
    });

    // A division added mid-tournament would change what the saved schedule and
    // the standings are describing.
    it.each(["Ongoing", "Finished"])("refuses to add to a %s tournament", async (status) => {
        tournamentRepository.getTournamentById
            .mockResolvedValue(makeTournament({ created_by: "user-1", status }));

        await expect(tournamentService.addDivision("tour-1", "user-1", division))
            .rejects.toMatchObject({ code: "TOURNAMENT_ALREADY_STARTED", status: 409 });
        expect(clientSql()).toEqual([]);
        expect(divisionService.createDivision).not.toHaveBeenCalled();
    });
});
