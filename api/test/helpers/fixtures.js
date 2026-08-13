// Builders for the object shapes the API passes around, plus the eight-team
// worked example from docs/division-state.md.
//
// Everything here is plain data. Nothing imports from src/, so a change to these
// helpers can never mask a change in behaviour.

let sequence = 0;
export function nextId(prefix = "id") {
    sequence += 1;
    return `${prefix}-${sequence}`;
}

export function makeTeam(overrides = {}) {
    return {
        id: overrides.id ?? nextId("team"),
        name: overrides.name ?? "Team",
        division_id: overrides.division_id ?? "div-1",
        ...overrides
    };
}

// A row as it comes out of the fixtures table: team_1/team_2 hold ids, and the
// per-set scores live in two parallel integer arrays.
export function makeFixture(overrides = {}) {
    return {
        id: overrides.id ?? nextId("fixture"),
        division_id: "div-1",
        match_no: 1,
        round: "Pool Play",
        status: "UPCOMING",
        team_1: null,
        team_2: null,
        team_1_placeholder: null,
        team_2_placeholder: null,
        team_1_result: null,
        team_2_result: null,
        ...overrides
    };
}

// A completed fixture expressed as set pairs, e.g. sets([[21, 15], [21, 18]]).
// Splits them back into the parallel-array storage format the DB uses.
export function makeCompletedFixture(teamOneId, teamTwoId, setPairs, overrides = {}) {
    return makeFixture({
        status: "COMPLETED",
        team_1: teamOneId,
        team_2: teamTwoId,
        team_1_result: setPairs.map((pair) => pair[0]),
        team_2_result: setPairs.map((pair) => pair[1]),
        ...overrides
    });
}

// A fixture already normalised for the standings helpers: result is [[a, b], ...]
// and the ids are on team_1_id/team_2_id, which is what buildHeadToHeadMap reads.
export function makeNormalisedFixture(overrides = {}) {
    return {
        id: overrides.id ?? nextId("fixture"),
        round: "Pool Play",
        status: "COMPLETED",
        team_1_id: null,
        team_2_id: null,
        result: [],
        ...overrides
    };
}

export function makeStandingsRow(overrides = {}) {
    return {
        id: overrides.id ?? nextId("team"),
        name: "Team",
        played: 0,
        won: 0,
        lost: 0,
        setsWon: 0,
        setsLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        setsRatio: 0,
        pointsRatio: 0,
        ...overrides
    };
}

export function makeRound(overrides = {}) {
    return {
        name: "Pool Play",
        type: "roundRobin",
        groups: [],
        results: [],
        totalGames: 0,
        completedGames: 0,
        fixtures: [],
        ...overrides
    };
}

export function makeState(overrides = {}) {
    return {
        teams: [],
        rounds: [],
        currentRound: 0,
        ...overrides
    };
}

export function makeDivision(overrides = {}) {
    return {
        id: "div-1",
        tournament_id: "tour-1",
        name: "Division A",
        type: "Classic",
        num_teams: null,
        state: makeState(),
        ...overrides
    };
}

export function makeTournament(overrides = {}) {
    return {
        id: "tour-1",
        name: "Summer Open",
        description: null,
        location: null,
        status: null,
        // Strings, because that is what a `date` column now yields — see the
        // type parser in src/config/db.js. A Date here would model a shape the
        // application no longer sees.
        start_date: "2026-08-01",
        end_date: "2026-08-03",
        created_by: "user-1",
        schedule: null,
        ...overrides
    };
}

// --- the docs/division-state.md worked example ----------------------------
//
// Eight teams, one round-robin pool stage split into two groups of four, then
// semifinals and finals. The ids are the ones in the doc, so a reader can diff
// this against the document directly.

export const GOLDEN_TEAM_IDS = [
    "45bb764e-c07d-474e-8d01-9d9711d39a3a",
    "2b64031d-8408-4783-92d8-e375a56ef8d5",
    "0da84d48-d442-40d4-a5fe-e7adac21a48d",
    "7999b658-993f-4fb4-84fa-2aad95489fce",
    "4009a8b3-c098-43ab-bab7-1ba6acf40c28",
    "d57c1597-f51b-4c10-a52a-f9e9e6d0f5a1",
    "56627a42-2d0e-4cbb-91ae-9710d9a971e3",
    "168eb664-ebd0-4da0-a1cc-74b8532f1500"
];

// Deep-cloned on every call: several functions under test mutate the state they
// are given, so sharing one object between tests would leak.
export function goldenEightTeamState() {
    return {
        teams: [...GOLDEN_TEAM_IDS],
        rounds: [
            {
                name: "Pool Play",
                type: "roundRobin",
                groups: [
                    [GOLDEN_TEAM_IDS[0], GOLDEN_TEAM_IDS[3], GOLDEN_TEAM_IDS[4], GOLDEN_TEAM_IDS[7]],
                    [GOLDEN_TEAM_IDS[1], GOLDEN_TEAM_IDS[2], GOLDEN_TEAM_IDS[5], GOLDEN_TEAM_IDS[6]]
                ],
                results: [],
                fixtures: [],
                totalGames: 12,
                completedGames: 0
            },
            {
                name: "Semifinals",
                type: "knockout",
                groups: [[0, 3], [1, 2]],
                results: [],
                fixtures: ["sf-fixture-1", "sf-fixture-2"],
                totalGames: 2,
                completedGames: 0
            },
            {
                name: "Finals",
                type: "knockout",
                // Index 0 is the bronze match, per createClassicState's unshift([2, 3]).
                groups: [[2, 3], [0, 1]],
                results: [],
                fixtures: ["final-fixture-1", "final-fixture-2"],
                totalGames: 2,
                completedGames: 0
            }
        ],
        currentRound: 0
    };
}

export function goldenEightTeams() {
    return GOLDEN_TEAM_IDS.map((id, index) =>
        makeTeam({ id, name: `Team ${index + 1}`, division_id: "div-1" })
    );
}
