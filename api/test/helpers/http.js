import { vi } from "vitest";

// Minimal Express request/response doubles for calling a controller directly.
// res.status() returns res so the usual res.status(x).json(y) chain works.
export function makeRes() {
    const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
        send: vi.fn(() => res),
        cookie: vi.fn(() => res),
        clearCookie: vi.fn(() => res)
    };
    return res;
}

export function makeReq(overrides = {}) {
    return {
        params: {},
        body: {},
        query: {},
        cookies: {},
        user: null,
        ...overrides
    };
}
