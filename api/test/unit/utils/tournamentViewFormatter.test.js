import { describe, it, expect } from "vitest";
import {
    FIXTURE_STATUS_LABELS,
    buildDivisionBracket,
    buildDivisionOverview,
    buildDivisionStandings,
    buildFinalStandings,
    buildFixtureTeam,
    buildTournamentDashboard,
    determineFixtureWinner,
    fixtureBelongsToRoundRobinGroup,
    fixtureSortValue,
    formatDivisionPayload,
    formatTournamentDetails,
    formatTournamentViewPayload,
    getCurrentRoundName,
    getFixtureLoser,
    getFixturesForKnockoutRound,
    getGroupLabel,
    isDivisionComplete,
    isResultFixture,
    normalizeDivisionState,
    normalizeFixture,
    normalizeFixtureResult,
    orderTeamsByState,
    parseStoredResultValue,
    participantKey,
    pushFinalStanding,
    resolveParticipant,
    sanitizeSetPairs,
    toISODate
} from "../../../src/utils/tournamentViewFormatter.js";
import {
    GOLDEN_TEAM_IDS,
    goldenEightTeamState,
    goldenEightTeams,
    makeDivision,
    makeFixture,
    makeRound,
    makeState,
    makeTeam,
    makeTournament
} from "../../helpers/fixtures.js";

function lookupOf(teams) {
    return new Map(teams.map((team) => [team.id, team]));
}

// --- small helpers --------------------------------------------------------

describe("toISODate", () => {
    it("returns null when there is no date", () => {
        expect(toISODate(null)).toBeNull();
        expect(toISODate(undefined)).toBeNull();
    });

    it("delegates to getISODate otherwise", () => {
        expect(toISODate("2026-08-01")).toBe("2026-08-01");
    });
});

describe("getGroupLabel", () => {
    it("labels groups A, B, C by index", () => {
        expect(getGroupLabel(0)).toBe("Group A");
        expect(getGroupLabel(1)).toBe("Group B");
        expect(getGroupLabel(25)).toBe("Group Z");
    });

    it("does not wrap after Z", () => {
        expect(getGroupLabel(26)).toBe("Group [");
    });
});

describe("isResultFixture", () => {
    it("treats completed and cancelled fixtures as results", () => {
        expect(isResultFixture({ status: "COMPLETED" })).toBe(true);
        expect(isResultFixture({ status: "CANCELLED" })).toBe(true);
    });

    it("does not treat an unplayed fixture as a result", () => {
        expect(isResultFixture({ status: "UPCOMING" })).toBe(false);
    });
});

describe("isDivisionComplete", () => {
    it("is false when there are no fixtures at all", () => {
        expect(isDivisionComplete([])).toBe(false);
    });

    it("is true once every fixture is completed or cancelled", () => {
        expect(isDivisionComplete([{ status: "COMPLETED" }, { status: "CANCELLED" }])).toBe(true);
    });

    it("is false while any fixture is outstanding", () => {
        expect(isDivisionComplete([{ status: "COMPLETED" }, { status: "UPCOMING" }])).toBe(false);
    });
});

describe("fixtureSortValue", () => {
    it("puts live fixtures first, then upcoming, then everything else", () => {
        expect(fixtureSortValue({ status: "LIVE", match_no: 5 })).toBe(5);
        expect(fixtureSortValue({ status: "UPCOMING", match_no: 5 })).toBe(100005);
        expect(fixtureSortValue({ status: "COMPLETED", match_no: 5 })).toBe(200005);
    });

    it("treats a missing match number as zero", () => {
        expect(fixtureSortValue({ status: "LIVE" })).toBe(0);
    });
});

describe("participantKey", () => {
    it("prefers the id, falls back to the name, then to null", () => {
        expect(participantKey({ id: "t1", name: "Aces" })).toBe("t1");
        expect(participantKey({ id: null, name: "Rank 1" })).toBe("Rank 1");
        expect(participantKey({ id: null, name: null })).toBeNull();
        expect(participantKey(null)).toBeNull();
    });
});

describe("getCurrentRoundName", () => {
    it("returns the name of the round at state.currentRound", () => {
        expect(getCurrentRoundName({ rounds: [{ name: "Pool Play" }, { name: "Finals" }], currentRound: 1 }))
            .toBe("Finals");
    });

    it("returns null when there are no rounds", () => {
        expect(getCurrentRoundName({ rounds: [], currentRound: 0 })).toBeNull();
        expect(getCurrentRoundName({ currentRound: 0 })).toBeNull();
    });

    it("returns null when currentRound points past the end", () => {
        expect(getCurrentRoundName({ rounds: [{ name: "Pool Play" }], currentRound: 4 })).toBeNull();
    });

    it("returns null when the round has no name", () => {
        expect(getCurrentRoundName({ rounds: [{}], currentRound: 0 })).toBeNull();
    });
});

describe("getFixturesForKnockoutRound", () => {
    it("selects the fixtures whose round matches", () => {
        const fixtures = [{ round: "Semifinals" }, { round: "Finals" }];

        expect(getFixturesForKnockoutRound(fixtures, "Semifinals")).toEqual([{ round: "Semifinals" }]);
    });

    it("folds the third-place playoff into the Finals round", () => {
        const fixtures = [
            { round: "3rd Place Playoff" },
            { round: "Finals" },
            { round: "Semifinals" }
        ];

        expect(getFixturesForKnockoutRound(fixtures, "Finals")).toEqual([
            { round: "3rd Place Playoff" },
            { round: "Finals" }
        ]);
    });
});

describe("fixtureBelongsToRoundRobinGroup", () => {
    const round = { name: "Pool Play" };

    it("accepts a fixture from the round between two members of the group", () => {
        expect(fixtureBelongsToRoundRobinGroup({ round: "Pool Play", team_1_id: "a", team_2_id: "b" }, round, ["a", "b"]))
            .toBe(true);
    });

    it("rejects a fixture from a different round", () => {
        expect(fixtureBelongsToRoundRobinGroup({ round: "Finals", team_1_id: "a", team_2_id: "b" }, round, ["a", "b"]))
            .toBe(false);
    });

    it("rejects a fixture involving a team from another group", () => {
        expect(fixtureBelongsToRoundRobinGroup({ round: "Pool Play", team_1_id: "a", team_2_id: "z" }, round, ["a", "b"]))
            .toBe(false);
    });
});

// --- result normalisation -------------------------------------------------

describe("sanitizeSetPairs", () => {
    it("keeps pairs and coerces the scores to numbers", () => {
        expect(sanitizeSetPairs([["21", "15"], [21, 18]])).toEqual([[21, 15], [21, 18]]);
    });

    it("drops entries that are not pairs", () => {
        expect(sanitizeSetPairs([[21], "nonsense", null, [21, 15]])).toEqual([[21, 15]]);
    });

    it("keeps the leading two scores of a longer entry", () => {
        expect(sanitizeSetPairs([[21, 15, 99]])).toEqual([[21, 15]]);
    });

    it("turns an unparseable score into zero, because the guard is Number(x) || 0", () => {
        expect(sanitizeSetPairs([["abc", null]])).toEqual([[0, 0]]);
    });
});

describe("parseStoredResultValue", () => {
    it("returns null for an absent value", () => {
        expect(parseStoredResultValue(null)).toBeNull();
        expect(parseStoredResultValue(undefined)).toBeNull();
    });

    it("passes an array through untouched", () => {
        expect(parseStoredResultValue([21, 15])).toEqual([21, 15]);
    });

    it("passes a number through untouched", () => {
        expect(parseStoredResultValue(21)).toBe(21);
    });

    it("parses a JSON string", () => {
        expect(parseStoredResultValue("[21,15]")).toEqual([21, 15]);
    });

    it("falls back to a numeric coercion when the string is not JSON", () => {
        expect(parseStoredResultValue("0x15")).toBe(21);
    });

    it("returns the raw string when it is neither JSON nor a number", () => {
        expect(parseStoredResultValue("1e")).toBe("1e");
    });

    it("returns anything else unchanged", () => {
        expect(parseStoredResultValue(true)).toBe(true);
    });
});

describe("normalizeFixtureResult", () => {
    it("sanitizes a result that is already an array of pairs", () => {
        expect(normalizeFixtureResult({ result: [["21", "15"], [9]] })).toEqual([[21, 15]]);
    });

    it("reads two scalar scores as a single set", () => {
        expect(normalizeFixtureResult({ team_1_result: 21, team_2_result: 15 })).toEqual([[21, 15]]);
    });

    it("zips two parallel numeric arrays of equal length", () => {
        expect(normalizeFixtureResult({ team_1_result: [21, 18], team_2_result: [15, 21] }))
            .toEqual([[21, 15], [18, 21]]);
    });

    it("coerces a missing opposing score to zero when zipping", () => {
        expect(normalizeFixtureResult({ team_1_result: [21], team_2_result: ["x"] })).toEqual([[21, 0]]);
    });

    it("reads team_1_result when it already holds pairs", () => {
        expect(normalizeFixtureResult({ team_1_result: [[21, 15]], team_2_result: [[0, 0]] }))
            .toEqual([[21, 15]]);
    });

    it("reads team_2_result when only that side holds pairs", () => {
        expect(normalizeFixtureResult({ team_1_result: ["x"], team_2_result: [[21, 15]] }))
            .toEqual([[21, 15]]);
    });

    it("treats two empty arrays as an empty result", () => {
        // [].every(...) is true, so this lands on the pairs branch and yields [].
        expect(normalizeFixtureResult({ team_1_result: [], team_2_result: [] })).toEqual([]);
    });

    it("gives up when the two arrays are numeric but different lengths", () => {
        expect(normalizeFixtureResult({ team_1_result: [21, 18], team_2_result: [15] })).toEqual([]);
    });

    it("gives up when nothing recognisable is stored", () => {
        expect(normalizeFixtureResult({ team_1_result: "1e", team_2_result: "2e" })).toEqual([]);
        expect(normalizeFixtureResult({})).toEqual([]);
    });
});

// --- participants and fixtures --------------------------------------------

describe("resolveParticipant", () => {
    const teamLookup = lookupOf([makeTeam({ id: "t1", name: "Aces" })]);

    it("resolves a known team id to its name", () => {
        expect(resolveParticipant("t1", teamLookup, "Rank 1")).toEqual({
            id: "t1",
            name: "Aces",
            placeholder: null
        });
    });

    it("keeps an unknown id and shows the placeholder", () => {
        expect(resolveParticipant("t9", teamLookup, "Rank 1")).toEqual({
            id: "t9",
            name: "Rank 1",
            placeholder: "Rank 1"
        });
    });

    it("shows TBD for an unknown id with no placeholder", () => {
        expect(resolveParticipant("t9", teamLookup)).toEqual({
            id: "t9",
            name: "TBD",
            placeholder: null
        });
    });

    it("renders an integer as a one-based rank, since knockout groups are positional", () => {
        expect(resolveParticipant(0, teamLookup)).toEqual({
            id: null,
            name: "Rank 1",
            placeholder: "Rank 1"
        });
    });

    it("falls back to the placeholder for anything else", () => {
        expect(resolveParticipant(null, teamLookup, "Winner SF1")).toEqual({
            id: null,
            name: "Winner SF1",
            placeholder: "Winner SF1"
        });
    });

    it("falls back to TBD when there is nothing at all", () => {
        expect(resolveParticipant(undefined, teamLookup)).toEqual({
            id: null,
            name: "TBD",
            placeholder: "TBD"
        });
    });
});

describe("buildFixtureTeam", () => {
    it("uses the team when one is known", () => {
        expect(buildFixtureTeam(makeTeam({ id: "t1", name: "Aces" }), "Rank 1")).toEqual({
            id: "t1",
            name: "Aces",
            placeholder: null
        });
    });

    it("uses the placeholder when the team is not yet decided", () => {
        expect(buildFixtureTeam(null, "Rank 1")).toEqual({
            id: null,
            name: "Rank 1",
            placeholder: "Rank 1"
        });
    });

    it("uses TBD when there is no placeholder either", () => {
        expect(buildFixtureTeam(null, null)).toEqual({
            id: null,
            name: "TBD",
            placeholder: "TBD"
        });
    });
});

describe("normalizeFixture", () => {
    const teamLookup = lookupOf([
        makeTeam({ id: "t1", name: "Aces" }),
        makeTeam({ id: "t2", name: "Bears" })
    ]);

    it("renames the database columns and resolves both team names", () => {
        const fixture = makeFixture({
            id: "f1",
            match_no: 3,
            status: "COMPLETED",
            team_1: "t1",
            team_2: "t2",
            team_1_result: [21],
            team_2_result: [15]
        });

        expect(normalizeFixture(fixture, teamLookup)).toMatchObject({
            id: "f1",
            match_no: 3,
            status: "COMPLETED",
            statusLabel: "Completed",
            team_1_id: "t1",
            team_2_id: "t2",
            team1: "Aces",
            team2: "Bears",
            result: [[21, 15]],
            teams: {
                team_1: { id: "t1", name: "Aces", placeholder: null },
                team_2: { id: "t2", name: "Bears", placeholder: null }
            }
        });
    });

    it("defaults an unset status to UPCOMING and nulls the empty columns", () => {
        expect(normalizeFixture(makeFixture({ status: null }), teamLookup)).toMatchObject({
            status: "UPCOMING",
            statusLabel: "Upcoming",
            team_1_id: null,
            team_2_id: null,
            team_1_placeholder: null,
            team_1_result: null,
            team1: "TBD"
        });
    });

    it("passes an unrecognised status through as its own label", () => {
        expect(normalizeFixture(makeFixture({ status: "FORFEIT" }), teamLookup).statusLabel).toBe("FORFEIT");
    });

    it("uses placeholders for teams that have not qualified yet", () => {
        const fixture = makeFixture({
            team_1_placeholder: "Rank 1",
            team_2_placeholder: "Rank 2"
        });

        expect(normalizeFixture(fixture, teamLookup)).toMatchObject({
            team1: "Rank 1",
            team2: "Rank 2"
        });
    });

    it("labels every known status", () => {
        expect(FIXTURE_STATUS_LABELS).toEqual({
            UPCOMING: "Upcoming",
            LIVE: "Live",
            COMPLETED: "Completed",
            CANCELLED: "Cancelled"
        });
    });
});

describe("determineFixtureWinner", () => {
    const completed = {
        status: "COMPLETED",
        team_1_id: "t1",
        team_2_id: "t2",
        team1: "Aces",
        team2: "Bears"
    };

    it("returns team one when team one wins more sets", () => {
        expect(determineFixtureWinner({ ...completed, result: [[21, 15], [21, 18]] }))
            .toEqual({ id: "t1", name: "Aces" });
    });

    it("returns team two when team two wins more sets", () => {
        expect(determineFixtureWinner({ ...completed, result: [[15, 21], [18, 21]] }))
            .toEqual({ id: "t2", name: "Bears" });
    });

    it("returns null when the set counts are level", () => {
        expect(determineFixtureWinner({ ...completed, result: [[21, 15], [15, 21], [20, 20]] })).toBeNull();
    });

    it("returns null for a fixture that has not been played", () => {
        expect(determineFixtureWinner(null)).toBeNull();
        expect(determineFixtureWinner({ ...completed, status: "UPCOMING", result: [[21, 15]] })).toBeNull();
        expect(determineFixtureWinner({ ...completed, result: null })).toBeNull();
        expect(determineFixtureWinner({ ...completed, result: [] })).toBeNull();
    });
});

describe("getFixtureLoser", () => {
    const winner = { id: "t1", name: "Aces" };
    const loser = { id: "t2", name: "Bears" };

    it("returns the participant that is not the winner", () => {
        expect(getFixtureLoser({ winner, participants: [winner, loser] })).toEqual(loser);
    });

    it("returns null when there is no match, winner or participant list", () => {
        expect(getFixtureLoser(null)).toBeNull();
        expect(getFixtureLoser({ winner: null, participants: [winner, loser] })).toBeNull();
        expect(getFixtureLoser({ winner, participants: null })).toBeNull();
    });

    it("returns null when no participant differs from the winner", () => {
        expect(getFixtureLoser({ winner, participants: [winner, { id: "t1", name: "Aces" }] })).toBeNull();
    });
});

describe("pushFinalStanding", () => {
    it("appends a ranking entry", () => {
        const rankings = [];
        const seen = new Set();

        pushFinalStanding(rankings, seen, { id: "t1", name: "Aces" }, 1, "Champion");

        expect(rankings).toEqual([{ rank: 1, team_id: "t1", name: "Aces", note: "Champion" }]);
        expect(seen.has("t1")).toBe(true);
    });

    it("skips a missing participant", () => {
        const rankings = [];

        pushFinalStanding(rankings, new Set(), null, 1, "Champion");

        expect(rankings).toEqual([]);
    });

    it("skips a participant with no name", () => {
        const rankings = [];

        pushFinalStanding(rankings, new Set(), { id: "t1", name: null }, 1, "Champion");

        expect(rankings).toEqual([]);
    });

    it("skips a participant that has already been ranked", () => {
        const rankings = [];
        const seen = new Set(["t1"]);

        pushFinalStanding(rankings, seen, { id: "t1", name: "Aces" }, 1, "Champion");

        expect(rankings).toEqual([]);
    });
});

// --- state and team ordering ----------------------------------------------

describe("normalizeDivisionState", () => {
    it("returns an empty state when there is none", () => {
        expect(normalizeDivisionState(null)).toEqual({ teams: [], rounds: [], currentRound: 0 });
    });

    it("parses a JSON string", () => {
        expect(normalizeDivisionState('{"teams":["a"],"rounds":[],"currentRound":2}'))
            .toEqual({ teams: ["a"], rounds: [], currentRound: 2 });
    });

    it("returns an empty state when the string will not parse", () => {
        expect(normalizeDivisionState("{not json")).toEqual({ teams: [], rounds: [], currentRound: 0 });
    });

    it("coerces the fields of an object state", () => {
        expect(normalizeDivisionState({ teams: ["a"], rounds: [{ name: "R" }], currentRound: 1 }))
            .toEqual({ teams: ["a"], rounds: [{ name: "R" }], currentRound: 1 });
    });

    it("replaces non-array teams and rounds and defaults currentRound", () => {
        expect(normalizeDivisionState({ teams: "nope", rounds: null }))
            .toEqual({ teams: [], rounds: [], currentRound: 0 });
    });

    // The schedule used to be carried here as a fallback for divisions.schedule.
    // Both are gone: it lives on the tournament now, so state never yields it.
    it("drops a schedule left over in state", () => {
        expect(normalizeDivisionState({ schedule: { slots: [] } })).not.toHaveProperty("schedule");
    });

    it("coerces a numeric-string currentRound", () => {
        expect(normalizeDivisionState({ currentRound: "2" }).currentRound).toBe(2);
    });

    it("falls back to round zero when currentRound is not a number", () => {
        expect(normalizeDivisionState({ currentRound: "later" }).currentRound).toBe(0);
    });
});

describe("orderTeamsByState", () => {
    const alpha = makeTeam({ id: "a", name: "Alpha" });
    const bravo = makeTeam({ id: "b", name: "Bravo" });
    const charlie = makeTeam({ id: "c", name: "Charlie" });

    it("puts seeded teams first, in seeded order", () => {
        expect(orderTeamsByState([alpha, bravo, charlie], ["c", "a"]).map((team) => team.name))
            .toEqual(["Charlie", "Alpha", "Bravo"]);
    });

    it("sorts unseeded teams alphabetically", () => {
        expect(orderTeamsByState([charlie, alpha, bravo], []).map((team) => team.name))
            .toEqual(["Alpha", "Bravo", "Charlie"]);
    });

    it("ignores seeded ids that have no team", () => {
        expect(orderTeamsByState([alpha], ["missing", "a"]).map((team) => team.name)).toEqual(["Alpha"]);
    });

    it("defaults to no seeding when the order is not supplied", () => {
        expect(orderTeamsByState([bravo, alpha]).map((team) => team.name)).toEqual(["Alpha", "Bravo"]);
    });
});

// --- standings, bracket, final standings ----------------------------------

describe("buildDivisionStandings", () => {
    const teams = [
        makeTeam({ id: "t1", name: "Aces" }),
        makeTeam({ id: "t2", name: "Bears" })
    ];
    const teamLookup = lookupOf(teams);

    function completedPoolFixture(overrides = {}) {
        return {
            round: "Pool Play",
            status: "COMPLETED",
            team_1_id: "t1",
            team_2_id: "t2",
            result: [[21, 15], [21, 18]],
            ...overrides
        };
    }

    it("builds one table per group of a round-robin round", () => {
        const state = makeState({
            teams: ["t1", "t2"],
            rounds: [makeRound({ groups: [["t1", "t2"]] })]
        });

        const standings = buildDivisionStandings(state, [completedPoolFixture()], teamLookup);

        expect(standings).toHaveLength(1);
        expect(standings[0]).toMatchObject({ round: "Pool Play", roundIndex: 0 });
        expect(standings[0].groups[0].name).toBe("Group A");
        expect(standings[0].groups[0].standings.map((row) => [row.name, row.won, row.setsWon]))
            .toEqual([["Aces", 1, 2], ["Bears", 0, 0]]);
    });

    // The other half of bug 1's contract. Progression and the standings table
    // must agree on who is ahead, so the head-to-head criterion has to reach
    // this table too, not just computeRoundResults.
    it("ranks the winner of a head-to-head above the loser when nothing else separates them", () => {
        const fourTeams = lookupOf([
            makeTeam({ id: "t1", name: "Aces" }),
            makeTeam({ id: "t2", name: "Bears" }),
            makeTeam({ id: "t3", name: "Cubs" }),
            makeTeam({ id: "t4", name: "Ducks" })
        ]);
        const state = makeState({
            teams: ["t1", "t2", "t3", "t4"],
            rounds: [makeRound({ groups: [["t1", "t2", "t3", "t4"]] })]
        });

        // t1 and t2 finish level on wins, set ratio and point ratio.
        // t2 beat t1, so t2 places above it despite t1 being the better seed.
        const fixtures = [
            completedPoolFixture({ team_1_id: "t2", team_2_id: "t1", result: [[21, 15]] }),
            completedPoolFixture({ team_1_id: "t1", team_2_id: "t3", result: [[21, 15]] }),
            completedPoolFixture({ team_1_id: "t4", team_2_id: "t2", result: [[21, 15]] })
        ];

        expect(buildDivisionStandings(state, fixtures, fourTeams)[0].groups[0].standings.map((row) => row.id))
            .toEqual(["t4", "t2", "t1", "t3"]);
    });

    it("names a round by its index when it has none", () => {
        const state = makeState({ rounds: [makeRound({ name: undefined, groups: [[]] })] });

        expect(buildDivisionStandings(state, [], teamLookup)[0].round).toBe("Round 1");
    });

    it("skips knockout rounds", () => {
        const state = makeState({ rounds: [makeRound({ type: "knockout", groups: [[0, 1]] })] });

        expect(buildDivisionStandings(state, [], teamLookup)).toEqual([]);
    });

    it("skips a round whose groups are not an array", () => {
        const state = makeState({ rounds: [makeRound({ groups: null })] });

        expect(buildDivisionStandings(state, [], teamLookup)).toEqual([]);
    });

    it("skips a state with no rounds array", () => {
        expect(buildDivisionStandings({ teams: [] }, [], teamLookup)).toEqual([]);
    });

    it("ignores non-string entries in a group and groups that are not arrays", () => {
        const state = makeState({ rounds: [makeRound({ groups: [["t1", 3, null], "nope"] })] });

        const standings = buildDivisionStandings(state, [], teamLookup);

        expect(standings[0].groups[0].standings.map((row) => row.id)).toEqual(["t1"]);
        expect(standings[0].groups[1].standings).toEqual([]);
    });

    it("ignores a fixture whose teams are not in the table it built", () => {
        // The guard this exercises protects against the group list and the team
        // lookup disagreeing: "t1" is in the group, but the lookup resolves it to
        // a row with a different id, so the fixture cannot be attributed.
        const state = makeState({ rounds: [makeRound({ groups: [["t1", "t2"]] })] });
        const inconsistentLookup = new Map([["t1", makeTeam({ id: "renamed", name: "Aces" })]]);

        const rows = buildDivisionStandings(state, [completedPoolFixture()], inconsistentLookup)[0]
            .groups[0].standings;

        expect(rows.every((row) => row.played === 0)).toBe(true);
    });

    it("ignores fixtures that do not count and fixtures from another group", () => {
        const state = makeState({ rounds: [makeRound({ groups: [["t1", "t2"]] })] });
        const fixtures = [
            completedPoolFixture({ status: "UPCOMING" }),
            completedPoolFixture({ round: "Finals" }),
            completedPoolFixture({ team_2_id: "outsider" })
        ];

        const rows = buildDivisionStandings(state, fixtures, teamLookup)[0].groups[0].standings;

        expect(rows.every((row) => row.played === 0)).toBe(true);
    });
});

describe("buildDivisionBracket", () => {
    const teams = [makeTeam({ id: "t1", name: "Aces" }), makeTeam({ id: "t2", name: "Bears" })];
    const teamLookup = lookupOf(teams);

    it("pairs each knockout group with its fixture", () => {
        const state = makeState({
            rounds: [makeRound({ name: "Finals", type: "knockout", groups: [[0, 1]] })]
        });
        const fixtures = [{
            id: "f1",
            match_no: 9,
            round: "Finals",
            status: "COMPLETED",
            team_1_id: "t1",
            team_2_id: "t2",
            team1: "Aces",
            team2: "Bears",
            result: [[21, 15]]
        }];

        const bracket = buildDivisionBracket(state, fixtures, teamLookup);

        expect(bracket.rounds[0]).toMatchObject({ name: "Finals", roundIndex: 0 });
        expect(bracket.rounds[0].matches[0]).toMatchObject({
            id: "f1",
            match_no: 9,
            status: "COMPLETED",
            winner: { id: "t1", name: "Aces" },
            isPlacementMatch: false
        });
    });

    it("shows the teams bound to the fixture, not the group's rank indices", () => {
        // A knockout group holds positional indices into the previous round's
        // results and keeps holding them after progression — binding happens on
        // the fixture. Reading the group alone left the final reading
        // "Rank 1 v Rank 2" once it had two real teams in it.
        const state = makeState({
            rounds: [makeRound({ name: "Finals", type: "knockout", groups: [[0, 1]] })]
        });
        const fixtures = [{
            id: "f1",
            round: "Finals",
            status: "UPCOMING",
            // Still set: progression never clears the placeholder columns.
            team_1_placeholder: "Rank 1",
            team_2_placeholder: "Rank 2",
            teams: {
                team_1: { id: "t1", name: "Aces", placeholder: null },
                team_2: { id: "t2", name: "Bears", placeholder: null }
            }
        }];

        const match = buildDivisionBracket(state, fixtures, teamLookup).rounds[0].matches[0];

        expect(match.participants).toEqual([
            { id: "t1", name: "Aces", placeholder: null },
            { id: "t2", name: "Bears", placeholder: null }
        ]);
    });

    it("falls back to the rank indices while only one side is bound", () => {
        const state = makeState({
            rounds: [makeRound({ name: "Finals", type: "knockout", groups: [[0, 1]] })]
        });
        const fixtures = [{
            id: "f1",
            round: "Finals",
            status: "UPCOMING",
            team_2_placeholder: "Rank 2",
            teams: {
                team_1: { id: "t1", name: "Aces", placeholder: null },
                team_2: { id: null, name: "Rank 2", placeholder: "Rank 2" }
            }
        }];

        const match = buildDivisionBracket(state, fixtures, teamLookup).rounds[0].matches[0];

        expect(match.participants.map((participant) => participant.name)).toEqual(["Aces", "Rank 2"]);
    });

    it("synthesises a match when the fixture does not exist yet", () => {
        const state = makeState({
            rounds: [makeRound({ name: "Semifinals", type: "knockout", groups: [[0, 3]] })]
        });

        const match = buildDivisionBracket(state, [], teamLookup).rounds[0].matches[0];

        expect(match).toMatchObject({
            id: "Semifinals-0",
            match_no: null,
            round: "Semifinals",
            status: "UPCOMING",
            result: [],
            winner: null,
            isPlacementMatch: false
        });
        expect(match.participants.map((participant) => participant.name)).toEqual(["Rank 1", "Rank 4"]);
    });

    it("flags the third-place playoff as a placement match", () => {
        const state = makeState({
            rounds: [makeRound({ name: "Finals", type: "knockout", groups: [[2, 3], [0, 1]] })]
        });
        const fixtures = [
            { id: "bronze", round: "3rd Place Playoff", status: "UPCOMING" },
            { id: "gold", round: "Finals", status: "UPCOMING" }
        ];

        const matches = buildDivisionBracket(state, fixtures, teamLookup).rounds[0].matches;

        expect(matches.map((match) => match.isPlacementMatch)).toEqual([true, false]);
    });

    it("skips round-robin rounds and malformed groups", () => {
        const state = makeState({
            rounds: [
                makeRound({ name: "Pool Play" }),
                makeRound({ name: "Finals", type: "knockout", groups: [[0], "nope", [0, 1]] })
            ]
        });

        const bracket = buildDivisionBracket(state, [], teamLookup);

        expect(bracket.rounds).toHaveLength(1);
        expect(bracket.rounds[0].matches).toHaveLength(1);
    });

    it("tolerates a knockout round with no groups key", () => {
        const state = makeState({ rounds: [{ name: "Finals", type: "knockout" }] });

        expect(buildDivisionBracket(state, [], teamLookup).rounds[0].matches).toEqual([]);
    });

    it("skips a state with no rounds array", () => {
        expect(buildDivisionBracket({}, [], teamLookup).rounds).toEqual([]);
    });
});

describe("buildFinalStandings", () => {
    const division = makeDivision({ type: "Classic" });
    const teams = [makeTeam({ id: "t1", name: "Aces" }), makeTeam({ id: "t2", name: "Bears" })];
    const completeFixtures = [{ status: "COMPLETED" }];

    function bracketWithFinal() {
        return {
            rounds: [{
                name: "Finals",
                matches: [
                    {
                        round: "3rd Place Playoff",
                        participants: [{ id: "t3", name: "Cubs" }, { id: "t4", name: "Ducks" }],
                        winner: { id: "t3", name: "Cubs" }
                    },
                    {
                        round: "Finals",
                        participants: [{ id: "t1", name: "Aces" }, { id: "t2", name: "Bears" }],
                        winner: { id: "t1", name: "Aces" }
                    }
                ]
            }]
        };
    }

    it("returns nothing while the division is still running", () => {
        expect(buildFinalStandings({
            division,
            fixtures: [{ status: "UPCOMING" }],
            standings: [],
            bracket: { rounds: [] },
            teams
        })).toEqual([]);
    });

    it("ranks champion, runner-up and the placement match from the bracket", () => {
        const ranked = buildFinalStandings({
            division,
            fixtures: completeFixtures,
            standings: [],
            bracket: bracketWithFinal(),
            teams: []
        });

        expect(ranked).toEqual([
            { rank: 1, team_id: "t1", name: "Aces", note: "Champion" },
            { rank: 2, team_id: "t2", name: "Bears", note: "Runner-up" },
            { rank: 3, team_id: "t3", name: "Cubs", note: "Third Place" },
            { rank: 4, team_id: "t4", name: "Ducks", note: "Fourth Place" }
        ]);
    });

    it("ignores bracket matches without two participants", () => {
        const bracket = { rounds: [{ name: "Finals", matches: [{ round: "Finals", participants: null }] }] };

        expect(buildFinalStandings({ division, fixtures: completeFixtures, standings: [], bracket, teams: [] }))
            .toEqual([]);
    });

    // Was bug 6. The fallback selected the last bracket round and then did
    // nothing with it, because the loop beneath re-tested each match's own name
    // against "Finals". A branch that cannot fire is worse than no branch.
    it("ranks the winner and loser of the last bracket round when none is named Finals", () => {
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

        expect(buildFinalStandings({ division, fixtures: completeFixtures, standings: [], bracket, teams: [] }))
            .toEqual([
                { rank: 1, team_id: "t1", name: "Aces", note: "Champion" },
                { rank: 2, team_id: "t2", name: "Bears", note: "Runner-up" }
            ]);
    });

    // The other half of the rule: a concluding round holding several undecided
    // matches settles no title, so the tier below it runs instead.
    it("declines to crown anyone when the last bracket round holds more than one match", () => {
        const bracket = {
            rounds: [{
                name: "Semifinals",
                matches: [
                    {
                        round: "Semifinals",
                        participants: [{ id: "t1", name: "Aces" }, { id: "t2", name: "Bears" }],
                        winner: { id: "t1", name: "Aces" }
                    },
                    {
                        round: "Semifinals",
                        participants: [{ id: "t3", name: "Cubs" }, { id: "t4", name: "Ducks" }],
                        winner: { id: "t3", name: "Cubs" }
                    }
                ]
            }]
        };

        expect(buildFinalStandings({ division, fixtures: completeFixtures, standings: [], bracket, teams: [] }))
            .toEqual([]);
    });

    it("falls back to the round-robin table when the bracket produced nothing", () => {
        const standings = [{
            round: "Pool Play",
            groups: [{
                name: "Group A",
                standings: [{ id: "t1", name: "Aces" }, { id: "t2", name: "Bears" }]
            }]
        }];

        expect(buildFinalStandings({ division, fixtures: completeFixtures, standings, bracket: { rounds: [] }, teams }))
            .toEqual([
                { rank: 1, team_id: "t1", name: "Aces", note: "Group A" },
                { rank: 2, team_id: "t2", name: "Bears", note: "Group A" }
            ]);
    });

    it("does not rank the same team twice via the table", () => {
        const standings = [{
            round: "Pool Play",
            groups: [
                { name: "Group A", standings: [{ id: "t1", name: "Aces" }] },
                { name: "Group B", standings: [{ id: "t1", name: "Aces" }, { id: "t2", name: "Bears" }] }
            ]
        }];

        expect(buildFinalStandings({ division, fixtures: completeFixtures, standings, bracket: { rounds: [] }, teams }))
            .toHaveLength(2);
    });

    it("appends any team the earlier tiers did not place", () => {
        const bracket = {
            rounds: [{
                name: "Finals",
                matches: [{
                    round: "Finals",
                    participants: [{ id: "t1", name: "Aces" }, { id: "t2", name: "Bears" }],
                    winner: { id: "t1", name: "Aces" }
                }]
            }]
        };
        const allTeams = [...teams, makeTeam({ id: "t5", name: "Eagles" })];

        const ranked = buildFinalStandings({
            division,
            fixtures: completeFixtures,
            standings: [],
            bracket,
            teams: allTeams
        });

        expect(ranked.at(-1)).toEqual({ rank: 3, team_id: "t5", name: "Eagles", note: "Classic" });
    });

    it("uses a null note for the leftover tier when the division has no type", () => {
        const ranked = buildFinalStandings({
            division: makeDivision({ type: null }),
            fixtures: completeFixtures,
            standings: [],
            bracket: { rounds: [] },
            teams: [makeTeam({ id: "t1", name: "Aces" })]
        });

        expect(ranked).toEqual([{ rank: 1, team_id: "t1", name: "Aces", note: null }]);
    });
});

// --- overview, dashboard, division and tournament payloads ----------------

describe("buildDivisionOverview", () => {
    const division = makeDivision({ num_teams: 6 });

    it("summarises counts and picks up the current round", () => {
        const fixtures = [
            { status: "COMPLETED", match_no: 1 },
            { status: "UPCOMING", match_no: 2 },
            { status: "LIVE", match_no: 3 }
        ];

        const overview = buildDivisionOverview({
            division,
            teams: [makeTeam(), makeTeam()],
            fixtures,
            results: [fixtures[0]],
            state: makeState({ rounds: [makeRound({ name: "Pool Play" })] })
        });

        expect(overview).toMatchObject({
            divisionId: "div-1",
            teamCount: 2,
            totalFixtures: 3,
            completedFixtures: 1,
            upcomingFixturesCount: 2,
            currentRound: "Pool Play"
        });
        // Live before upcoming.
        expect(overview.upcomingFixtures.map((fixture) => fixture.match_no)).toEqual([3, 2]);
    });

    it("falls back to the declared team count when no teams are loaded", () => {
        expect(buildDivisionOverview({
            division,
            teams: [],
            fixtures: [],
            results: [],
            state: makeState()
        })).toMatchObject({ teamCount: 6 });
    });

    it("falls back to zero when neither is available", () => {
        expect(buildDivisionOverview({
            division: makeDivision({ num_teams: null }),
            teams: [],
            fixtures: [],
            results: [],
            state: makeState()
        }).teamCount).toBe(0);
    });

    it("sorts results with no match number to the back", () => {
        const results = [
            { status: "COMPLETED", match_no: null },
            { status: "COMPLETED", match_no: 4 },
            { status: "COMPLETED" },
            { status: "COMPLETED", match_no: 2 }
        ];

        const overview = buildDivisionOverview({
            division,
            teams: [],
            fixtures: [],
            results,
            state: makeState()
        });

        expect(overview.recentResults.map((fixture) => fixture.match_no ?? 0)).toEqual([4, 2, 0, 0]);
    });

    it("caps the recent results and upcoming lists at five", () => {
        const results = Array.from({ length: 7 }, (_, index) => ({ status: "COMPLETED", match_no: index + 1 }));
        const upcoming = Array.from({ length: 7 }, (_, index) => ({ status: "UPCOMING", match_no: index + 10 }));

        const overview = buildDivisionOverview({
            division,
            teams: [],
            fixtures: upcoming,
            results,
            state: makeState()
        });

        expect(overview.recentResults).toHaveLength(5);
        expect(overview.recentResults[0].match_no).toBe(7);
        expect(overview.upcomingFixtures).toHaveLength(5);
    });
});

describe("buildTournamentDashboard", () => {
    function divisionSummary(id, overrides = {}) {
        return {
            id,
            name: `Division ${id}`,
            type: "Classic",
            overview: {
                teamCount: 4,
                totalFixtures: 6,
                completedFixtures: 2,
                upcomingFixturesCount: 4,
                currentRound: "Pool Play",
                recentResults: [{ id: `${id}-r1`, match_no: 2, status: "COMPLETED" }],
                upcomingFixtures: [{ id: `${id}-u1`, match_no: 3, status: "UPCOMING" }],
                ...overrides
            }
        };
    }

    it("totals every division and tags each fixture with its division", () => {
        const dashboard = buildTournamentDashboard(
            { id: "tour-1", status: "LIVE" },
            [divisionSummary("a"), divisionSummary("b")]
        );

        expect(dashboard).toMatchObject({
            tournament_id: "tour-1",
            divisionCount: 2,
            totalTeams: 8,
            totalFixtures: 12,
            completedFixtureCount: 4,
            upcomingFixtureCount: 8,
            currentStatus: "LIVE",
            hasSchedule: false
        });
        expect(dashboard.recentResults[0]).toMatchObject({ division_id: "a", division_name: "Division a" });
        expect(dashboard.upcomingFixtures).toHaveLength(2);
    });

    // The schedule is tournament-wide, so the flag is read off the tournament
    // rather than aggregated from the divisions.
    it("reports a schedule from the tournament, not from any division", () => {
        const dashboard = buildTournamentDashboard(
            { id: "tour-1", status: "LIVE", schedule: { days: [] } },
            [divisionSummary("a")]
        );

        expect(dashboard.hasSchedule).toBe(true);
        expect(dashboard.divisions[0]).not.toHaveProperty("hasSchedule");
    });

    it("sorts pooled results with no match number to the back", () => {
        const dashboard = buildTournamentDashboard({ id: "tour-1", status: "LIVE" }, [
            divisionSummary("a", {
                recentResults: [{ id: "a1", match_no: null, status: "COMPLETED" }, { id: "a2", match_no: 5, status: "COMPLETED" }]
            }),
            divisionSummary("b", {
                recentResults: [{ id: "b1", status: "COMPLETED" }, { id: "b2", match_no: 3, status: "COMPLETED" }]
            })
        ]);

        expect(dashboard.recentResults.map((fixture) => fixture.id).slice(0, 2)).toEqual(["a2", "b2"]);
        expect(dashboard.recentResults).toHaveLength(4);
    });

    it("caps the cross-division lists at eight", () => {
        const divisions = Array.from({ length: 5 }, (_, index) =>
            divisionSummary(`d${index}`, {
                recentResults: [
                    { id: `${index}-r1`, match_no: 1, status: "COMPLETED" },
                    { id: `${index}-r2`, match_no: 2, status: "COMPLETED" }
                ],
                upcomingFixtures: [
                    { id: `${index}-u1`, match_no: 1, status: "UPCOMING" },
                    { id: `${index}-u2`, match_no: 2, status: "UPCOMING" }
                ]
            })
        );

        const dashboard = buildTournamentDashboard({ id: "tour-1", status: "LIVE" }, divisions);

        expect(dashboard.recentResults).toHaveLength(8);
        expect(dashboard.upcomingFixtures).toHaveLength(8);
    });
});

describe("formatTournamentDetails", () => {
    it("formats dates and reports a single division type", () => {
        const details = formatTournamentDetails(makeTournament({ status: "LIVE", description: "Open", location: "Hall" }), [
            { type: "Classic" },
            { type: "Classic" }
        ]);

        expect(details).toMatchObject({
            id: "tour-1",
            description: "Open",
            location: "Hall",
            status: "LIVE",
            // The ISO fields and the labels describe the same day. They used to
            // be a day apart — bug 7.
            start_date: "2026-08-01",
            startDate: "2026-08-01",
            start_date_label: "1 August 2026",
            end_date_label: "3 August 2026",
            type: "Classic",
            division_count: 2
        });
    });

    it("defaults the optional strings and the status", () => {
        expect(formatTournamentDetails(makeTournament(), [])).toMatchObject({
            description: "",
            location: "",
            status: "Not Started",
            type: null,
            division_count: 0,
            schedule: null
        });
    });

    // The schedule lives here now rather than on each division.
    it("carries the tournament's schedule", () => {
        const schedule = { version: 1, days: [] };

        expect(formatTournamentDetails(makeTournament({ schedule }), []).schedule).toEqual(schedule);
    });

    it("reports no type when the divisions disagree", () => {
        expect(formatTournamentDetails(makeTournament(), [{ type: "Classic" }, { type: "League" }]).type).toBeNull();
    });

    it("nulls the date labels when the tournament has no dates", () => {
        expect(formatTournamentDetails(makeTournament({ start_date: null, end_date: null }), [])).toMatchObject({
            start_date: null,
            end_date: null,
            start_date_label: null,
            end_date_label: null
        });
    });
});

describe("formatDivisionPayload", () => {
    it("orders teams by state, sorts fixtures and splits out the results", () => {
        const teams = [
            makeTeam({ id: "t2", name: "Bears" }),
            makeTeam({ id: "t1", name: "Aces" })
        ];
        const division = makeDivision({
            num_teams: null,
            state: makeState({ teams: ["t1", "t2"], rounds: [makeRound({ groups: [["t1", "t2"]] })] })
        });
        const fixtures = [
            makeFixture({ id: "f2", match_no: 2, status: "UPCOMING", team_1: "t1", team_2: "t2" }),
            makeFixture({ id: "f1", match_no: 1, status: "COMPLETED", team_1: "t1", team_2: "t2", team_1_result: [21], team_2_result: [15] })
        ];

        const payload = formatDivisionPayload({ division, teams, fixtures });

        expect(payload.teams.map((team) => team.name)).toEqual(["Aces", "Bears"]);
        expect(payload.fixtures.map((fixture) => fixture.id)).toEqual(["f1", "f2"]);
        expect(payload.results.map((fixture) => fixture.id)).toEqual(["f1"]);
        expect(payload.num_teams).toBe(2);
    });

    // A division no longer carries a schedule at all, however one arrives.
    it("never emits a schedule, even when one is left on the row or in state", () => {
        const division = makeDivision({
            schedule: { source: "column" },
            state: makeState({ schedule: { source: "state" } })
        });

        const payload = formatDivisionPayload({ division, teams: [], fixtures: [] });

        expect(payload).not.toHaveProperty("schedule");
        expect(payload.overview).not.toHaveProperty("hasSchedule");
    });

    it("keeps the declared team count and nulls an absent type", () => {
        const division = makeDivision({ num_teams: 12, type: null });

        expect(formatDivisionPayload({ division, teams: [], fixtures: [] })).toMatchObject({
            num_teams: 12,
            type: null
        });
    });

    it("treats fixtures with no match number as first", () => {
        const division = makeDivision();
        const fixtures = [
            makeFixture({ id: "f3", match_no: 3 }),
            makeFixture({ id: "n1", match_no: null }),
            makeFixture({ id: "f1", match_no: 1 }),
            makeFixture({ id: "n2", match_no: undefined })
        ];

        expect(formatDivisionPayload({ division, teams: [], fixtures }).fixtures.map((fixture) => fixture.id))
            .toEqual(["n1", "n2", "f1", "f3"]);
    });
});

describe("formatTournamentViewPayload", () => {
    it("assembles the tournament, dashboard and divisions from the worked example", () => {
        const teams = goldenEightTeams();
        const division = makeDivision({ id: "div-1", num_teams: 8, state: goldenEightTeamState() });
        const fixtures = [
            makeFixture({
                id: "pool-1",
                match_no: 1,
                round: "Pool Play",
                status: "COMPLETED",
                team_1: GOLDEN_TEAM_IDS[0],
                team_2: GOLDEN_TEAM_IDS[3],
                team_1_result: [21, 21],
                team_2_result: [15, 18]
            }),
            makeFixture({
                id: "sf-fixture-1",
                match_no: 13,
                round: "Semifinals",
                status: "UPCOMING",
                team_1_placeholder: "Rank 1",
                team_2_placeholder: "Rank 4"
            })
        ];

        const payload = formatTournamentViewPayload({
            tournament: makeTournament(),
            divisions: [division],
            teamsByDivisionId: new Map([["div-1", teams]]),
            fixturesByDivisionId: new Map([["div-1", fixtures]])
        });

        expect(payload.tournament).toMatchObject({ id: "tour-1", type: "Classic", division_count: 1 });
        expect(payload.dashboard).toMatchObject({ divisionCount: 1, totalTeams: 8, totalFixtures: 2 });
        expect(payload.divisions).toHaveLength(1);

        const [formatted] = payload.divisions;
        expect(formatted.teams.map((team) => team.name)).toEqual(teams.map((team) => team.name));
        expect(formatted.standings[0].groups.map((group) => group.name)).toEqual(["Group A", "Group B"]);
        expect(formatted.bracket.rounds.map((round) => round.name)).toEqual(["Semifinals", "Finals"]);
        // Nothing is finished, so there is no final ranking yet.
        expect(formatted.finalStandings).toEqual([]);
    });

    it("defaults to empty teams and fixtures for a division with no entries in the maps", () => {
        const payload = formatTournamentViewPayload({
            tournament: makeTournament(),
            divisions: [makeDivision({ id: "div-9", num_teams: 0 })],
            teamsByDivisionId: new Map(),
            fixturesByDivisionId: new Map()
        });

        expect(payload.divisions[0].teams).toEqual([]);
        expect(payload.divisions[0].fixtures).toEqual([]);
        expect(payload.dashboard.totalTeams).toBe(0);
    });
});
