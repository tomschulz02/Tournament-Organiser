import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/users.service.js", () => ({
    userService: {
        createUser: vi.fn(),
        loginUser: vi.fn()
    }
}));

const { userController } = await import("../../../src/controllers/users.controller.js");
const { userService } = await import("../../../src/services/users.service.js");
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
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("userController.signup", () => {
    const body = { username: "tom", email: "tom@example.com", password: "secret", confirmPassword: "secret" };

    it("sets the session cookie and returns the new username", async () => {
        userService.createUser.mockResolvedValue("signed-token");
        const res = makeRes();

        await userController.signup(makeReq({ body }), res);

        expect(userService.createUser).toHaveBeenCalledWith("tom", "tom@example.com", "secret", "secret");
        expect(res.cookie).toHaveBeenCalledWith("token", "signed-token", EXPECTED_COOKIE);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "User registered successfully",
            user: { username: "tom" }
        });
    });

    it.each([
        ["PASSWORDS_DO_NOT_MATCH", 400, "Passwords do not match"],
        ["MISSING_FIELDS", 400, "Missing required fields"],
        ["USER_CREATION_ERROR", 500, "Failed to create account"],
        ["SOMETHING_ELSE", 500, "Internal server error"]
    ])("maps %s to %i", async (code, status, message) => {
        userService.createUser.mockRejectedValue(new Error(code));
        const res = makeRes();

        await userController.signup(makeReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json).toHaveBeenCalledWith({ error: message });
        expect(res.cookie).not.toHaveBeenCalled();
    });
});

describe("userController.login", () => {
    const body = { email: "tom@example.com", password: "secret" };

    it("sets the session cookie on success", async () => {
        userService.loginUser.mockResolvedValue("signed-token");
        const res = makeRes();

        await userController.login(makeReq({ body }), res);

        expect(userService.loginUser).toHaveBeenCalledWith("tom@example.com", "secret");
        expect(res.cookie).toHaveBeenCalledWith("token", "signed-token", EXPECTED_COOKIE);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, message: "Login successful" });
    });

    it.each([
        ["MISSING_FIELDS", 400, "Missing required fields"],
        ["INVALID_CREDENTIALS", 401, "Invalid email or password"],
        ["LOGIN_ERROR", 500, "Internal server error"]
    ])("maps %s to %i", async (code, status, message) => {
        userService.loginUser.mockRejectedValue(new Error(code));
        const res = makeRes();

        await userController.login(makeReq({ body }), res);

        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json).toHaveBeenCalledWith({ error: message });
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
        expect(res.json).toHaveBeenCalledWith({ success: true, message: "User logged out" });
    });

    it("reports a failure to clear the cookie as a 500", async () => {
        const res = makeRes();
        res.clearCookie.mockImplementationOnce(() => {
            throw new Error("HEADERS_SENT");
        });

        await userController.logout(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("userController.checkLogin", () => {
    it("reports the signed-in username", async () => {
        const res = makeRes();

        await userController.checkLogin(makeReq({ user: { username: "tom" } }), res);

        expect(res.json).toHaveBeenCalledWith({ loggedIn: true, user: "tom" });
    });

    it("reports an anonymous caller", async () => {
        const res = makeRes();

        await userController.checkLogin(makeReq(), res);

        expect(res.json).toHaveBeenCalledWith({ loggedIn: false });
    });

    it("reports a failure to respond as a 500", async () => {
        const res = makeRes();
        res.json.mockImplementationOnce(() => {
            throw new Error("HEADERS_SENT");
        });

        await userController.checkLogin(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenLastCalledWith({ error: "Internal server error" });
    });
});

describe("userController.getUserProfile", () => {
    it("is unimplemented and never sends a response", async () => {
        // The try block is empty, so this resolves without touching res. Over
        // HTTP that leaves the request hanging until the client gives up, which
        // is why the route is not exercised through supertest.
        const res = makeRes();

        await expect(userController.getUserProfile(makeReq({ params: { id: "user-1" } }), res)).resolves.toBeUndefined();

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        expect(res.send).not.toHaveBeenCalled();
    });
});
