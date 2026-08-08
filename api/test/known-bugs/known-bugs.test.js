import { describe, it, expect, beforeEach, vi } from "vitest";

// THESE TESTS ARE EXPECTED TO FAIL.
//
// Each one encodes the behaviour the code was written to have, per
// docs/tournament-rules.md and docs/division-state.md, and names the line that
// currently prevents it. They are the specification for ten outstanding fixes;
// as each bug is fixed, its test turns green and stays as the regression guard.
//
// The rest of the suite locks in what the code does *today*, so the two are
// deliberately in tension. Run them alone with `npm run test:bugs`.

const uuidState = vi.hoisted(() => ({ next: 0 }));

vi.mock("uuid", () => ({ v4: () => `uuid-${++uuidState.next}` }));

vi.mock("../../src/config/db.js", async () => {
    const { dbMock } = await import("../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../src/repositories/divisions.repository.js", () => ({
    divisionsRepository: {
        createTeam: vi.fn(async () => "team-id"),
        createDivision: vi.fn(),
        getDivisionWithOwner: vi.fn(),
        getFixturesByDivisionId: vi.fn(),
        getTeamsByIds: vi.fn(),
        updateRounds: vi.fn()
    }
}));

vi.mock("../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: { createFixture: vi.fn(), updateFixtures: vi.fn() }
}));

vi.mock("../../src/repositories/tournament.repository.js", () => ({
    tournamentRepository: {
        createTournament: vi.fn(),
        getAllTournaments: vi.fn(),
        getTournamentById: vi.fn(),
        deleteTournament: vi.fn()
    }
}));

vi.mock("../../src/services/divisions.service.js", async (importOriginal) => await importOriginal());

const { computeRoundResults, hasPlayedFixtures, normalizeFixtureResult, progressionService } =
    await import("../../src/services/progression.service.js");
const { createLeagueState, divisionService } = await import("../../src/services/divisions.service.js");
const { generateFixtures } = await import("../../src/services/fixtures.service.js");
const { tournamentService } = await import("../../src/services/tournaments.service.js");
const { buildFinalStandings } = await import("../../src/utils/tournamentViewFormatter.js");
const { getISODate, getLongDate } = await import("../../src/utils/DateHandler.js");
const { userRepository } = await import("../../src/repositories/users.repository.js");

const { divisionsRepository } = await import("../../src/repositories/divisions.repository.js");
const { fixturesRepository } = await import("../../src/repositories/fixtures.repository.js");
const { tournamentRepository } = await import("../../src/repositories/tournament.repository.js");
const { dbMock, resetDbMock } = await import("../helpers/dbMock.js");
const { makeFixture, makeRound, makeState } = await import("../helpers/fixtures.js");

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
    vi.mocked(divisionsRepository.createTeam).mockReset().mockResolvedValue("team-id");
    vi.mocked(divisionsRepository.createDivision).mockReset();
    vi.mocked(divisionsRepository.getDivisionWithOwner).mockReset();
    vi.mocked(divisionsRepository.getFixturesByDivisionId).mockReset();
    vi.mocked(divisionsRepository.getTeamsByIds).mockReset().mockResolvedValue([]);
    vi.mocked(divisionsRepository.updateRounds).mockReset();
    vi.mocked(fixturesRepository.createFixture).mockReset();
    vi.mocked(fixturesRepository.updateFixtures).mockReset();
    vi.mocked(tournamentRepository.getAllTournaments).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("bug 1: head-to-head never applies during round progression", () => {
    // api/src/utils/standings.js:120 reads fixture.team_1_id / team_2_id, but
    // progression.service.js feeds it rows straight from the fixtures table,
    // which carry team_1 / team_2. Both ids come back undefined, the guard on
    // line 122 fires for every fixture and the map is always empty — so step 4
    // of the ranking chain in docs/tournament-rules.md is dead here.
    it("ranks the winner of a head-to-head above the loser when nothing else separates them", () => {
        const state = makeState({ teams: ["t1", "t2", "t3", "t4"] });
        const round = makeRound({ name: "Pool Play", groups: [["t1", "t2", "t3", "t4"]] });

        // t1 and t2 finish level on wins, set ratio and point ratio.
        // t2 beat t1, so t2 must rank higher despite t1 being the better seed.
        const fixtures = [
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t2", team_2: "t1", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t1", team_2: "t3", team_1_result: [21], team_2_result: [15] }),
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t4", team_2: "t2", team_1_result: [21], team_2_result: [15] })
        ].map(normalizeFixtureResult);

        expect(computeRoundResults(round, state, fixtures).map((row) => row.id))
            .toEqual(["t4", "t2", "t1", "t3"]);
    });
});

describe("bug 2: a League division produces no standings", () => {
    // api/src/services/divisions.service.js:89 writes groups: [[teams]].
    // Every consumer filters group entries to strings, so the inner array is
    // discarded and a League division shows an empty table.
    it("puts the team ids one level deep, as a single pool", () => {
        expect(createLeagueState(["t1", "t2"], 2).rounds[0].groups).toEqual([["t1", "t2"]]);
    });
});

describe("bug 3: every team is created with no name", () => {
    // api/src/services/divisions.service.js:19 calls createTeam() with no
    // arguments, inside a loop whose `team` variable is never used.
    it("passes the team name and the division id when inserting a team", async () => {
        await divisionService.createDivision(
            { name: "Division A", type: "league", teams: ["Aces", "Bears"], num_teams: 2, num_groups: 1 },
            "tour-1",
            "user-1"
        );

        expect(divisionsRepository.createTeam).toHaveBeenCalledTimes(2);
        expect(divisionsRepository.createTeam).toHaveBeenNthCalledWith(1, "Aces", "uuid-1");
        expect(divisionsRepository.createTeam).toHaveBeenNthCalledWith(2, "Bears", "uuid-1");
    });
});

describe("bug 4: one tournament without a status hides every tournament after it", () => {
    // api/src/services/tournaments.service.js:92 uses `break` where it means
    // `continue`, so the loop stops at the first null status.
    it("skips only the row with no status", async () => {
        const dates = {
            start_date: new Date("2026-08-01T00:00:00.000Z"),
            end_date: new Date("2026-08-03T00:00:00.000Z")
        };
        tournamentRepository.getAllTournaments.mockResolvedValue([
            { id: "a", status: "Ongoing", ...dates },
            { id: "null-row", status: null, ...dates },
            { id: "b", status: "Ongoing", ...dates }
        ]);

        const grouped = await tournamentService.fetchTournaments();

        expect(grouped.ongoing.map((entry) => entry.id)).toEqual(["a", "b"]);
    });
});

describe("bug 5: the re-progression guard misses in-progress fixtures", () => {
    // api/src/services/progression.service.js:320 checks for status "LIVE",
    // but the rest of the code uses "ONGOING" (see FIXTURE_STATUS_LABELS in
    // tournamentViewFormatter.js). A round already under way is not detected,
    // so a correction can silently discard it.
    it("treats an ONGOING fixture as the next round having started", () => {
        const round = makeRound({ name: "Finals" });
        const fixtures = [makeFixture({ round: "Finals", status: "ONGOING" })];

        expect(hasPlayedFixtures(round, fixtures)).toBe(true);
    });
});

describe("bug 6: the final-standings bracket fallback never produces anything", () => {
    // api/src/utils/tournamentViewFormatter.js:292 falls back to the last
    // bracket round when none is named "Finals", but the loop below it only
    // acts on matches whose round is "Finals" or "3rd Place Playoff", so the
    // fallback is inert and control always drops to the next tier.
    it("ranks the winner and loser of the last bracket round", () => {
        const bracket = {
            rounds: [{
                name: "Semifinals",
                matches: [{
                    round: "Semifinals",
                    participants: [{ id: "t1", name: "Aces" }, { id: "t2", name: "Bears" }],
                    winner: { id: "t1", name: "Aces" }
                }]
            }]
        };

        const ranked = buildFinalStandings({
            division: { type: "Classic" },
            fixtures: [{ status: "COMPLETED" }],
            standings: [],
            bracket,
            teams: []
        });

        expect(ranked.map((entry) => [entry.rank, entry.team_id])).toEqual([[1, "t1"], [2, "t2"]]);
    });
});

describe("bug 7: the two date helpers disagree by a day", () => {
    // api/src/utils/DateHandler.js:3 shifts getISODate forward one UTC day;
    // getLongDate does not, and also computes an isoDate it then discards.
    // The same tournament therefore renders as two different dates.
    it("describes the same day in both formats", () => {
        const date = new Date("2026-08-01T00:00:00.000Z");

        expect(getLongDate(date)).toBe(
            new Date(`${getISODate(date)}T00:00:00.000Z`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric"
            })
        );
    });
});

describe("bug 8: committing a round is not atomic", () => {
    // api/src/services/progression.service.js:104-114 advances state.currentRound
    // and then binds the next round's fixtures, in two separate transactions.
    // A failure between them leaves the division on a round whose fixtures still
    // hold placeholders. Binding first would make the failure harmless.
    it("binds the next round's fixtures before advancing the round", async () => {
        const order = [];
        divisionsRepository.updateRounds.mockImplementation(async () => {
            order.push("updateRounds");
        });
        fixturesRepository.updateFixtures.mockImplementation(async () => {
            order.push("updateFixtures");
        });

        divisionsRepository.getDivisionWithOwner.mockResolvedValue({
            id: "div-1",
            name: "Division A",
            created_by: "user-1",
            state: makeState({
                teams: ["t1", "t2"],
                rounds: [
                    makeRound({ name: "Pool Play", groups: [["t1", "t2"]] }),
                    makeRound({ name: "Finals", type: "knockout", groups: [[0, 1]], fixtures: ["f-final"] })
                ]
            })
        });
        divisionsRepository.getFixturesByDivisionId.mockResolvedValue([
            makeFixture({ round: "Pool Play", status: "COMPLETED", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] })
        ]);

        await progressionService.commit("div-1", "user-1", ["t1", "t2"]);

        expect(order).toEqual(["updateFixtures", "updateRounds"]);
    });
});

describe("bug 9: an unknown round type crashes with a TypeError", () => {
    // api/src/services/fixtures.service.js:44 reads result.matchNo without
    // checking that a generator matched round.type, so an unrecognised type
    // surfaces as "Cannot read properties of undefined" instead of a named
    // error the controllers could map to a response.
    it("raises a named error", () => {
        expect(() => generateFixtures([makeRound({ type: "swiss" })])).toThrow("UNSUPPORTED_ROUND_TYPE");
    });
});

describe("bug 10: the friends and saved-tournament queries always throw", () => {
    // api/src/repositories/users.repository.js:49, 62, 75, 88 and 101 test
    // `result.success` on the value returned by db.query, which is a rows array
    // and has no such property. The guard therefore fires on every call.
    it.each([
        ["addFriend", ["user-1", "user-2"]],
        ["getFriends", ["user-1"]],
        ["joinTournament", ["user-1", "tour-1"]],
        ["getSavedTournaments", ["user-1"]],
        ["unfollowTournament", ["user-1", "tour-1"]]
    ])("%s returns the rows the query produced", async (method, args) => {
        const rows = [{ user_id: "user-1" }];
        dbMock.instance.query.mockResolvedValueOnce(rows);

        await expect(userRepository[method](...args)).resolves.toEqual(rows);
    });
});
