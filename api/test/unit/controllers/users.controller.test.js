import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/users.service.js", () => ({
    userService: {
        createUser: vi.fn(),
        loginUser: vi.fn()
    }
}));

const { userController } = await import("../../../src/controllers/users.controller.js");
const { userService } = await import("../../../src/services/users.service.js");
const { AppError } = await import("../../../src/errors.js");
const { makeReq, makeRes } = await import("../../helpers/http.js");

// NODE_ENV is "test" in the suite, so the cookie is the non-production variant.
const EXPECTED_COOKIE = {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000
};

beforeEach(() => {
    vi.mocked(userService.createUser).mockReset();
    vi.mocked(userService.loginUser).mockReset();
});

// The controllers no longer catch. A rejected service call propagates to the
// error middleware, which owns every status and message; these tests assert only
// that the rejection is not swallowed.

describe("userController.signup", () => {
    const body = { username: "tom", email: "tom@example.com", password: "secret", confirmPassword: "secret" };

    it("sets the session cookie and returns the new username in data", async () => {
        userService.createUser.mockResolvedValue({ token: "signed-token", username: "tom" });
        const res = makeRes();

        await userController.signup(makeReq({ body }), res);

        expect(userService.createUser).toHaveBeenCalledWith("tom", "tom@example.com", "secret", "secret");
        expect(res.cookie).toHaveBeenCalledWith("token", "signed-token", EXPECTED_COOKIE);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "User registered successfully",
            data: { username: "tom" }
        });
    });

    it("lets a failure propagate instead of mapping it", async () => {
        const failure = new AppError("EMAIL_ALREADY_REGISTERED");
        userService.createUser.mockRejectedValue(failure);
        const res = makeRes();

        await expect(userController.signup(makeReq({ body }), res)).rejects.toBe(failure);

        expect(res.cookie).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });
});

describe("userController.login", () => {
    const body = { email: "tom@example.com", password: "secret" };

    it("sets the session cookie and returns the username, so the client can greet the user", async () => {
        userService.loginUser.mockResolvedValue({ token: "signed-token", username: "tom" });
        const res = makeRes();

        await userController.login(makeReq({ body }), res);

        expect(userService.loginUser).toHaveBeenCalledWith("tom@example.com", "secret");
        expect(res.cookie).toHaveBeenCalledWith("token", "signed-token", EXPECTED_COOKIE);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Login successful",
            data: { username: "tom" }
        });
    });

    it("lets a failure propagate instead of mapping it", async () => {
        const failure = new AppError("INVALID_CREDENTIALS");
        userService.loginUser.mockRejectedValue(failure);
        const res = makeRes();

        await expect(userController.login(makeReq({ body }), res)).rejects.toBe(failure);

        expect(res.cookie).not.toHaveBeenCalled();
    });
});

describe("userController.logout", () => {
    it("clears the cookie with the flags it was set with", async () => {
        const res = makeRes();

        await userController.logout(makeReq(), res);

        expect(res.clearCookie).toHaveBeenCalledWith("token", {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/"
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, message: "User logged out", data: null });
    });
});

describe("userController.checkLogin", () => {
    it("reports the signed-in username inside data", async () => {
        const res = makeRes();

        await userController.checkLogin(makeReq({ user: { username: "tom" } }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Logged in",
            data: { loggedIn: true, username: "tom" }
        });
    });

    it("reports an anonymous caller", async () => {
        const res = makeRes();

        await userController.checkLogin(makeReq(), res);

        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Not logged in",
            data: { loggedIn: false, username: null }
        });
    });
});

describe("userController.getUserProfile", () => {
    it("rejects with 501 rather than hanging the request", async () => {
        const res = makeRes();

        await expect(
            userController.getUserProfile(makeReq({ params: { id: "user-1" } }), res)
        ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED", status: 501 });

        expect(res.json).not.toHaveBeenCalled();
    });
});
