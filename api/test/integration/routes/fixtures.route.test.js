import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/services/fixtures.service.js", () => ({
    fixtureService: { updateResult: vi.fn() }
}));

const app = (await import("../../../src/app.js")).default;
const { fixtureService } = await import("../../../src/services/fixtures.service.js");
const { AppError } = await import("../../../src/errors.js");
const { authCookie } = await import("../../helpers/auth.js");

const VALID_UUID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";
const PATH = `/api/fixtures/${VALID_UUID}/result`;

beforeEach(() => {
    vi.mocked(fixtureService.updateResult).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT /api/fixtures/:fixtureId/result", () => {
    it("requires a session", async () => {
        const response = await request(app).put(PATH).send({ sets: [[21, 15]], finished: true });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "You must be logged in to do that",
            data: null
        });
        expect(fixtureService.updateResult).not.toHaveBeenCalled();
    });

    it("records the result for the signed-in owner", async () => {
        const data = { id: VALID_UUID, status: "COMPLETED", completedGames: 2 };
        fixtureService.updateResult.mockResolvedValue(data);

        const response = await request(app)
            .put(PATH)
            .set("Cookie", authCookie({ id: "user-1", username: "tom" }))
            .send({ sets: [[21, 15], [21, 18]], finished: true });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Result recorded", data });
        expect(fixtureService.updateResult)
            .toHaveBeenCalledWith(VALID_UUID, "user-1", [[21, 15], [21, 18]], true);
    });

    it("answers 403 for a signed-in user who does not own the tournament", async () => {
        fixtureService.updateResult.mockRejectedValue(new AppError("NOT_TOURNAMENT_OWNER"));

        const response = await request(app)
            .put(PATH)
            .set("Cookie", authCookie({ id: "user-2" }))
            .send({ sets: [[21, 15]], finished: true });

        expect(response.status).toBe(403);
        expect(response.body.message).toBe("You do not own this tournament");
    });

    it("answers 404 when the fixture does not exist", async () => {
        fixtureService.updateResult.mockRejectedValue(new AppError("FIXTURE_NOT_FOUND"));

        const response = await request(app).put(PATH).set("Cookie", authCookie()).send({ sets: [] });

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Fixture not found");
    });

    it("answers 404 for an id that is not a UUID, without reaching the service", async () => {
        const response = await request(app)
            .put("/api/fixtures/not-a-uuid/result")
            .set("Cookie", authCookie())
            .send({ sets: [] });

        expect(response.status).toBe(404);
        expect(fixtureService.updateResult).not.toHaveBeenCalled();
    });

    it("answers 400 for a fixture whose teams are not bound yet", async () => {
        fixtureService.updateResult.mockRejectedValue(new AppError("FIXTURE_NOT_READY"));

        const response = await request(app).put(PATH).set("Cookie", authCookie()).send({ sets: [[21, 15]] });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("This match does not have both teams yet");
    });

    it("answers 400 for a malformed score", async () => {
        fixtureService.updateResult.mockRejectedValue(new AppError("INVALID_SCORE"));

        const response = await request(app).put(PATH).set("Cookie", authCookie()).send({ sets: [[21, -1]] });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Scores must be whole numbers of zero or more");
    });

    it("hides an unexpected failure behind a generic 500", async () => {
        fixtureService.updateResult.mockRejectedValue(new Error("deadlock detected"));

        const response = await request(app).put(PATH).set("Cookie", authCookie()).send({ sets: [] });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, message: "Internal server error", data: null });
    });

    it("has no other verb on the path", async () => {
        // POST /fixtures/result/:id was the old shape the frontend called. It is
        // gone, not aliased: docs/api.md settles on the resource-first form.
        const response = await request(app).post(PATH).set("Cookie", authCookie()).send({ sets: [] });

        expect(response.status).toBe(404);
    });
});
