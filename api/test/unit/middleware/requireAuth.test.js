import { describe, it, expect, vi } from "vitest";
import { requireAuth } from "../../../src/middleware/requireAuth.js";
import { AppError } from "../../../src/errors.js";

function makeRes() {
    const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res)
    };
    return res;
}

describe("requireAuth", () => {
    it("passes the request on when a session is present", () => {
        const res = makeRes();
        const next = vi.fn();

        requireAuth({ user: { id: "user-1" } }, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("hands a 401 to the error middleware when req.user is null", () => {
        const res = makeRes();
        const next = vi.fn();

        requireAuth({ user: null }, res, next);

        const failure = next.mock.calls[0][0];
        expect(failure).toBeInstanceOf(AppError);
        expect(failure.code).toBe("AUTH_REQUIRED");
        expect(failure.status).toBe(401);
        // The middleware never responds itself, so the envelope stays in one place.
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("rejects when req.user was never set", () => {
        const res = makeRes();
        const next = vi.fn();

        requireAuth({}, res, next);

        expect(next.mock.calls[0][0].code).toBe("AUTH_REQUIRED");
        expect(res.status).not.toHaveBeenCalled();
    });
});
