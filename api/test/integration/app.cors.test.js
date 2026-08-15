import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// src/app.js reads NODE_ENV and FRONTEND_URL when it builds the cors() options,
// at module load. Setting them here — before the dynamic import below — is the
// only way to exercise the development branch, which adds the Vite dev origin
// alongside the configured one.
process.env.NODE_ENV = "development";
process.env.FRONTEND_URL = "https://tourganiser.example";

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const app = (await import("../../src/app.js")).default;

describe("CORS in development", () => {
    it("allows the deployed frontend origin", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Origin", "https://tourganiser.example");

        expect(response.headers["access-control-allow-origin"]).toBe("https://tourganiser.example");
    });

    it("also allows the local Vite dev server", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Origin", "http://localhost:5173");

        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("does not echo an origin that is not on the list", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Origin", "https://attacker.example");

        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
});

// These two are what makes the tournament view's ETag usable from the browser,
// and both were missing when the caching went in. supertest does not enforce
// CORS, so nothing here fails the way a browser does — it can only assert that
// the headers are advertised. That is enough to catch the regression: with
// either one absent, the cache is silently inert or every request is blocked.
describe("CORS and conditional requests", () => {
    it("lets the browser read the ETag it is meant to send back", async () => {
        const response = await request(app)
            .get("/api/users/check-login")
            .set("Origin", "https://tourganiser.example");

        // Without this, cross-origin JavaScript reads null and never caches.
        expect(response.headers["access-control-expose-headers"]).toContain("ETag");
    });

    it("permits If-None-Match on the preflight", async () => {
        const response = await request(app)
            .options("/api/tournaments/45bb764e-c07d-474e-8d01-9d9711d39a3a")
            .set("Origin", "https://tourganiser.example")
            .set("Access-Control-Request-Method", "GET")
            .set("Access-Control-Request-Headers", "if-none-match");

        // If-None-Match is not safelisted, so sending it triggers a preflight.
        // Unlisted, the browser blocks the request outright.
        expect(response.headers["access-control-allow-headers"]).toContain("If-None-Match");
    });
});
