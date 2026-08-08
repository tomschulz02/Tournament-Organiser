import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/tournaments.service.js", () => ({
    tournamentService: {
        createTournament: vi.fn(),
        fetchTournaments: vi.fn(),
        fetchTournamentDetails: vi.fn()
    }
}));

const { tournamentController } = await import("../../../src/controllers/tournaments.controller.js");
const { tournamentService } = await import("../../../src/services/tournaments.service.js");
const { makeReq, makeRes } = await import("../../helpers/http.js");

const VALID_UUID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";

beforeEach(() => {
    vi.mocked(tournamentService.createTournament).mockReset();
    vi.mocked(tournamentService.fetchTournaments).mockReset();
    vi.mocked(tournamentService.fetchTournamentDetails).mockReset();
});

describe("tournamentController.createTournament", () => {
    it("creates the tournament for the logged-in user", async () => {
        tournamentService.createTournament.mockResolvedValue("tour-1");
        const res = makeRes();
        const body = { details: {}, divisions: [] };

        await tournamentController.createTournament(makeReq({ body, user: { id: "user-1" } }), res);

        expect(tournamentService.createTournament).toHaveBeenCalledWith(body, "user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Tournament created successfully",
            id: "tour-1"
        });
    });

    it("returns the service error message on failure", async () => {
        tournamentService.createTournament.mockRejectedValue(new Error("DATABASE_ERROR"));
        const res = makeRes();

        await tournamentController.createTournament(makeReq({ user: { id: "user-1" } }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "DATABASE_ERROR" });
    });

    it("falls back to a generic code when the failure has no message", async () => {
        tournamentService.createTournament.mockRejectedValue(new Error(""));
        const res = makeRes();

        await tournamentController.createTournament(makeReq({ user: { id: "user-1" } }), res);

        expect(res.json).toHaveBeenCalledWith({ error: "CREATE_TOURNAMENT_ERROR" });
    });
});

describe("tournamentController.fetchTournaments", () => {
    it("returns the grouped tournaments under message", async () => {
        // Note the payload sits in `message`, which docs/api.md flags as drift.
        const grouped = { upcoming: [], ongoing: [], completed: [] };
        tournamentService.fetchTournaments.mockResolvedValue(grouped);
        const res = makeRes();

        await tournamentController.fetchTournaments(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, message: grouped });
    });

    it("returns the service error message on failure", async () => {
        tournamentService.fetchTournaments.mockRejectedValue(new Error("FETCH_TOURNAMENTS_ERROR"));
        const res = makeRes();

        await tournamentController.fetchTournaments(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "FETCH_TOURNAMENTS_ERROR" });
    });

    it("falls back to a generic code when the failure has no message", async () => {
        tournamentService.fetchTournaments.mockRejectedValue(new Error(""));
        const res = makeRes();

        await tournamentController.fetchTournaments(makeReq(), res);

        expect(res.json).toHaveBeenCalledWith({ error: "FETCH_TOURNAMENT_ERROR" });
    });
});

describe("tournamentController.fetchTournamentDetails", () => {
    it("returns the tournament view for a logged-in creator", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue({ creator: true, message: { tournament: {} } });
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(
            makeReq({ params: { tournamentId: VALID_UUID }, user: { id: "user-1" } }),
            res
        );

        expect(tournamentService.fetchTournamentDetails).toHaveBeenCalledWith(VALID_UUID, "user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            loggedIn: true,
            creator: true,
            message: { tournament: {} }
        });
    });

    it("serves an anonymous viewer without a user id", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue({ creator: false, message: {} });
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: VALID_UUID } }), res);

        expect(tournamentService.fetchTournamentDetails).toHaveBeenCalledWith(VALID_UUID, null);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ loggedIn: false, creator: false }));
    });

    it("rejects an id that is not a v1-v5 UUID without calling the service", async () => {
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: "12345" } }), res);

        expect(tournamentService.fetchTournamentDetails).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: "TOURNAMENT_NOT_FOUND" });
    });

    it("also rejects the nil UUID and a v7 UUID, which the regex does not admit", async () => {
        for (const id of ["00000000-0000-0000-0000-000000000000", "018f7a2c-1b3d-7c4e-9f2a-6b1d2e3f4a5b"]) {
            const res = makeRes();

            await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: id } }), res);

            expect(res.status).toHaveBeenCalledWith(404);
        }
    });

    it("rejects a missing id", async () => {
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 404 when the tournament does not exist", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue(null);
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: VALID_UUID } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: "TOURNAMENT_NOT_FOUND" });
    });

    it("returns the service error message on failure", async () => {
        tournamentService.fetchTournamentDetails.mockRejectedValue(new Error("FETCH_TOURNAMENT_DETAILS_ERROR"));
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: VALID_UUID } }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "FETCH_TOURNAMENT_DETAILS_ERROR" });
    });

    it("falls back to a generic code when the failure has no message", async () => {
        tournamentService.fetchTournamentDetails.mockRejectedValue(new Error(""));
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: VALID_UUID } }), res);

        expect(res.json).toHaveBeenCalledWith({ error: "FETCH_TOURNAMENT_DETAILS_ERROR" });
    });
});
