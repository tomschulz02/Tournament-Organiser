import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { userRepository } = await import("../../../src/repositories/users.repository.js");
const { dbMock, resetDbMock, clientSql, squash } = await import("../../helpers/dbMock.js");

const db = dbMock.instance;
const client = dbMock.client;

beforeEach(() => {
    resetDbMock();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createUser", () => {
    it("commits the insert and returns the new user without its password", async () => {
        client.query.mockResolvedValue({
            rows: [{ id: "user-1", username: "tom", email: "tom@example.com", admin: false }]
        });

        expect(await userRepository.createUser("tom", "tom@example.com", "hashed-password")).toEqual({
            id: "user-1",
            username: "tom",
            email: "tom@example.com",
            admin: false
        });

        expect(clientSql().map(squash)).toEqual([
            "BEGIN",
            "INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email, admin",
            "COMMIT"
        ]);
        // The column order is (username, password, email) and the caller passes a
        // hash as the third argument, so the bindings are deliberately reordered.
        expect(client.query.mock.calls[1][1]).toEqual(["tom", "hashed-password", "tom@example.com"]);
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("rolls back and rethrows the database message", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("INSERT")) throw new Error("duplicate key value violates unique constraint");
            return { rows: [] };
        });

        await expect(userRepository.createUser("tom", "tom@example.com", "hash"))
            .rejects.toThrow("duplicate key value violates unique constraint");
        expect(clientSql()).toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("falls back to a generic code when the failure has no message", async () => {
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("INSERT")) throw new Error("");
            return { rows: [] };
        });

        await expect(userRepository.createUser("tom", "tom@example.com", "hash"))
            .rejects.toThrow("USER_CREATION_ERROR");
    });
});

describe("findUserByEmail", () => {
    it("returns the matching user", async () => {
        db.query.mockResolvedValueOnce([{ id: "user-1", email: "tom@example.com" }]);

        expect(await userRepository.findUserByEmail("tom@example.com"))
            .toEqual({ id: "user-1", email: "tom@example.com" });
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM users WHERE email = $1", ["tom@example.com"]);
    });

    it("returns null when nobody has that email, leaving the caller to decide", async () => {
        db.query.mockResolvedValueOnce([]);

        expect(await userRepository.findUserByEmail("nobody@example.com")).toBeNull();
    });

    it("throws a repository code on failure", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));

        await expect(userRepository.findUserByEmail("tom@example.com")).rejects.toThrow("LOGIN_ERROR");
    });
});

// These five all check `result.success` on the value returned by db.query, which
// is a rows array and has no such property — so in production they always throw.
// test/known-bugs asserts the behaviour they were written to have.
describe.each([
    ["addFriend", ["user-1", "user-2"], "INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)", "ADD_FRIEND_ERROR"],
    ["getFriends", ["user-1"], "SELECT * FROM friends WHERE user_id = $1", "GET_FRIENDS_ERROR"],
    ["joinTournament", ["user-1", "tour-1"], "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES ($1, $2)", "JOIN_TOURNAMENT_ERROR"],
    ["getSavedTournaments", ["user-1"], "SELECT tournament_id FROM saved_tournaments WHERE user_id = $1", "GET_SAVED_TOURNAMENTS_ERROR"],
    ["unfollowTournament", ["user-1", "tour-1"], "DELETE FROM saved_tournaments WHERE user_id = $1 AND tournament_id = $2", "UNFOLLOW_TOURNAMENT_ERROR"]
])("%s", (method, args, expectedSql, errorCode) => {
    it("issues the expected statement", async () => {
        await userRepository[method](...args).catch(() => {});

        expect(db.query).toHaveBeenCalledWith(expectedSql, args);
    });

    it(`throws ${errorCode} even when the statement succeeds`, async () => {
        db.query.mockResolvedValueOnce([]);

        await expect(userRepository[method](...args)).rejects.toThrow(errorCode);
    });

    it("would return the message if the database layer reported success", async () => {
        // Covers the success path, which no real db.query result can reach —
        // db.query resolves rows, never an object carrying `success`.
        db.query.mockResolvedValueOnce({ success: true, message: "done" });

        expect(await userRepository[method](...args)).toBe("done");
    });

    it("rethrows the database message, falling back to a generic code", async () => {
        db.query.mockRejectedValueOnce(new Error("relation does not exist"));
        await expect(userRepository[method](...args)).rejects.toThrow("relation does not exist");

        db.query.mockRejectedValueOnce(new Error(""));
        await expect(userRepository[method](...args)).rejects.toThrow(errorCode);
    });
});
