// Ranking and progression rules. Pure functions — no Express, no database.
//
// This is the single implementation of the rules in docs/tournament-rules.md.
// Both the standings view (tournamentViewFormatter.js) and round progression
// (divisions.service.js) must use it, so a table and the qualifiers derived from
// that table can never disagree.

// Sentinel for a ratio whose denominator is zero. Two of these compare equal and
// fall through to the next criterion, which is what the rules require. Doing this
// with Infinity produces Infinity - Infinity = NaN, which sorts unpredictably.
const UNDEFINED_RATIO = Symbol("undefinedRatio");

export function createStandingsRow(team, fallbackId) {
    return {
        id: team?.id || fallbackId,
        name: team?.name || "TBD",
        played: 0,
        won: 0,
        lost: 0,
        setsWon: 0,
        setsLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        // How this team's completed matches finished, keyed by the scoreline from
        // its own perspective — "2-0", "2-1", "1-2", "0-2". A counter for the
        // standings table and nothing else: it is deliberately absent from
        // compareTeams, because the ranking chain in docs/tournament-rules.md is
        // the five criteria there and no sixth.
        //
        // The keys are whatever the fixtures produced, so a best-of-five division
        // yields six of them. Rounds carry no match-format key to assume one from
        // — see docs/division-state.md.
        setOutcomes: {},
        setsRatio: 0,
        pointsRatio: 0
    };
}

// Applies one completed fixture to two standings rows.
// A set with equal scores counts for neither team but its points still count.
export function applyFixtureToStandings(teamOne, teamTwo, result) {
    let teamOneSetsWon = 0;
    let teamTwoSetsWon = 0;

    result.forEach(([teamOneScore, teamTwoScore]) => {
        teamOne.pointsFor += teamOneScore;
        teamOne.pointsAgainst += teamTwoScore;
        teamTwo.pointsFor += teamTwoScore;
        teamTwo.pointsAgainst += teamOneScore;

        if (teamOneScore > teamTwoScore) {
            teamOne.setsWon += 1;
            teamTwo.setsLost += 1;
            teamOneSetsWon += 1;
        } else if (teamTwoScore > teamOneScore) {
            teamTwo.setsWon += 1;
            teamOne.setsLost += 1;
            teamTwoSetsWon += 1;
        }
    });

    teamOne.played += 1;
    teamTwo.played += 1;

    if (teamOneSetsWon > teamTwoSetsWon) {
        teamOne.won += 1;
        teamTwo.lost += 1;
    } else if (teamTwoSetsWon > teamOneSetsWon) {
        teamTwo.won += 1;
        teamOne.lost += 1;
    }

    // Level set counts are already excluded from won and lost above. They get no
    // scoreline key either, rather than a key invented to hold them.
    if (teamOneSetsWon !== teamTwoSetsWon) {
        recordSetOutcome(teamOne, teamOneSetsWon, teamTwoSetsWon);
        recordSetOutcome(teamTwo, teamTwoSetsWon, teamOneSetsWon);
    }
}

function recordSetOutcome(row, setsWon, setsLost) {
    const key = `${setsWon}-${setsLost}`;
    row.setOutcomes[key] = (row.setOutcomes[key] || 0) + 1;
}

// A team that has won sets but lost none has no defined ratio.
// A team with nothing recorded at all sits at zero, not undefined.
export function computeRatios(row) {
    row.setsRatio = ratio(row.setsWon, row.setsLost);
    row.pointsRatio = ratio(row.pointsFor, row.pointsAgainst);
    return row;
}

function ratio(numerator, denominator) {
    if (denominator > 0) return numerator / denominator;
    return numerator > 0 ? UNDEFINED_RATIO : 0;
}

// Returns a negative number when a should rank above b, positive when below,
// and zero when this criterion cannot separate them.
function compareRatio(a, b) {
    const aUndefined = a === UNDEFINED_RATIO;
    const bUndefined = b === UNDEFINED_RATIO;

    if (aUndefined && bUndefined) return 0;
    if (aUndefined) return -1;
    if (bUndefined) return 1;

    return b - a;
}

// Head-to-head between exactly the teams still tied. Returns null when it cannot
// decide — either they never met, or their results form a loop (A beat B, B beat
// C, C beat A). The rules say do not attempt a mini-league; fall through instead.
function compareHeadToHead(a, b, headToHead) {
    const key = `${a.id}|${b.id}`;
    const reverse = `${b.id}|${a.id}`;

    const aWins = headToHead.get(key) || 0;
    const bWins = headToHead.get(reverse) || 0;

    if (aWins === bWins) return null;
    return bWins - aWins;
}

// Builds a map of "winnerId|loserId" -> matches won, from completed fixtures.
//
// Takes normalised fixtures: team ids on team_1_id / team_2_id, scores as set
// pairs on result. That is the one shape these helpers accept — see
// makeNormalisedFixture in test/helpers/fixtures.js. Callers holding raw rows
// from the fixtures table, which name those columns team_1 / team_2, adapt
// before calling. Do not teach this function to read both: accepting either
// shape hides the mismatch instead of fixing it, and the mismatch is what made
// this return an empty map — killing head-to-head — throughout progression.
export function buildHeadToHeadMap(fixtures) {
    const map = new Map();

    fixtures.forEach((fixture) => {
        if (!isCountableFixture(fixture)) return;

        let oneSets = 0;
        let twoSets = 0;
        fixture.result.forEach(([one, two]) => {
            if (one > two) oneSets += 1;
            else if (two > one) twoSets += 1;
        });

        if (oneSets === twoSets) return;

        const winner = oneSets > twoSets ? fixture.team_1_id : fixture.team_2_id;
        const loser = oneSets > twoSets ? fixture.team_2_id : fixture.team_1_id;
        if (!winner || !loser) return;

        const key = `${winner}|${loser}`;
        map.set(key, (map.get(key) || 0) + 1);
    });

    return map;
}

// Only COMPLETED fixtures count. CANCELLED never happened.
export function isCountableFixture(fixture) {
    return (
        fixture.status === "COMPLETED" &&
        Array.isArray(fixture.result) &&
        fixture.result.length > 0
    );
}

// The ranking chain from docs/tournament-rules.md:
//   matches won -> set ratio -> point ratio -> head-to-head -> seeding.
// Seeding is a total order over the division, so this always resolves.
export function compareTeams(a, b, { headToHead = new Map(), seedIndex = new Map() } = {}) {
    if (b.won !== a.won) return b.won - a.won;

    const bySets = compareRatio(a.setsRatio, b.setsRatio);
    if (bySets !== 0) return bySets;

    const byPoints = compareRatio(a.pointsRatio, b.pointsRatio);
    if (byPoints !== 0) return byPoints;

    const byHeadToHead = compareHeadToHead(a, b, headToHead);
    if (byHeadToHead !== null) return byHeadToHead;

    return seedOf(a, seedIndex) - seedOf(b, seedIndex);
}

function seedOf(row, seedIndex) {
    const seed = seedIndex.get(row.id);
    return typeof seed === "number" ? seed : Number.MAX_SAFE_INTEGER;
}

// Maps team id -> seeding position. state.teams is the seeded order, index 0 top.
export function buildSeedIndex(teamIds) {
    return new Map((teamIds || []).map((id, index) => [id, index]));
}

export function rankGroup(rows, context) {
    return rows.slice().sort((a, b) => compareTeams(a, b, context));
}

// Cross-pool seeding for a round-robin round.
// Pool position first: every pool winner (ranked against each other), then every
// runner-up, and so on. Head-to-head is skipped across pools because teams from
// different pools have usually not met.
export function seedAcrossGroups(rankedGroups, seedIndex) {
    const ordered = [];
    const depth = Math.max(0, ...rankedGroups.map((group) => group.length));

    for (let position = 0; position < depth; position += 1) {
        const atPosition = rankedGroups
            .map((group) => group[position])
            .filter(Boolean);

        atPosition.sort((a, b) => compareTeams(a, b, { seedIndex }));
        ordered.push(...atPosition);
    }

    return ordered;
}

// Knockout rounds rank winners first, then losers, each half keeping the seeding
// order it carried into the round. Produces [w1, w2, l1, l2] for a semifinal, so
// the next round can express bronze as [2, 3] and the final as [0, 1].
export function seedKnockoutResults(matchups, seedIndex) {
    const winners = [];
    const losers = [];

    matchups.forEach(({ winnerId, loserId }) => {
        if (winnerId) winners.push(winnerId);
        if (loserId) losers.push(loserId);
    });

    const bySeed = (a, b) =>
        (seedIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (seedIndex.get(b) ?? Number.MAX_SAFE_INTEGER);

    winners.sort(bySeed);
    losers.sort(bySeed);

    return [...winners, ...losers];
}

export const RATIO_UNDEFINED = UNDEFINED_RATIO;
