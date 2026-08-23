import { describe, it, expect } from "vitest";

const { validateSchedule } = await import("../../../src/utils/scheduleValidator.js");
const { makeFixture } = await import("../../helpers/fixtures.js");

// The validator is the only thing between the client and an arbitrary JSONB blob
// in tournaments.schedule, so every rule in docs/schedule.md has a case here for
// what it rejects AND a case for what it must keep accepting. A validator that
// is merely strict is as useless as one that is merely permissive.

const DIVISIONS = [
    {
        id: "div-1",
        state: {
            rounds: [
                { name: "Pool Play", type: "roundRobin" },
                { name: "Semifinals", type: "knockout" },
                { name: "Finals", type: "knockout" }
            ]
        }
    },
    {
        id: "div-2",
        state: { rounds: [{ name: "Round robin", type: "roundRobin" }] }
    }
];

const FIXTURES = [
    makeFixture({ id: "pool-1", division_id: "div-1", round: "Pool Play", team_1: "t1", team_2: "t2" }),
    makeFixture({ id: "pool-2", division_id: "div-1", round: "Pool Play", team_1: "t3", team_2: "t4" }),
    makeFixture({ id: "semi-1", division_id: "div-1", round: "Semifinals", team_1: null, team_2: null }),
    makeFixture({ id: "final-1", division_id: "div-1", round: "Finals", team_1: null, team_2: null }),
    makeFixture({ id: "league-1", division_id: "div-2", round: "Round robin", team_1: "t5", team_2: "t6" })
];

const CONTEXT = {
    // Strings rather than Date objects on purpose: the tournament's dates are a
    // DATE column, and a Date built from a UTC instant would land on a different
    // day depending on where the suite runs.
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    divisions: DIVISIONS,
    fixtures: FIXTURES
};

function entry(overrides = {}) {
    return {
        id: "entry-1",
        type: "fixture",
        day: "2026-09-12",
        courtId: "court-1",
        startTime: "09:00",
        endTime: "09:30",
        fixtureId: "pool-1",
        title: "",
        officials: "",
        notes: "",
        ...overrides
    };
}

function schedule(entries) {
    return {
        version: 1,
        days: [{ id: "day-1", date: "2026-09-12", label: "Day 1" }],
        courts: [{ id: "court-1", name: "Court 1" }, { id: "court-2", name: "Court 2" }],
        entries,
        settings: { dayStartTime: "09:00", dayEndTime: "18:00", slotMinutes: 30 }
    };
}

// The bronze match carries its own fixture round name and belongs to the Finals
// round in state.rounds.
const BRONZE = makeFixture({
    id: "bronze",
    division_id: "div-1",
    round: "3rd Place Playoff",
    team_1: null,
    team_2: null
});

function rejects(entries, code, context = CONTEXT) {
    expect(() => validateSchedule(schedule(entries), context)).toThrowError(
        expect.objectContaining({ code })
    );
}

describe("validateSchedule — what it accepts", () => {
    it("accepts a schedule that places nothing", () => {
        expect(() => validateSchedule(schedule([]), CONTEXT)).not.toThrow();
    });

    it("accepts a partial schedule — not every fixture has to be placed", () => {
        expect(() => validateSchedule(schedule([entry()]), CONTEXT)).not.toThrow();
    });

    it("treats a missing entries key as placing nothing", () => {
        expect(() => validateSchedule({ version: 1 }, CONTEXT)).not.toThrow();
    });

    it("accepts two divisions running at the same time on different courts", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1" }),
                    entry({ id: "b", fixtureId: "league-1", courtId: "court-2" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("accepts an entry that ends at midnight", () => {
        expect(() =>
            validateSchedule(schedule([entry({ startTime: "23:30", endTime: "24:00" })]), CONTEXT)
        ).not.toThrow();
    });

    it("does not judge whether a schedule is good, only whether it is possible", () => {
        // Every fixture on one court, back to back, with no rest between a team's
        // two matches. Unpleasant, entirely possible, and none of the server's
        // business — see docs/decisions.md.
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", startTime: "09:00", endTime: "09:30" }),
                    entry({ id: "b", fixtureId: "pool-2", startTime: "09:30", endTime: "10:00" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("stores free text without inspecting it", () => {
        expect(() =>
            validateSchedule(
                schedule([entry({ title: "<script>", officials: "Sam", notes: "x".repeat(500) })]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("does not care that a courtId is not in courts — that is the client's to flag", () => {
        expect(() =>
            validateSchedule(schedule([entry({ courtId: "court-99" })]), CONTEXT)
        ).not.toThrow();
    });
});

describe("validateSchedule — shape", () => {
    it.each([[null], [undefined], ["schedule"], [7], [[]]])("refuses %s in place of an object", (value) => {
        expect(() => validateSchedule(value, CONTEXT)).toThrowError(
            expect.objectContaining({ code: "SCHEDULE_MALFORMED", status: 400 })
        );
    });

    it("refuses entries that are not an array", () => {
        expect(() => validateSchedule({ entries: {} }, CONTEXT)).toThrowError(
            expect.objectContaining({ code: "SCHEDULE_MALFORMED" })
        );
    });

    it("refuses an entry that is not an object", () => {
        rejects(["entry-1"], "SCHEDULE_MALFORMED");
    });

    // normaliseSchedule on the client silently drops these, so a malformed entry
    // would be invisible there — in the column but not in the view.
    it.each(["id", "day", "startTime", "endTime"])("refuses an entry with no %s", (key) => {
        rejects([{ ...entry(), [key]: undefined }], "SCHEDULE_MALFORMED");
    });

    it("refuses the same entry id twice", () => {
        rejects([entry({ fixtureId: "pool-1" }), entry({ fixtureId: "pool-2", courtId: "court-2" })], "SCHEDULE_MALFORMED");
    });

    it("refuses a type it does not recognise", () => {
        rejects([entry({ type: "lunch" })], "SCHEDULE_MALFORMED");
    });

    it("refuses a fixture entry carrying no fixture", () => {
        rejects([entry({ fixtureId: null })], "SCHEDULE_MALFORMED");
    });

    it("refuses a courtId that is neither a string nor null", () => {
        rejects([entry({ courtId: 2 })], "SCHEDULE_MALFORMED");
    });

    it.each(["12-09-2026", "2026-9-12", "tomorrow"])("refuses %s as a day", (day) => {
        rejects([entry({ day })], "SCHEDULE_MALFORMED");
    });

    it.each(["9:00", "0900", "25:00", "09:60"])("refuses %s as a time", (startTime) => {
        rejects([entry({ startTime })], "SCHEDULE_MALFORMED");
    });

    it("accepts a break, which carries no fixture", () => {
        expect(() =>
            validateSchedule(
                schedule([entry({ type: "break", fixtureId: null, courtId: null, title: "Lunch" })]),
                CONTEXT
            )
        ).not.toThrow();
    });
});

describe("validateSchedule — times and dates", () => {
    it("refuses an entry that ends before it starts", () => {
        rejects([entry({ startTime: "10:00", endTime: "09:00" })], "SCHEDULE_TIME_INVALID");
    });

    it("refuses an entry of no length", () => {
        rejects([entry({ startTime: "10:00", endTime: "10:00" })], "SCHEDULE_TIME_INVALID");
    });

    it.each(["2026-09-11", "2026-09-14"])("refuses a day outside the tournament — %s", (day) => {
        rejects([entry({ day })], "SCHEDULE_DAY_OUT_OF_RANGE");
    });

    it("accepts the last day of the tournament", () => {
        expect(() =>
            validateSchedule(schedule([entry({ day: "2026-09-13" })]), CONTEXT)
        ).not.toThrow();
    });

    it("accepts the first day of a one-day tournament", () => {
        expect(() =>
            validateSchedule(schedule([entry({ day: "2026-09-12" })]), {
                ...CONTEXT,
                startDate: "2026-09-12",
                endDate: "2026-09-12"
            })
        ).not.toThrow();
    });

    it("treats a one-day tournament with no end date as ending when it starts", () => {
        expect(() =>
            validateSchedule(schedule([entry({ day: "2026-09-13" })]), { ...CONTEXT, endDate: null })
        ).toThrowError(expect.objectContaining({ code: "SCHEDULE_DAY_OUT_OF_RANGE" }));
    });

    it.each([[null], ["whenever"], [new Date("not a date")], [20260912]])(
        "constrains nothing when the tournament's start date is %s",
        (startDate) => {
            expect(() =>
                validateSchedule(schedule([entry({ day: "2030-01-01" })]), { ...CONTEXT, startDate })
            ).not.toThrow();
        }
    );
});

describe("validateSchedule — fixtures", () => {
    it("refuses a fixture that is not this tournament's", () => {
        rejects([entry({ fixtureId: "someone-elses-fixture" })], "SCHEDULE_FIXTURE_UNKNOWN");
    });

    it("refuses the same fixture placed twice", () => {
        rejects(
            [
                entry({ id: "a", fixtureId: "pool-1" }),
                entry({ id: "b", fixtureId: "pool-1", startTime: "11:00", endTime: "11:30" })
            ],
            "SCHEDULE_FIXTURE_REPEATED"
        );
    });

    // A break is not supposed to carry a fixtureId. One that does is still
    // checked as a placement, so it cannot be used to smuggle a duplicate past.
    it("checks any entry carrying a fixture id, whatever its type says", () => {
        rejects([entry({ type: "break", fixtureId: "not-a-fixture" })], "SCHEDULE_FIXTURE_UNKNOWN");
    });

    it("names the offending entry and fixture in details", () => {
        try {
            validateSchedule(schedule([entry({ fixtureId: "nope" })]), CONTEXT);
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error.details).toEqual({ entryId: "entry-1", fixtureId: "nope" });
        }
    });
});

describe("validateSchedule — clashes", () => {
    it("refuses two entries overlapping on the same court", () => {
        rejects(
            [
                entry({ id: "a", fixtureId: "pool-1", startTime: "09:00", endTime: "10:00" }),
                entry({ id: "b", fixtureId: "pool-2", startTime: "09:30", endTime: "10:30" })
            ],
            "SCHEDULE_COURT_CLASH"
        );
    });

    it("allows two entries that merely touch", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", startTime: "09:00", endTime: "10:00" }),
                    entry({ id: "b", fixtureId: "pool-2", startTime: "10:00", endTime: "11:00" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("allows the same times on different courts", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1" }),
                    entry({ id: "b", fixtureId: "pool-2", courtId: "court-2" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("allows the same times on the same court on different days", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", day: "2026-09-12" }),
                    entry({ id: "b", fixtureId: "pool-2", day: "2026-09-13" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    // courtId null spans every court that day, which is what makes an all-courts
    // break a break rather than a suggestion.
    it("refuses a fixture placed inside an all-courts break", () => {
        rejects(
            [
                entry({ id: "a", type: "break", fixtureId: null, courtId: null, title: "Lunch", startTime: "12:00", endTime: "13:00" }),
                entry({ id: "b", fixtureId: "pool-1", courtId: "court-2", startTime: "12:30", endTime: "13:00" })
            ],
            "SCHEDULE_COURT_CLASH"
        );
    });

    it("refuses an all-courts break laid over a fixture already placed", () => {
        // The mirror of the case above: the break arrives second, so the null
        // court is on the other side of the comparison.
        rejects(
            [
                entry({ id: "a", fixtureId: "pool-1", courtId: "court-2", startTime: "12:30", endTime: "13:00" }),
                entry({ id: "b", type: "break", fixtureId: null, courtId: null, title: "Lunch", startTime: "12:00", endTime: "13:00" })
            ],
            "SCHEDULE_COURT_CLASH"
        );
    });

    it("refuses a team required in two places at once, even on different courts", () => {
        // pool-1 is t1 v t2, and `shared` puts t1 on the other court at the same
        // time.
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1" }),
                    entry({ id: "b", fixtureId: "shared", courtId: "court-2" })
                ]),
                {
                    ...CONTEXT,
                    fixtures: [
                        ...FIXTURES,
                        makeFixture({ id: "shared", division_id: "div-1", round: "Pool Play", team_1: "t1", team_2: "t9" })
                    ]
                }
            )
        ).toThrowError(expect.objectContaining({ code: "SCHEDULE_TEAM_CLASH", status: 409 }));
    });

    it("does not treat two unbound knockout fixtures as sharing a team", () => {
        // semi-1 and final-1 both carry nulls until progression binds them. A
        // null is not a team.
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "semi-1", courtId: "court-1", day: "2026-09-13" }),
                    entry({ id: "b", fixtureId: "final-1", courtId: "court-2", day: "2026-09-13" })
                ]),
                { ...CONTEXT, divisions: [{ id: "div-1", state: { rounds: [] } }, DIVISIONS[1]] }
            )
        ).not.toThrow();
    });

    it("names both entries of a clash in details", () => {
        try {
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", startTime: "09:00", endTime: "10:00" }),
                    entry({ id: "b", fixtureId: "pool-2", startTime: "09:30", endTime: "10:30" })
                ]),
                CONTEXT
            );
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error.details).toEqual({ entryIds: ["a", "b"] });
        }
    });
});

describe("validateSchedule — court division restriction", () => {
    // A schedule whose courts carry a restriction. pool-1 is div-1, league-1 is
    // div-2, so a court reserved for div-2 must refuse pool-1 and accept league-1.
    function withCourts(courts, entries) {
        return {
            version: 1,
            days: [{ id: "day-1", date: "2026-09-12", label: "Day 1" }],
            courts,
            entries,
            settings: { dayStartTime: "09:00", dayEndTime: "18:00", slotMinutes: 30 }
        };
    }

    function run(courts, entries) {
        return validateSchedule(withCourts(courts, entries), CONTEXT);
    }

    it("accepts a fixture on a court reserved for its own division", () => {
        expect(() =>
            run([{ id: "court-1", name: "Court 1", divisions: ["div-1"] }], [entry({ fixtureId: "pool-1" })])
        ).not.toThrow();
    });

    it("refuses a fixture on a court reserved for another division", () => {
        expect(() =>
            run([{ id: "court-1", name: "Court 1", divisions: ["div-2"] }], [entry({ fixtureId: "pool-1" })])
        ).toThrowError(expect.objectContaining({ code: "SCHEDULE_COURT_DIVISION", status: 409 }));
    });

    it("names the offending entry in details", () => {
        try {
            run([{ id: "court-1", name: "Court 1", divisions: ["div-2"] }], [entry({ id: "bad", fixtureId: "pool-1" })]);
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error.details).toEqual({ entryId: "bad" });
        }
    });

    it.each([
        ["an empty array", []],
        ["a missing key", undefined],
        ["null", null],
        ["a non-array", "div-1"]
    ])("restricts nothing when divisions is %s", (_label, divisions) => {
        expect(() =>
            run([{ id: "court-1", name: "Court 1", divisions }], [entry({ fixtureId: "pool-1" })])
        ).not.toThrow();
    });

    it("exempts a break placed on a restricted court", () => {
        expect(() =>
            run(
                [{ id: "court-1", name: "Court 1", divisions: ["div-2"] }],
                [entry({ type: "break", fixtureId: null, title: "Lunch" })]
            )
        ).not.toThrow();
    });

    it("exempts an entry naming a court that does not exist", () => {
        expect(() =>
            run([{ id: "court-1", name: "Court 1", divisions: ["div-2"] }], [entry({ fixtureId: "pool-1", courtId: "court-99" })])
        ).not.toThrow();
    });
});

describe("validateSchedule — officials", () => {
    // pool-1 is t1 v t2 and pool-2 is t3 v t4, both in div-1; league-1 is t5 v t6
    // in div-2. The names let a bare officials string resolve back to one team.
    const TEAMS = new Map([
        ["div-1", [
            { id: "t1", name: "Team 1" },
            { id: "t2", name: "Team 2" },
            { id: "t3", name: "Team 3" },
            { id: "t4", name: "Team 4" }
        ]],
        ["div-2", [
            { id: "t5", name: "Team 5" },
            { id: "t6", name: "Team 6" }
        ]]
    ]);

    const OFFICIALS = { ...CONTEXT, teamsByDivisionId: TEAMS };

    function run(entries) {
        return validateSchedule(schedule(entries), OFFICIALS);
    }

    it("refuses a team officiating a match it is playing in", () => {
        expect(() => run([entry({ fixtureId: "pool-1", officials: "Team 1" })])).toThrowError(
            expect.objectContaining({ code: "SCHEDULE_OFFICIAL_PLAYING", status: 409 })
        );
    });

    it("refuses a team officiating an overlapping match on another court", () => {
        expect(() =>
            run([
                entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "09:00", endTime: "10:00" }),
                entry({ id: "b", fixtureId: "pool-2", courtId: "court-2", startTime: "09:30", endTime: "10:30", officials: "Team 1" })
            ])
        ).toThrowError(expect.objectContaining({ code: "SCHEDULE_OFFICIAL_PLAYING" }));
    });

    it("names the offending entry in details", () => {
        try {
            run([entry({ id: "bad", fixtureId: "pool-1", officials: "Team 1" })]);
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error.details).toEqual({ entryId: "bad" });
        }
    });

    it("accepts a team officiating a match that does not overlap its own", () => {
        expect(() =>
            run([
                entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "09:00", endTime: "09:30" }),
                entry({ id: "b", fixtureId: "pool-2", courtId: "court-2", startTime: "10:00", endTime: "10:30", officials: "Team 1" })
            ])
        ).not.toThrow();
    });

    it("accepts an officials string that resolves to no team", () => {
        expect(() => run([entry({ fixtureId: "pool-1", officials: "Club referee" })])).not.toThrow();
    });

    // Two divisions may each have a "Team 5"; resolution never crosses a division.
    it("does not resolve an officials name against another division", () => {
        // "Team 5" is a div-2 team; pool-1 is div-1, so it resolves to nobody here.
        expect(() => run([entry({ fixtureId: "pool-1", officials: "Team 5" })])).not.toThrow();
    });

    it("accepts an empty officials string", () => {
        expect(() => run([entry({ fixtureId: "pool-1", officials: "" })])).not.toThrow();
    });

    it("ignores surrounding whitespace and case when resolving", () => {
        expect(() => run([entry({ fixtureId: "pool-1", officials: "  team 1  " })])).toThrowError(
            expect.objectContaining({ code: "SCHEDULE_OFFICIAL_PLAYING" })
        );
    });

    it("does not check officials on a break", () => {
        expect(() =>
            run([entry({ type: "break", fixtureId: null, courtId: null, title: "Lunch", officials: "Team 1" })])
        ).not.toThrow();
    });

    it("ignores a non-string officials value", () => {
        expect(() => run([entry({ fixtureId: "pool-1", officials: 5 })])).not.toThrow();
    });

    it("does not clash an official against a match on another day", () => {
        // Team 1 officiates pool-2 on the second day; its own pool-1 sits on the
        // first, so the day never lines up and there is nothing to clash with.
        expect(() =>
            run([
                entry({ id: "a", fixtureId: "pool-2", day: "2026-09-13", officials: "Team 1" }),
                entry({ id: "b", fixtureId: "pool-1", day: "2026-09-12" })
            ])
        ).not.toThrow();
    });

    // teamsByDivisionId may arrive as a plain object rather than a Map — the
    // repository serialises it either way — so resolution has to handle both.
    it("resolves officials from a plain-object team map", () => {
        expect(() =>
            validateSchedule(schedule([entry({ fixtureId: "pool-1", officials: "Team 1" })]), {
                ...CONTEXT,
                teamsByDivisionId: { "div-1": [{ id: "t1", name: "Team 1" }] }
            })
        ).toThrowError(expect.objectContaining({ code: "SCHEDULE_OFFICIAL_PLAYING" }));
    });

    it("treats a division whose teams are not an array as having none", () => {
        expect(() =>
            validateSchedule(schedule([entry({ fixtureId: "pool-1", officials: "Team 1" })]), {
                ...CONTEXT,
                teamsByDivisionId: { "div-1": "not an array" }
            })
        ).not.toThrow();
    });

    it("treats a null team map as resolving nothing", () => {
        expect(() =>
            validateSchedule(schedule([entry({ fixtureId: "pool-1", officials: "Team 1" })]), {
                ...CONTEXT,
                teamsByDivisionId: null
            })
        ).not.toThrow();
    });
});

describe("validateSchedule — round order", () => {
    it("refuses a semifinal starting before pool play has finished", () => {
        rejects(
            [
                entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "09:00", endTime: "10:00" }),
                entry({ id: "b", fixtureId: "semi-1", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
            ],
            "SCHEDULE_ROUND_ORDER"
        );
    });

    it("accepts a semifinal starting exactly when pool play ends", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "09:00", endTime: "10:00" }),
                    entry({ id: "b", fixtureId: "semi-1", courtId: "court-2", startTime: "10:00", endTime: "11:00" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("compares across days, not only within one", () => {
        rejects(
            [
                entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", day: "2026-09-13", startTime: "12:00", endTime: "13:00" }),
                entry({ id: "b", fixtureId: "semi-1", courtId: "court-2", day: "2026-09-12", startTime: "09:00", endTime: "10:00" })
            ],
            "SCHEDULE_ROUND_ORDER"
        );
    });

    // Partial schedules are legal, so the semifinals may be unplaced. The
    // constraint from pool play still holds over the final.
    it("compares against every earlier round, not only the immediately preceding one", () => {
        rejects(
            [
                entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                entry({ id: "b", fixtureId: "final-1", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
            ],
            "SCHEDULE_ROUND_ORDER"
        );
    });

    it("constrains each division separately, so two divisions may overlap", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                    entry({ id: "b", fixtureId: "league-1", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
                ]),
                CONTEXT
            )
        ).not.toThrow();
    });

    it("leaves a pure league unconstrained — it has one round", () => {
        expect(() =>
            validateSchedule(
                schedule([entry({ id: "a", fixtureId: "league-1", startTime: "09:00", endTime: "10:00" })]),
                CONTEXT
            )
        ).not.toThrow();
    });

    // Drift rather than an impossible schedule. Refusing the save would strand
    // the organiser over a round name nothing else cares about.
    it("ignores a fixture whose round is not in state.rounds", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                    entry({ id: "b", fixtureId: "orphan", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
                ]),
                {
                    ...CONTEXT,
                    fixtures: [
                        ...FIXTURES,
                        makeFixture({ id: "orphan", division_id: "div-1", round: "Repechage", team_1: "t7", team_2: "t8" })
                    ]
                }
            )
        ).not.toThrow();
    });

    it("ignores a fixture whose division was not supplied", () => {
        expect(() =>
            validateSchedule(schedule([entry({ id: "a", fixtureId: "pool-1" })]), { ...CONTEXT, divisions: [] })
        ).not.toThrow();
    });

    it("reads a division's state whether it arrives parsed or as a string", () => {
        const stringified = DIVISIONS.map((division) => ({ ...division, state: JSON.stringify(division.state) }));

        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                    entry({ id: "b", fixtureId: "semi-1", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
                ]),
                { ...CONTEXT, divisions: stringified }
            )
        ).toThrowError(expect.objectContaining({ code: "SCHEDULE_ROUND_ORDER" }));
    });

    it("constrains nothing for a division stored before state carried anything", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                    entry({ id: "b", fixtureId: "semi-1", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
                ]),
                { ...CONTEXT, divisions: [{ id: "div-1", state: null }] }
            )
        ).not.toThrow();
    });

    // The third-place playoff carries its own fixture round name while belonging
    // to the Finals round in state.rounds, so it sorts with the final rather than
    // before it. See docs/tournament-rules.md.
    it("allows the bronze match alongside the final", () => {
        expect(() =>
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "final-1", courtId: "court-1", startTime: "14:00", endTime: "15:00" }),
                    entry({ id: "b", fixtureId: "bronze", courtId: "court-2", startTime: "14:00", endTime: "15:00" })
                ]),
                { ...CONTEXT, fixtures: [...FIXTURES, BRONZE] }
            )
        ).not.toThrow();
    });

    it("holds the bronze match to the Finals round's place in the order", () => {
        rejects(
            [
                entry({ id: "a", fixtureId: "semi-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                entry({ id: "b", fixtureId: "bronze", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
            ],
            "SCHEDULE_ROUND_ORDER",
            { ...CONTEXT, fixtures: [...FIXTURES, BRONZE] }
        );
    });

    it("names the offending entry in details", () => {
        try {
            validateSchedule(
                schedule([
                    entry({ id: "a", fixtureId: "pool-1", courtId: "court-1", startTime: "11:00", endTime: "12:00" }),
                    entry({ id: "b", fixtureId: "semi-1", courtId: "court-2", startTime: "09:00", endTime: "10:00" })
                ]),
                CONTEXT
            );
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error.details).toEqual({ entryId: "b" });
        }
    });
});
