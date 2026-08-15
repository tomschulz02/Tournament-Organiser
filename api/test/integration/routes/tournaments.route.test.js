import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/tournaments.service.js", () => ({
    tournamentService: {
        createTournament: vi.fn(),
        fetchTournaments: vi.fn(),
        fetchTournamentDetails: vi.fn(),
        startTournament: vi.fn(),
        endTournament: vi.fn(),
        deleteTournament: vi.fn(),
        updateSchedule: vi.fn()
    }
}));

const app = (await import("../../../src/app.js")).default;
const { tournamentService } = await import("../../../src/services/tournaments.service.js");
const { AppError } = await import("../../../src/errors.js");
const { authCookie } = await import("../../helpers/auth.js");

const VALID_UUID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";

beforeEach(() => {
    vi.mocked(tournamentService.createTournament).mockReset();
    vi.mocked(tournamentService.fetchTournaments).mockReset();
    vi.mocked(tournamentService.fetchTournamentDetails).mockReset();
    vi.mocked(tournamentService.startTournament).mockReset();
    vi.mocked(tournamentService.endTournament).mockReset();
    vi.mocked(tournamentService.deleteTournament).mockReset();
    vi.mocked(tournamentService.updateSchedule).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/tournaments/create", () => {
    const body = { details: { name: "Summer Open" }, divisions: [{ name: "Division A" }] };

    it("requires a session", async () => {
        const response = await request(app).post("/api/tournaments/create").send(body);

        expect(response.status).toBe(401);
        expect(tournamentService.createTournament).not.toHaveBeenCalled();
    });

    it("creates the tournament for the signed-in user", async () => {
        tournamentService.createTournament.mockResolvedValue("tour-1");

        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }))
            .send(body);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            success: true,
            message: "Tournament created successfully",
            data: { id: "tour-1" }
        });
        expect(tournamentService.createTournament).toHaveBeenCalledWith(body, "user-1");
    });

    it("hides a failure behind a generic 500 rather than leaking the service's text", async () => {
        tournamentService.createTournament.mockRejectedValue(new Error("null value in column \"name\""));

        const response = await request(app)
            .post("/api/tournaments/create")
            .set("Cookie", authCookie())
            .send(body);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, message: "Internal server error", data: null });
    });
});

describe("GET /api/tournaments/", () => {
    it("returns the grouped list to anyone", async () => {
        const grouped = { upcoming: [{ id: "a" }], ongoing: [], completed: [] };
        tournamentService.fetchTournaments.mockResolvedValue(grouped);

        const response = await request(app).get("/api/tournaments/");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Tournaments fetched", data: grouped });
    });

    it("reports a failure as 500", async () => {
        tournamentService.fetchTournaments.mockRejectedValue(new Error("connection lost"));

        expect((await request(app).get("/api/tournaments/")).status).toBe(500);
    });
});

describe("GET /api/tournaments/:tournamentId", () => {
    it("serves an anonymous viewer", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue({
            creator: false,
            view: { tournament: { id: "tour-1" } }
        });

        const response = await request(app).get(`/api/tournaments/${VALID_UUID}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "Tournament fetched",
            data: { loggedIn: false, creator: false, tournament: { id: "tour-1" } }
        });
        expect(tournamentService.fetchTournamentDetails).toHaveBeenCalledWith(VALID_UUID, null);
    });

    // Through the real Express stack, so these cover what the controller tests
    // cannot: that the headers survive helmet and the middleware chain, and
    // that Express does not substitute its own ETag or its own 304.
    describe("caching", () => {
        const CHANGE_KEY = "1754042400000";
        const OWNER_ID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";

        function serves({ creator = false, changeKey = CHANGE_KEY, view = { tournament: { id: "tour-1" } } } = {}) {
            tournamentService.fetchTournamentDetails.mockResolvedValue({ creator, changeKey, view });
        }

        it("sends an ETag, Vary and Cache-Control on the full response", async () => {
            serves();

            const response = await request(app).get(`/api/tournaments/${VALID_UUID}`);

            expect(response.status).toBe(200);
            expect(response.headers.etag).toMatch(/^".+"$/);
            expect(response.headers.vary).toBe("Cookie");
            expect(response.headers["cache-control"]).toBe("no-cache");
        });

        it("answers 304 with an empty body when the validator matches", async () => {
            serves();
            const first = await request(app).get(`/api/tournaments/${VALID_UUID}`);

            const second = await request(app)
                .get(`/api/tournaments/${VALID_UUID}`)
                .set("If-None-Match", first.headers.etag);

            expect(second.status).toBe(304);
            expect(second.text).toBeFalsy();
        });

        it("answers 200 once the data has moved", async () => {
            serves();
            const first = await request(app).get(`/api/tournaments/${VALID_UUID}`);

            serves({ changeKey: "1754042499999" });
            const second = await request(app)
                .get(`/api/tournaments/${VALID_UUID}`)
                .set("If-None-Match", first.headers.etag);

            expect(second.status).toBe(200);
            expect(second.body.data).toMatchObject({ tournament: { id: "tour-1" } });
        });

        // The trap, end to end. A signed-out reader presenting the organiser's
        // validator must be given a fresh, non-organiser payload — never a 304
        // that leaves them rendering the organiser's cached page.
        it("never honours the organiser's validator for a signed-out reader", async () => {
            serves({ creator: true });
            const organiser = await request(app)
                .get(`/api/tournaments/${VALID_UUID}`)
                .set("Cookie", authCookie({ id: OWNER_ID }));

            serves({ creator: false });
            const anonymous = await request(app)
                .get(`/api/tournaments/${VALID_UUID}`)
                .set("If-None-Match", organiser.headers.etag);

            expect(anonymous.status).toBe(200);
            expect(anonymous.body.data).toMatchObject({ loggedIn: false, creator: false });
            expect(anonymous.headers.etag).not.toBe(organiser.headers.etag);
        });

        it("gives the same reader and data the same validator twice", async () => {
            serves();
            const first = await request(app).get(`/api/tournaments/${VALID_UUID}`);
            const second = await request(app).get(`/api/tournaments/${VALID_UUID}`);

            expect(second.headers.etag).toBe(first.headers.etag);
        });

        it("sends no ETag when the change key is unknown", async () => {
            serves({ changeKey: null });

            const response = await request(app).get(`/api/tournaments/${VALID_UUID}`);

            expect(response.status).toBe(200);
            expect(response.headers.etag).toBeUndefined();
        });
    });

    it("marks the owner as the creator", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue({ creator: true, view: {} });

        const response = await request(app)
            .get(`/api/tournaments/${VALID_UUID}`)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }));

        expect(response.body.data).toMatchObject({ loggedIn: true, creator: true });
        expect(tournamentService.fetchTournamentDetails).toHaveBeenCalledWith(VALID_UUID, "user-1");
    });

    it("returns 404 for an id that is not a UUID, without reaching the service", async () => {
        const response = await request(app).get("/api/tournaments/not-a-uuid");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Tournament not found", data: null });
        expect(tournamentService.fetchTournamentDetails).not.toHaveBeenCalled();
    });

    it("returns 404 when the tournament does not exist", async () => {
        tournamentService.fetchTournamentDetails.mockRejectedValue(new AppError("TOURNAMENT_NOT_FOUND"));

        const response = await request(app).get(`/api/tournaments/${VALID_UUID}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Tournament not found", data: null });
    });

    it("reports a failure as 500", async () => {
        tournamentService.fetchTournamentDetails.mockRejectedValue(new Error("connection lost"));

        expect((await request(app).get(`/api/tournaments/${VALID_UUID}`)).status).toBe(500);
    });
});

// The lifecycle routes. Resource-first paths per docs/api.md; the verb-first
// forms these replaced no longer exist.
describe.each([
    ["post", `/api/tournaments/${VALID_UUID}/start`, "startTournament", "Tournament started"],
    ["post", `/api/tournaments/${VALID_UUID}/end`, "endTournament", "Tournament ended"],
    ["delete", `/api/tournaments/${VALID_UUID}`, "deleteTournament", "Tournament deleted"]
])("%s %s", (method, path, serviceMethod, message) => {
    it("requires a session", async () => {
        const response = await request(app)[method](path);

        expect(response.status).toBe(401);
        expect(tournamentService[serviceMethod]).not.toHaveBeenCalled();
    });

    it("performs the transition for the signed-in owner", async () => {
        tournamentService[serviceMethod].mockResolvedValue({ id: VALID_UUID });

        const response = await request(app)[method](path).set("Cookie", authCookie({ id: "user-1", username: "tom" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message, data: { id: VALID_UUID } });
        expect(tournamentService[serviceMethod]).toHaveBeenCalledWith(VALID_UUID, "user-1");
    });

    it("answers 403 for a signed-in user who does not own it", async () => {
        tournamentService[serviceMethod].mockRejectedValue(new AppError("NOT_TOURNAMENT_OWNER"));

        const response = await request(app)[method](path).set("Cookie", authCookie({ id: "user-2" }));

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            success: false,
            message: "You do not own this tournament",
            data: null
        });
    });

    it("answers 404 when the tournament does not exist", async () => {
        tournamentService[serviceMethod].mockRejectedValue(new AppError("TOURNAMENT_NOT_FOUND"));

        const response = await request(app)[method](path).set("Cookie", authCookie());

        expect(response.status).toBe(404);
    });
});

describe("lifecycle transitions the tournament is not in", () => {
    it("answers 409 rather than 500 when a tournament is started twice", async () => {
        tournamentService.startTournament.mockRejectedValue(new AppError("TOURNAMENT_ALREADY_STARTED"));

        const response = await request(app)
            .post(`/api/tournaments/${VALID_UUID}/start`)
            .set("Cookie", authCookie());

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            success: false,
            message: "This tournament has already started",
            data: null
        });
    });

    it("answers 409 when a tournament that has not started is ended", async () => {
        tournamentService.endTournament.mockRejectedValue(new AppError("TOURNAMENT_NOT_STARTED"));

        const response = await request(app)
            .post(`/api/tournaments/${VALID_UUID}/end`)
            .set("Cookie", authCookie());

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("This tournament has not started yet");
    });
});

// Declared but not built. These exist so the paths are settled and the UI can
// wire to them properly; each answers 501 in the standard envelope. requireAuth
// is already on them so the auth shape does not change when they are implemented.
describe.each([
    ["post", `/api/tournaments/${VALID_UUID}/save`, "follow"],
    ["delete", `/api/tournaments/${VALID_UUID}/save`, "unfollow"]
])("%s %s", (method, path, purpose) => {
    it("requires a session", async () => {
        const response = await request(app)[method](path);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
    });

    it(`answers 501 for ${purpose}`, async () => {
        const response = await request(app)[method](path).set("Cookie", authCookie());

        expect(response.status).toBe(501);
        expect(response.body).toEqual({
            success: false,
            message: "This feature is not available yet",
            data: null
        });
    });
});

describe("PUT /api/tournaments/:tournamentId/schedule", () => {
    const path = `/api/tournaments/${VALID_UUID}/schedule`;
    const schedule = { version: 1, days: [], courts: [], entries: [], settings: {} };

    it("requires a session", async () => {
        const response = await request(app).put(path).send({ schedule });

        expect(response.status).toBe(401);
        expect(tournamentService.updateSchedule).not.toHaveBeenCalled();
    });

    it("saves the schedule for the owner", async () => {
        tournamentService.updateSchedule.mockResolvedValue({ id: VALID_UUID, entries: 0 });

        const response = await request(app)
            .put(path)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }))
            .send({ schedule });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "Schedule saved",
            data: { id: VALID_UUID, entries: 0 }
        });
        expect(tournamentService.updateSchedule).toHaveBeenCalledWith(VALID_UUID, "user-1", schedule);
    });

    it("answers 404 for a tournament id that is not a UUID", async () => {
        const response = await request(app)
            .put("/api/tournaments/12345/schedule")
            .set("Cookie", authCookie())
            .send({ schedule });

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Tournament not found");
        expect(tournamentService.updateSchedule).not.toHaveBeenCalled();
    });

    it("answers 403 when the tournament belongs to someone else", async () => {
        tournamentService.updateSchedule.mockRejectedValue(new AppError("NOT_TOURNAMENT_OWNER"));

        const response = await request(app).put(path).set("Cookie", authCookie()).send({ schedule });

        expect(response.status).toBe(403);
        expect(response.body.message).toBe("You do not own this tournament");
    });

    // Each rule has its own code and its own message, so the organiser is told
    // which one they broke. The rules themselves are covered in the validator's
    // unit suite; this asserts they survive the trip through the middleware,
    // details and all.
    it.each([
        ["SCHEDULE_MALFORMED", 400, "The schedule is not in a recognised format"],
        ["SCHEDULE_TIME_INVALID", 400, "An entry ends before it starts"],
        ["SCHEDULE_DAY_OUT_OF_RANGE", 400, "An entry falls outside the tournament dates"],
        ["SCHEDULE_FIXTURE_UNKNOWN", 400, "A scheduled match does not belong to this tournament"],
        ["SCHEDULE_FIXTURE_REPEATED", 400, "A match is scheduled more than once"],
        ["SCHEDULE_COURT_CLASH", 409, "Two entries use the same court at the same time"],
        ["SCHEDULE_TEAM_CLASH", 409, "A team is scheduled in two places at once"],
        ["SCHEDULE_ROUND_ORDER", 409, "A match is scheduled before the round feeding it has finished"]
    ])("reports %s as its own %i with its own message", async (code, status, message) => {
        tournamentService.updateSchedule.mockRejectedValue(
            new AppError(code, { details: { entryId: "entry-1" } })
        );

        const response = await request(app).put(path).set("Cookie", authCookie()).send({ schedule });

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ success: false, message, data: { entryId: "entry-1" } });
    });
});
