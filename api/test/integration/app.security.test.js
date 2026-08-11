import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const app = (await import("../../src/app.js")).default;
const { dbMock, resetDbMock, squash } = await import("../helpers/dbMock.js");

beforeEach(() => {
    resetDbMock();
});

// helmet is mounted first in app.js so that every response carries the headers,
// including errors and 404s. These assert the ones that actually matter for a
// JSON API rather than helmet's full default set, which is its business to
// change between versions.

describe("security headers", () => {
    it("sets baseline headers on a successful response", async () => {
        const response = await request(app).get("/api/users/check-login");

        expect(response.status).toBe(200);
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(response.headers["strict-transport-security"]).toContain("max-age=");
    });

    it("sets them on a 404 as well, since helmet runs before the routers", async () => {
        const response = await request(app).get("/api/nothing-here");

        expect(response.status).toBe(404);
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    // Express advertises itself by default, which tells an attacker what to
    // look up. helmet removes it.
    it("does not advertise the server technology", async () => {
        const response = await request(app).get("/api/users/check-login");

        expect(response.headers["x-powered-by"]).toBeUndefined();
    });
});

describe("GET /api/health", () => {
    it("answers without a session cookie", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "OK",
            data: { database: "up" }
        });
    });

    // "The process is up" would report healthy while every request 500s, so the
    // check has to reach the pool.
    it("asks the database the cheapest possible question", async () => {
        await request(app).get("/api/health");

        expect(dbMock.instance.query).toHaveBeenCalledTimes(1);
        expect(squash(dbMock.instance.query.mock.calls[0][0])).toBe("SELECT 1");
    });

    it("reports 503 in the standard envelope when the database does not answer", async () => {
        dbMock.instance.query.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));

        const response = await request(app).get("/api/health");

        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            success: false,
            message: "The service is not ready",
            data: null
        });
    });

    it("sits above the session middleware, so a bad token does not affect it", async () => {
        const response = await request(app).get("/api/health").set("Cookie", "token=not-a-real-jwt");

        expect(response.status).toBe(200);
    });
});

describe("automatic ETags", () => {
    // Express content-hashes JSON responses into a weak ETag unless told not
    // to. That would override the tournament controller's deliberate decision
    // to send no validator when it cannot determine one, so it is off.
    it("is disabled, so no endpoint gets a validator by accident", async () => {
        expect(app.get("etag")).toBe(false);

        const response = await request(app).get("/api/users/check-login");

        expect(response.status).toBe(200);
        expect(response.headers.etag).toBeUndefined();
    });
});

describe("proxy trust", () => {
    // Render terminates TLS and forwards, so without this every visitor shares
    // one rate-limit bucket. Trusting one hop makes req.ip the address Render
    // recorded rather than Render's own.
    it("trusts exactly one proxy hop", () => {
        expect(app.get("trust proxy")).toBe(1);
    });
});
