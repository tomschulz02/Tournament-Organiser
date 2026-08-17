import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/progression.service.js", () => ({
    progressionService: { getProposal: vi.fn(), commit: vi.fn() }
}));

vi.mock("../../../src/services/divisions.service.js", () => ({
    divisionService: { updateDivision: vi.fn(), deleteDivision: vi.fn() }
}));

const app = (await import("../../../src/app.js")).default;
const { progressionService } = await import("../../../src/services/progression.service.js");
const { divisionService } = await import("../../../src/services/divisions.service.js");
const { AppError } = await import("../../../src/errors.js");
const { authCookie } = await import("../../helpers/auth.js");

const PROGRESSION_URL = "/api/divisions/div-1/progression";
const DIVISION_URL = "/api/divisions/div-1";

beforeEach(() => {
    vi.mocked(progressionService.getProposal).mockReset();
    vi.mocked(progressionService.commit).mockReset();
    vi.mocked(divisionService.updateDivision).mockReset();
    vi.mocked(divisionService.deleteDivision).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/divisions/:divisionId/progression", () => {
    it("requires a session", async () => {
        const response = await request(app).get(PROGRESSION_URL);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
        expect(progressionService.getProposal).not.toHaveBeenCalled();
    });

    it("returns the proposal in the documented envelope", async () => {
        const proposal = { divisionId: "div-1", roundIndex: 0, qualifiers: [] };
        progressionService.getProposal.mockResolvedValue(proposal);

        const response = await request(app)
            .get(PROGRESSION_URL)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Progression proposal", data: proposal });
        expect(progressionService.getProposal).toHaveBeenCalledWith("div-1", "user-1");
    });
});

describe("POST /api/divisions/:divisionId/progression", () => {
    it("requires a session", async () => {
        const response = await request(app).post(PROGRESSION_URL).send({ teams: ["t1"] });

        expect(response.status).toBe(401);
        expect(progressionService.commit).not.toHaveBeenCalled();
    });

    it("commits the confirmed team list", async () => {
        const result = { divisionId: "div-1", nextRoundIndex: 1, fixturesBound: 2, amended: false };
        progressionService.commit.mockResolvedValue(result);

        const response = await request(app)
            .post(PROGRESSION_URL)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }))
            .send({ teams: ["t1", "t2", "t3", "t4"] });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Round progressed", data: result });
        expect(progressionService.commit).toHaveBeenCalledWith("div-1", "user-1", ["t1", "t2", "t3", "t4"]);
    });

    it("passes an absent teams field through as undefined", async () => {
        progressionService.commit.mockRejectedValue(new AppError("INVALID_RESULTS"));

        const response = await request(app)
            .post(PROGRESSION_URL)
            .set("Cookie", authCookie())
            .send({});

        expect(progressionService.commit).toHaveBeenCalledWith("div-1", "user-1", undefined);
        expect(response.status).toBe(400);
    });
});

describe("PUT /api/divisions/:divisionId", () => {
    const payload = {
        teams: [{ id: "t1", name: "Aces" }, { name: "Bears" }],
        num_groups: 1,
        knockout_teams: 0
    };

    it("requires a session", async () => {
        const response = await request(app).put(DIVISION_URL).send(payload);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
        expect(divisionService.updateDivision).not.toHaveBeenCalled();
    });

    it("passes the submitted list through and answers in the documented envelope", async () => {
        const result = { divisionId: "div-1", rebuilt: true, teams: [], fixtures: 6, scheduleEntriesRemoved: 2 };
        divisionService.updateDivision.mockResolvedValue(result);

        const response = await request(app)
            .put(DIVISION_URL)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }))
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Division updated", data: result });
        expect(divisionService.updateDivision).toHaveBeenCalledWith("div-1", "user-1", payload);
    });
});

describe("DELETE /api/divisions/:divisionId", () => {
    it("requires a session", async () => {
        const response = await request(app).delete(DIVISION_URL);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
        expect(divisionService.deleteDivision).not.toHaveBeenCalled();
    });

    it("removes the division and answers in the documented envelope", async () => {
        const result = {
            divisionId: "div-1",
            tournamentId: "tour-1",
            fixturesRemoved: 6,
            scheduleEntriesRemoved: 4
        };
        divisionService.deleteDivision.mockResolvedValue(result);

        const response = await request(app)
            .delete(DIVISION_URL)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Division removed", data: result });
        expect(divisionService.deleteDivision).toHaveBeenCalledWith("div-1", "user-1");
    });
});

// Every refusal this endpoint can raise, driven end to end. Both 409s are here:
// a started tournament and the last division are different rules with different
// messages, and the client shows whichever comes back.
describe.each([
    ["NOT_TOURNAMENT_OWNER", 403, "You do not own this tournament"],
    ["DIVISION_NOT_FOUND", 404, "Division not found"],
    ["TOURNAMENT_ALREADY_STARTED", 409, "This tournament has already started"],
    ["LAST_DIVISION", 409, "A tournament needs at least one division"]
])("division removal error %s", (code, status, message) => {
    it(`returns ${status}`, async () => {
        divisionService.deleteDivision.mockRejectedValue(new AppError(code));

        const response = await request(app).delete(DIVISION_URL).set("Cookie", authCookie());

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ success: false, message, data: null });
    });
});

// The conditions this endpoint adds to the catalogue, driven end to end.
describe.each([
    ["TEAM_NOT_IN_DIVISION", 400, "A team does not belong to this division"],
    ["INVALID_STRUCTURE", 400, "The group and qualifier counts do not fit the number of teams"],
    ["MISSING_FIELDS", 400, "Missing required fields"],
    ["DUPLICATE_TEAM", 400, "A team appears more than once"],
    ["NOT_TOURNAMENT_OWNER", 403, "You do not own this tournament"],
    ["DIVISION_NOT_FOUND", 404, "Division not found"],
    ["TOURNAMENT_ALREADY_STARTED", 409, "This tournament has already started"],
    ["DIVISION_HAS_RESULTS", 409, "This division already has results"]
])("division update error %s", (code, status, message) => {
    it(`returns ${status}`, async () => {
        divisionService.updateDivision.mockRejectedValue(new AppError(code));

        const response = await request(app)
            .put(DIVISION_URL)
            .set("Cookie", authCookie())
            .send({ teams: [] });

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ success: false, message, data: null });
    });
});

// The three 501 team stubs were removed on 2026-08-10, superseded by the single
// PUT above. Their paths are gone, not merely unimplemented.
describe.each([
    ["post", "/api/divisions/div-1/teams"],
    ["put", "/api/divisions/div-1/teams/team-1"],
    ["delete", "/api/divisions/div-1/teams/team-1"]
])("%s %s", (method, path) => {
    it("is no longer routed", async () => {
        const response = await request(app)[method](path).set("Cookie", authCookie());

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, message: "Not found", data: null });
    });
});

// The status codes documented in docs/api.md, driven end to end. This is the
// table that used to be ERROR_STATUS in divisions.controller.js; the codes now
// resolve through the catalogue in src/errors.js and the error middleware.
describe.each([
    ["DIVISION_NOT_FOUND", 404, "Division not found"],
    ["ROUND_NOT_FOUND", 404, "Round not found"],
    ["NOT_TOURNAMENT_OWNER", 403, "You do not own this tournament"],
    ["ROUND_NOT_COMPLETE", 409, "This round still has unplayed fixtures"],
    ["NO_NEXT_ROUND", 409, "This is the final round"],
    ["NEXT_ROUND_ALREADY_STARTED", 409, "The next round has already started"],
    ["INVALID_RESULTS", 400, "Invalid results list"],
    ["WRONG_QUALIFIER_COUNT", 400, "Wrong number of qualifying teams"],
    ["DUPLICATE_TEAM", 400, "A team appears more than once"],
    ["TEAM_NOT_IN_ROUND", 400, "A team did not play in this round"],
    // Not a declared condition, so it falls through to the generic fault.
    ["SOMETHING_UNEXPECTED", 500, "Internal server error"]
])("progression error %s", (code, status, message) => {
    it(`returns ${status} from the proposal endpoint`, async () => {
        progressionService.getProposal.mockRejectedValue(new AppError(code));

        const response = await request(app).get(PROGRESSION_URL).set("Cookie", authCookie());

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ success: false, message, data: null });
    });

    it(`returns ${status} from the commit endpoint`, async () => {
        progressionService.commit.mockRejectedValue(new AppError(code));

        const response = await request(app)
            .post(PROGRESSION_URL)
            .set("Cookie", authCookie())
            .send({ teams: ["t1"] });

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ success: false, message, data: null });
    });
});
