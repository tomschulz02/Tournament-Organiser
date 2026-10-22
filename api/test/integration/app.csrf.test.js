import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../src/services/tournaments.service.js", () => ({
    tournamentService: {
        createTournament: vi.fn(),
        startTournament: vi.fn(),
        deleteTournament: vi.fn(),
        updateSchedule: vi.fn(),
        fetchTournaments: vi.fn()
    }
}));

const app = (await import("../../src/app.js")).default;
const { tournamentService } = await import("../../src/services/tournaments.service.js");
const { rejectCrossOriginWrites } = await import("../../src/middleware/csrf.js");
const { authCookie } = await import("../helpers/auth.js");

// test/setup.js sets FRONTEND_URL to this and NODE_ENV to "test", so it is the
// only allowed origin here. The development list is covered by app.cors.test.js.
const FRONTEND = "http://localhost:5173";
const ATTACKER = "https://attacker.example";
const TOURNAMENT_ID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";

beforeEach(() => {
    vi.mocked(tournamentService.createTournament).mockReset().mockResolvedValue("tour-1");
    vi.mocked(tournamentService.startTournament).mockReset().mockResolvedValue({ id: TOURNAMENT_ID });
    vi.mocked(tournamentService.deleteTournament).mockReset().mockResolvedValue({ id: TOURNAMENT_ID });
    vi.mocked(tournamentService.updateSchedule).mockReset().mockResolvedValue({ id: TOURNAMENT_ID, entries: 0 });
    vi.mocked(tournamentService.fetchTournaments).mockReset().mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
});

const CROSS_ORIGIN = {
    success: false,
    message: "This request did not come from the Tourganiser site",
    data: null
};

const NOT_JSON = {
    success: false,
    message: "Requests must be sent as JSON",
    data: null
};

// The attack: a page on another site auto-submits a hidden form, and the browser
// attaches the victim's session cookie because it is SameSite=None in production.
describe("writes from another origin", () => {
    it("refuses a cross-site form post to a body-less route, which needs nothing but the cookie", async () => {
        const response = await request(app)
            .post(`/api/tournaments/${TOURNAMENT_ID}/start`)
            .set("Cookie", authCookie())
            .set("Origin", ATTACKER)
            .type("form")
            .send("");

        expect(response.status).toBe(403);
        expect(response.body).toEqual(CROSS_ORIGIN);
        expect(tournamentService.startTournament).not.toHaveBeenCalled();
    });

    it("refuses a cross-site JSON write as well", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", ATTACKER)
            .send({ details: {}, divisions: [] });

        expect(response.status).toBe(403);
        expect(tournamentService.createTournament).not.toHaveBeenCalled();
    });

    it.each([
        ["PUT", (agent) => agent.put(`/api/tournaments/${TOURNAMENT_ID}/schedule`).send({ schedule: {} })],
        ["DELETE", (agent) => agent.delete(`/api/tournaments/${TOURNAMENT_ID}`)]
    ])("refuses a cross-site %s", async (method, send) => {
        const response = await send(request(app)).set("Cookie", authCookie()).set("Origin", ATTACKER);

        expect(response.status).toBe(403);
        expect(tournamentService.updateSchedule).not.toHaveBeenCalled();
        expect(tournamentService.deleteTournament).not.toHaveBeenCalled();
    });

    // A sandboxed frame or a no-referrer page sends the literal string "null".
    it("refuses an opaque origin", async () => {
        const response = await request(app)
            .post(`/api/tournaments/${TOURNAMENT_ID}/start`)
            .set("Cookie", authCookie())
            .set("Origin", "null");

        expect(response.status).toBe(403);
    });

    // Decided before the session middleware runs, so the refusal is the same for
    // a signed-in victim and for nobody.
    it("refuses before authentication is even considered", async () => {
        const response = await request(app)
            .post(`/api/tournaments/${TOURNAMENT_ID}/start`)
            .set("Origin", ATTACKER);

        expect(response.status).toBe(403);
    });

    // Reading is anonymous and public, and CORS already decides who may read a
    // response. Only writes are checked.
    it("leaves reads from another origin alone", async () => {
        const response = await request(app).get("/api/tournaments").set("Origin", ATTACKER);

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
});

describe("writes from the frontend", () => {
    it("accepts a JSON write", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND)
            .send({ details: { name: "Open" }, divisions: [] });

        expect(response.status).toBe(201);
        expect(tournamentService.createTournament).toHaveBeenCalledWith(
            { details: { name: "Open" }, divisions: [] },
            "user-1"
        );
    });

    // How requests.js sends start, end, save, delete and logout: no body and no
    // Content-Type at all.
    it("accepts a write with no body and no Content-Type", async () => {
        const response = await request(app)
            .post(`/api/tournaments/${TOURNAMENT_ID}/start`)
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND);

        expect(response.status).toBe(200);
        expect(tournamentService.startTournament).toHaveBeenCalledWith(TOURNAMENT_ID, "user-1");
    });

    it.each(["application/json; charset=utf-8", "Application/JSON"])("accepts Content-Type %s", async (type) => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND)
            .set("Content-Type", type)
            .send(JSON.stringify({ details: {}, divisions: [] }));

        expect(response.status).toBe(201);
    });

    // curl, scripts and this suite. A request without Origin is not a browser
    // acting for a victim, so there is no cookie to have been forged.
    it("accepts a write with no Origin at all", async () => {
        const response = await request(app)
            .post(`/api/tournaments/${TOURNAMENT_ID}/start`)
            .set("Cookie", authCookie());

        expect(response.status).toBe(200);
    });
});

// The second line of defence. Even with no Origin header, a form can only send
// these three types, and there is no longer a parser that would read them.
describe("JSON only", () => {
    it.each([
        ["application/x-www-form-urlencoded", "details[name]=Open"],
        ["multipart/form-data; boundary=x", "--x--"],
        ["text/plain", "{\"details\":{}}"]
    ])("refuses %s with 415", async (type, body) => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Content-Type", type)
            .send(body);

        expect(response.status).toBe(415);
        expect(response.body).toEqual(NOT_JSON);
        expect(tournamentService.createTournament).not.toHaveBeenCalled();
    });

    // A form-encoded Content-Type is refused even with nothing in the body, so a
    // form aimed at a body-less route fails on this rule as well as on Origin.
    it("refuses a form Content-Type on a body-less route", async () => {
        const response = await request(app)
            .post(`/api/tournaments/${TOURNAMENT_ID}/start`)
            .set("Cookie", authCookie())
            .type("form")
            .send("");

        expect(response.status).toBe(415);
        expect(tournamentService.startTournament).not.toHaveBeenCalled();
    });

    // superagent sends a Buffer as it is, with a Content-Length and no type.
    it("refuses a body that declares no Content-Type", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .send(Buffer.from("{\"details\":{}}"));

        expect(response.status).toBe(415);
    });

    // csrf.js passes it, since the media type is JSON; body-parser then refuses
    // the charset. That used to reach the error middleware as an unnamed 500.
    it("refuses JSON in a charset other than UTF-8 with 415 rather than a fault", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Content-Type", "application/json; charset=latin1")
            .send("{\"details\":{}}");

        expect(response.status).toBe(415);
        expect(response.body).toEqual(NOT_JSON);
        expect(console.error).not.toHaveBeenCalled();
        expect(tournamentService.createTournament).not.toHaveBeenCalled();
    });

    // body-parser decompresses gzip, deflate and br. Anything else used to reach
    // the error middleware as an unnamed 500.
    it("refuses a Content-Encoding it cannot decompress with 415 rather than a fault", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Content-Type", "application/json")
            .set("Content-Encoding", "zstd")
            .send("{\"details\":{}}");

        expect(response.status).toBe(415);
        expect(response.body).toEqual({
            success: false,
            message: "The request is compressed in a format the server does not support",
            data: null
        });
        expect(console.error).not.toHaveBeenCalled();
        expect(tournamentService.createTournament).not.toHaveBeenCalled();
    });

    it("tells the frontend why, with headers it is allowed to read", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND)
            .type("form")
            .send("details[name]=Open");

        expect(response.status).toBe(415);
        expect(response.headers["access-control-allow-origin"]).toBe(FRONTEND);
    });

    // Driven directly: supertest always knows its body's length, so it never
    // sends a chunked request.
    it("treats a chunked body with no Content-Type as a body", () => {
        const next = vi.fn();
        const req = { method: "POST", headers: { "transfer-encoding": "chunked" } };

        rejectCrossOriginWrites([FRONTEND])(req, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNSUPPORTED_MEDIA_TYPE" }));
    });
});

describe("body size", () => {
    it("refuses a body over the limit with 413 in the standard envelope", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND)
            .send({ details: { description: "x".repeat(1024 * 1024) }, divisions: [] });

        expect(response.status).toBe(413);
        expect(response.body).toEqual({ success: false, message: "The request is too large", data: null });
        // body-parser fails before any route, and the error middleware is mounted
        // after cors(), so the frontend can still read the message.
        expect(response.headers["access-control-allow-origin"]).toBe(FRONTEND);
        expect(console.error).not.toHaveBeenCalled();
        expect(tournamentService.createTournament).not.toHaveBeenCalled();
    });

    it("accepts a body above express's old 100kb default", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND)
            .send({ details: { description: "x".repeat(200 * 1024) }, divisions: [] });

        expect(response.status).toBe(201);
    });

    // The same ordering, for the parse failure that existed before this.
    it("lets the frontend read a malformed-JSON rejection too", async () => {
        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .set("Origin", FRONTEND)
            .set("Content-Type", "application/json")
            .send("{ not json");

        expect(response.status).toBe(400);
        expect(response.headers["access-control-allow-origin"]).toBe(FRONTEND);
    });
});
