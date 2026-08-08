import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/repositories/users.repository.js", () => ({
    userRepository: {
        createUser: vi.fn(),
        findUserByEmail: vi.fn()
    }
}));

vi.mock("bcrypt", () => ({
    default: {
        hash: vi.fn(async () => "hashed-password"),
        compare: vi.fn(async () => true)
    }
}));

vi.mock("jsonwebtoken", () => ({
    default: { sign: vi.fn(() => "signed-token") }
}));

const { userService } = await import("../../../src/services/users.service.js");
const { userRepository } = await import("../../../src/repositories/users.repository.js");
const { AppError } = await import("../../../src/errors.js");
const bcrypt = (await import("bcrypt")).default;
const jwt = (await import("jsonwebtoken")).default;

const STORED_USER = {
    id: "user-1",
    username: "tom",
    email: "tom@example.com",
    password: "hashed-password",
    admin: false
};

// What the repository throws when the insert violates a unique constraint: a
// wrapper carrying the pg error as cause.
function duplicateKeyFailure(constraint) {
    const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
        constraint
    });
    return new Error("Failed to insert user", { cause: pgError });
}

beforeEach(() => {
    vi.mocked(userRepository.createUser).mockReset().mockResolvedValue(STORED_USER);
    vi.mocked(userRepository.findUserByEmail).mockReset().mockResolvedValue(STORED_USER);
    vi.mocked(bcrypt.hash).mockReset().mockResolvedValue("hashed-password");
    vi.mocked(bcrypt.compare).mockReset().mockResolvedValue(true);
    vi.mocked(jwt.sign).mockReset().mockReturnValue("signed-token");
});

describe("userService.createUser", () => {
    it("hashes the password, stores the user and returns a session token with the username", async () => {
        const created = await userService.createUser("tom", "tom@example.com", "secret", "secret");

        expect(created).toEqual({ token: "signed-token", username: "tom" });
        expect(bcrypt.hash).toHaveBeenCalledWith("secret", 10);
        expect(userRepository.createUser).toHaveBeenCalledWith("tom", "tom@example.com", "hashed-password");
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: "user-1", username: "tom", email: "tom@example.com", admin: false },
            "test-jwt-secret",
            { expiresIn: "24h" }
        );
    });

    it("rejects mismatched passwords before touching the database", async () => {
        await expect(userService.createUser("tom", "tom@example.com", "secret", "other"))
            .rejects.toMatchObject({ code: "PASSWORDS_DO_NOT_MATCH", status: 400 });

        expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it("rejects a missing username, email or password", async () => {
        const codeOf = (promise) => promise.catch((err) => err.code);

        expect(await codeOf(userService.createUser("", "tom@example.com", "secret", "secret"))).toBe("MISSING_FIELDS");
        expect(await codeOf(userService.createUser("tom", "", "secret", "secret"))).toBe("MISSING_FIELDS");
        expect(await codeOf(userService.createUser("tom", "tom@example.com", "", ""))).toBe("MISSING_FIELDS");
    });

    it("turns a duplicate email into a 409 that says so", async () => {
        const failure = duplicateKeyFailure("users_email_key");
        userRepository.createUser.mockRejectedValue(failure);

        const err = await userService.createUser("tom", "tom@example.com", "secret", "secret").catch((e) => e);

        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe("EMAIL_ALREADY_REGISTERED");
        expect(err.status).toBe(409);
        expect(err.cause).toBe(failure);
    });

    it("turns a duplicate username into a 409 that says so", async () => {
        userRepository.createUser.mockRejectedValue(duplicateKeyFailure("users_username_key"));

        await expect(userService.createUser("tom", "tom@example.com", "secret", "secret"))
            .rejects.toMatchObject({ code: "USERNAME_TAKEN", status: 409 });
    });

    it("lets an unexpected storage failure propagate untouched, to become a 500", async () => {
        const failure = new Error("connection terminated unexpectedly");
        userRepository.createUser.mockRejectedValue(failure);

        await expect(userService.createUser("tom", "tom@example.com", "secret", "secret")).rejects.toBe(failure);
    });

    it("lets a unique violation on an unrecognised constraint propagate as a fault", async () => {
        // Not a named domain failure, so it must not become a 409 by accident.
        const failure = duplicateKeyFailure("some_other_key");
        userRepository.createUser.mockRejectedValue(failure);

        await expect(userService.createUser("tom", "tom@example.com", "secret", "secret")).rejects.toBe(failure);
    });
});

describe("userService.loginUser", () => {
    it("returns a session token and the username for correct credentials", async () => {
        expect(await userService.loginUser("tom@example.com", "secret")).toEqual({
            token: "signed-token",
            username: "tom"
        });

        expect(bcrypt.compare).toHaveBeenCalledWith("secret", "hashed-password");
    });

    it("rejects a missing email or password", async () => {
        await expect(userService.loginUser("", "secret")).rejects.toMatchObject({ code: "MISSING_FIELDS" });
        await expect(userService.loginUser("tom@example.com", "")).rejects.toMatchObject({ code: "MISSING_FIELDS" });
    });

    it("gives the same error for an unknown email and a wrong password", async () => {
        // Distinguishing the two would let an attacker enumerate accounts.
        userRepository.findUserByEmail.mockResolvedValueOnce(null);
        const unknownEmail = await userService.loginUser("nobody@example.com", "secret").catch((err) => err);

        bcrypt.compare.mockResolvedValueOnce(false);
        const wrongPassword = await userService.loginUser("tom@example.com", "wrong").catch((err) => err);

        expect(unknownEmail.code).toBe("INVALID_CREDENTIALS");
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.code).toBe("INVALID_CREDENTIALS");
        expect(wrongPassword.message).toBe(unknownEmail.message);
    });

    it("lets a lookup failure propagate, so it becomes a 500 rather than a bad-credentials 401", async () => {
        const failure = new Error("Failed to look up user by email");
        userRepository.findUserByEmail.mockRejectedValue(failure);

        await expect(userService.loginUser("tom@example.com", "secret")).rejects.toBe(failure);
    });
});
