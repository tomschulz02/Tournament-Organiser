import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { editorsRepository } = await import("../../../src/repositories/editors.repository.js");
const { dbMock, resetDbMock, squash } = await import("../../helpers/dbMock.js");

const db = dbMock.instance;

beforeEach(() => {
    resetDbMock();
});

describe("getEditors", () => {
    it("joins each membership row to its user, oldest first, without the email", async () => {
        const rows = [{ id: "user-2", username: "priya", created_at: "2026-09-24T10:00:00Z" }];
        db.query.mockResolvedValue(rows);

        expect(await editorsRepository.getEditors("t-1")).toBe(rows);

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe(
            "SELECT u.id, u.username, e.created_at FROM tournament_editors e JOIN users u ON u.id = e.user_id WHERE e.tournament_id = $1::uuid ORDER BY e.created_at ASC"
        );
        expect(params).toEqual(["t-1"]);
    });

    it("rethrows with the pg error as cause", async () => {
        const pgError = new Error("boom");
        db.query.mockRejectedValue(pgError);

        const failure = await editorsRepository.getEditors("t-1").catch((err) => err);

        expect(failure.message).toBe("Failed to fetch editors");
        expect(failure.cause).toBe(pgError);
    });
});

describe("isEditor", () => {
    it("is true when a row exists", async () => {
        db.query.mockResolvedValue([{ "?column?": 1 }]);

        expect(await editorsRepository.isEditor("t-1", "user-2")).toBe(true);
        expect(db.query.mock.calls[0][1]).toEqual(["t-1", "user-2"]);
    });

    it("is false when none does", async () => {
        expect(await editorsRepository.isEditor("t-1", "user-2")).toBe(false);
    });

    it("rethrows with the pg error as cause", async () => {
        const pgError = new Error("boom");
        db.query.mockRejectedValue(pgError);

        const failure = await editorsRepository.isEditor("t-1", "user-2").catch((err) => err);

        expect(failure.message).toBe("Failed to check editor");
        expect(failure.cause).toBe(pgError);
    });
});

describe("addEditor", () => {
    it("inserts the membership row", async () => {
        await editorsRepository.addEditor("t-1", "user-2");

        const [sql, params] = db.query.mock.calls[0];
        expect(squash(sql)).toBe("INSERT INTO tournament_editors (tournament_id, user_id) VALUES ($1::uuid, $2::uuid)");
        expect(params).toEqual(["t-1", "user-2"]);
    });

    it("rethrows with the pg error as cause, so a unique violation survives", async () => {
        const pgError = Object.assign(new Error("duplicate"), { code: "23505" });
        db.query.mockRejectedValue(pgError);

        const failure = await editorsRepository.addEditor("t-1", "user-2").catch((err) => err);

        expect(failure.message).toBe("Failed to add editor");
        expect(failure.cause.code).toBe("23505");
    });
});

describe("removeEditor", () => {
    it("reports true when a row was deleted", async () => {
        db.query.mockResolvedValue([{ user_id: "user-2" }]);

        expect(await editorsRepository.removeEditor("t-1", "user-2")).toBe(true);
        expect(squash(db.query.mock.calls[0][0])).toBe(
            "DELETE FROM tournament_editors WHERE tournament_id = $1::uuid AND user_id = $2::uuid RETURNING user_id"
        );
    });

    it("reports false when nothing matched", async () => {
        expect(await editorsRepository.removeEditor("t-1", "user-2")).toBe(false);
    });

    it("rethrows with the pg error as cause", async () => {
        const pgError = new Error("boom");
        db.query.mockRejectedValue(pgError);

        const failure = await editorsRepository.removeEditor("t-1", "user-2").catch((err) => err);

        expect(failure.message).toBe("Failed to remove editor");
        expect(failure.cause).toBe(pgError);
    });
});
