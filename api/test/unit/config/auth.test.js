import { describe, it, expect, afterEach, vi } from "vitest";
import { SESSION_TTL_JWT, SESSION_TTL_MS, sessionCookieOptions } from "../../../src/config/auth.js";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("session lifetime constants", () => {
    it("keeps the cookie maxAge and the JWT expiry in agreement", () => {
        expect(SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
        expect(SESSION_TTL_JWT).toBe("24h");
    });
});

describe("sessionCookieOptions", () => {
    it("requires a secure cross-site cookie in production", () => {
        vi.stubEnv("NODE_ENV", "production");

        expect(sessionCookieOptions()).toEqual({
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/"
        });
    });

    it("relaxes secure and sameSite outside production, so http://localhost works", () => {
        vi.stubEnv("NODE_ENV", "development");

        expect(sessionCookieOptions()).toEqual({
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/"
        });
    });
});
