import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { AppError } from "../../src/errors.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { notFound } from "../../src/middleware/notFound.js";

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const app = (await import("../../src/app.js")).default;

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
});

// A throwaway app so the handler can be driven with errors no real route
// produces yet. The wiring itself is checked against the real app below.
function appThatThrows(failure) {
    const stub = express();
    stub.use(express.json());
    stub.get("/boom", () => {
        throw failure;
    });
    stub.post("/echo", (req, res) => res.json(req.body));
    stub.use(notFound);
    stub.use(errorHandler);
    return stub;
}

describe("notFound", () => {
    it("answers an unmatched route with 404 in the envelope", async () => {
        const response = await request(app).get("/no/such/path");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Not found", data: null });
    });

    it("covers a mounted router that exposes no routes", async () => {
        const response = await request(app).get("/api/fixtures");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Not found", data: null });
    });
});

describe("errorHandler", () => {
    it("maps an AppError to its catalogue status and message", async () => {
        const response = await request(appThatThrows(new AppError("NOT_TOURNAMENT_OWNER"))).get("/boom");

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            success: false,
            message: "You do not own this tournament",
            data: null
        });
        expect(console.error).not.toHaveBeenCalled();
    });

    it("surfaces AppError details through data, since messages are static", async () => {
        const failure = new AppError("WRONG_QUALIFIER_COUNT", { details: { expected: 4 } });
        const response = await request(appThatThrows(failure)).get("/boom");

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            message: "Wrong number of qualifying teams",
            data: { expected: 4 }
        });
    });

    it("turns an unrecognised code into a generic 500", async () => {
        const response = await request(appThatThrows(new AppError("NOBODY_DECLARED_THIS"))).get("/boom");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, message: "Internal server error", data: null });
    });

    it("hides an unexpected fault behind a generic 500 and logs it instead", async () => {
        const failure = new Error("connection terminated unexpectedly");
        const response = await request(appThatThrows(failure)).get("/boom");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, message: "Internal server error", data: null });
        expect(console.error).toHaveBeenCalledWith(failure);
    });

    it("logs the cause, so the Postgres code reaches the log", async () => {
        const pgError = Object.assign(new Error("duplicate key value"), { code: "23505" });
        const failure = new Error("insert failed", { cause: pgError });

        await request(appThatThrows(failure)).get("/boom");

        expect(console.error).toHaveBeenCalledWith(failure);
        expect(vi.mocked(console.error).mock.calls[0][0].cause).toBe(pgError);
    });

    it("answers a malformed JSON body with 400 rather than a fault", async () => {
        const response = await request(appThatThrows(new Error("unused")))
            .post("/echo")
            .set("Content-Type", "application/json")
            .send("{ not json");

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            message: "Request body is not valid JSON",
            data: null
        });
        expect(console.error).not.toHaveBeenCalled();
    });

    // Driven directly rather than through supertest: once the response has begun,
    // Express destroys the socket, so there is nothing left for a client to read.
    it("delegates to Express once the response has begun, since nothing can be sent", () => {
        const res = { headersSent: true, status: vi.fn(() => res), json: vi.fn(() => res) };
        const next = vi.fn();
        const failure = new AppError("DIVISION_NOT_FOUND");

        errorHandler(failure, {}, res, next);

        expect(next).toHaveBeenCalledWith(failure);
        expect(res.status).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
    });
});

describe("requireAuth", () => {
    it("rejects an anonymous request with 401 in the envelope", async () => {
        const response = await request(app).get("/api/divisions/div-1/progression");

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
    });
});
