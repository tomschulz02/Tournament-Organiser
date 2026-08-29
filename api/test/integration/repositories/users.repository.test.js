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

    it("rolls back and rethrows, keeping the pg error as cause", async () => {
        // The cause is what lets the service tell a duplicate email from a fault.
        // Stringifying it here is what used to make a duplicate email a 500.
        const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
            code: "23505",
            constraint: "users_email_key"
        });
        client.query.mockImplementation(async (sql) => {
            if (sql.startsWith("INSERT")) throw pgError;
            return { rows: [] };
        });

        const failure = await userRepository.createUser("tom", "tom@example.com", "hash").catch((err) => err);

        expect(failure.cause).toBe(pgError);
        expect(failure.cause.code).toBe("23505");
        expect(failure.cause.constraint).toBe("users_email_key");
        expect(clientSql()).toContain("ROLLBACK");
        expect(client.release).toHaveBeenCalledOnce();
    });
});

describe("findUserByEmailOrUsername", () => {
    it("returns the matching user", async () => {
        db.query.mockResolvedValueOnce([{ id: "user-1", email: "tom@example.com" }]);

        expect(await userRepository.findUserByEmailOrUsername("tom@example.com"))
            .toEqual({ id: "user-1", email: "tom@example.com" });
        expect(db.query).toHaveBeenCalledWith(
            "SELECT * FROM users WHERE email = $1 OR username = $1",
            ["tom@example.com"]
        );
    });

    it("returns null when nobody matches, leaving the caller to decide", async () => {
        db.query.mockResolvedValueOnce([]);

        expect(await userRepository.findUserByEmailOrUsername("nobody@example.com")).toBeNull();
    });

    it("throws on failure, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await userRepository.findUserByEmailOrUsername("tom@example.com").catch((err) => err);

        expect(failure.message).toBe("Failed to look up user by email");
        expect(failure.cause).toBe(underlying);
    });
});

describe("getUserById", () => {
    it("returns the matching user", async () => {
        db.query.mockResolvedValueOnce([{ id: "user-1", email: "tom@example.com" }]);

        expect(await userRepository.getUserById("user-1")).toEqual({ id: "user-1", email: "tom@example.com" });
        expect(db.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", ["user-1"]);
    });

    it("returns null when nobody has that id", async () => {
        db.query.mockResolvedValueOnce([]);

        expect(await userRepository.getUserById("nobody")).toBeNull();
    });

    it("throws on failure, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await userRepository.getUserById("user-1").catch((err) => err);

        expect(failure.message).toBe("Failed to look up user by id");
        expect(failure.cause).toBe(underlying);
    });
});

describe("updatePassword", () => {
    it("issues the update statement", async () => {
        db.query.mockResolvedValueOnce([]);

        await userRepository.updatePassword("user-1", "new-hash");

        expect(db.query).toHaveBeenCalledWith("UPDATE users SET password = $1 WHERE id = $2", [
            "new-hash",
            "user-1"
        ]);
    });

    it("throws on failure, keeping the underlying error as cause", async () => {
        const underlying = new Error("connection lost");
        db.query.mockRejectedValueOnce(underlying);

        const failure = await userRepository.updatePassword("user-1", "new-hash").catch((err) => err);

        expect(failure.message).toBe("Failed to update password");
        expect(failure.cause).toBe(underlying);
    });
});

// These two still check `result.success` on the value returned by db.query,
// which is a rows array and has no such property — so in production they
// always throw. test/known-bugs asserts the behaviour they were written to
// have; both are deferred until the friends feature is built.
describe.each([
    ["addFriend", ["user-1", "user-2"], "INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)", "ADD_FRIEND_ERROR"],
    ["getFriends", ["user-1"], "SELECT * FROM friends WHERE user_id = $1", "GET_FRIENDS_ERROR"]
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

// joinTournament, getSavedTournaments and unfollowTournament used to share the
// same broken `result.success` guard as addFriend/getFriends above (known-bug
// 10). Fixed for the Profile page: each now resolves what db.query produces,
// the same shape findUserByEmailOrUsername's tests above assert.
describe("joinTournament", () => {
    it("resolves the rows db.query produced", async () => {
        const rows = [{ user_id: "user-1", tournament_id: "tour-1" }];
        db.query.mockResolvedValueOnce(rows);

        expect(await userRepository.joinTournament("user-1", "tour-1")).toBe(rows);
        expect(db.query).toHaveBeenCalledWith(
            "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES ($1, $2)",
            ["user-1", "tour-1"]
        );
    });

    it("throws on failure, keeping the underlying message", async () => {
        db.query.mockRejectedValueOnce(new Error("duplicate key value"));

        await expect(userRepository.joinTournament("user-1", "tour-1")).rejects.toThrow("duplicate key value");
    });

    it("falls back to a generic message when the underlying error carries none", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        await expect(userRepository.joinTournament("user-1", "tour-1")).rejects.toThrow("JOIN_TOURNAMENT_ERROR");
    });
});

describe("getSavedTournaments", () => {
    it("resolves the rows db.query produced", async () => {
        const rows = [{ tournament_id: "tour-1" }, { tournament_id: "tour-2" }];
        db.query.mockResolvedValueOnce(rows);

        expect(await userRepository.getSavedTournaments("user-1")).toBe(rows);
        expect(db.query).toHaveBeenCalledWith(
            "SELECT tournament_id FROM saved_tournaments WHERE user_id = $1",
            ["user-1"]
        );
    });

    it("throws on failure, keeping the underlying message", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));

        await expect(userRepository.getSavedTournaments("user-1")).rejects.toThrow("connection lost");
    });

    it("falls back to a generic message when the underlying error carries none", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        await expect(userRepository.getSavedTournaments("user-1")).rejects.toThrow("GET_SAVED_TOURNAMENTS_ERROR");
    });
});

describe("unfollowTournament", () => {
    it("resolves the rows db.query produced", async () => {
        const rows = [];
        db.query.mockResolvedValueOnce(rows);

        expect(await userRepository.unfollowTournament("user-1", "tour-1")).toBe(rows);
        expect(db.query).toHaveBeenCalledWith(
            "DELETE FROM saved_tournaments WHERE user_id = $1 AND tournament_id = $2",
            ["user-1", "tour-1"]
        );
    });

    it("throws on failure, keeping the underlying message", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));

        await expect(userRepository.unfollowTournament("user-1", "tour-1")).rejects.toThrow("connection lost");
    });

    it("falls back to a generic message when the underlying error carries none", async () => {
        db.query.mockRejectedValueOnce(new Error(""));

        await expect(userRepository.unfollowTournament("user-1", "tour-1")).rejects.toThrow("UNFOLLOW_TOURNAMENT_ERROR");
    });
});
