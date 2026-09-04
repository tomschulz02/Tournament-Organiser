import { getISODate, getLongDate } from "./DateHandler.js";
import {
    applyFixtureToStandings,
    buildHeadToHeadMap,
    buildSeedIndex,
    compareTeams,
    computeRatios,
    createStandingsRow,
    describeQualifierSlot,
    isCountableFixture,
    rankGroup
} from "./standings.js";
import { qualifierCount } from "../services/progression.service.js";
import { roundHolding } from "../services/fixtures.service.js";
import { AppError } from "../errors.js";

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
        scoresheet_template: tournament.scoresheet_template ?? null,
        type: divisionTypes.length === 1 ? divisionTypes[0] : null,
        division_count: divisions.length
    };
}

function formatDivisionPayload({ division, teams, fixtures }) {
    const state = normalizeDivisionState(division.state);
    const orderedTeams = orderTeamsByState(teams, state.teams);
    const teamLookup = new Map(orderedTeams.map((team) => [team.id, team]));
    const lockedRoundNames = lockedRoundNamesOf(state);
    const normalizedFixtures = fixtures
        .slice()
        .sort((a, b) => (a.match_no || 0) - (b.match_no || 0))
        .map((fixture) => normalizeFixture(fixture, teamLookup, lockedRoundNames));

    const results = normalizedFixtures.filter((fixture) => isResultFixture(fixture));
    const standings = buildDivisionStandings(state, normalizedFixtures, teamLookup);
    const bracket = buildDivisionBracket(state, normalizedFixtures, teamLookup);
    const finalStandings = buildFinalStandings({
        division,
        state,
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

// One standings entry per round-robin round, UNLESS every round-robin round in
// the division shares the same groups shape (one group holding the same team
// set) — the repeated-League-cycle case, per docs/decisions.md — in which case
// their fixtures are combined into a single table instead of one per leg. A
// division with exactly one round-robin round (Classic's Pool Play, a
// single-leg League) trivially satisfies "every round shares the same shape"
// against itself, so this produces the same single-table output as before this
// change — the combination is additive, not a special case that could regress
// Classic.
function buildDivisionStandings(state, fixtures, teamLookup) {
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    const seedIndex = buildSeedIndex(state.teams);
    const headToHead = buildHeadToHeadMap(fixtures);

    const roundRobinRounds = rounds
        .map((round, roundIndex) => ({ round, roundIndex }))
        .filter((entry) => entry.round.type === "roundRobin" && Array.isArray(entry.round.groups));

    if (roundRobinRounds.length === 0) {
        return [];
    }

    const firstGroups = roundRobinRounds[0].round.groups;
    const isRepeatedCycle = roundRobinRounds.every((entry) => sameGroupsShape(entry.round.groups, firstGroups));

    if (!isRepeatedCycle) {
        return roundRobinRounds.map((entry) =>
            buildRoundRobinStandingsEntry(entry.round, entry.roundIndex, [entry.round], fixtures, teamLookup, seedIndex, headToHead)
        );
    }

    const primary = roundRobinRounds[0];
    return [
        buildRoundRobinStandingsEntry(
            primary.round,
            primary.roundIndex,
            roundRobinRounds.map((entry) => entry.round),
            fixtures,
            teamLookup,
            seedIndex,
            headToHead
        )
    ];
}

// Same group count, same team set per group, order-independent — a reordered
// pool is still the same pool. Used only to decide whether two round-robin
// rounds are the same repeated cycle; it says nothing about fixtures.
function sameGroupsShape(groupsA, groupsB) {
    if (groupsA.length !== groupsB.length) {
        return false;
    }

    return groupsA.every((group, index) => {
        const other = groupsB[index];
        if (!Array.isArray(group) || !Array.isArray(other) || group.length !== other.length) {
            return false;
        }

        const sortedA = [...group].sort();
        const sortedB = [...other].sort();
        return sortedA.every((value, position) => value === sortedB[position]);
    });
}

// `sourceRounds` is every round-robin round whose fixtures belong in this one
// entry — more than one only for a combined multi-leg table, where every round
// shares `primaryRound.groups`, so grouping by `primaryRound`'s groups is valid
// for all of them.
function buildRoundRobinStandingsEntry(primaryRound, roundIndex, sourceRounds, fixtures, teamLookup, seedIndex, headToHead) {
    const roundStandings = {
        round: primaryRound.name || `Round ${roundIndex + 1}`,
        roundIndex,
        groups: []
    };

    primaryRound.groups.forEach((group, groupIndex) => {
        const participantIds = Array.isArray(group) ? group.filter((value) => typeof value === "string") : [];
        const rows = participantIds.map((teamId) => createStandingsRow(teamLookup.get(teamId), teamId));

        fixtures.forEach((fixture) => {
            if (!isCountableFixture(fixture)) {
                return;
            }

            if (!sourceRounds.some((round) => fixtureBelongsToRoundRobinGroup(fixture, round, participantIds))) {
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

    return roundStandings;
}

function buildDivisionBracket(state, fixtures, teamLookup) {
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    const bracketRounds = [];
    // The knockout round immediately before this one, if there is one. A knockout
    // group holds an index into the previous round's results, and after the bye fix
    // that layout is deterministic — one team per group in group order, then the
    // losers in match order — so which match feeds which slot can simply be stated.
    let previousRound = null;
    // The most recently seen pool round's pool sizes, so the first knockout
    // round can name a clean-tier slot by pool letter instead of "Rank N".
    let poolGroupSizes = null;

    rounds.forEach((round, roundIndex) => {
        if (round.type !== "knockout") {
            // A pool round's results are ranked teams, not match outcomes, so the
            // first knockout round has nothing to name and keeps its placeholders.
            previousRound = null;
            poolGroupSizes = Array.isArray(round.groups)
                ? round.groups.map((group) => (Array.isArray(group) ? group.length : 0))
                : null;
            return;
        }

        // Sorted here rather than trusted from the caller: formatDivisionPayload
        // happens to pre-sort the whole fixture list by match_no today, but a
        // group's match is matched to a fixture by walking this array in
        // order, and that pairing has to hold regardless of what order the
        // caller handed fixtures in.
        const roundFixtures = getFixturesForKnockoutRound(fixtures, round.name)
            .slice()
            .sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0));
        let fixtureIndex = 0;
        const matches = [];
        const groups = round.groups || [];
        // Only the round immediately after pool play has slots that are still
        // pool positions rather than "Winner of #N" — same signal the
        // sources/previousRound mechanism already uses for that distinction.
        const poolContext =
            previousRound === null && poolGroupSizes
                ? { groupSizes: poolGroupSizes, qualifyingTeams: qualifierCount(round) }
                : null;

        groups.forEach((group, groupIndex) => {
            if (!Array.isArray(group) || group.length < 2) {
                return;
            }

            // A match is two entries; a bye is one, handled above. Three or more
            // is not a shape this bracket can draw — it used to silently read
            // only group[0]/group[1] and drop every entry past the second.
            if (group.length > 2) {
                throw new AppError("INVALID_KNOCKOUT_GROUP", {
                    details: { round: round.name, groupIndex, size: group.length }
                });
            }

            const fixture = roundFixtures[fixtureIndex++] || null;
            // The fixture first, the group second. A knockout group holds
            // positional indices into the previous round's results and keeps
            // holding them forever — progression binds teams to the fixture, not
            // to the group. Reading the group alone therefore showed "Rank 1"
            // even after the final had two real teams in it.
            const participantOne =
                fixture?.teams?.team_1?.id
                    ? fixture.teams.team_1
                    : resolveByeTeam(group[0], previousRound, teamLookup) ||
                      resolveParticipant(group[0], teamLookup, fixture?.team_1_placeholder, poolContext);
            const participantTwo =
                fixture?.teams?.team_2?.id
                    ? fixture.teams.team_2
                    : resolveByeTeam(group[1], previousRound, teamLookup) ||
                      resolveParticipant(group[1], teamLookup, fixture?.team_2_placeholder, poolContext);

            matches.push({
                id: fixture?.id || `${round.name}-${groupIndex}`,
                match_no: fixture?.match_no ?? null,
                round: fixture?.round || round.name,
                status: fixture?.status || "UPCOMING",
                participants: [participantOne, participantTwo],
                // Parallel to participants, one entry per slot, so the client needs
                // no cross-round lookup to label an unbound slot or to draw a
                // connector. Null where nothing feeds the slot.
                sources: [
                    resolveMatchSource(group[0], previousRound),
                    resolveMatchSource(group[1], previousRound)
                ],
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

        // The results this round's groups index into, so a bye can be named.
        // earlierRound keeps the chain one level further back, so a team that
        // received a bye two consecutive knockout rounds in a row can still be
        // resolved by walking back again — see resolveByeTeam.
        previousRound = {
            groups,
            matches,
            previousResults: rounds[roundIndex - 1]?.results,
            earlierRound: previousRound
        };
    });

    return {
        rounds: bracketRounds
    };
}

// Which match, if any, produces the team that lands at `index` in the previous
// round's results. Those results are one team per group in group order, then the
// losers in match order, so with G groups: an index below G is that group's
// advancing team — its match's winner, or nobody at all if the group was a bye —
// and an index at or above G is the loser of match `index - G`. That second half
// indexes the matches array, not the groups array; the two differ exactly when the
// round has byes.
function resolveMatchSource(index, previousRound) {
    if (!previousRound || !Number.isInteger(index)) {
        return null;
    }

    const { groups, matches } = previousRound;

    if (index >= groups.length) {
        return describeMatchSource(matches[index - groups.length], "LOSER");
    }

    const group = groups[index];
    if (!Array.isArray(group) || group.length < 2) {
        return null;
    }

    // The matches array skips one-team groups, so the match for group `index` sits
    // at the number of groups of two or more that precede it.
    let matchIndex = 0;
    for (let position = 0; position < index; position += 1) {
        const earlier = groups[position];
        if (Array.isArray(earlier) && earlier.length >= 2) {
            matchIndex += 1;
        }
    }

    return describeMatchSource(matches[matchIndex], "WINNER");
}

// A slot fed by a bye already knows its team, and showing it "Rank 4" hides a
// team that is certainly in the match: the previous round's one-team group holds
// an index into the round before it, whose results were committed when this round
// was drawn. Nothing is played to change it. Only byes resolve this way — a slot
// waiting on a match stays a placeholder, because it genuinely is one.
//
// It ranks below the fixture in precedence: once progression binds the fixture,
// the bound team is the answer for the same reason it always was.
//
// A team can receive a bye in two (or more) consecutive knockout rounds. When
// that happens, previousResults has nothing at this index yet — the round that
// would confirm it has not been committed — but the slot is still knowable:
// walk back to the round before that one (earlierRound) and ask whether *it*
// was a bye too. The chain terminates as soon as a round is not itself a bye
// (returns null and the caller's own fallback to a "Rank N" placeholder takes
// over) or there is nothing earlier to walk to (a pool round, or the first
// knockout round in the division).
function resolveByeTeam(index, previousRound, teamLookup) {
    if (!previousRound || !Number.isInteger(index) || index >= previousRound.groups.length) {
        return null;
    }

    const group = previousRound.groups[index];
    if (!Array.isArray(group) || group.length !== 1) {
        return null;
    }

    const entry = group[0];
    if (typeof entry === "string") {
        const team = teamLookup.get(entry);
        return team ? { id: team.id, name: team.name, placeholder: null } : null;
    }

    if (!Number.isInteger(entry)) {
        return null;
    }

    const teamId = previousRound.previousResults?.[entry];
    if (teamId) {
        const team = teamLookup.get(teamId);
        return team ? { id: team.id, name: team.name, placeholder: null } : null;
    }

    return resolveByeTeam(entry, previousRound.earlierRound, teamLookup);
}

function describeMatchSource(match, outcome) {
    if (!match) {
        return null;
    }

    // matchNo travels with the id so the client can label a slot without looking
    // the match up. It is null until fixtures exist, which is the case the client
    // falls back on.
    return { matchId: match.id, matchNo: match.match_no ?? null, outcome };
}

// Final rankings, filled from the bottom as rounds complete. A team's place is
// decided by which round eliminated it, not by whether the division has finished:
// after the quarter-finals, places 5-8 are known and 1-4 are still being played
// for. A round-robin division has no bracket and keeps today's behaviour exactly —
// nothing until the last fixture, then the full table, which is what the two
// fallbacks at the end are gated on.
function buildFinalStandings({ division, state, fixtures, standings, bracket, teams }) {
    const rankedTeams = [];
    const seenTeams = new Set();

    if (bracket.rounds.length > 0) {
        const finalRound = bracket.rounds.find((round) => round.name === "Finals") || bracket.rounds.at(-1);
        /* v8 ignore next -- the falsy path is unreachable: rounds is non-empty
           here, so at(-1) always yields an element, and a rounds array holding an
           undefined element would already have thrown inside find() above */
        if (finalRound) {
            // Which matches decide the title is a question about the round that
            // concludes the bracket, not about what that round is called. Testing
            // each match's own name against "Finals" made the fallback above inert:
            // a bracket ending in a round named anything else selected a round and
            // then did nothing with it.
            //
            // The bronze match is still identified by name, because it is the
            // fixture's own round rather than the containing round's — a Classic
            // "Finals" round holds both the final and the playoff.
            const decidable = finalRound.matches.filter(
                (match) => Array.isArray(match.participants) && match.participants.length >= 2
            );
            const playoffs = decidable.filter((match) => match.round === "3rd Place Playoff");
            const deciders = decidable.filter((match) => match.round !== "3rd Place Playoff");

            // Exactly one. A concluding round holding several undecided matches —
            // a semifinal pair, say — settles no title, and crowning both winners
            // champion would be worse than leaving it to the tier below.
            if (deciders.length === 1) {
                const final = deciders[0];
                pushFinalStanding(rankedTeams, seenTeams, final.winner, 1, "Champion");
                pushFinalStanding(rankedTeams, seenTeams, getFixtureLoser(final), 2, "Runner-up");
            }

            playoffs.forEach((match) => {
                pushFinalStanding(rankedTeams, seenTeams, match.winner, 3, "Third Place");
                pushFinalStanding(rankedTeams, seenTeams, getFixtureLoser(match), 4, "Fourth Place");
            });

            rankEliminatedTeams({
                rankedTeams,
                seenTeams,
                state,
                fixtures,
                bracket,
                finalRound,
                teams
            });
        }
    }

    if (isDivisionComplete(fixtures) && rankedTeams.length === 0 && standings.length > 0) {
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

    if (isDivisionComplete(fixtures) && rankedTeams.length < teams.length) {
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

// Places are filled from the bottom as rounds complete: the pool round's
// non-qualifiers take the lowest block, then each knockout round's losers take the
// next block up. The walk stops at the first block that is not yet determined,
// because the places above an unfinished round are not determined either.
function rankEliminatedTeams({ rankedTeams, seenTeams, state, fixtures, bracket, finalRound, teams }) {
    const teamLookup = new Map(teams.map((team) => [team.id, team]));
    const seedIndex = buildSeedIndex(teams.map((team) => team.id));
    const rounds = Array.isArray(state?.rounds) ? state.rounds : [];

    const blocks = [nonQualifyingTeams(state, teamLookup)];
    bracket.rounds.forEach((round) => {
        if (round !== finalRound) {
            blocks.push(teamsEliminatedIn(round, rounds[round.roundIndex], fixtures, seedIndex, teamLookup));
        }
    });

    let floorRank = teams.length;

    for (const block of blocks) {
        if (!block) return;

        block.participants.forEach((participant, offset) => {
            pushFinalStanding(
                rankedTeams,
                seenTeams,
                participant,
                floorRank - block.participants.length + 1 + offset,
                block.note
            );
        });

        floorRank -= block.participants.length;
    }
}

// Everyone the pool ranking produced who is not in the list the organiser
// committed. Both lists are written by progression's commit, in the order the
// ranking already established, so the block needs no reordering.
function nonQualifyingTeams(state, teamLookup) {
    const rounds = Array.isArray(state?.rounds) ? state.rounds : [];
    const pool = rounds.find((round) => round.type !== "knockout");

    // A knockout-only division has nothing below its bracket.
    if (!pool) {
        return { note: null, participants: [] };
    }

    const qualified = Array.isArray(pool.results) ? pool.results : [];
    // Until the round is committed nobody has qualified, so nobody has failed to.
    if (qualified.length === 0) {
        return null;
    }

    const computed = Array.isArray(pool.computedResults) ? pool.computedResults : [];

    return {
        note: pool.name || null,
        participants: computed
            .filter((teamId) => !qualified.includes(teamId))
            .map((teamId) => teamLookup.get(teamId))
            .filter(Boolean)
    };
}

// Everyone this round computed a result for who is not in the list the organiser
// committed — the knockout equivalent of nonQualifyingTeams. Reading who actually
// advanced from state.rounds, rather than re-deriving a "loser" from each match's
// score, is what lets the organiser's own progression override (advancing a team
// that lost its match, e.g. a walkover) decide who is eliminated. It also settles
// the semifinal-loses-to-the-playoff case for free: both a finalist and a bronze
// contestant are in the round's confirmed list, so neither counts as eliminated
// here — their actual place is decided later, from the concluding round's matches.
function teamsEliminatedIn(round, stateRound, fixtures, seedIndex, teamLookup) {
    const confirmed = Array.isArray(stateRound?.results) ? stateRound.results : [];
    // Until the round is committed nobody has advanced, so nobody has failed to.
    if (confirmed.length === 0) {
        return null;
    }

    const computed = Array.isArray(stateRound?.computedResults) ? stateRound.computedResults : [];
    const advancing = new Set(confirmed);
    const losers = computed
        .filter((teamId) => !advancing.has(teamId))
        .map((teamId) => teamLookup.get(teamId))
        .filter(Boolean);

    return { note: round.name, participants: orderEliminatedTeams(losers, fixtures, seedIndex) };
}

// Teams eliminated in the same round are tied on elimination and are separated by
// how they performed in the match they lost — sets, then points, from that match
// alone. Still level, the comparison steps back a round at a time. If they never
// separate, seeding resolves it, as it always does.
function orderEliminatedTeams(losers, fixtures, seedIndex) {
    const history = new Map(losers.map((loser) => [loser.id, playedFixtures(loser.id, fixtures)]));

    return losers.slice().sort((a, b) => compareEliminatedTeams(a, b, history, seedIndex));
}

function compareEliminatedTeams(a, b, history, seedIndex) {
    const aPlayed = history.get(a.id);
    const bPlayed = history.get(b.id);
    const depth = Math.max(aPlayed.length, bPlayed.length);

    for (let step = 0; step < depth; step += 1) {
        // No seed index at this stage, deliberately. Seeding is a total order, so
        // passing it here would resolve every comparison at the first step and
        // nothing would ever step back to an earlier round.
        const verdict = compareTeams(
            rowFromFixture(a.id, aPlayed[step]),
            rowFromFixture(b.id, bPlayed[step])
        );

        if (verdict !== 0) {
            return verdict;
        }
    }

    return compareTeams(rowFromFixture(a.id, null), rowFromFixture(b.id, null), { seedIndex });
}

// A team's completed fixtures, most recent first, so stepping through them is
// stepping back a round at a time.
function playedFixtures(teamId, fixtures) {
    return fixtures
        .filter(
            (fixture) =>
                isCountableFixture(fixture) &&
                (fixture.team_1_id === teamId || fixture.team_2_id === teamId)
        )
        .sort((a, b) => (b.match_no || 0) - (a.match_no || 0));
}

// One team's standings row from one fixture, so the ranking chain can be applied
// to a single match. The opponent's row is discarded.
function rowFromFixture(teamId, fixture) {
    const row = createStandingsRow(null, teamId);

    if (fixture) {
        const opponent = createStandingsRow(null, null);

        if (fixture.team_1_id === teamId) {
            applyFixtureToStandings(row, opponent, fixture.result);
        } else {
            applyFixtureToStandings(opponent, row, fixture.result);
        }
    }

    computeRatios(row);
    return row;
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

function normalizeFixture(fixture, teamLookup, lockedRoundNames = new Set()) {
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
        team_2_result: fixture.team_2_result ?? null,
        // Mirrors fixtures.service.js's assertRoundNotLocked: a round is locked
        // for editing from the moment progression commits its results, which is
        // also the moment state.currentRound moves past it.
        locked: lockedRoundNames.has(roundHolding(fixture.round))
    };
}

// The set of state.rounds names whose results are already committed, so a
// fixture's editability can be looked up in one pass rather than re-scanning
// state.rounds per fixture.
function lockedRoundNamesOf(state) {
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    return new Set(
        rounds.filter((round) => Array.isArray(round.results) && round.results.length > 0).map((round) => round.name)
    );
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

function resolveParticipant(value, teamLookup, fallbackPlaceholder = null, poolContext = null) {
    if (typeof value === "string") {
        const team = teamLookup.get(value);
        return {
            id: team?.id || value,
            name: team?.name || fallbackPlaceholder || "TBD",
            placeholder: team ? null : fallbackPlaceholder || null
        };
    }

    if (Number.isInteger(value)) {
        const slot = poolContext
            ? describeQualifierSlot(value, poolContext.groupSizes, poolContext.qualifyingTeams)
            : null;
        const name = slot
            ? `${String.fromCharCode(65 + slot.groupIndex)}${slot.position} (Rank ${value + 1})`
            : `Rank ${value + 1}`;

        return { id: null, name, placeholder: name };
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
    lockedRoundNamesOf,
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
