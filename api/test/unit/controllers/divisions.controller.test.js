import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/progression.service.js", () => ({
    progressionService: {
        getProposal: vi.fn(),
        commit: vi.fn()
    }
}));

vi.mock("../../../src/services/divisions.service.js", () => ({
    divisionService: { updateDivision: vi.fn(), updateDivisionColour: vi.fn() }
}));

const { divisionController } = await import("../../../src/controllers/divisions.controller.js");
const { progressionService } = await import("../../../src/services/progression.service.js");
const { divisionService } = await import("../../../src/services/divisions.service.js");
const { makeReq, makeRes } = await import("../../helpers/http.js");

beforeEach(() => {
    vi.mocked(progressionService.getProposal).mockReset();
    vi.mocked(progressionService.commit).mockReset();
    vi.mocked(divisionService.updateDivision).mockReset();
    vi.mocked(divisionService.updateDivisionColour).mockReset();
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

describe("divisionController.updateDivision", () => {
    it("passes the whole body through and reports the outcome", async () => {
        // The body is not picked apart here: which of a rename and a rebuild
        // this is follows from the data, and that derivation is the service's.
        const payload = { teams: [{ id: "t1", name: "Aces" }], num_groups: 1, knockout_teams: 0 };
        divisionService.updateDivision.mockResolvedValue({ divisionId: "div-1", rebuilt: false, renamed: 1 });
        const res = makeRes();

        await divisionController.updateDivision(req({ body: payload }), res);

        expect(divisionService.updateDivision).toHaveBeenCalledWith("div-1", "user-1", payload);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Division updated",
            data: { divisionId: "div-1", rebuilt: false, renamed: 1 }
        });
    });
});

describe("divisionController.updateDivisionColour", () => {
    it("passes the chosen colour through and reports the outcome", async () => {
        divisionService.updateDivisionColour.mockResolvedValue({ divisionId: "div-1", color: "accent-3" });
        const res = makeRes();

        await divisionController.updateDivisionColour(req({ body: { color: "accent-3" } }), res);

        expect(divisionService.updateDivisionColour).toHaveBeenCalledWith("div-1", "user-1", "accent-3");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Division colour updated",
            data: { divisionId: "div-1", color: "accent-3" }
        });
    });

    // A body with no colour is how the choice is cleared, so it has to reach the
    // service as null rather than be treated as a missing field.
    it.each([{ body: {} }, { body: undefined }])("sends null when no colour is given (%p)", async (overrides) => {
        divisionService.updateDivisionColour.mockResolvedValue({ divisionId: "div-1", color: null });
        const res = makeRes();

        await divisionController.updateDivisionColour(req(overrides), res);

        expect(divisionService.updateDivisionColour).toHaveBeenCalledWith("div-1", "user-1", null);
    });
});

// Status and message mapping is no longer this controller's job. The full table
// of progression codes is driven end to end in
// test/integration/routes/divisions.route.test.js; here we only check that a
// failure is not swallowed on its way to the error middleware.
describe("failure handling", () => {
    it("lets a failure from the proposal endpoint propagate", async () => {
        const failure = new Error("ROUND_NOT_COMPLETE");
        progressionService.getProposal.mockRejectedValue(failure);
        const res = makeRes();

        await expect(divisionController.getProgression(req(), res)).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });

    it("lets a failure from the commit endpoint propagate", async () => {
        const failure = new Error("DUPLICATE_TEAM");
        progressionService.commit.mockRejectedValue(failure);
        const res = makeRes();

        await expect(divisionController.commitProgression(req({ body: { teams: [] } }), res)).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });

    it("lets a failure from the division update endpoint propagate", async () => {
        const failure = new Error("DIVISION_HAS_RESULTS");
        divisionService.updateDivision.mockRejectedValue(failure);
        const res = makeRes();

        await expect(divisionController.updateDivision(req({ body: { teams: [] } }), res)).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });

    it("lets a failure from the colour endpoint propagate", async () => {
        const failure = new Error("INVALID_DIVISION_COLOUR");
        divisionService.updateDivisionColour.mockRejectedValue(failure);
        const res = makeRes();

        await expect(divisionController.updateDivisionColour(req({ body: { color: "red" } }), res)).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });
});
