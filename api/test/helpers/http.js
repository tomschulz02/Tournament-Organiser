import { vi } from "vitest";

// Minimal Express request/response doubles for calling a controller directly.
// res.status() returns res so the usual res.status(x).json(y) chain works.
export function makeRes() {
    const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
        send: vi.fn(() => res),
        end: vi.fn(() => res),
        // Records what was set so a test can assert ETag, Vary and Cache-Control
        // without reaching into the mock's call list.
        headers: {},
        set: vi.fn((name, value) => {
            res.headers[name] = value;
            return res;
        }),
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
        headers: {},
        user: null,
        ...overrides
    };
}
