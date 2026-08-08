import { describe, it, expect } from "vitest";
import { getISODate, getLongDate } from "../../../src/utils/DateHandler.js";

// test/setup.js pins TZ to UTC. Without that these assertions shift by a day
// depending on where the suite runs.

describe("getISODate", () => {
    it("adds one UTC day and returns the date part only", () => {
        // The +1 is deliberate in the source, compensating for a shift applied
        // elsewhere. Locked here so it cannot change silently.
        expect(getISODate("2026-08-01")).toBe("2026-08-02");
    });

    it("accepts a Date object", () => {
        expect(getISODate(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-02");
    });

    it("rolls over the end of a month", () => {
        expect(getISODate("2026-01-31")).toBe("2026-02-01");
    });

    it("rolls over the end of a year", () => {
        expect(getISODate("2026-12-31")).toBe("2027-01-01");
    });

    it("throws on a value that is not a date", () => {
        expect(() => getISODate("not a date")).toThrow(RangeError);
    });
});

describe("getLongDate", () => {
    it("formats a Date in en-GB long form", () => {
        expect(getLongDate(new Date("2026-08-01T00:00:00.000Z"))).toBe("1 August 2026");
    });

    it("does not apply the day shift that getISODate applies", () => {
        const date = new Date("2026-08-01T00:00:00.000Z");

        expect(getLongDate(date)).toBe("1 August 2026");
        expect(getISODate(date)).toBe("2026-08-02");
    });

    it("requires a Date and throws on an ISO string", () => {
        // Unlike getISODate, which accepts anything new Date() accepts.
        expect(() => getLongDate("2026-08-01")).toThrow(TypeError);
    });
});
