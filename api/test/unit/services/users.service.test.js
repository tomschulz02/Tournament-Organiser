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
const bcrypt = (await import("bcrypt")).default;
const jwt = (await import("jsonwebtoken")).default;

const STORED_USER = {
    id: "user-1",
    username: "tom",
    email: "tom@example.com",
    password: "hashed-password",
    admin: false
};

beforeEach(() => {
    // The service logs the underlying error before rewrapping it.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(userRepository.createUser).mockReset().mockResolvedValue(STORED_USER);
    vi.mocked(userRepository.findUserByEmail).mockReset().mockResolvedValue(STORED_USER);
    vi.mocked(bcrypt.hash).mockReset().mockResolvedValue("hashed-password");
    vi.mocked(bcrypt.compare).mockReset().mockResolvedValue(true);
    vi.mocked(jwt.sign).mockReset().mockReturnValue("signed-token");
});

describe("userService.createUser", () => {
    it("hashes the password, stores the user and returns a session token", async () => {
        const token = await userService.createUser("tom", "tom@example.com", "secret", "secret");

        expect(token).toBe("signed-token");
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
            .rejects.toThrow("PASSWORDS_DO_NOT_MATCH");

        expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it("rejects a missing username, email or password", async () => {
        await expect(userService.createUser("", "tom@example.com", "secret", "secret")).rejects.toThrow("MISSING_FIELDS");
        await expect(userService.createUser("tom", "", "secret", "secret")).rejects.toThrow("MISSING_FIELDS");
        await expect(userService.createUser("tom", "tom@example.com", "", "")).rejects.toThrow("MISSING_FIELDS");
    });

    it("collapses any storage failure into one error", async () => {
        userRepository.createUser.mockRejectedValue(new Error("duplicate key value"));

        await expect(userService.createUser("tom", "tom@example.com", "secret", "secret"))
            .rejects.toThrow("USER_CREATION_ERROR");
    });
});

describe("userService.loginUser", () => {
    it("returns a session token for correct credentials", async () => {
        expect(await userService.loginUser("tom@example.com", "secret")).toBe("signed-token");

        expect(bcrypt.compare).toHaveBeenCalledWith("secret", "hashed-password");
    });

    it("rejects a missing email or password", async () => {
        await expect(userService.loginUser("", "secret")).rejects.toThrow("MISSING_FIELDS");
        await expect(userService.loginUser("tom@example.com", "")).rejects.toThrow("MISSING_FIELDS");
    });

    it("gives the same error for an unknown email and a wrong password", async () => {
        // Distinguishing the two would let an attacker enumerate accounts.
        userRepository.findUserByEmail.mockResolvedValueOnce(null);
        const unknownEmail = await userService.loginUser("nobody@example.com", "secret").catch((err) => err.message);

        bcrypt.compare.mockResolvedValueOnce(false);
        const wrongPassword = await userService.loginUser("tom@example.com", "wrong").catch((err) => err.message);

        expect(unknownEmail).toBe("INVALID_CREDENTIALS");
        expect(wrongPassword).toBe("INVALID_CREDENTIALS");
    });

    it("reports a lookup failure separately from bad credentials", async () => {
        userRepository.findUserByEmail.mockRejectedValue(new Error("LOGIN_ERROR"));

        await expect(userService.loginUser("tom@example.com", "secret")).rejects.toThrow("LOGIN_ERROR");
    });
});
