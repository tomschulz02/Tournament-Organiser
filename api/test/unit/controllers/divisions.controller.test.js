import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/progression.service.js", () => ({
    progressionService: {
        getProposal: vi.fn(),
        commit: vi.fn()
    }
}));

const { divisionController } = await import("../../../src/controllers/divisions.controller.js");
const { progressionService } = await import("../../../src/services/progression.service.js");
const { makeReq, makeRes } = await import("../../helpers/http.js");

beforeEach(() => {
    vi.mocked(progressionService.getProposal).mockReset();
    vi.mocked(progressionService.commit).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

function req(overrides = {}) {
    return makeReq({ params: { divisionId: "div-1" }, user: { id: "user-1" }, ...overrides });
}

describe("divisionController.getProgression", () => {
    it("returns the proposal for the division's current round", async () => {
        progressionService.getProposal.mockResolvedValue({ roundIndex: 0 });
        const res = makeRes();

        await divisionController.getProgression(req(), res);

        expect(progressionService.getProposal).toHaveBeenCalledWith("div-1", "user-1");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Progression proposal",
            data: { roundIndex: 0 }
        });
    });
});

describe("divisionController.commitProgression", () => {
    it("passes the confirmed team list through and reports the outcome", async () => {
        progressionService.commit.mockResolvedValue({ fixturesBound: 2 });
        const res = makeRes();

        await divisionController.commitProgression(req({ body: { teams: ["t1", "t2"] } }), res);

        expect(progressionService.commit).toHaveBeenCalledWith("div-1", "user-1", ["t1", "t2"]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Round progressed",
            data: { fixturesBound: 2 }
        });
    });
});

describe("error mapping", () => {
    // Every entry of ERROR_STATUS, driven through both endpoints.
    const cases = [
        ["DIVISION_NOT_FOUND", 404, "Division not found"],
        ["ROUND_NOT_FOUND", 404, "Round not found"],
        ["NOT_TOURNAMENT_OWNER", 403, "You do not own this tournament"],
        ["ROUND_NOT_COMPLETE", 409, "This round still has unplayed fixtures"],
        ["NO_NEXT_ROUND", 409, "This is the final round"],
        ["NEXT_ROUND_ALREADY_STARTED", 409, "The next round has already started"],
        ["INVALID_RESULTS", 400, "Invalid results list"],
        ["WRONG_QUALIFIER_COUNT", 400, "Wrong number of qualifying teams"],
        ["DUPLICATE_TEAM", 400, "A team appears more than once"],
        ["TEAM_NOT_IN_ROUND", 400, "A team did not play in this round"]
    ];

    it.each(cases)("maps %s from the proposal endpoint to %i", async (code, status, message) => {
        progressionService.getProposal.mockRejectedValue(new Error(code));
        const res = makeRes();

        await divisionController.getProgression(req(), res);

        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json).toHaveBeenCalledWith({ error: message });
    });

    it.each(cases)("maps %s from the commit endpoint to %i", async (code, status, message) => {
        progressionService.commit.mockRejectedValue(new Error(code));
        const res = makeRes();

        await divisionController.commitProgression(req({ body: { teams: [] } }), res);

        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json).toHaveBeenCalledWith({ error: message });
    });

    it("hides an unmapped error behind a 500 and logs it", async () => {
        const failure = new Error("SOMETHING_UNEXPECTED");
        progressionService.getProposal.mockRejectedValue(failure);
        const res = makeRes();

        await divisionController.getProgression(req(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
        expect(console.error).toHaveBeenCalledWith(failure);
    });
});
