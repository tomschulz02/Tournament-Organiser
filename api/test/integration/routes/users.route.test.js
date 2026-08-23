import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/users.service.js", () => ({
    userService: { createUser: vi.fn(), loginUser: vi.fn() }
}));

vi.mock("../../../src/services/tournaments.service.js", () => ({
    tournamentService: { getMyTournaments: vi.fn(), getSavedTournaments: vi.fn() }
}));

const app = (await import("../../../src/app.js")).default;
const { userService } = await import("../../../src/services/users.service.js");
const { tournamentService } = await import("../../../src/services/tournaments.service.js");
const { AppError } = await import("../../../src/errors.js");
const { authCookie } = await import("../../helpers/auth.js");
const { resetAuthLimiter, AUTH_MAX_ATTEMPTS } = await import("../../../src/middleware/rateLimit.js");

beforeEach(() => {
    vi.mocked(userService.createUser).mockReset();
    vi.mocked(userService.loginUser).mockReset();
    vi.mocked(tournamentService.getMyTournaments).mockReset();
    vi.mocked(tournamentService.getSavedTournaments).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Signup and login are rate limited per IP, and every test here comes from
    // the same one. Without this the file spends its own budget and later cases
    // get a 429 instead of the response they are asserting.
    resetAuthLimiter();
});

describe("auth rate limiting", () => {
    const login = { email: "tom@example.com", password: "secret" };

    async function attemptLogin() {
        return await request(app).post("/api/users/login").send(login);
    }

    it(`allows ${AUTH_MAX_ATTEMPTS} attempts and refuses the next one`, async () => {
        userService.loginUser.mockResolvedValue({ token: "signed-token", username: "tom" });

        for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt += 1) {
            expect((await attemptLogin()).status).toBe(200);
        }

        expect((await attemptLogin()).status).toBe(429);
    });

    // A bare rejection from the middleware would be the only response in the
    // application not wearing the envelope.
    it("returns the 429 in the standard envelope", async () => {
        userService.loginUser.mockRejectedValue(new AppError("INVALID_CREDENTIALS"));

        for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt += 1) {
            await attemptLogin();
        }
        const response = await attemptLogin();

        expect(response.status).toBe(429);
        expect(response.body).toEqual({
            success: false,
            message: "Too many attempts. Please wait a minute and try again",
            data: null
        });
    });

    it("stops calling the service once the limit is reached", async () => {
        userService.loginUser.mockRejectedValue(new AppError("INVALID_CREDENTIALS"));

        for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS + 3; attempt += 1) {
            await attemptLogin();
        }

        expect(userService.loginUser).toHaveBeenCalledTimes(AUTH_MAX_ATTEMPTS);
    });

    it("counts signup against the same budget as login", async () => {
        userService.loginUser.mockResolvedValue({ token: "signed-token", username: "tom" });
        userService.createUser.mockResolvedValue({ token: "signed-token", username: "tom" });

        for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt += 1) {
            await attemptLogin();
        }

        const signup = await request(app).post("/api/users/signup")
            .send({ username: "tom", email: "tom@example.com", password: "secret", confirmPassword: "secret" });

        expect(signup.status).toBe(429);
    });

    it("leaves an unthrottled endpoint alone", async () => {
        for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS + 2; attempt += 1) {
            await request(app).get("/api/users/check-login");
        }

        expect((await request(app).get("/api/users/check-login")).status).toBe(200);
    });

    it("advertises the limit in RateLimit headers, not the obsolete X-RateLimit ones", async () => {
        userService.loginUser.mockResolvedValue({ token: "signed-token", username: "tom" });

        const response = await attemptLogin();

        expect(response.headers["ratelimit-policy"]).toBeDefined();
        expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
    });
});

describe("POST /api/users/signup", () => {
    const body = { username: "tom", email: "tom@example.com", password: "secret", confirmPassword: "secret" };

    it("creates the account and issues an httpOnly session cookie", async () => {
        userService.createUser.mockResolvedValue({ token: "signed-token", username: "tom" });

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            success: true,
            message: "User registered successfully",
            data: { username: "tom" }
        });

        const [cookie] = response.headers["set-cookie"];
        expect(cookie).toContain("token=signed-token");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Path=/");
        expect(cookie).toContain("Max-Age=86400");
        expect(cookie).toContain("SameSite=Lax");
    });

    it("rejects mismatched passwords with 400", async () => {
        userService.createUser.mockRejectedValue(new AppError("PASSWORDS_DO_NOT_MATCH"));

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ success: false, message: "Passwords do not match", data: null });
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("rejects an incomplete body with 400", async () => {
        userService.createUser.mockRejectedValue(new AppError("MISSING_FIELDS"));

        expect((await request(app).post("/api/users/signup").send({})).status).toBe(400);
    });

    // The wire shape the client codes against. The message is static by
    // contract, so which field was wrong has to travel in `data`.
    it("names the offending field in data when one is too long", async () => {
        userService.createUser.mockRejectedValue(
            new AppError("FIELD_TOO_LONG", { details: { field: "username", max: 100, length: 101 } })
        );

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            message: "One of the fields is too long",
            data: { field: "username", max: 100, length: 101 }
        });
    });

    it("reports an already-registered email as 409, not a fault", async () => {
        userService.createUser.mockRejectedValue(new AppError("EMAIL_ALREADY_REGISTERED"));

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ success: false, message: "That email is already registered", data: null });
    });

    it("hides an unexpected storage failure behind a generic 500", async () => {
        userService.createUser.mockRejectedValue(new Error("connection terminated unexpectedly"));

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, message: "Internal server error", data: null });
    });
});

describe("POST /api/users/login", () => {
    const body = { email: "tom@example.com", password: "secret" };

    it("issues a session cookie and returns the username", async () => {
        userService.loginUser.mockResolvedValue({ token: "signed-token", username: "tom" });

        const response = await request(app).post("/api/users/login").send(body);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "Login successful",
            data: { username: "tom" }
        });
        expect(response.headers["set-cookie"][0]).toContain("token=signed-token");
    });

    it("rejects an incomplete body with 400", async () => {
        userService.loginUser.mockRejectedValue(new AppError("MISSING_FIELDS"));

        expect((await request(app).post("/api/users/login").send({})).status).toBe(400);
    });

    it("returns an identical 401 for an unknown email and a wrong password", async () => {
        userService.loginUser.mockRejectedValue(new AppError("INVALID_CREDENTIALS"));
        const unknownEmail = await request(app).post("/api/users/login").send({ email: "nobody@example.com", password: "secret" });

        userService.loginUser.mockRejectedValue(new AppError("INVALID_CREDENTIALS"));
        const wrongPassword = await request(app).post("/api/users/login").send({ email: "tom@example.com", password: "wrong" });

        // Any difference here would let an attacker enumerate registered accounts.
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.body).toEqual(wrongPassword.body);
        expect(unknownEmail.body).toEqual({ success: false, message: "Invalid email or password", data: null });
    });

    it("reports an unexpected failure as 500", async () => {
        userService.loginUser.mockRejectedValue(new Error("connection lost"));

        expect((await request(app).post("/api/users/login").send(body)).status).toBe(500);
    });
});

describe("POST /api/users/logout", () => {
    it("clears the session cookie", async () => {
        const response = await request(app).post("/api/users/logout").set("Cookie", authCookie());

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "User logged out", data: null });
        expect(response.headers["set-cookie"][0]).toContain("token=;");
    });

    it("is reachable without a session", async () => {
        expect((await request(app).post("/api/users/logout")).status).toBe(200);
    });
});

describe("GET /api/users/check-login", () => {
    it("reports the signed-in user", async () => {
        const response = await request(app).get("/api/users/check-login").set("Cookie", authCookie());

        expect(response.body).toEqual({
            success: true,
            message: "Logged in",
            data: { loggedIn: true, username: "tom" }
        });
    });

    it("reports an anonymous caller", async () => {
        expect((await request(app).get("/api/users/check-login")).body).toEqual({
            success: true,
            message: "Not logged in",
            data: { loggedIn: false, username: null }
        });
    });
});

describe("GET /api/users/profile", () => {
    it("requires a session", async () => {
        const response = await request(app).get("/api/users/profile");

        expect(response.status).toBe(401);
    });

    it("returns the session's own id, username, email and admin flag", async () => {
        const response = await request(app)
            .get("/api/users/profile")
            .set("Cookie", authCookie({ id: "user-1", username: "tom", email: "tom@example.com", admin: true }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "Profile fetched",
            data: { id: "user-1", username: "tom", email: "tom@example.com", admin: true }
        });
    });
});

describe("GET /api/users/profile/tournaments", () => {
    it("requires a session", async () => {
        const response = await request(app).get("/api/users/profile/tournaments");

        expect(response.status).toBe(401);
        expect(tournamentService.getMyTournaments).not.toHaveBeenCalled();
    });

    it("returns the caller's created tournaments", async () => {
        tournamentService.getMyTournaments.mockResolvedValue([{ id: "tour-1" }]);

        const response = await request(app)
            .get("/api/users/profile/tournaments")
            .set("Cookie", authCookie({ id: "user-1" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "Tournaments fetched",
            data: [{ id: "tour-1" }]
        });
        expect(tournamentService.getMyTournaments).toHaveBeenCalledWith("user-1");
    });

    it("reports a failure as 500", async () => {
        tournamentService.getMyTournaments.mockRejectedValue(new Error("connection lost"));

        const response = await request(app)
            .get("/api/users/profile/tournaments")
            .set("Cookie", authCookie());

        expect(response.status).toBe(500);
    });
});

describe("GET /api/users/profile/saved-tournaments", () => {
    it("requires a session", async () => {
        const response = await request(app).get("/api/users/profile/saved-tournaments");

        expect(response.status).toBe(401);
        expect(tournamentService.getSavedTournaments).not.toHaveBeenCalled();
    });

    it("returns the caller's saved tournaments", async () => {
        tournamentService.getSavedTournaments.mockResolvedValue([{ id: "tour-2" }]);

        const response = await request(app)
            .get("/api/users/profile/saved-tournaments")
            .set("Cookie", authCookie({ id: "user-1" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "Saved tournaments fetched",
            data: [{ id: "tour-2" }]
        });
        expect(tournamentService.getSavedTournaments).toHaveBeenCalledWith("user-1");
    });

    it("reports a failure as 500", async () => {
        tournamentService.getSavedTournaments.mockRejectedValue(new Error("connection lost"));

        const response = await request(app)
            .get("/api/users/profile/saved-tournaments")
            .set("Cookie", authCookie());

        expect(response.status).toBe(500);
    });
});
