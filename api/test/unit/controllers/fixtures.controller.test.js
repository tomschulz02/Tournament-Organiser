import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/fixtures.service.js", () => ({
    fixtureService: { updateResult: vi.fn() }
}));

const { fixtureController } = await import("../../../src/controllers/fixtures.controller.js");
const { fixtureService } = await import("../../../src/services/fixtures.service.js");
const { makeReq, makeRes } = await import("../../helpers/http.js");

const VALID_UUID = "45bb764e-c07d-474e-8d01-9d9711d39a3a";

beforeEach(() => {
    vi.mocked(fixtureService.updateResult).mockReset();
});

// The controller does not catch. A rejected service call propagates to the error
// middleware, which owns every status and message.

describe("fixtureController.updateResult", () => {
    it("passes the id, the session user, the sets and the intent to the service", async () => {
        const data = { id: VALID_UUID, status: "COMPLETED", completedGames: 2 };
        fixtureService.updateResult.mockResolvedValue(data);
        const res = makeRes();

        await fixtureController.updateResult(
            makeReq({
                params: { fixtureId: VALID_UUID },
                body: { sets: [[21, 15]], finished: true },
                user: { id: "user-1" }
            }),
            res
        );

        expect(fixtureService.updateResult).toHaveBeenCalledWith(VALID_UUID, "user-1", [[21, 15]], true);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, message: "Result recorded", data });
    });

    it("ignores a status the client tries to send, because the body is destructured", async () => {
        fixtureService.updateResult.mockResolvedValue({});

        await fixtureController.updateResult(
            makeReq({
                params: { fixtureId: VALID_UUID },
                body: { sets: [], finished: false, status: "COMPLETED", round: "Finals" },
                user: { id: "user-1" }
            }),
            makeRes()
        );

        expect(fixtureService.updateResult).toHaveBeenCalledWith(VALID_UUID, "user-1", [], false);
    });

    it("passes an absent body through, for the service to reject or treat as no sets", async () => {
        fixtureService.updateResult.mockResolvedValue({});

        await fixtureController.updateResult(
            makeReq({ params: { fixtureId: VALID_UUID }, user: { id: "user-1" } }),
            makeRes()
        );

        expect(fixtureService.updateResult)
            .toHaveBeenCalledWith(VALID_UUID, "user-1", undefined, undefined);
    });

    it.each([
        ["a plain string", "12345"],
        ["the nil UUID", "00000000-0000-0000-0000-000000000000"],
        ["a v7 UUID", "018f7a2c-1b3d-7c4e-9f2a-6b1d2e3f4a5b"]
    ])("rejects %s without calling the service", async (_label, fixtureId) => {
        const res = makeRes();

        await expect(
            fixtureController.updateResult(makeReq({ params: { fixtureId }, user: { id: "user-1" } }), res)
        ).rejects.toMatchObject({ code: "FIXTURE_NOT_FOUND", status: 404 });

        expect(fixtureService.updateResult).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("rejects a missing id", async () => {
        await expect(
            fixtureController.updateResult(makeReq({ user: { id: "user-1" } }), makeRes())
        ).rejects.toMatchObject({ code: "FIXTURE_NOT_FOUND" });
    });

    it("lets the service's refusal propagate", async () => {
        const failure = Object.assign(new Error("You do not own this tournament"), { code: "NOT_TOURNAMENT_OWNER" });
        fixtureService.updateResult.mockRejectedValue(failure);
        const res = makeRes();

        await expect(
            fixtureController.updateResult(
                makeReq({ params: { fixtureId: VALID_UUID }, body: {}, user: { id: "user-2" } }),
                res
            )
        ).rejects.toBe(failure);

        expect(res.json).not.toHaveBeenCalled();
    });
});
