import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/progression.service.js", () => ({
    progressionService: { getProposal: vi.fn(), commit: vi.fn() }
}));

const app = (await import("../../../src/app.js")).default;
const { progressionService } = await import("../../../src/services/progression.service.js");
const { AppError } = await import("../../../src/errors.js");
const { authCookie } = await import("../../helpers/auth.js");

const PROGRESSION_URL = "/api/divisions/div-1/progression";

beforeEach(() => {
    vi.mocked(progressionService.getProposal).mockReset();
    vi.mocked(progressionService.commit).mockReset();
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

// Declared but not built, like the tournament stubs. Each answers 501 in the
// standard envelope, behind requireAuth so the auth shape is already right.
describe.each([
    ["post", "/api/divisions/div-1/teams", "add team"],
    ["put", "/api/divisions/div-1/teams/team-1", "edit team"],
    ["delete", "/api/divisions/div-1/teams/team-1", "remove team"]
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
