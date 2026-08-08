import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../src/services/users.service.js", () => ({
    userService: { createUser: vi.fn(), loginUser: vi.fn() }
}));

vi.mock("../../src/services/tournaments.service.js", () => ({
    tournamentService: { createTournament: vi.fn(), fetchTournaments: vi.fn(), fetchTournamentDetails: vi.fn() }
}));

vi.mock("../../src/services/progression.service.js", () => ({
    progressionService: { getProposal: vi.fn(), commit: vi.fn() }
}));

const app = (await import("../../src/app.js")).default;
const { userService } = await import("../../src/services/users.service.js");
const { authCookie, cookieSignedWithWrongSecret, expiredAuthCookie } = await import("../helpers/auth.js");

beforeEach(() => {
    vi.mocked(userService.loginUser).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

// The middleware in src/app.js populates req.user from the session cookie and
// never rejects; requireAuth is what turns a missing session into a 401.
//
// check-login is the observation point: its data reports whatever req.user was
// left as.
const ANONYMOUS = { loggedIn: false, username: null };

describe("session middleware", () => {
    it("populates req.user from a valid token", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ loggedIn: true, username: "tom" });
    });

    it("leaves req.user null when there is no cookie", async () => {
        const response = await request(app).get("/api/users/check-login");

        expect(response.body.data).toEqual(ANONYMOUS);
    });

    it("leaves req.user null for a token signed with the wrong secret", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Cookie", cookieSignedWithWrongSecret());

        expect(response.body.data).toEqual(ANONYMOUS);
    });

    it("leaves req.user null for an expired token", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Cookie", expiredAuthCookie());

        expect(response.body.data).toEqual(ANONYMOUS);
    });

    it("leaves req.user null for a token that is not a JWT at all", async () => {
        const response = await request(app).get("/api/users/check-login").set("Cookie", "token=garbage");

        expect(response.body.data).toEqual(ANONYMOUS);
    });

    it("skips the login route entirely, so a broken cookie cannot block signing in", async () => {
        userService.loginUser.mockResolvedValue("signed-token");

        const response = await request(app)
            .post("/api/users/login")
            .set("Cookie", "token=garbage")
            .send({ email: "tom@example.com", password: "secret" });

        expect(response.status).toBe(200);
    });

    it("skips the signup route too", async () => {
        vi.mocked(userService.createUser).mockResolvedValue("signed-token");

        const response = await request(app)
            .post("/api/users/signup")
            .set("Cookie", "token=garbage")
            .send({ username: "tom", email: "tom@example.com", password: "secret", confirmPassword: "secret" });

        expect(response.status).toBe(201);
    });
});

describe("requireAuth on protected routes", () => {
    it("rejects an anonymous request with 401", async () => {
        const response = await request(app).get("/api/divisions/div-1/progression");

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
    });

    it("rejects a request whose token did not verify", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", "token=garbage")
            .send({});

        expect(response.status).toBe(401);
    });
});

describe("app wiring", () => {
    it("mounts the fixtures router, which currently exposes no routes", async () => {
        expect((await request(app).get("/api/fixtures")).status).toBe(404);
    });

    it("returns 404 for an unknown path", async () => {
        expect((await request(app).get("/nope")).status).toBe(404);
    });

    it("allows the configured frontend origin with credentials", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Origin", "http://localhost:5173");

        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("answers a preflight request with 200", async () => {
        const response = await request(app)
            .options("/api/users/login")
            .set("Origin", "http://localhost:5173")
            .set("Access-Control-Request-Method", "POST");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("accepts a urlencoded body", async () => {
        vi.mocked(userService.loginUser).mockResolvedValue("signed-token");

        const response = await request(app)
            .post("/api/users/login")
            .type("form")
            .send("email=tom@example.com&password=secret");

        expect(response.status).toBe(200);
        expect(userService.loginUser).toHaveBeenCalledWith("tom@example.com", "secret");
    });
});
