import { divisionsRepository } from "../repositories/divisions.repository.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";
import {
    applyFixtureToStandings,
    buildHeadToHeadMap,
    buildSeedIndex,
    computeRatios,
    createStandingsRow,
    isCountableFixture,
    rankGroup,
    seedAcrossGroups,
    seedKnockoutResults
} from "../utils/standings.js";
import { AppError } from "../errors.js";

// Round progression.
//
// Two steps, deliberately separate:
//   getProposal  — computes the default ranking and qualifiers. Read only.
//   commit       — accepts the organiser's confirmed or amended list and writes it.
//
// The organiser may reorder the ranking, because tournaments differ in how they
// resolve ties. Everything they send is untrusted input that lands in
// divisions.state, so commit revalidates it from scratch rather than trusting
// that it came from a proposal.

async function getProposal(divisionId, userId) {
    const { division, state, rounds, roundIndex, round, fixtures, teamNames } =
        await loadDivision(divisionId, userId);

    if (!isRoundComplete(round, fixtures)) {
        throw new AppError("ROUND_NOT_COMPLETE");
    }

    const nextRound = rounds[roundIndex + 1] || null;

    const computed = computeRoundResults(round, state, fixtures, {
        nextRound,
        previousResults: rounds[roundIndex - 1]?.results
    }).map((row) => ({
        ...row,
        name: teamNames.get(row.id) || "Unknown"
    }));
    const qualifyingTeams = qualifierCount(nextRound) || computed.length;

    return {
        divisionId: division.id,
        divisionName: division.name,
        roundIndex,
        roundName: round.name,
        roundType: round.type,
        isFinalRound: nextRound === null,
        nextRoundName: nextRound?.name || null,
        qualifyingTeams,
        // Full default ranking, plus the slice that would qualify. The organiser
        // edits the qualifier list; the ranking is shown for context.
        computedResults: computed,
        qualifiers: computed.slice(0, qualifyingTeams),
        // Teams the organiser is permitted to substitute in.
        eligibleTeams: computed,
        // The same pairing structure commit() uses to bind fixtures (see
        // bindFixturesToResults), exposed read-only so the client can preview the
        // next round's matchups from the organiser's current qualifier order,
        // before anything is confirmed. Null on the final round, which has none.
        nextRound: nextRound ? { name: nextRound.name, groups: nextRound.groups } : null
    };
}

async function commit(divisionId, userId, confirmedTeamIds) {
    const { division, state, rounds, roundIndex, round, fixtures } =
        await loadDivision(divisionId, userId);

    if (!isRoundComplete(round, fixtures)) {
        throw new AppError("ROUND_NOT_COMPLETE");
    }

    const nextRound = rounds[roundIndex + 1] || null;
    if (!nextRound) {
        throw new AppError("NO_NEXT_ROUND");
    }

    // Re-progression guard. Permitted only while nothing in the next round has
    // been played, so a correction can never discard real scores.
    if (Array.isArray(round.results) && round.results.length > 0) {
        if (hasPlayedFixtures(nextRound, fixtures)) {
            throw new AppError("NEXT_ROUND_ALREADY_STARTED");
        }
    }

    const computed = computeRoundResults(round, state, fixtures, {
        nextRound,
        previousResults: rounds[roundIndex - 1]?.results
    });
    const confirmed = validateConfirmedTeams(confirmedTeamIds, computed, nextRound);

    const amended = !sameOrder(confirmed, computed.slice(0, confirmed.length).map((row) => row.id));

    const updatedRounds = rounds.map((entry, index) => {
        if (index !== roundIndex) return entry;

        return {
            ...entry,
            results: confirmed,
            // Both lists are kept: what the rules produced, and what was used.
            // Without this there is no way to tell later whether an unexpected
            // bracket came from the rules or from a manual override.
            computedResults: computed.map((row) => row.id),
            resultsAmended: amended
        };
    });

    // Knockout fixtures already exist as placeholders. Progression binds real teams
    // to them rather than creating new ones, so fixture IDs stay stable and any
    // schedule already referencing them survives.
    const boundFixtures = bindFixturesToResults(nextRound, confirmed);

    // Order matters, and these are two separate transactions.
    //
    // Bind first: a failure after this leaves the division still on the old
    // round with the next round's fixtures already correct, and a retry simply
    // redoes the same deterministic binding. Advancing first would leave the
    // division sitting on a round whose fixtures still read "Rank 1".
    if (boundFixtures.length > 0) {
        await fixturesRepository.updateFixtures(divisionId, boundFixtures);
    }

    await divisionsRepository.updateRounds(
        divisionId,
        userId,
        updatedRounds,
        null,
        roundIndex + 1
    );

    return {
        divisionId: division.id,
        roundIndex,
        nextRoundIndex: roundIndex + 1,
        results: confirmed,
        fixturesBound: boundFixtures.length,
        amended
    };
}

// A knockout group holds two indices into the confirmed results. nextRound.fixtures
// is compacted — generateKnockoutFixtures skips one-team groups — so the fixture is
// taken from a cursor that advances only on groups of two or more, never from the
// group index. Reading fixtureIds[groupIndex] meant that in a Round of 12, where the
// four matches sit at group indices 4-7 and the four fixtures at 0-3, every lookup
// missed and no fixture in a bye round was ever bound.
function bindFixturesToResults(nextRound, confirmed) {
    const groups = Array.isArray(nextRound.groups) ? nextRound.groups : [];
    const fixtureIds = Array.isArray(nextRound.fixtures) ? nextRound.fixtures : [];

    const bound = [];
    let fixtureIndex = 0;

    groups.forEach((group) => {
        // A bye has no fixture, so it consumes no cursor position either.
        if (!Array.isArray(group) || group.length < 2) return;

        const fixtureId = fixtureIds[fixtureIndex++];
        if (!fixtureId) return;

        const [one, two] = group;
        // A knockout group holds positional indices, not team ids.
        if (!Number.isInteger(one) || !Number.isInteger(two)) return;

        bound.push({
            id: fixtureId,
            team_1: confirmed[one] ?? null,
            team_2: confirmed[two] ?? null
        });
    });

    return bound;
}

// --- validation -----------------------------------------------------------

// The organiser may reorder freely and may substitute in any team that played the
// round — that covers withdrawals. They may not invent teams, duplicate one, or
// change how many qualify.
function validateConfirmedTeams(confirmedTeamIds, computed, nextRound) {
    if (!Array.isArray(confirmedTeamIds) || confirmedTeamIds.length === 0) {
        throw new AppError("INVALID_RESULTS");
    }

    if (!confirmedTeamIds.every((id) => typeof id === "string" && id.length > 0)) {
        throw new AppError("INVALID_RESULTS");
    }

    const expected = qualifierCount(nextRound) || computed.length;
    if (confirmedTeamIds.length !== expected) {
        throw new AppError("WRONG_QUALIFIER_COUNT");
    }

    if (new Set(confirmedTeamIds).size !== confirmedTeamIds.length) {
        throw new AppError("DUPLICATE_TEAM");
    }

    const eligible = new Set(computed.map((row) => row.id));
    if (!confirmedTeamIds.every((id) => eligible.has(id))) {
        throw new AppError("TEAM_NOT_IN_ROUND");
    }

    return confirmedTeamIds;
}

function sameOrder(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

// --- ranking --------------------------------------------------------------

// Produces the flat, seeded result list for a round, per docs/tournament-rules.md.
//
// The tail is an options object rather than two more positional parameters:
// nextRound gives the qualifier count, previousResults are the results a knockout
// round's groups index into, which is the only way to name a bye team.
function computeRoundResults(round, state, fixtures, { nextRound = null, previousResults = [] } = {}) {
    const seedIndex = buildSeedIndex(state.teams);

    if (round.type === "knockout") {
        const outcomes = buildKnockoutOutcomes(round, fixtures, previousResults);
        const stats = knockoutStatsById(outcomes);

        return seedKnockoutResults(outcomes).map((id) => ({ id, ...stats.get(id) }));
    }

    const headToHead = buildHeadToHeadMap(fixtures);
    const groups = Array.isArray(round.groups) ? round.groups : [];

    const rankedGroups = groups.map((group) => {
        const participantIds = Array.isArray(group)
            ? group.filter((value) => typeof value === "string")
            : [];
        const rows = participantIds.map((teamId) => createStandingsRow(null, teamId));

        fixtures.forEach((fixture) => {
            if (!isCountableFixture(fixture)) return;
            if (fixture.round !== round.name) return;

            const teamOne = rows.find((row) => row.id === fixture.team_1_id);
            const teamTwo = rows.find((row) => row.id === fixture.team_2_id);
            if (!teamOne || !teamTwo) return;

            applyFixtureToStandings(teamOne, teamTwo, fixture.result);
        });

        rows.forEach(computeRatios);
        return rankGroup(rows, { headToHead, seedIndex });
    });

    return seedAcrossGroups(rankedGroups, seedIndex, qualifierCount(nextRound));
}

// The next round's groups hold indices into this round's results, so the number
// of teams that round needs is one past the largest index it references.
// Derived rather than stored: rounds written before this existed carry no such
// key, and state is JSONB that no migration reaches.
function qualifierCount(nextRound) {
    const groups = Array.isArray(nextRound?.groups) ? nextRound.groups : [];
    let max = -1;
    for (const group of groups) {
        for (const index of group) {
            if (typeof index === "number" && index > max) max = index;
        }
    }
    return max + 1;
}


// One outcome per group, in group order: the bye team for a one-team group, the
// winner and loser of the match for a two-team group. Emitting one per fixture
// instead dropped every bye team and let the losers take their places — in a Round
// of 12 that produced eight results, the right count with the wrong teams.
//
// The cursor is the whole point: generateKnockoutFixtures skips one-team groups
// when it builds round.fixtures, so the fixture at position N belongs to the Nth
// group of two or more, not to group N. buildDivisionBracket is the model.
function buildKnockoutOutcomes(round, fixtures, previousResults = []) {
    // The same selection rule the bracket formatter uses. Without the playoff the
    // Finals round sees one fixture for two groups and the cursor misaligns.
    const roundFixtures = fixtures
        .filter(
            (fixture) =>
                fixture.round === round.name ||
                (round.name === "Finals" && fixture.round === "3rd Place Playoff")
        )
        .sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0));

    const groups = Array.isArray(round.groups) ? round.groups : [];
    const outcomes = [];
    let fixtureIndex = 0;

    groups.forEach((group) => {
        if (!Array.isArray(group)) return;

        // A bye. The group holds one index into the previous round's results and
        // the team named there carries on without playing, so it has no sets to
        // report.
        if (group.length < 2) {
            const byeTeamId = resolveGroupTeam(group[0], previousResults);
            if (byeTeamId) outcomes.push({ winnerId: byeTeamId, loserId: null, winnerSets: 0, loserSets: 0 });
            return;
        }

        const fixture = roundFixtures[fixtureIndex++];
        if (!fixture || !isCountableFixture(fixture)) return;

        let oneSets = 0;
        let twoSets = 0;
        fixture.result.forEach(([one, two]) => {
            if (one > two) oneSets += 1;
            else if (two > one) twoSets += 1;
        });

        // A drawn or cancelled match contributes nothing, as before.
        if (oneSets === twoSets) return;

        outcomes.push(
            oneSets > twoSets
                ? { winnerId: fixture.team_1_id, loserId: fixture.team_2_id, winnerSets: oneSets, loserSets: twoSets }
                : { winnerId: fixture.team_2_id, loserId: fixture.team_1_id, winnerSets: twoSets, loserSets: oneSets }
        );
    });

    return outcomes;
}

// The set score a knockout outcome carries is thrown away by seedKnockoutResults,
// which only orders ids — so it is collected here, by id, before that happens.
// Matches computeRatios' row shape (won/lost/setsWon/setsLost) so the frontend's
// stats display needs no special-casing between a pool round and a knockout one.
function knockoutStatsById(outcomes) {
    const stats = new Map();

    outcomes.forEach(({ winnerId, loserId, winnerSets, loserSets }) => {
        if (winnerId) {
            stats.set(winnerId, { won: loserId ? 1 : 0, lost: 0, setsWon: winnerSets, setsLost: loserSets });
        }
        if (loserId) {
            stats.set(loserId, { won: 0, lost: 1, setsWon: loserSets, setsLost: winnerSets });
        }
    });

    return stats;
}

// A knockout group entry is an index into the previous round's results. A team id
// is accepted too, for a knockout round that was seeded directly.
function resolveGroupTeam(entry, previousResults) {
    if (typeof entry === "string" && entry.length > 0) return entry;
    if (Number.isInteger(entry)) return previousResults?.[entry] ?? null;
    return null;
}

// --- loading --------------------------------------------------------------

async function loadDivision(divisionId, userId) {
    const division = await divisionsRepository.getDivisionWithOwner(divisionId);
    if (!division) {
        throw new AppError("DIVISION_NOT_FOUND");
    }

    // requireAuth proves the caller is logged in. This proves the tournament is theirs.
    if (division.created_by !== userId) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    const state = normalizeState(division.state);
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    const roundIndex = Number.isInteger(state.currentRound) ? state.currentRound : 0;
    const round = rounds[roundIndex];

    if (!round) {
        throw new AppError("ROUND_NOT_FOUND");
    }

    const [rawFixtures, teams] = await Promise.all([
        divisionsRepository.getFixturesByDivisionId(divisionId),
        divisionsRepository.getTeamsByIds(state.teams || [])
    ]);

    const fixtures = rawFixtures.map(normalizeFixtureResult);
    const teamNames = new Map(teams.map((team) => [team.id, team.name]));

    return { division, state, rounds, roundIndex, round, fixtures, teamNames };
}

function normalizeState(state) {
    if (!state) return { teams: [], rounds: [], currentRound: 0 };
    if (typeof state === "string") {
        try {
            return JSON.parse(state);
        } catch {
            return { teams: [], rounds: [], currentRound: 0 };
        }
    }
    return state;
}

// The one adapter from a fixtures-table row to the shape the standings helpers
// take. Two things differ:
//
//   - team_1_result and team_2_result are parallel integer arrays, one entry per
//     set; the helpers expect [[teamOneScore, teamTwoScore], ...] on `result`.
//   - the table names the team columns team_1 / team_2; the helpers read
//     team_1_id / team_2_id.
//
// The team columns are renamed rather than added alongside, so that past this
// point there is exactly one name for a team id. Carrying both is what let
// buildHeadToHeadMap read undefined without anything noticing.
function normalizeFixtureResult(fixture) {
    const { team_1, team_2, ...rest } = fixture;
    const one = Array.isArray(fixture.team_1_result) ? fixture.team_1_result : [];
    const two = Array.isArray(fixture.team_2_result) ? fixture.team_2_result : [];
    const setCount = Math.min(one.length, two.length);

    const result = [];
    for (let index = 0; index < setCount; index += 1) {
        result.push([Number(one[index]) || 0, Number(two[index]) || 0]);
    }

    return { ...rest, team_1_id: team_1 ?? null, team_2_id: team_2 ?? null, result };
}

function isRoundComplete(round, fixtures) {
    const roundFixtures = fixtures.filter((fixture) => fixture.round === round.name);
    if (roundFixtures.length === 0) return false;

    // CANCELLED matches never happened, so they do not hold a round open.
    return roundFixtures.every(
        (fixture) => fixture.status === "COMPLETED" || fixture.status === "CANCELLED"
    );
}

function hasPlayedFixtures(round, fixtures) {
    return fixtures.some(
        (fixture) =>
            fixture.round === round.name &&
            (fixture.status === "COMPLETED" || fixture.status === "LIVE")
    );
}

export const progressionService = {
    getProposal,
    commit
};

// Exported for unit tests, and qualifierCount is also used by
// tournamentViewFormatter.js. The rest are pure and tested directly so each rule in
// docs/tournament-rules.md has its own case.
export {
    bindFixturesToResults,
    validateConfirmedTeams,
    sameOrder,
    computeRoundResults,
    qualifierCount,
    buildKnockoutOutcomes,
    normalizeState,
    normalizeFixtureResult,
    isRoundComplete,
    hasPlayedFixtures
};
