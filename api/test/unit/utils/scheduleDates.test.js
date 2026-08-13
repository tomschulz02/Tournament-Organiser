import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { formatTournamentDetails } from "../../../src/utils/tournamentViewFormatter.js";
import { validateSchedule } from "../../../src/utils/scheduleValidator.js";
import { getLongDate } from "../../../src/utils/DateHandler.js";
import { makeTournament } from "../../helpers/fixtures.js";

// The one file in the suite that does not run in UTC. Do not "tidy" the timezone
// away — it is the entire point of the file.
//
// test/setup.js pins TZ=UTC, and in UTC the fault this guards against is
// invisible: every conversion of a calendar day agrees with every other. East of
// UTC they did not. `tournaments.start_date` came back from pg as a Date at local
// midnight; the formatter rendered it in UTC and told the client the tournament
// started a day early, while the validator read the same value's local components
// and rejected every entry the client then built on that day. The organiser saw
// SCHEDULE_DAY_OUT_OF_RANGE on a schedule the application itself had produced.
//
// The fix is the pg type parser in src/config/db.js: a `date` column is handed
// through as its stored 'YYYY-MM-DD' string, so there is no instant to render and
// nothing left to disagree about. These tests hold that shut by driving the whole
// round trip — what the client is told, and what the validator will then accept —
// under a zone where a reintroduced conversion would show.

const TIMEZONE = "Africa/Johannesburg"; // UTC+2: local midnight is the previous UTC day
const TOURNAMENT = makeTournament({ start_date: "2026-08-01", end_date: "2026-08-03" });

let originalTimezone;

beforeAll(() => {
    originalTimezone = process.env.TZ;
    process.env.TZ = TIMEZONE;
});

afterAll(() => {
    process.env.TZ = originalTimezone;
});

function scheduleOn(day) {
    return {
        version: 1,
        days: [],
        courts: [{ id: "court-1", name: "Court 1" }],
        entries: [
            {
                id: "entry-1",
                type: "break",
                day,
                courtId: "court-1",
                startTime: "09:00",
                endTime: "09:30"
            }
        ],
        settings: { dayStartTime: "09:00", dayEndTime: "18:00", slotMinutes: 30 }
    };
}

function context() {
    return { startDate: TOURNAMENT.start_date, endDate: TOURNAMENT.end_date };
}

describe("tournament dates east of UTC", () => {
    it("confirms the suite is not in UTC, so the rest of this file means something", () => {
        expect(new Date(2026, 7, 1).toISOString()).toBe("2026-07-31T22:00:00.000Z");
    });

    it("reports the calendar day the database stores", () => {
        const details = formatTournamentDetails(TOURNAMENT, []);

        expect(details.start_date).toBe("2026-08-01");
        expect(details.end_date).toBe("2026-08-03");
        expect(details.start_date_label).toBe("1 August 2026");
        expect(details.end_date_label).toBe("3 August 2026");
        expect(getLongDate(TOURNAMENT.start_date)).toBe("1 August 2026");
    });

    it("accepts an entry on the first day it reported to the client", () => {
        const { start_date: firstDay } = formatTournamentDetails(TOURNAMENT, []);

        expect(() => validateSchedule(scheduleOn(firstDay), context())).not.toThrow();
    });

    it("accepts an entry on the last day it reported to the client", () => {
        const { end_date: lastDay } = formatTournamentDetails(TOURNAMENT, []);

        expect(() => validateSchedule(scheduleOn(lastDay), context())).not.toThrow();
    });

    it("still rejects an entry genuinely outside the tournament", () => {
        expect(() => validateSchedule(scheduleOn("2026-07-31"), context())).toThrowError(
            expect.objectContaining({ code: "SCHEDULE_DAY_OUT_OF_RANGE" })
        );
        expect(() => validateSchedule(scheduleOn("2026-08-04"), context())).toThrowError(
            expect.objectContaining({ code: "SCHEDULE_DAY_OUT_OF_RANGE" })
        );
    });
});
