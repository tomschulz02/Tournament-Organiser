import { describe, it, expect, beforeEach, vi } from "vitest";

const uuidState = vi.hoisted(() => ({ next: 0 }));

vi.mock("uuid", () => ({ v4: () => `uuid-${++uuidState.next}` }));

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { tournamentRepository } = await import("../../../src/repositories/tournament.repository.js");
const { dbMock, resetDbMock, clientSql, squash } = await import("../../helpers/dbMock.js");

const db = dbMock.instance;
const client = dbMock.client;

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
});

describe("createTournament", () => {
    const details = {
        name: "Summer Open",
        location: "Hall",
        start_date: "2026-08-01",
        end_date: "2026-08-03",
        description: "Open entry"
    };

    it("generates the id in JavaScript and returns it", async () => {
        expect(await tournamentRepository.createTournament(details, "user-1")).toEqual({ tournamentId: "uuid-1" });

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "INSERT INTO tournaments (id, name, location, start_date, end_date, created_by, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id"
        );
        expect(params).toEqual(["uuid-1", "Summer Open", "Hall", "2026-08-01", "2026-08-03", "user-1", "Open entry"]);
    });

    it("joins the caller's transaction when given a client", async () => {
        await tournamentRepository.createTournament(details, "user-1", client);

        expect(client.query).toHaveBeenCalledOnce();
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("null value in column");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.createTournament(details, "user-1").catch((err) => err);

        expect(failure.message).toBe("Failed to create tournament");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getAllTournaments", () => {
    it("returns every tournament", async () => {
        db.query.mockResolvedValueOnce([{ id: "tour-1" }]);

        expect(await tournamentRepository.getAllTournaments()).toEqual([{ id: "tour-1" }]);
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM tournaments;", []);
    });

    it("throws rather than returning an error string, keeping the cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.getAllTournaments().catch((err) => err);

        expect(failure.message).toBe("Failed to fetch tournaments");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getTournamentById", () => {
    it("returns the first matching row", async () => {
        db.query.mockResolvedValueOnce([{ id: "tour-1" }]);

        expect(await tournamentRepository.getTournamentById("tour-1")).toEqual({ id: "tour-1" });
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM tournaments WHERE id = $1 LIMIT 1;", ["tour-1"]);
    });

    it("returns null when there is no such tournament", async () => {
        db.query.mockResolvedValueOnce([]);

        expect(await tournamentRepository.getTournamentById("tour-1")).toBeNull();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("invalid uuid");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.getTournamentById("nope").catch((err) => err);

        expect(failure.message).toBe("Failed to fetch tournament");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getTournamentsByCreator", () => {
    it("selects the card columns for one creator, newest start date first", async () => {
        db.query.mockResolvedValueOnce([{ id: "tour-1" }]);

        expect(await tournamentRepository.getTournamentsByCreator("user-1")).toEqual([{ id: "tour-1" }]);
        expect(squash(db.query.mock.calls[0][0])).toBe(
            "SELECT id, name, start_date, end_date, location, description, status, created_by FROM tournaments WHERE created_by = $1 ORDER BY start_date DESC"
        );
        expect(db.query.mock.calls[0][1]).toEqual(["user-1"]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.getTournamentsByCreator("user-1").catch((err) => err);

        expect(failure.message).toBe("Failed to fetch tournaments by creator");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getTournamentsByIds", () => {
    it("returns an empty list without querying when given no ids", async () => {
        expect(await tournamentRepository.getTournamentsByIds([])).toEqual([]);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("selects the card columns for the given ids, newest start date first", async () => {
        db.query.mockResolvedValueOnce([{ id: "tour-1" }, { id: "tour-2" }]);

        expect(await tournamentRepository.getTournamentsByIds(["tour-1", "tour-2"]))
            .toEqual([{ id: "tour-1" }, { id: "tour-2" }]);
        expect(squash(db.query.mock.calls[0][0])).toBe(
            "SELECT id, name, start_date, end_date, location, description, status, created_by FROM tournaments WHERE id = ANY($1::uuid[]) ORDER BY start_date DESC"
        );
        expect(db.query.mock.calls[0][1]).toEqual([["tour-1", "tour-2"]]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.getTournamentsByIds(["tour-1"]).catch((err) => err);

        expect(failure.message).toBe("Failed to fetch tournaments by id");
        expect(failure.cause).toBe(underlying);
    });
});

describe("updateSchedule", () => {
    it("writes the schedule to the tournament's own column", async () => {
        expect(await tournamentRepository.updateSchedule("tour-1", { slots: [] }))
            .toEqual({ message: "Schedule updated" });

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe("UPDATE tournaments SET schedule = $1::jsonb WHERE id = $2::uuid");
        expect(params).toEqual(['{"slots":[]}', "tour-1"]);
    });

    // A division rebuild repairs the schedule inside the transaction that
    // deleted the fixtures it referenced.
    it("joins the caller's transaction when given a client", async () => {
        await tournamentRepository.updateSchedule("tour-1", { slots: [] }, client);

        expect(client.query).toHaveBeenCalledOnce();
        expect(db.query).not.toHaveBeenCalled();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.updateSchedule("tour-1", {}).catch((err) => err);

        expect(failure.message).toBe("Failed to update schedule");
        expect(failure.cause).toBe(underlying);
    });
});

// The read half of the schedule repair. Takes the client rather than defaulting
// to the pool, for the same reason as divisions' getStateForUpdate: a lock taken
// outside the transaction that does the write achieves nothing.
describe("getScheduleForUpdate", () => {
    it("reads the schedule and locks the row", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ schedule: { entries: [] } }], rowCount: 1 });

        expect(await tournamentRepository.getScheduleForUpdate("tour-1", client)).toEqual({ entries: [] });

        const [sql, params] = client.query.mock.calls[0];
        expect(squash(sql)).toBe("SELECT schedule FROM tournaments WHERE id = $1::uuid FOR UPDATE");
        expect(params).toEqual(["tour-1"]);
    });

    it("returns null when the tournament does not exist", async () => {
        client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        expect(await tournamentRepository.getScheduleForUpdate("missing", client)).toBeNull();
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        client.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository.getScheduleForUpdate("tour-1", client).catch((err) => err);

        expect(failure.message).toBe("Failed to fetch schedule");
        expect(failure.cause).toBe(underlying);
    });
});

// startTournament, endTournament and deleteTournament share a shape: one
// statement, no transaction, and no created_by filter. Ownership is checked in
// the service, so that a missing tournament and someone else's tournament can
// produce different statuses rather than the same zero rows affected.
describe.each([
    ["startTournament", "UPDATE tournaments SET status = 'Ongoing' WHERE id = $1", "Failed to start tournament", "Tournament started"],
    ["endTournament", "UPDATE tournaments SET status = 'Finished' WHERE id = $1", "Failed to end tournament", "Tournament ended"],
    ["deleteTournament", "DELETE FROM tournaments WHERE id = $1", "Failed to delete tournament", "Tournament deleted"]
])("%s", (method, expectedSql, expectedMessage, successMessage) => {
    it("runs one statement keyed on the id alone", async () => {
        expect(await tournamentRepository[method]("tour-1")).toEqual({ message: successMessage });

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(expectedSql);
        expect(params).toEqual(["tour-1"]);
        // No transaction: a single statement is already atomic.
        expect(clientSql()).toEqual([]);
    });

    it("throws, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await tournamentRepository[method]("tour-1").catch((err) => err);

        expect(failure.message).toBe(expectedMessage);
        expect(failure.cause).toBe(underlying);
    });
});
