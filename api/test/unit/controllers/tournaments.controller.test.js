import { describe, it, expect, beforeEach, vi } from "vitest";

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

const { tournamentController } = await import("../../../src/controllers/tournaments.controller.js");
const { tournamentService } = await import("../../../src/services/tournaments.service.js");
const { makeReq, makeRes } = await import("../../helpers/http.js");

const VALID_UUID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";

beforeEach(() => {
    vi.mocked(tournamentService.createTournament).mockReset();
    vi.mocked(tournamentService.fetchTournaments).mockReset();
    vi.mocked(tournamentService.fetchTournamentDetails).mockReset();
    vi.mocked(tournamentService.startTournament).mockReset();
    vi.mocked(tournamentService.endTournament).mockReset();
    vi.mocked(tournamentService.deleteTournament).mockReset();
});

// The controllers no longer catch. A rejected service call propagates to the
// error middleware, which owns every status and message.

describe("tournamentController.createTournament", () => {
    it("creates the tournament for the logged-in user and returns 201", async () => {
        tournamentService.createTournament.mockResolvedValue("tour-1");
        const res = makeRes();
        const body = { details: {}, divisions: [] };

        await tournamentController.createTournament(makeReq({ body, user: { id: "user-1" } }), res);

        expect(tournamentService.createTournament).toHaveBeenCalledWith(body, "user-1");
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Tournament created successfully",
            data: { id: "tour-1" }
        });
    });

    it("lets a failure propagate rather than leaking the service's error text", async () => {
        const failure = new Error("insert failed");
        tournamentService.createTournament.mockRejectedValue(failure);
        const res = makeRes();

        await expect(
            tournamentController.createTournament(makeReq({ user: { id: "user-1" } }), res)
        ).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });
});

describe("tournamentController.fetchTournaments", () => {
    it("returns the grouped tournaments in data", async () => {
        const grouped = { upcoming: [], ongoing: [], completed: [] };
        tournamentService.fetchTournaments.mockResolvedValue(grouped);
        const res = makeRes();

        await tournamentController.fetchTournaments(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, message: "Tournaments fetched", data: grouped });
    });

    it("lets a failure propagate", async () => {
        const failure = new Error("connection lost");
        tournamentService.fetchTournaments.mockRejectedValue(failure);

        await expect(tournamentController.fetchTournaments(makeReq(), makeRes())).rejects.toBe(failure);
    });
});

describe("tournamentController.fetchTournamentDetails", () => {
    it("returns the view alongside loggedIn and creator, all inside data", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue({
            creator: true,
            view: { tournament: { id: "tour-1" }, dashboard: {}, divisions: [] }
        });
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(
            makeReq({ params: { tournamentId: VALID_UUID }, user: { id: "user-1" } }),
            res
        );

        expect(tournamentService.fetchTournamentDetails).toHaveBeenCalledWith(VALID_UUID, "user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Tournament fetched",
            data: {
                loggedIn: true,
                creator: true,
                tournament: { id: "tour-1" },
                dashboard: {},
                divisions: []
            }
        });
    });

    it("serves an anonymous viewer without a user id", async () => {
        tournamentService.fetchTournamentDetails.mockResolvedValue({ creator: false, view: {} });
        const res = makeRes();

        await tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: VALID_UUID } }), res);

        expect(tournamentService.fetchTournamentDetails).toHaveBeenCalledWith(VALID_UUID, null);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Tournament fetched",
            data: { loggedIn: false, creator: false }
        });
    });

    it("rejects an id that is not a v1-v5 UUID without calling the service", async () => {
        const res = makeRes();

        await expect(
            tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: "12345" } }), res)
        ).rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });

        expect(tournamentService.fetchTournamentDetails).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("also rejects the nil UUID and a v7 UUID, which the regex does not admit", async () => {
        for (const id of ["00000000-0000-0000-0000-000000000000", "018f7a2c-1b3d-7c4e-9f2a-6b1d2e3f4a5b"]) {
            await expect(
                tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: id } }), makeRes())
            ).rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND" });
        }
    });

    it("rejects a missing id", async () => {
        await expect(
            tournamentController.fetchTournamentDetails(makeReq(), makeRes())
        ).rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND" });
    });

    it("lets the service's not-found propagate", async () => {
        const failure = Object.assign(new Error("Tournament not found"), { code: "TOURNAMENT_NOT_FOUND" });
        tournamentService.fetchTournamentDetails.mockRejectedValue(failure);

        await expect(
            tournamentController.fetchTournamentDetails(makeReq({ params: { tournamentId: VALID_UUID } }), makeRes())
        ).rejects.toBe(failure);
    });
});

// The three lifecycle controllers are the same shape: guard the id, hand the id
// and the session user to the service, answer 200 with whatever it returned.
describe.each([
    ["startTournament", "Tournament started"],
    ["endTournament", "Tournament ended"],
    ["deleteTournament", "Tournament deleted"]
])("tournamentController.%s", (method, message) => {
    it("passes the id and the session user to the service", async () => {
        const data = { id: VALID_UUID };
        tournamentService[method].mockResolvedValue(data);
        const res = makeRes();

        await tournamentController[method](
            makeReq({ params: { tournamentId: VALID_UUID }, user: { id: "user-1" } }),
            res
        );

        expect(tournamentService[method]).toHaveBeenCalledWith(VALID_UUID, "user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, message, data });
    });

    it("rejects an id that is not a UUID without calling the service", async () => {
        const res = makeRes();

        await expect(
            tournamentController[method](makeReq({ params: { tournamentId: "12345" }, user: { id: "user-1" } }), res)
        ).rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });

        expect(tournamentService[method]).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("lets the service's refusal propagate", async () => {
        const failure = Object.assign(new Error("You do not own this tournament"), { code: "NOT_TOURNAMENT_OWNER" });
        tournamentService[method].mockRejectedValue(failure);
        const res = makeRes();

        await expect(
            tournamentController[method](
                makeReq({ params: { tournamentId: VALID_UUID }, user: { id: "user-2" } }),
                res
            )
        ).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });
});
