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
        fetchTournamentDetails: vi.fn()
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
