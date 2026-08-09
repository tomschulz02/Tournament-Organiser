import { getISODate, getLongDate } from "./DateHandler.js";
import {
    applyFixtureToStandings,
    buildHeadToHeadMap,
    buildSeedIndex,
    computeRatios,
    createStandingsRow,
    isCountableFixture,
    rankGroup
} from "./standings.js";

const FIXTURE_STATUS_LABELS = {
    UPCOMING: "Upcoming",
    LIVE: "Live",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled"
};

export function formatTournamentViewPayload({ tournament, divisions, teamsByDivisionId, fixturesByDivisionId }) {
    const formattedDivisions = divisions.map((division) =>
        formatDivisionPayload({
            division,
            teams: teamsByDivisionId.get(division.id) || [],
            fixtures: fixturesByDivisionId.get(division.id) || []
        })
    );

    const formattedTournament = formatTournamentDetails(tournament, formattedDivisions);
    const dashboard = buildTournamentDashboard(formattedTournament, formattedDivisions);

    return {
        tournament: formattedTournament,
        dashboard,
        divisions: formattedDivisions
    };
}

function formatTournamentDetails(tournament, divisions) {
    const startDate = toISODate(tournament.start_date);
    const endDate = toISODate(tournament.end_date);
    const divisionTypes = [...new Set(divisions.map((division) => division.type).filter(Boolean))];

    return {
        id: tournament.id,
        name: tournament.name,
        description: tournament.description || "",
        location: tournament.location || "",
        status: tournament.status || "Not Started",
        start_date: startDate,
        end_date: endDate,
        start_date_label: tournament.start_date ? getLongDate(tournament.start_date) : null,
        end_date_label: tournament.end_date ? getLongDate(tournament.end_date) : null,
        startDate,
        endDate,
        // A schedule spans the whole tournament, not one division — divisions
        // share the same courts. Moved from divisions.schedule on 2026-08-08.
        schedule: tournament.schedule ?? null,
        type: divisionTypes.length === 1 ? divisionTypes[0] : null,
        division_count: divisions.length
    };
}

function formatDivisionPayload({ division, teams, fixtures }) {
    const state = normalizeDivisionState(division.state);
    const orderedTeams = orderTeamsByState(teams, state.teams);
    const teamLookup = new Map(orderedTeams.map((team) => [team.id, team]));
    const normalizedFixtures = fixtures
        .slice()
        .sort((a, b) => (a.match_no || 0) - (b.match_no || 0))
        .map((fixture) => normalizeFixture(fixture, teamLookup));

    const results = normalizedFixtures.filter((fixture) => isResultFixture(fixture));
    const standings = buildDivisionStandings(state, normalizedFixtures, teamLookup);
    const bracket = buildDivisionBracket(state, normalizedFixtures, teamLookup);
    const finalStandings = buildFinalStandings({
        division,
        fixtures: normalizedFixtures,
        standings,
        bracket,
        teams: orderedTeams
    });
    const overview = buildDivisionOverview({
        division,
        teams: orderedTeams,
        fixtures: normalizedFixtures,
        results,
        state
    });

    return {
        id: division.id,
        name: division.name,
        type: division.type || null,
        num_teams: division.num_teams ?? orderedTeams.length,
        state,
        teams: orderedTeams.map((team) => ({
            id: team.id,
            name: team.name,
            division_id: team.division_id
        })),
        fixtures: normalizedFixtures,
        results,
        overview,
        standings,
        bracket,
        finalStandings
    };
}

function buildTournamentDashboard(tournament, divisions) {
    const allUpcoming = [];
    const allResults = [];
    let totalTeams = 0;
    let totalFixtures = 0;
    let completedFixtureCount = 0;
    let upcomingFixtureCount = 0;

    const divisionSummaries = divisions.map((division) => {
        const summary = {
            id: division.id,
            name: division.name,
            type: division.type,
            teamCount: division.overview.teamCount,
            fixtureCount: division.overview.totalFixtures,
            completedFixtureCount: division.overview.completedFixtures,
            upcomingFixtureCount: division.overview.upcomingFixturesCount,
            currentRoundName: division.overview.currentRound,
            recentResults: division.overview.recentResults,
            upcomingFixtures: division.overview.upcomingFixtures
        };

        totalTeams += summary.teamCount;
        totalFixtures += summary.fixtureCount;
        completedFixtureCount += summary.completedFixtureCount;
        upcomingFixtureCount += summary.upcomingFixtureCount;
        allUpcoming.push(...summary.upcomingFixtures.map((fixture) => ({ ...fixture, division_id: division.id, division_name: division.name })));
        allResults.push(...summary.recentResults.map((fixture) => ({ ...fixture, division_id: division.id, division_name: division.name })));

        return summary;
    });

    return {
        tournament_id: tournament.id,
        divisionCount: divisions.length,
        totalTeams,
        totalFixtures,
        completedFixtureCount,
        upcomingFixtureCount,
        currentStatus: tournament.status,
        // One flag for the whole tournament. The schedule is not per-division,
        // so neither is the question of whether one exists.
        hasSchedule: Boolean(tournament.schedule),
        divisions: divisionSummaries,
        recentResults: allResults
            .sort((a, b) => (b.match_no || 0) - (a.match_no || 0))
            .slice(0, 8),
        upcomingFixtures: allUpcoming
            .sort((a, b) => fixtureSortValue(a) - fixtureSortValue(b))
            .slice(0, 8)
    };
}

function buildDivisionOverview({ division, teams, fixtures, results, state }) {
    const completedFixtures = fixtures.filter((fixture) => fixture.status === "COMPLETED").length;
    const upcomingFixtures = fixtures
        .filter((fixture) => fixture.status === "UPCOMING" || fixture.status === "LIVE")
        .sort((a, b) => fixtureSortValue(a) - fixtureSortValue(b));

    return {
        divisionId: division.id,
        teamCount: teams.length || division.num_teams || 0,
        totalFixtures: fixtures.length,
        completedFixtures,
        upcomingFixturesCount: upcomingFixtures.length,
        recentResults: results
            .slice()
            .sort((a, b) => (b.match_no || 0) - (a.match_no || 0))
            .slice(0, 5),
        upcomingFixtures: upcomingFixtures.slice(0, 5),
        currentRound: getCurrentRoundName(state)
    };
}

function buildDivisionStandings(state, fixtures, teamLookup) {
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    const standings = [];
    const seedIndex = buildSeedIndex(state.teams);
    const headToHead = buildHeadToHeadMap(fixtures);

    rounds.forEach((round, roundIndex) => {
        if (round.type !== "roundRobin" || !Array.isArray(round.groups)) {
            return;
        }

        const roundStandings = {
            round: round.name || `Round ${roundIndex + 1}`,
            roundIndex,
            groups: []
        };

        round.groups.forEach((group, groupIndex) => {
            const participantIds = Array.isArray(group) ? group.filter((value) => typeof value === "string") : [];
            const rows = participantIds.map((teamId) => createStandingsRow(teamLookup.get(teamId), teamId));

            fixtures.forEach((fixture) => {
                if (!isCountableFixture(fixture)) {
                    return;
                }

                if (!fixtureBelongsToRoundRobinGroup(fixture, round, participantIds)) {
                    return;
                }

                const teamOne = rows.find((team) => team.id === fixture.team_1_id);
                const teamTwo = rows.find((team) => team.id === fixture.team_2_id);
                if (!teamOne || !teamTwo) {
                    return;
                }

                applyFixtureToStandings(teamOne, teamTwo, fixture.result);
            });

            rows.forEach(computeRatios);

            roundStandings.groups.push({
                name: getGroupLabel(groupIndex),
                groupIndex,
                standings: rankGroup(rows, { headToHead, seedIndex })
            });
        });

        standings.push(roundStandings);
    });

    return standings;
}

function buildDivisionBracket(state, fixtures, teamLookup) {
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    const bracketRounds = [];

    rounds.forEach((round, roundIndex) => {
        if (round.type !== "knockout") {
            return;
        }

        const roundFixtures = getFixturesForKnockoutRound(fixtures, round.name);
        let fixtureIndex = 0;
        const matches = [];

        (round.groups || []).forEach((group, groupIndex) => {
            if (!Array.isArray(group) || group.length < 2) {
                return;
            }

            const fixture = roundFixtures[fixtureIndex++] || null;
            const participantOne = resolveParticipant(group[0], teamLookup, fixture?.team_1_placeholder);
            const participantTwo = resolveParticipant(group[1], teamLookup, fixture?.team_2_placeholder);

            matches.push({
                id: fixture?.id || `${round.name}-${groupIndex}`,
                match_no: fixture?.match_no ?? null,
                round: fixture?.round || round.name,
                status: fixture?.status || "UPCOMING",
                participants: [participantOne, participantTwo],
                result: fixture?.result || [],
                winner: determineFixtureWinner(fixture),
                isPlacementMatch: fixture?.round === "3rd Place Playoff"
            });
        });

        bracketRounds.push({
            name: round.name,
            roundIndex,
            matches
        });
    });

    return {
        rounds: bracketRounds
    };
}

function buildFinalStandings({ division, fixtures, standings, bracket, teams }) {
    if (!isDivisionComplete(fixtures)) {
        return [];
    }

    const rankedTeams = [];
    const seenTeams = new Set();

    if (bracket.rounds.length > 0) {
        const finalRound = bracket.rounds.find((round) => round.name === "Finals") || bracket.rounds.at(-1);
        /* v8 ignore next -- the falsy path is unreachable: rounds is non-empty
           here, so at(-1) always yields an element, and a rounds array holding an
           undefined element would already have thrown inside find() above */
        if (finalRound) {
            finalRound.matches.forEach((match) => {
                if (!Array.isArray(match.participants) || match.participants.length < 2) {
                    return;
                }

                const winner = match.winner;
                const loser = getFixtureLoser(match);

                if (match.round === "Finals") {
                    pushFinalStanding(rankedTeams, seenTeams, winner, 1, "Champion");
                    pushFinalStanding(rankedTeams, seenTeams, loser, 2, "Runner-up");
                }

                if (match.round === "3rd Place Playoff") {
                    pushFinalStanding(rankedTeams, seenTeams, winner, 3, "Third Place");
                    pushFinalStanding(rankedTeams, seenTeams, loser, 4, "Fourth Place");
                }
            });
        }
    }

    if (rankedTeams.length === 0 && standings.length > 0) {
        let rank = 1;
        standings.forEach((round) => {
            round.groups.forEach((group) => {
                group.standings.forEach((team) => {
                    if (seenTeams.has(team.id)) {
                        return;
                    }

                    rankedTeams.push({
                        rank,
                        team_id: team.id,
                        name: team.name,
                        note: group.name
                    });
                    seenTeams.add(team.id);
                    rank += 1;
                });
            });
        });
    }

    if (rankedTeams.length < teams.length) {
        let rank = rankedTeams.length + 1;
        teams.forEach((team) => {
            if (seenTeams.has(team.id)) {
                return;
            }

            rankedTeams.push({
                rank,
                team_id: team.id,
                name: team.name,
                note: division.type || null
            });
            seenTeams.add(team.id);
            rank += 1;
        });
    }

    return rankedTeams.sort((a, b) => a.rank - b.rank);
}

function normalizeDivisionState(state) {
    if (!state) {
        return { teams: [], rounds: [], currentRound: 0 };
    }

    if (typeof state === "string") {
        try {
            return JSON.parse(state);
        } catch {
            return { teams: [], rounds: [], currentRound: 0 };
        }
    }

    return {
        teams: Array.isArray(state.teams) ? state.teams : [],
        rounds: Array.isArray(state.rounds) ? state.rounds : [],
        currentRound: Number.isInteger(state.currentRound) ? state.currentRound : Number(state.currentRound) || 0
    };
}

function orderTeamsByState(teams, teamOrder = []) {
    const lookup = new Map(teams.map((team) => [team.id, team]));
    const orderedTeams = [];

    teamOrder.forEach((teamId) => {
        if (lookup.has(teamId)) {
            orderedTeams.push(lookup.get(teamId));
            lookup.delete(teamId);
        }
    });

    const remainingTeams = [...lookup.values()].sort((a, b) => a.name.localeCompare(b.name));
    return orderedTeams.concat(remainingTeams);
}

function normalizeFixture(fixture, teamLookup) {
    const teamOne = teamLookup.get(fixture.team_1);
    const teamTwo = teamLookup.get(fixture.team_2);
    const result = normalizeFixtureResult(fixture);

    return {
        id: fixture.id,
        division_id: fixture.division_id,
        match_no: fixture.match_no,
        round: fixture.round,
        status: fixture.status || "UPCOMING",
        statusLabel: FIXTURE_STATUS_LABELS[fixture.status] || fixture.status || "Upcoming",
        team_1_id: fixture.team_1 || null,
        team_2_id: fixture.team_2 || null,
        team_1_placeholder: fixture.team_1_placeholder || null,
        team_2_placeholder: fixture.team_2_placeholder || null,
        team1: teamOne?.name || fixture.team_1_placeholder || "TBD",
        team2: teamTwo?.name || fixture.team_2_placeholder || "TBD",
        teams: {
            team_1: buildFixtureTeam(teamOne, fixture.team_1_placeholder),
            team_2: buildFixtureTeam(teamTwo, fixture.team_2_placeholder)
        },
        result,
        team_1_result: fixture.team_1_result ?? null,
        team_2_result: fixture.team_2_result ?? null
    };
}

function buildFixtureTeam(team, placeholder) {
    if (team) {
        return {
            id: team.id,
            name: team.name,
            placeholder: null
        };
    }

    return {
        id: null,
        name: placeholder || "TBD",
        placeholder: placeholder || "TBD"
    };
}

function normalizeFixtureResult(fixture) {
    if (Array.isArray(fixture.result)) {
        return sanitizeSetPairs(fixture.result);
    }

    const teamOneResult = parseStoredResultValue(fixture.team_1_result);
    const teamTwoResult = parseStoredResultValue(fixture.team_2_result);

    if (typeof teamOneResult === "number" && typeof teamTwoResult === "number") {
        return [[teamOneResult, teamTwoResult]];
    }

    if (Array.isArray(teamOneResult) && Array.isArray(teamTwoResult)) {
        if (teamOneResult.length > 0 && typeof teamOneResult[0] === "number" && teamOneResult.length === teamTwoResult.length) {
            return teamOneResult.map((score, index) => [score, Number(teamTwoResult[index]) || 0]);
        }

        if (teamOneResult.every((pair) => Array.isArray(pair) && pair.length === 2)) {
            return sanitizeSetPairs(teamOneResult);
        }

        if (teamTwoResult.every((pair) => Array.isArray(pair) && pair.length === 2)) {
            return sanitizeSetPairs(teamTwoResult);
        }
    }

    return [];
}

function parseStoredResultValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            const parsedNumber = Number(value);
            return Number.isNaN(parsedNumber) ? value : parsedNumber;
        }
    }

    return value;
}

function sanitizeSetPairs(result) {
    return result
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => [Number(pair[0]) || 0, Number(pair[1]) || 0]);
}

function resolveParticipant(value, teamLookup, fallbackPlaceholder = null) {
    if (typeof value === "string") {
        const team = teamLookup.get(value);
        return {
            id: team?.id || value,
            name: team?.name || fallbackPlaceholder || "TBD",
            placeholder: team ? null : fallbackPlaceholder || null
        };
    }

    if (Number.isInteger(value)) {
        return {
            id: null,
            name: `Rank ${value + 1}`,
            placeholder: `Rank ${value + 1}`
        };
    }

    return {
        id: null,
        name: fallbackPlaceholder || "TBD",
        placeholder: fallbackPlaceholder || "TBD"
    };
}

function determineFixtureWinner(fixture) {
    if (!fixture || fixture.status !== "COMPLETED" || !Array.isArray(fixture.result) || fixture.result.length === 0) {
        return null;
    }

    let teamOneSets = 0;
    let teamTwoSets = 0;

    fixture.result.forEach(([teamOneScore, teamTwoScore]) => {
        if (teamOneScore > teamTwoScore) {
            teamOneSets += 1;
        } else if (teamTwoScore > teamOneScore) {
            teamTwoSets += 1;
        }
    });

    if (teamOneSets === teamTwoSets) {
        return null;
    }

    return teamOneSets > teamTwoSets
        ? { id: fixture.team_1_id, name: fixture.team1 }
        : { id: fixture.team_2_id, name: fixture.team2 };
}

function getFixtureLoser(match) {
    if (!match || !match.winner || !Array.isArray(match.participants)) {
        return null;
    }

    return match.participants.find((participant) => participantKey(participant) !== participantKey(match.winner)) || null;
}

function pushFinalStanding(rankings, seenTeams, participant, rank, note) {
    const key = participantKey(participant);
    if (!participant || !participant.name || seenTeams.has(key)) {
        return;
    }

    rankings.push({
        rank,
        team_id: participant.id,
        name: participant.name,
        note
    });
    seenTeams.add(key);
}

// createStandingsRow, applyFixtureToStandings and the ranking comparator now live
// in ./standings.js so progression and this view cannot drift apart.


function fixtureBelongsToRoundRobinGroup(fixture, round, participantIds) {
    if (fixture.round !== round.name) {
        return false;
    }

    return participantIds.includes(fixture.team_1_id) && participantIds.includes(fixture.team_2_id);
}

function getFixturesForKnockoutRound(fixtures, roundName) {
    return fixtures.filter((fixture) =>
        fixture.round === roundName || (roundName === "Finals" && fixture.round === "3rd Place Playoff")
    );
}

function getCurrentRoundName(state) {
    if (!Array.isArray(state.rounds) || state.rounds.length === 0) {
        return null;
    }

    const currentRound = state.rounds[state.currentRound];
    return currentRound?.name || null;
}

function getGroupLabel(groupIndex) {
    return `Group ${String.fromCharCode(65 + groupIndex)}`;
}

function isResultFixture(fixture) {
    return fixture.status === "COMPLETED" || fixture.status === "CANCELLED";
}

function isDivisionComplete(fixtures) {
    if (fixtures.length === 0) {
        return false;
    }

    return fixtures.every((fixture) => fixture.status === "COMPLETED" || fixture.status === "CANCELLED");
}

function fixtureSortValue(fixture) {
    const statusPriority = fixture.status === "LIVE" ? 0 : fixture.status === "UPCOMING" ? 1 : 2;
    return statusPriority * 100000 + (fixture.match_no || 0);
}

function toISODate(date) {
    return date ? getISODate(date) : null;
}


function participantKey(participant) {
    return participant?.id || participant?.name || null;
}

// Exported for unit tests only. formatTournamentViewPayload remains the sole
// entry point for application code — nothing in src/ imports the names below.
// They are exposed because driving 27 helpers through one funnel would need
// elaborate fixtures that obscure what each branch actually does.
export {
    formatTournamentDetails,
    formatDivisionPayload,
    buildTournamentDashboard,
    buildDivisionOverview,
    buildDivisionStandings,
    buildDivisionBracket,
    buildFinalStandings,
    normalizeDivisionState,
    orderTeamsByState,
    normalizeFixture,
    buildFixtureTeam,
    normalizeFixtureResult,
    parseStoredResultValue,
    sanitizeSetPairs,
    resolveParticipant,
    determineFixtureWinner,
    getFixtureLoser,
    pushFinalStanding,
    fixtureBelongsToRoundRobinGroup,
    getFixturesForKnockoutRound,
    getCurrentRoundName,
    getGroupLabel,
    isResultFixture,
    isDivisionComplete,
    fixtureSortValue,
    toISODate,
    participantKey,
    FIXTURE_STATUS_LABELS
};
