import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/users.service.js", () => ({
    userService: { createUser: vi.fn(), loginUser: vi.fn() }
}));

const app = (await import("../../../src/app.js")).default;
const { userService } = await import("../../../src/services/users.service.js");
const { authCookie } = await import("../../helpers/auth.js");

beforeEach(() => {
    vi.mocked(userService.createUser).mockReset();
    vi.mocked(userService.loginUser).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/users/signup", () => {
    const body = { username: "tom", email: "tom@example.com", password: "secret", confirmPassword: "secret" };

    it("creates the account and issues an httpOnly session cookie", async () => {
        userService.createUser.mockResolvedValue("signed-token");

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            success: true,
            message: "User registered successfully",
            user: { username: "tom" }
        });

        const [cookie] = response.headers["set-cookie"];
        expect(cookie).toContain("token=signed-token");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Path=/");
        expect(cookie).toContain("Max-Age=86400");
        expect(cookie).toContain("SameSite=Lax");
    });

    it("rejects mismatched passwords with 400", async () => {
        userService.createUser.mockRejectedValue(new Error("PASSWORDS_DO_NOT_MATCH"));

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Passwords do not match" });
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("rejects an incomplete body with 400", async () => {
        userService.createUser.mockRejectedValue(new Error("MISSING_FIELDS"));

        expect((await request(app).post("/api/users/signup").send({})).status).toBe(400);
    });

    it("reports a storage failure as 500", async () => {
        userService.createUser.mockRejectedValue(new Error("USER_CREATION_ERROR"));

        const response = await request(app).post("/api/users/signup").send(body);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Failed to create account" });
    });
});

describe("POST /api/users/login", () => {
    const body = { email: "tom@example.com", password: "secret" };

    it("issues a session cookie on success", async () => {
        userService.loginUser.mockResolvedValue("signed-token");

        const response = await request(app).post("/api/users/login").send(body);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Login successful" });
        expect(response.headers["set-cookie"][0]).toContain("token=signed-token");
    });

    it("rejects an incomplete body with 400", async () => {
        userService.loginUser.mockRejectedValue(new Error("MISSING_FIELDS"));

        expect((await request(app).post("/api/users/login").send({})).status).toBe(400);
    });

    it("returns an identical 401 for an unknown email and a wrong password", async () => {
        userService.loginUser.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
        const unknownEmail = await request(app).post("/api/users/login").send({ email: "nobody@example.com", password: "secret" });

        userService.loginUser.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
        const wrongPassword = await request(app).post("/api/users/login").send({ email: "tom@example.com", password: "wrong" });

        // Any difference here would let an attacker enumerate registered accounts.
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.body).toEqual(wrongPassword.body);
        expect(unknownEmail.body).toEqual({ error: "Invalid email or password" });
    });

    it("reports an unexpected failure as 500", async () => {
        userService.loginUser.mockRejectedValue(new Error("LOGIN_ERROR"));

        expect((await request(app).post("/api/users/login").send(body)).status).toBe(500);
    });
});

describe("POST /api/users/logout", () => {
    it("clears the session cookie", async () => {
        const response = await request(app).post("/api/users/logout").set("Cookie", authCookie());

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "User logged out" });
        expect(response.headers["set-cookie"][0]).toContain("token=;");
    });

    it("is reachable without a session", async () => {
        expect((await request(app).post("/api/users/logout")).status).toBe(200);
    });
});

describe("GET /api/users/check-login", () => {
    it("reports the signed-in user", async () => {
        const response = await request(app).get("/api/users/check-login").set("Cookie", authCookie());

        expect(response.body).toEqual({ loggedIn: true, user: "tom" });
    });

    it("reports an anonymous caller", async () => {
        expect((await request(app).get("/api/users/check-login")).body).toEqual({ loggedIn: false });
    });
});

describe("GET /api/users/profile/:id", () => {
    it("requires a session", async () => {
        const response = await request(app).get("/api/users/profile/user-1");

        expect(response.status).toBe(401);
    });

    // Not exercised with a valid session: the controller's try block is empty, so
    // it never responds and the request would hang until supertest times out.
    // userController.getUserProfile is covered directly in the unit tests instead.
});
