import { describe, it, expect, vi } from "vitest";
import { requireAuth } from "../../../src/middleware/requireAuth.js";

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

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects with 401 when req.user is null", () => {
        const res = makeRes();
        const next = vi.fn();

        requireAuth({ user: null }, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
        expect(next).not.toHaveBeenCalled();
    });

    it("rejects when req.user was never set", () => {
        const res = makeRes();
        const next = vi.fn();

        requireAuth({}, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
