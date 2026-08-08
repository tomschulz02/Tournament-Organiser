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
