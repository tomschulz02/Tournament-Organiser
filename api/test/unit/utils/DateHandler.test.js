import { describe, it, expect } from "vitest";
import { getISODate, getLongDate } from "../../../src/utils/DateHandler.js";

// test/setup.js pins TZ to UTC. Without that these assertions shift by a day
// depending on where the suite runs — which is exactly why getLongDate is
// derived from getISODate rather than formatting the Date directly, and why
// these tests cannot prove that part on their own.

describe("getISODate", () => {
    it("returns the UTC date part, unshifted", () => {
        // Was bug 7: this added a UTC day, so every date the helper produced was
        // one ahead of the date it was given.
        expect(getISODate("2026-08-01")).toBe("2026-08-01");
    });

    it("accepts a Date object", () => {
        expect(getISODate(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-01");
    });

    it("keeps the last day of a month", () => {
        expect(getISODate("2026-01-31")).toBe("2026-01-31");
    });

    it("keeps the last day of a year", () => {
        expect(getISODate("2026-12-31")).toBe("2026-12-31");
    });

    it("takes the UTC day, not the local one, from a mid-day timestamp", () => {
        expect(getISODate(new Date("2026-08-01T23:30:00.000Z"))).toBe("2026-08-01");
    });

    it("throws on a value that is not a date", () => {
        expect(() => getISODate("not a date")).toThrow(RangeError);
    });
});

describe("getLongDate", () => {
    it("formats a Date in en-GB long form", () => {
        expect(getLongDate(new Date("2026-08-01T00:00:00.000Z"))).toBe("1 August 2026");
    });

    // Was bug 7. The two helpers described the same tournament as two different
    // days, so anything showing both — a card and its detail page — disagreed.
    it("describes the same day as getISODate", () => {
        const date = new Date("2026-08-01T00:00:00.000Z");

        expect(getISODate(date)).toBe("2026-08-01");
        expect(getLongDate(date)).toBe("1 August 2026");
    });

    it("agrees with getISODate at the end of a month", () => {
        const date = new Date("2026-01-31T00:00:00.000Z");

        expect(getISODate(date)).toBe("2026-01-31");
        expect(getLongDate(date)).toBe("31 January 2026");
    });

    // It used to throw here, because it called toLocaleDateString on whatever it
    // was handed. Both helpers now take anything new Date() takes.
    it("accepts an ISO string, as getISODate does", () => {
        expect(getLongDate("2026-08-01")).toBe("1 August 2026");
    });

    it("throws on a value that is not a date", () => {
        expect(() => getLongDate("not a date")).toThrow(RangeError);
    });
});
