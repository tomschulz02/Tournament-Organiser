import { describe, it, expect, beforeEach, vi } from "vitest";

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
    vi.mocked(tournamentService.updateSchedule).mockReset();
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

    describe("caching", () => {
        const CHANGE_KEY = "1754042400000";

        function loadableWith(overrides = {}) {
            tournamentService.fetchTournamentDetails.mockResolvedValue({
                creator: true,
                changeKey: CHANGE_KEY,
                view: {},
                ...overrides
            });
        }

        async function fetchAs(res, { user = { id: "user-1" }, ifNoneMatch } = {}) {
            await tournamentController.fetchTournamentDetails(
                makeReq({
                    params: { tournamentId: VALID_UUID },
                    user,
                    headers: ifNoneMatch ? { "if-none-match": ifNoneMatch } : {}
                }),
                res
            );
        }

        it("offers an ETag and forbids a shared cache from reusing the response", async () => {
            loadableWith();
            const res = makeRes();

            await fetchAs(res);

            expect(res.headers.ETag).toMatch(/^".+"$/);
            // Without Vary, a shared cache could hand the organiser's body to
            // the next reader regardless of the ETag.
            expect(res.headers.Vary).toBe("Cookie");
            expect(res.headers["Cache-Control"]).toBe("no-cache");
        });

        it("answers 304 with no body when the validator matches", async () => {
            loadableWith();
            const first = makeRes();
            await fetchAs(first);

            const second = makeRes();
            await fetchAs(second, { ifNoneMatch: first.headers.ETag });

            expect(second.status).toHaveBeenCalledWith(304);
            expect(second.end).toHaveBeenCalled();
            expect(second.json).not.toHaveBeenCalled();
        });

        it("answers 200 when the data has moved", async () => {
            loadableWith();
            const first = makeRes();
            await fetchAs(first);

            loadableWith({ changeKey: "1754042499999" });
            const second = makeRes();
            await fetchAs(second, { ifNoneMatch: first.headers.ETag });

            expect(second.status).toHaveBeenCalledWith(200);
            expect(second.json).toHaveBeenCalled();
        });

        // THE TRAP. The organiser's validator must never be honoured for a
        // signed-out reader, or they receive a 304 and render the cached page
        // complete with management controls.
        it("refuses the organiser's validator for a signed-out reader", async () => {
            loadableWith({ creator: true });
            const organiser = makeRes();
            await fetchAs(organiser, { user: { id: "user-1" } });

            loadableWith({ creator: false });
            const anonymous = makeRes();
            await fetchAs(anonymous, { user: null, ifNoneMatch: organiser.headers.ETag });

            expect(anonymous.status).toHaveBeenCalledWith(200);
            expect(anonymous.status).not.toHaveBeenCalledWith(304);
            expect(anonymous.json.mock.calls[0][0].data).toMatchObject({ loggedIn: false, creator: false });
            expect(anonymous.headers.ETag).not.toBe(organiser.headers.ETag);
        });

        it("refuses one signed-in user's validator for another", async () => {
            loadableWith();
            const first = makeRes();
            await fetchAs(first, { user: { id: "user-1" } });

            const second = makeRes();
            await fetchAs(second, { user: { id: "user-2" }, ifNoneMatch: first.headers.ETag });

            expect(second.status).toHaveBeenCalledWith(200);
        });

        // Nothing to validate against, so every request is answered in full
        // rather than risking a validator that means nothing.
        it("offers no ETag and never 304s when the change key is unknown", async () => {
            loadableWith({ changeKey: null });
            const res = makeRes();

            await fetchAs(res, { ifNoneMatch: '"anything"' });

            expect(res.headers.ETag).toBeUndefined();
            expect(res.status).toHaveBeenCalledWith(200);
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

describe("tournamentController.updateSchedule", () => {
    const schedule = { version: 1, entries: [] };

    it("hands the id, the session user and the schedule to the service", async () => {
        tournamentService.updateSchedule.mockResolvedValue({ id: VALID_UUID, entries: 0 });
        const res = makeRes();

        await tournamentController.updateSchedule(
            makeReq({ params: { tournamentId: VALID_UUID }, body: { schedule }, user: { id: "user-1" } }),
            res
        );

        expect(tournamentService.updateSchedule).toHaveBeenCalledWith(VALID_UUID, "user-1", schedule);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Schedule saved",
            data: { id: VALID_UUID, entries: 0 }
        });
    });

    // The controller does not decide what a valid schedule is. An empty body
    // reaches the validator as undefined and is refused there, so the two
    // definitions of "malformed" cannot drift apart.
    it("passes an absent schedule straight through rather than guessing at one", async () => {
        tournamentService.updateSchedule.mockResolvedValue({ id: VALID_UUID, entries: 0 });

        await tournamentController.updateSchedule(
            makeReq({ params: { tournamentId: VALID_UUID }, body: undefined, user: { id: "user-1" } }),
            makeRes()
        );

        expect(tournamentService.updateSchedule).toHaveBeenCalledWith(VALID_UUID, "user-1", undefined);
    });

    it("rejects an id that is not a UUID without calling the service", async () => {
        await expect(
            tournamentController.updateSchedule(
                makeReq({ params: { tournamentId: "12345" }, body: { schedule }, user: { id: "user-1" } }),
                makeRes()
            )
        ).rejects.toMatchObject({ code: "TOURNAMENT_NOT_FOUND", status: 404 });

        expect(tournamentService.updateSchedule).not.toHaveBeenCalled();
    });

    it("lets the validator's refusal propagate", async () => {
        const failure = Object.assign(new Error("A team is scheduled in two places at once"), {
            code: "SCHEDULE_TEAM_CLASH"
        });
        tournamentService.updateSchedule.mockRejectedValue(failure);
        const res = makeRes();

        await expect(
            tournamentController.updateSchedule(
                makeReq({ params: { tournamentId: VALID_UUID }, body: { schedule }, user: { id: "user-1" } }),
                res
            )
        ).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
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
