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

    const computed = computeRoundResults(round, state, fixtures).map((row) => ({
        ...row,
        name: teamNames.get(row.id) || "Unknown"
    }));
    const nextRound = rounds[roundIndex + 1] || null;
    const qualifyingTeams = nextRound?.qualifyingTeams ?? computed.length;

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
        eligibleTeams: computed
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

    const computed = computeRoundResults(round, state, fixtures);
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

    await divisionsRepository.updateRounds(
        divisionId,
        userId,
        updatedRounds,
        null,
        roundIndex + 1
    );

    if (boundFixtures.length > 0) {
        await fixturesRepository.updateFixtures(divisionId, boundFixtures);
    }

    return {
        divisionId: division.id,
        roundIndex,
        nextRoundIndex: roundIndex + 1,
        results: confirmed,
        fixturesBound: boundFixtures.length,
        amended
    };
}

// nextRound.groups[i] holds two indices into the confirmed results, and
// nextRound.fixtures[i] is the placeholder fixture for that matchup.
function bindFixturesToResults(nextRound, confirmed) {
    const groups = Array.isArray(nextRound.groups) ? nextRound.groups : [];
    const fixtureIds = Array.isArray(nextRound.fixtures) ? nextRound.fixtures : [];

    return groups
        .map((group, index) => {
            const fixtureId = fixtureIds[index];
            if (!fixtureId || !Array.isArray(group)) return null;

            const [one, two] = group;
            // A knockout group holds positional indices, not team ids.
            if (!Number.isInteger(one) || !Number.isInteger(two)) return null;

            return {
                id: fixtureId,
                team_1: confirmed[one] ?? null,
                team_2: confirmed[two] ?? null
            };
        })
        .filter(Boolean);
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

    const expected = nextRound.qualifyingTeams ?? computed.length;
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
function computeRoundResults(round, state, fixtures) {
    const seedIndex = buildSeedIndex(state.teams);

    if (round.type === "knockout") {
        return seedKnockoutResults(buildKnockoutOutcomes(round, fixtures), seedIndex)
            .map((id) => ({ id }));
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

            const teamOne = rows.find((row) => row.id === fixture.team_1);
            const teamTwo = rows.find((row) => row.id === fixture.team_2);
            if (!teamOne || !teamTwo) return;

            applyFixtureToStandings(teamOne, teamTwo, fixture.result);
        });

        rows.forEach(computeRatios);
        return rankGroup(rows, { headToHead, seedIndex });
    });

    return seedAcrossGroups(rankedGroups, seedIndex);
}

function buildKnockoutOutcomes(round, fixtures) {
    const roundFixtures = fixtures.filter(
        (fixture) => fixture.round === round.name && isCountableFixture(fixture)
    );

    return roundFixtures
        .map((fixture) => {
            let oneSets = 0;
            let twoSets = 0;
            fixture.result.forEach(([one, two]) => {
                if (one > two) oneSets += 1;
                else if (two > one) twoSets += 1;
            });

            if (oneSets === twoSets) return null;

            return oneSets > twoSets
                ? { winnerId: fixture.team_1, loserId: fixture.team_2 }
                : { winnerId: fixture.team_2, loserId: fixture.team_1 };
        })
        .filter(Boolean);
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

// fixtures.team_1_result and team_2_result are parallel integer arrays, one entry
// per set. The standings helpers expect [[teamOneScore, teamTwoScore], ...].
function normalizeFixtureResult(fixture) {
    const one = Array.isArray(fixture.team_1_result) ? fixture.team_1_result : [];
    const two = Array.isArray(fixture.team_2_result) ? fixture.team_2_result : [];
    const setCount = Math.min(one.length, two.length);

    const result = [];
    for (let index = 0; index < setCount; index += 1) {
        result.push([Number(one[index]) || 0, Number(two[index]) || 0]);
    }

    return { ...fixture, result };
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

// Exported for unit tests only. Application code goes through getProposal and
// commit; the helpers below are pure and are tested directly so each rule in
// docs/tournament-rules.md has its own case.
export {
    bindFixturesToResults,
    validateConfirmedTeams,
    sameOrder,
    computeRoundResults,
    buildKnockoutOutcomes,
    normalizeState,
    normalizeFixtureResult,
    isRoundComplete,
    hasPlayedFixtures
};
