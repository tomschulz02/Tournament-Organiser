import { describe, it, expect, vi } from "vitest";

// Placement matches, played end to end through the real generation, progression
// and view code — no mocks beyond the database handle nothing here touches.
//
// Each case plays a whole Classic division in which the better seed wins every
// match by the same score. With every result identical, the only thing that can
// separate teams is the order they are eliminated in and, where no match decides
// it, seeding — so the final standings must come out in seed order whatever the
// placement depth, and any index that points at the wrong team breaks that.

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { createClassicState, addPlacementMatches, ordinal } = await import("../../../src/services/divisions.service.js");
const { generateFixtures } = await import("../../../src/services/fixtures.service.js");
const {
    bindFixturesToResults,
    computeRoundResults,
    isRoundComplete,
    normalizeFixtureResult,
    qualifierCount
} = await import("../../../src/services/progression.service.js");
const { formatDivisionPayload } = await import("../../../src/utils/tournamentViewFormatter.js");

function playDivision({ teamCount, pools, knockoutTeams, depth }) {
    const teamIds = Array.from({ length: teamCount }, (_, index) => `t${index}`);
    const seed = (id) => teamIds.indexOf(id);
    const state = createClassicState(teamIds, teamCount, pools, knockoutTeams, depth);
    const generated = generateFixtures(state.rounds);
    state.rounds = generated.rounds;

    const rows = generated.fixtures.map((fixture) => ({
        id: fixture.id,
        division_id: "div-1",
        match_no: fixture.matchNo,
        round: fixture.round,
        team_1: fixture.placeholder1 ? null : fixture.team1,
        team_2: fixture.placeholder2 ? null : fixture.team2,
        team_1_placeholder: fixture.placeholder1 ? `Rank ${fixture.team1 + 1}` : null,
        team_2_placeholder: fixture.placeholder2 ? `Rank ${fixture.team2 + 1}` : null,
        status: "UPCOMING",
        team_1_result: null,
        team_2_result: null
    }));

    const inRound = (round) => rows.filter((row) => round.fixtures.includes(row.id));

    state.rounds.forEach((round, roundIndex) => {
        inRound(round).forEach((row) => {
            const oneWins = seed(row.team_1) < seed(row.team_2);
            row.status = "COMPLETED";
            row.team_1_result = oneWins ? [21, 21] : [10, 12];
            row.team_2_result = oneWins ? [10, 12] : [21, 21];
        });

        const nextRound = state.rounds[roundIndex + 1];
        if (!nextRound) return;

        const fixtures = rows.map(normalizeFixtureResult);
        expect(isRoundComplete(round, fixtures)).toBe(true);

        const computed = computeRoundResults(round, state, fixtures, {
            nextRound,
            previousResults: state.rounds[roundIndex - 1]?.results
        }).map((row) => row.id);
        const confirmed = computed.slice(0, qualifierCount(nextRound));

        round.results = confirmed;
        round.computedResults = computed;
        state.currentRound = roundIndex + 1;

        bindFixturesToResults(nextRound, confirmed).forEach((bound) => {
            const row = rows.find((candidate) => candidate.id === bound.id);
            row.team_1 = bound.team_1;
            row.team_2 = bound.team_2;
        });
    });

    const division = { id: "div-1", name: "Open", type: "Classic", state, placement_depth: depth };
    const teams = teamIds.map((id) => ({ id, name: id, division_id: "div-1" }));

    return { state, rows, view: formatDivisionPayload({ division, teams, fixtures: rows }), teamIds };
}

describe("a knockout without placement depth", () => {
    it("draws exactly what it always has", () => {
        const teams = Array.from({ length: 16 }, (_, index) => `t${index}`);

        expect(createClassicState(teams, 16, 2, 8, null)).toEqual(createClassicState(teams, 16, 2, 8));
        expect(createClassicState(teams, 16, 2, 8).rounds.some((round) => "placement" in round)).toBe(false);
    });
});

describe.each([
    // teams, pools, knockout teams, depth, placement fixtures expected
    [16, 2, 8, 7, 4],
    [16, 2, 8, 5, 3],
    [16, 2, 6, 5, 1],
    [16, 2, 7, 7, 2],
    [16, 2, 7, 5, 2],
    [16, 4, 12, 11, 8],
    [16, 4, 12, 9, 7],
    [16, 1, 16, 15, 16],
    [16, 1, 16, 9, 11],
    [16, 2, 8, null, 0],
    [16, 2, 6, null, 0]
])("%i teams, %i pools, %i in the knockout, depth %s", (teamCount, pools, knockoutTeams, depth, placementFixtures) => {
    const { rows, view, teamIds, state } = playDivision({ teamCount, pools, knockoutTeams, depth });

    it("generates one fixture per placement match the depth asks for", () => {
        expect(rows.filter((row) => row.round.includes(" · "))).toHaveLength(placementFixtures);
    });

    it("ranks every team in seed order, from real results where the depth reaches", () => {
        expect(view.finalStandings.map((entry) => entry.team_id)).toEqual(teamIds);
        expect(view.finalStandings.map((entry) => entry.rank)).toEqual(teamIds.map((_, index) => index + 1));
    });

    it("notes each rank the depth covers as decided by its placement match, and no other", () => {
        const covered = (rank) => depth !== null && rank >= 5 && rank <= Math.min(depth + 1, knockoutTeams);

        view.finalStandings.forEach((entry) => {
            if (covered(entry.rank)) expect(entry.note).toBe(`${ordinal(entry.rank)} Place`);
            else expect(entry.note).not.toMatch(/d+(st|nd|rd|th) Place/);
        });
    });

    it("draws each placement match in the bracket with a source for every slot", () => {
        const placementMatches = view.bracket.rounds
            .flatMap((round) => round.matches)
            .filter((match) => match.round.includes(" · "));

        expect(placementMatches).toHaveLength(placementFixtures);
        placementMatches.forEach((match) => {
            expect(match.isPlacementMatch).toBe(true);
            expect(match.sources.every((source) => source !== null)).toBe(true);
        });
    });

    it("keeps the 3rd-place playoff and the final where they were", () => {
        const finals = view.bracket.rounds.at(-1);

        expect(finals.matches[0].round).toBe("3rd Place Playoff");
        expect(finals.matches[1].round).toBe("Finals");
        expect(state.rounds.at(-1).groups[1]).toEqual([0, 1]);
    });
});

describe("addPlacementMatches", () => {
    it("leaves a division with no knockout, or a knockout of one round, alone", () => {
        const pool = { name: "Pool Play", type: "roundRobin", groups: [["a", "b"]] };
        const final = { name: "Finals", type: "knockout", groups: [[0, 1]] };

        expect(addPlacementMatches([pool], 7)).toEqual([pool]);
        expect(addPlacementMatches([pool, final], 7)).toEqual([pool, final]);
    });
});

describe("ordinal", () => {
    it.each([[1, "1st"], [2, "2nd"], [3, "3rd"], [5, "5th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"], [23, "23rd"], [111, "111th"]])(
        "%i is %s",
        (value, expected) => expect(ordinal(value)).toBe(expected)
    );
});
