import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/users.service.js", () => ({
    userService: {
        createUser: vi.fn(),
        loginUser: vi.fn()
    }
}));

vi.mock("../../../src/services/tournaments.service.js", () => ({
    tournamentService: {
        getMyTournaments: vi.fn(),
        getSavedTournaments: vi.fn()
    }
}));

const { userController } = await import("../../../src/controllers/users.controller.js");
const { userService } = await import("../../../src/services/users.service.js");
const { tournamentService } = await import("../../../src/services/tournaments.service.js");
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
    vi.mocked(tournamentService.getMyTournaments).mockReset();
    vi.mocked(tournamentService.getSavedTournaments).mockReset();
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
    it("responds from req.user alone, with no service or repository call", async () => {
        const res = makeRes();

        await userController.getUserProfile(
            makeReq({ user: { id: "user-1", username: "tom", email: "tom@example.com", admin: false } }),
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Profile fetched",
            data: { id: "user-1", username: "tom", email: "tom@example.com", admin: false }
        });
    });

    it("carries an admin flag when the caller is an admin", async () => {
        const res = makeRes();

        await userController.getUserProfile(
            makeReq({ user: { id: "user-1", username: "tom", email: "tom@example.com", admin: true } }),
            res
        );

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ admin: true }) }));
    });
});

describe("userController.getMyTournaments", () => {
    it("returns the caller's created tournaments in data", async () => {
        const tournaments = [{ id: "tour-1" }];
        tournamentService.getMyTournaments.mockResolvedValue(tournaments);
        const res = makeRes();

        await userController.getMyTournaments(makeReq({ user: { id: "user-1" } }), res);

        expect(tournamentService.getMyTournaments).toHaveBeenCalledWith("user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Tournaments fetched",
            data: tournaments
        });
    });

    it("lets a failure propagate", async () => {
        const failure = new Error("connection lost");
        tournamentService.getMyTournaments.mockRejectedValue(failure);

        await expect(
            userController.getMyTournaments(makeReq({ user: { id: "user-1" } }), makeRes())
        ).rejects.toBe(failure);
    });
});

describe("userController.getMySavedTournaments", () => {
    it("returns the caller's saved tournaments in data", async () => {
        const tournaments = [{ id: "tour-2" }];
        tournamentService.getSavedTournaments.mockResolvedValue(tournaments);
        const res = makeRes();

        await userController.getMySavedTournaments(makeReq({ user: { id: "user-1" } }), res);

        expect(tournamentService.getSavedTournaments).toHaveBeenCalledWith("user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Saved tournaments fetched",
            data: tournaments
        });
    });

    it("lets a failure propagate", async () => {
        const failure = new Error("connection lost");
        tournamentService.getSavedTournaments.mockRejectedValue(failure);

        await expect(
            userController.getMySavedTournaments(makeReq({ user: { id: "user-1" } }), makeRes())
        ).rejects.toBe(failure);
    });
});
