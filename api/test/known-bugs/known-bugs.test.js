import { describe, it, expect, beforeEach, vi } from "vitest";

// THESE TESTS ARE EXPECTED TO FAIL.
//
// Each one encodes the behaviour the code was written to have, per
// docs/tournament-rules.md and docs/division-state.md, and names the line that
// currently prevents it. They are the specification for the outstanding fixes;
// as each bug is fixed, its test moves into the matching unit or integration
// file and stays there as the regression guard. A comment is left in its place
// here saying where it went.
//
// Bug 10 is deferred rather than outstanding: it now covers two functions
// nothing calls, for a `friends` table that is not in the schema. It is fixed
// when the friends feature is built. It is the only entry left in this file.
// joinTournament, getSavedTournaments and unfollowTournament were fixed for the
// Profile page — their regression guard now lives in
// test/integration/repositories/users.repository.test.js, asserting each
// resolves the rows db.query produced rather than throwing.
//
// Run this suite alone with `npm run test:bugs`; api/vitest.config.js excludes it
// from `npm test` so the default run stays a usable signal.

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { userRepository } = await import("../../src/repositories/users.repository.js");
const { dbMock, resetDbMock } = await import("../helpers/dbMock.js");

beforeEach(() => {
    resetDbMock();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
});

// bug 1, head-to-head never applying during round progression, is fixed. Its
// regression guard now lives in test/unit/services/progression.service.test.js,
// under computeRoundResults, asserting that the winner of a head-to-head ranks
// above the loser when nothing else separates them.

// bug 2, a League division producing no fixtures or standings, is fixed. Its
// regression guard now lives in test/unit/services/divisions.service.test.js,
// asserting the pool shape and the generated game count.

// bug 3, every team created with no name, is fixed. Its regression guard now
// lives in test/unit/services/divisions.service.test.js, asserting the team name
// and the organiser's user id.

// bug 4, one tournament without a status hiding every tournament after it, is
// fixed. Its regression guard now lives in
// test/unit/services/tournaments.service.test.js, asserting that only the null
// row is skipped.

// bug 6, the final-standings bracket fallback never producing anything, is
// fixed. Its regression guard now lives in
// test/unit/utils/tournamentViewFormatter.test.js, under buildFinalStandings,
// asserting both that a single-match concluding round ranks its two teams and
// that a multi-match one declines to.

// bug 7, the two date helpers disagreeing by a day, is fixed. Its regression
// guard now lives in test/unit/utils/DateHandler.test.js, asserting that both
// helpers describe the same UTC day.

// bug 8, committing a round binding fixtures only after advancing the round, is
// fixed. Its regression guard now lives in
// test/unit/services/progression.service.test.js, under progressionService.commit,
// asserting the write order and that a failed binding leaves the round unadvanced.

// bug 9, an unknown round type crashing with a TypeError, is fixed. Its
// regression guard now lives in test/unit/services/fixtures.service.test.js,
// under generateFixtures, asserting the UNSUPPORTED_ROUND_TYPE code and the
// round type it reports in `details`.

// bug 11, round-robin groups of unequal size double-generating the smaller
// group's early fixtures, is fixed. Its regression guard now lives in
// test/unit/services/fixtures.service.test.js, under
// describe("generateRoundRobinFixtures"), asserting a 4/4/5 group split
// produces 6/6/10 fixtures with no duplicate pairing per group.

describe("bug 10: the friends queries always throw", () => {
    // api/src/repositories/users.repository.js:44 and 57 test `result.success`
    // on the value returned by db.query, which is a rows array and has no such
    // property. The guard therefore fires on every call.
    it.each([
        ["addFriend", ["user-1", "user-2"]],
        ["getFriends", ["user-1"]]
    ])("%s returns the rows the query produced", async (method, args) => {
        const rows = [{ user_id: "user-1" }];
        dbMock.instance.query.mockResolvedValueOnce(rows);

        await expect(userRepository[method](...args)).resolves.toEqual(rows);
    });
});
