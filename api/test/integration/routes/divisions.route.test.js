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
        expect(response.body).toEqual({ error: "Authentication required" });
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
        progressionService.commit.mockRejectedValue(new Error("INVALID_RESULTS"));

        const response = await request(app)
            .post(PROGRESSION_URL)
            .set("Cookie", authCookie())
            .send({});

        expect(progressionService.commit).toHaveBeenCalledWith("div-1", "user-1", undefined);
        expect(response.status).toBe(400);
    });
});

// The status codes documented in docs/api.md, driven end to end.
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
    ["SOMETHING_UNEXPECTED", 500, "Internal server error"]
])("progression error %s", (code, status, message) => {
    it(`returns ${status} from the proposal endpoint`, async () => {
        progressionService.getProposal.mockRejectedValue(new Error(code));

        const response = await request(app).get(PROGRESSION_URL).set("Cookie", authCookie());

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ error: message });
    });

    it(`returns ${status} from the commit endpoint`, async () => {
        progressionService.commit.mockRejectedValue(new Error(code));

        const response = await request(app)
            .post(PROGRESSION_URL)
            .set("Cookie", authCookie())
            .send({ teams: ["t1"] });

        expect(response.status).toBe(status);
        expect(response.body).toEqual({ error: message });
    });
});
