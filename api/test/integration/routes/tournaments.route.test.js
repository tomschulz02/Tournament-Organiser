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
        deleteTournament: vi.fn()
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
    ["delete", `/api/tournaments/${VALID_UUID}/save`, "unfollow"],
    ["put", `/api/tournaments/${VALID_UUID}/schedule`, "save schedule"]
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
