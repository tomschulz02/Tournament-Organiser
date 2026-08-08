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
    vi.spyOn(console, "log").mockImplementation(() => {});
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

    it("rethrows the database message, falling back to a generic code", async () => {
        db.query.mockRejectedValueOnce(new Error("null value in column"));
        await expect(tournamentRepository.createTournament(details, "user-1")).rejects.toThrow("null value in column");

        db.query.mockRejectedValueOnce(new Error(""));
        await expect(tournamentRepository.createTournament(details, "user-1")).rejects.toThrow("DATABASE_ERROR");
    });
});

describe("getAllTournaments", () => {
    it("returns every tournament", async () => {
        db.query.mockResolvedValueOnce([{ id: "tour-1" }]);

        expect(await tournamentRepository.getAllTournaments()).toEqual([{ id: "tour-1" }]);
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM tournaments;", []);
    });

    it("returns the failure message rather than throwing", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));

        expect(await tournamentRepository.getAllTournaments()).toBe("connection lost");
    });

    it("falls back to a generic code when the failure has no message", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        expect(await tournamentRepository.getAllTournaments()).toBe("GET_TOURNAMENTS_ERROR");
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

    it("rethrows the database message, falling back to a generic code", async () => {
        db.query.mockRejectedValueOnce(new Error("invalid uuid"));
        await expect(tournamentRepository.getTournamentById("nope")).rejects.toThrow("invalid uuid");

        db.query.mockRejectedValueOnce(new Error(""));
        await expect(tournamentRepository.getTournamentById("nope")).rejects.toThrow("GET_TOURNAMENT_ERROR");
    });
});

// startTournament, endTournament and deleteTournament share a shape: one
// owner-scoped statement inside a transaction, returning the raw pg result and
// swallowing failures into a message string.
describe.each([
    ["startTournament", "UPDATE tournaments SET status = 'Ongoing' WHERE id = $1 AND created_by = $2", "START_TOURNAMENT_ERROR"],
    ["endTournament", "UPDATE tournaments SET status = 'Finished' WHERE id = $1 AND created_by = $2", "END_TOURNAMENT_ERROR"],
    ["deleteTournament", "DELETE FROM tournaments WHERE id = $1 AND created_by = $2", "DELETE_TOURNAMENT_ERROR"]
])("%s", (method, expectedSql, fallbackCode) => {
    it("commits a statement scoped to the owner", async () => {
        client.query.mockResolvedValue({ rows: [], rowCount: 1 });

        expect(await tournamentRepository[method]("tour-1", "user-1")).toEqual({ rows: [], rowCount: 1 });

        expect(clientSql().map(squash)).toEqual(["BEGIN", expectedSql, "COMMIT"]);
        expect(client.query.mock.calls[1][1]).toEqual(["tour-1", "user-1"]);
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("rolls back and returns the failure message", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql === expectedSql) throw new Error("connection lost");
            return { rows: [] };
        });

        expect(await tournamentRepository[method]("tour-1", "user-1")).toBe("connection lost");
        expect(clientSql()).toContain("ROLLBACK");
    });

    it("falls back to a generic code when the failure has no message", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql === expectedSql) throw new Error("");
            return { rows: [] };
        });

        expect(await tournamentRepository[method]("tour-1", "user-1")).toBe(fallbackCode);
    });
});
