import { describe, it, expect } from "vitest";
import { getISODate, getLongDate } from "../../../src/utils/DateHandler.js";

// Both helpers take the 'YYYY-MM-DD' string a `date` column yields — see the pg
// type parser in src/config/db.js. They no longer accept a Date, because a Date
// is an instant and a calendar day is not, and the two readings of that instant
// disagreeing is what rejected every schedule save east of UTC.
//
// test/setup.js pins TZ to UTC, so these assertions cannot prove the helpers are
// timezone-independent on their own. test/unit/utils/scheduleDates.test.js sets a
// non-UTC zone deliberately and does.

describe("getISODate", () => {
    it("returns the calendar day it is given", () => {
        // Was bug 7: this added a UTC day, so every date the helper produced was
        // one ahead of the date it was given.
        expect(getISODate("2026-08-01")).toBe("2026-08-01");
    });

    it("keeps the last day of a month", () => {
        expect(getISODate("2026-01-31")).toBe("2026-01-31");
    });

    it("keeps the last day of a year", () => {
        expect(getISODate("2026-12-31")).toBe("2026-12-31");
    });

    it("takes the leading date of a longer ISO string", () => {
        expect(getISODate("2026-08-01T23:30:00.000Z")).toBe("2026-08-01");
    });

    it("throws on a value that is not a date", () => {
        expect(() => getISODate("not a date")).toThrow(RangeError);
    });

    // A Date arriving here means something upstream changed — most likely the
    // type parser being removed. Making one up silently is how the original
    // off-by-one survived.
    it("throws on a Date rather than guessing a timezone for it", () => {
        expect(() => getISODate(new Date("2026-08-01T00:00:00.000Z"))).toThrow(RangeError);
    });
});

describe("getLongDate", () => {
    it("formats a calendar day in en-GB long form", () => {
        expect(getLongDate("2026-08-01")).toBe("1 August 2026");
    });

    // Was bug 7. The two helpers described the same tournament as two different
    // days, so anything showing both — a card and its detail page — disagreed.
    it("describes the same day as getISODate", () => {
        expect(getISODate("2026-08-01")).toBe("2026-08-01");
        expect(getLongDate("2026-08-01")).toBe("1 August 2026");
    });

    it("agrees with getISODate at the end of a month", () => {
        expect(getISODate("2026-01-31")).toBe("2026-01-31");
        expect(getLongDate("2026-01-31")).toBe("31 January 2026");
    });

    it("throws on a value that is not a date", () => {
        expect(() => getLongDate("not a date")).toThrow(RangeError);
    });
});
