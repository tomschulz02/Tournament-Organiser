import { AppError } from "../errors.js";
import DatabaseConnection from "../config/db.js";
import { divisionsRepository } from "../repositories/divisions.repository.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";
import { tournamentRepository } from "../repositories/tournament.repository.js";
import { generateFixtures, fixtureService, generatePartialRoundRobinPairs } from "./fixtures.service.js";
import { v4 as uuidv4 } from "uuid";

const db = DatabaseConnection();

// `client` is required, not defaulted: a division is only ever created as part
// of creating a tournament, inside that transaction. createTournament owns the
// boundary — see docs/decisions.md.
async function createDivision(details, tournamentId, userId, client){
    const divisionId = uuidv4();

    // Every team is new and belongs to this division. A team carries a name and
    // nothing else — teams.division_id means a team belongs to exactly one
    // division, so there is no library of a user's teams to select from and no
    // client-supplied id to authorise. See docs/decisions.md, where the
    // select-or-create decision is recorded as superseded.
    const teamNames = validateTeamNames(details.teams);

    // Ids are generated here, before anything is written, because state.teams
    // has to hold them before the division row can be stored — and the team
    // rows cannot be stored until after it. See createTeam.
    const teamIds = teamNames.map(() => uuidv4());

    // Only Classic's populateGroups is sensitive to num_groups/knockout_teams —
    // League ignores both (see createLeagueState) and the create form never
    // sends them for it, so validating here would reject every League
    // division outright. Classic's own generation used to accept a num_groups
    // greater than the team count and silently hand back empty group arrays;
    // this is the same check rebuildDivision/reorderTeams already make.
    if (details.type === "classic") {
        validateStructure(toCount(details.num_groups), toCount(details.knockout_teams), teamIds.length);
    }

    const { division, fixtures } = buildDivision(
        details.type,
        teamIds,
        details.num_teams,
        details.num_groups,
        details.knockout_teams,
        leagueConfigFromPayload(details)
    );
    division.name = details.name;
    division.num_teams = details.num_teams;

    //store division in database
    // First of the three writes: teams and fixtures both carry a division_id
    // foreign key, so neither can exist before this row does.
    await divisionsRepository.createDivision(divisionId, tournamentId, division, userId, client);

    //store teams in database
    // Sequential and awaited, for the same reason as the divisions loop in
    // createTournament: one pg client cannot run concurrent queries.
    for (const [index, teamId] of teamIds.entries()) {
        await divisionsRepository.createTeam(teamId, teamNames[index], divisionId, client);
    }

    //store fixtures in database
    // After the teams: fixtures.team_1 and team_2 are foreign keys into teams.
    await createFixtures(divisionId, fixtures, client);

    return divisionId;
}

// PUT /api/divisions/:divisionId — the division's full intended team list.
//
// One endpoint rather than three, because teams and structure cannot change
// independently and three endpoints would be three ways to leave a division
// inconsistent. The client never declares what it is doing: the incoming ids are
// compared against state.teams and the intent follows from the data.
//
//   same set, same order — a rename. Names are written and nothing else moves,
//                   because fixtures reference teams.id and the schedule
//                   references fixture ids, so nothing structural depends on a
//                   name.
//   same set, reordered — a reseed. state.teams is written in the submitted
//                   order, any name changes go with it, and the pools and
//                   fixtures are redrawn from the new order — seed order is
//                   what the serpentine draw uses to place teams into pools.
//                   Gated on Not Started, and on no results existing yet, the
//                   same as a rebuild; see docs/decisions.md.
//   different set — the division is rebuilt from scratch.
//
// A team arriving with no id is new; one in state.teams and absent from the body
// is removed.
async function updateDivision(divisionId, userId, payload = {}) {
    const division = await divisionsRepository.getDivisionWithOwner(divisionId);
    if (!division) {
        throw new AppError("DIVISION_NOT_FOUND");
    }

    // requireAuth proves the caller is logged in. This proves the tournament is
    // theirs, the same check progression's loadDivision makes.
    if (division.created_by !== userId) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    const existingIds = teamIdsOf(division.state);
    const entries = readTeamEntries(payload.teams, existingIds);

    // Every entry carries an id this division already holds, and no id twice, so
    // matching the stored count is enough to prove the sets are equal.
    const sameSet = entries.length === existingIds.length && entries.every((entry) => entry.id !== null);
    if (!sameSet) {
        return await rebuildDivision(division, entries, payload);
    }

    // The sets match, so the only structural thing left that can have moved is
    // the order — and the order is the seeding. A reordered list used to satisfy
    // sameSet and route here as a rename, which never touches state.teams, so
    // the request succeeded and changed nothing.
    const reordered = entries.some((entry, index) => entry.id !== existingIds[index]);

    return reordered
        ? await reorderTeams(division, entries, payload)
        : await renameTeams(divisionId, entries, existingIds);
}

// The rename path. No gate: a name has no bearing on results, so there is no
// reason to forbid fixing a typo once the tournament is under way.
async function renameTeams(divisionId, entries, existingIds) {
    const stored = await divisionsRepository.getTeamsByIds(existingIds);
    const namesById = new Map(stored.map((team) => [team.id, team.name]));

    // A team whose name has not moved is not written. Nothing would change and
    // the row would be touched for no reason.
    const changed = entries.filter((entry) => namesById.get(entry.id) !== entry.name);

    if (changed.length > 0) {
        // One transaction, so a list of renames cannot half-apply.
        await db.withTransaction(async (client) => {
            for (const entry of changed) {
                await divisionsRepository.updateTeam(entry.id, entry.name, client);
            }

            // A rename writes only to `teams`, which carries no last_update and
            // has no trigger. Without this the division's stamp would not move,
            // the tournament view's ETag would not change, and every reader
            // would keep being told their cached page — with the old names — is
            // still current.
            await divisionsRepository.touchDivision(divisionId, client);
        });
    }

    return { divisionId, rebuilt: false, reordered: false, renamed: changed.length, teams: entries };
}

// The reorder path. state.teams is the seeding, and seeding is the final
// tiebreak in the ranking chain — see docs/tournament-rules.md — so reordering
// it once results exist would retroactively change who separated from whom, and
// therefore who qualified, with nothing on screen to explain it. Seed order is
// also what the serpentine draw uses to place teams into pools, so a reorder
// redraws pools and knockout structure and regenerates fixtures from scratch —
// the same machinery a rebuild uses, just without adding or removing teams.
//
// Gated on the same Not Started that team editing uses, plus the same
// no-results check a rebuild has, since this now discards and regenerates
// fixtures the same way a rebuild does. The choice and what it gives up are
// recorded in docs/decisions.md.
async function reorderTeams(division, entries, payload) {
    if ((division.tournament_status || "Not Started") !== "Not Started") {
        throw new AppError("TOURNAMENT_ALREADY_STARTED");
    }

    const played = await fixturesRepository.getResults(division.id);
    if (played.length > 0) {
        throw new AppError("DIVISION_HAS_RESULTS");
    }

    const numGroups = toCount(payload.num_groups);
    const knockoutTeams = toCount(payload.knockout_teams);
    validateStructure(numGroups, knockoutTeams, entries.length);

    // A reorder and a rename can arrive in the same request. The comparison is
    // the rename path's, for the same reason: a name that has not moved is not
    // written.
    const stored = await divisionsRepository.getTeamsByIds(entries.map((entry) => entry.id));
    const namesById = new Map(stored.map((team) => [team.id, team.name]));
    const changed = entries.filter((entry) => namesById.get(entry.id) !== entry.name);

    // Generation is pure and can fail on its own terms, so it happens before
    // the transaction opens — same reasoning as rebuildDivision.
    const { division: generated, fixtures } = buildDivision(
        formatOf(division.type),
        entries.map((entry) => entry.id),
        entries.length,
        numGroups,
        knockoutTeams,
        leagueConfigFromState(division.state, entries.length)
    );

    return await db.withTransaction(async (client) => {
        for (const entry of changed) {
            await divisionsRepository.updateTeam(entry.id, entry.name, client);
        }

        const deletedFixtureIds = await fixturesRepository.deleteByDivisionId(division.id, client);

        // Full state overwrite, same as a rebuild: generated.state.teams is
        // already the entries in the submitted order. Stamps last_update
        // itself, so the tournament view's ETag moves without a separate
        // touchDivision.
        await divisionsRepository.replaceState(division.id, generated.state, entries.length, client);
        await createFixtures(division.id, fixtures, client);

        const scheduleEntriesRemoved = await repairSchedule(
            division.tournament_id,
            deletedFixtureIds,
            client
        );

        return {
            divisionId: division.id,
            rebuilt: false,
            reordered: true,
            renamed: changed.length,
            teams: entries,
            fixtures: fixtures.length,
            scheduleEntriesRemoved
        };
    });
}

// The rebuild path. Delete-all-and-recreate for the division, not a diff of
// which fixtures survive: the rebuild is only safe because nothing has been
// played, and if nothing has been played there is nothing to preserve. See
// docs/decisions.md.
async function rebuildDivision(division, entries, payload) {
    // The gate. Two checks, because a status can simply be wrong and a completed
    // fixture cannot.
    if ((division.tournament_status || "Not Started") !== "Not Started") {
        throw new AppError("TOURNAMENT_ALREADY_STARTED");
    }

    const played = await fixturesRepository.getResults(division.id);
    if (played.length > 0) {
        throw new AppError("DIVISION_HAS_RESULTS");
    }

    const numGroups = toCount(payload.num_groups);
    const knockoutTeams = toCount(payload.knockout_teams);
    validateStructure(numGroups, knockoutTeams, entries.length);

    // Ids for the new teams, and the whole regenerated structure, before the
    // transaction opens. Generation is pure and can fail on its own terms; there
    // is no reason for a rejected structure to have had anything to roll back.
    const teams = entries.map((entry) => ({
        id: entry.id ?? uuidv4(),
        name: entry.name,
        isNew: entry.id === null
    }));

    const { division: generated, fixtures } = buildDivision(
        formatOf(division.type),
        teams.map((team) => team.id),
        teams.length,
        numGroups,
        knockoutTeams,
        leagueConfigFromState(division.state, teams.length)
    );

    const kept = new Set(teams.map((team) => team.id));
    const removedIds = teamIdsOf(division.state).filter((id) => !kept.has(id));

    // One transaction: fixtures deleted, teams reconciled, state rewritten and
    // the schedule repaired together, or none of it.
    return await db.withTransaction(async (client) => {
        // First, because fixtures reference the team rows the next step removes.
        // The ids come back because the schedule references them.
        const deletedFixtureIds = await fixturesRepository.deleteByDivisionId(division.id, client);

        await divisionsRepository.deleteTeamsByIds(removedIds, client);

        for (const team of teams) {
            if (team.isNew) {
                await divisionsRepository.createTeam(team.id, team.name, division.id, client);
            } else {
                // Written unconditionally. Every other row in the division is
                // being replaced, so comparing first to save one UPDATE buys
                // nothing here — unlike the rename path, which writes nothing else.
                await divisionsRepository.updateTeam(team.id, team.name, client);
            }
        }

        await divisionsRepository.replaceState(division.id, generated.state, teams.length, client);
        await createFixtures(division.id, fixtures, client);

        const scheduleEntriesRemoved = await repairSchedule(
            division.tournament_id,
            deletedFixtureIds,
            client
        );

        return {
            divisionId: division.id,
            rebuilt: true,
            teams: teams.map((team) => ({ id: team.id, name: team.name })),
            fixtures: fixtures.length,
            scheduleEntriesRemoved
        };
    });
}

// DELETE /api/divisions/:divisionId.
//
// Gated on Not Started, like the rebuild: a division removed from a running
// tournament leaves a schedule and a set of standings describing a tournament
// that no longer exists. Deleting a whole tournament is allowed at any status
// because that leaves nothing behind to be inconsistent with.
//
// Lives here rather than in tournaments.service.js because repairSchedule is
// module-private to this file, and because the rebuild path directly below does
// the same job.
async function deleteDivision(divisionId, userId) {
    const division = await divisionsRepository.getDivisionWithOwner(divisionId);
    if (!division) {
        throw new AppError("DIVISION_NOT_FOUND");
    }

    if (division.created_by !== userId) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    if ((division.tournament_status || "Not Started") !== "Not Started") {
        throw new AppError("TOURNAMENT_ALREADY_STARTED");
    }

    const divisions = await divisionsRepository.getDivisionsByTournamentId(division.tournament_id);
    if (divisions.length <= 1) {
        throw new AppError("LAST_DIVISION");
    }

    // One transaction: the fixtures, the division and the schedule repair
    // together, or none of it.
    return await db.withTransaction(async (client) => {
        // First, and explicitly rather than through the cascade: after the
        // division row goes the fixture ids are gone, and they are what the
        // schedule references.
        const deletedFixtureIds = await fixturesRepository.deleteByDivisionId(division.id, client);

        // The team rows go with this, by cascade — see docs/database.md.
        await divisionsRepository.deleteDivision(division.id, client);

        const scheduleEntriesRemoved = await repairSchedule(
            division.tournament_id,
            deletedFixtureIds,
            client
        );

        return {
            divisionId: division.id,
            tournamentId: division.tournament_id,
            fixturesRemoved: deletedFixtureIds.length,
            scheduleEntriesRemoved
        };
    });
}

// Drops the schedule entries that pointed at fixtures which no longer exist, and
// leaves everything else alone — breaks, and every other division's placements.
// The column is repaired, never nulled.
async function repairSchedule(tournamentId, deletedFixtureIds, client) {
    if (deletedFixtureIds.length === 0) {
        return 0;
    }

    const schedule = await tournamentRepository.getScheduleForUpdate(tournamentId, client);
    const entries = Array.isArray(schedule?.entries) ? schedule.entries : [];
    if (entries.length === 0) {
        return 0;
    }

    const deleted = new Set(deletedFixtureIds);
    // A break carries fixtureId: null and is never a candidate.
    const remaining = entries.filter((entry) => !(entry.fixtureId && deleted.has(entry.fixtureId)));

    const removed = entries.length - remaining.length;
    if (removed > 0) {
        await tournamentRepository.updateSchedule(tournamentId, { ...schedule, entries: remaining }, client);
    }

    return removed;
}

export const divisionService = {
    createDivision,
    updateDivision,
    deleteDivision
}



// Helper Functions

// The one place a submitted team list is checked, so creation and editing cannot
// drift apart on what a valid list is.
//
// teams.name is NOT NULL, so an entry with no name is a 400 rather than a 500,
// and the same team twice in one division would corrupt standings and fixture
// generation. Names are compared trimmed and case-insensitively.
function validateTeamNames(teams) {
    if (!Array.isArray(teams)) {
        throw new AppError("MISSING_FIELDS");
    }

    if (teams.some((team) => !team?.name?.trim())) {
        throw new AppError("MISSING_FIELDS");
    }

    const teamNames = teams.map((team) => team.name.trim());
    const compared = teamNames.map((name) => name.toLowerCase());
    if (new Set(compared).size !== compared.length) {
        throw new AppError("DUPLICATE_TEAM");
    }

    return teamNames;
}

// Turns the submitted list into { id, name } entries, with id null for a team
// that is new. An id the division does not already hold is refused rather than
// reinterpreted: it either names a team belonging to someone else's division or
// the request is confused, and neither should be guessed at.
function readTeamEntries(teams, existingIds) {
    const teamNames = validateTeamNames(teams);
    const existing = new Set(existingIds);
    const seen = new Set();

    return teams.map((team, index) => {
        const id = team.id ?? null;
        if (id === null) {
            return { id: null, name: teamNames[index] };
        }

        if (!existing.has(id)) {
            throw new AppError("TEAM_NOT_IN_DIVISION");
        }
        if (seen.has(id)) {
            throw new AppError("DUPLICATE_TEAM");
        }
        seen.add(id);

        return { id, name: teamNames[index] };
    });
}

// The generation sequence, shared so a rebuilt division is indistinguishable
// from a freshly created one. generateFixtures mutates the rounds it is given
// and hands them back, which is why the state's rounds are reassigned from it.
function buildDivision(format, teamIds, numTeams, numGroups, knockoutTeams, leagueConfig) {
    const division = generateDivisionDetails(format, teamIds, numTeams, numGroups, knockoutTeams, leagueConfig);

    const generated = generateFixtures(division.state.rounds);
    division.state.rounds = generated.rounds;

    return { division, fixtures: generated.fixtures };
}

// Sequential and awaited: one pg client cannot run concurrent queries.
async function createFixtures(divisionId, fixtures, client) {
    for (const fixture of fixtures) {
        await fixtureService.createFixture(divisionId, fixture, client);
    }
}

// divisions.state is jsonb, so pg hands it back already parsed. The guard covers
// a division stored before the column carried anything.
function teamIdsOf(state) {
    return Array.isArray(state?.teams) ? state.teams : [];
}

// divisions.type holds the display name; generation takes the format key the
// creation form sends. Only the two implemented formats can have been stored,
// so anything else is a division this endpoint cannot rebuild.
const FORMAT_BY_TYPE = {
    Classic: "classic",
    League: "league"
};

function formatOf(type) {
    const format = FORMAT_BY_TYPE[type];
    if (!format) {
        throw new AppError("UNSUPPORTED_FORMAT");
    }

    return format;
}

// A count from a form arrives as either a number or its decimal string.
// Anything else is absent as far as this is concerned.
function toCount(value) {
    if (Number.isInteger(value)) {
        return value;
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        return Number(value.trim());
    }

    return null;
}

// Both counts are required on a rebuild and neither is adjusted to fit. The
// organiser confirms them against the new team count in the client, and
// correcting their choice without saying so is worse than refusing it.
function validateStructure(numGroups, knockoutTeams, teamCount) {
    if (numGroups === null || numGroups < 1 || numGroups > teamCount) {
        throw new AppError("INVALID_STRUCTURE");
    }

    if (knockoutTeams === null || knockoutTeams > teamCount) {
        throw new AppError("INVALID_STRUCTURE");
    }
}

function generateDivisionDetails(format, teams, num_teams, num_groups=1, qualifyingTeams=0, leagueConfig){
    let division = {};
    if (format === 'classic'){
        division.type = "Classic";
        division.state = createClassicState(teams, num_teams, num_groups, qualifyingTeams);
    } else if (format === 'league'){
        division.type = "League";
        division.state = createLeagueState(teams, num_teams, leagueConfig);
    } else if (format === 'single_elim'){
        // The ignore spans the throw as well as the two note lines below it:
        // newer v8 reports the never-taken fall-through after a throw as an
        // uncovered branch, the same reporting artifact the finally-block
        // markers in vitest.config.js suppress. The throw itself is exercised.
        /* v8 ignore next 3 -- unreachable fall-through + notes of the intended shape */
        throw new AppError("FORMAT_NOT_IMPLEMENTED");
        division.type = "Single Elimination";
        numGroups = Math.ceil(num_teams/2);
    } else if (format === 'double_elim'){
        /* v8 ignore next 2 -- unreachable fall-through + note of the intended shape */
        throw new AppError("FORMAT_NOT_IMPLEMENTED");
        division.type = "Double Elimination";
    } else {
        throw new AppError("UNSUPPORTED_FORMAT");
    }

    return division;
}

// leagueConfig picks one of two mutually exclusive modes — see
// docs/division-state.md:
//   { mode: 'legs', legs: n }     — n full round-robin cycles, one round object
//                                    each, every team playing every other team
//                                    n times over.
//   { mode: 'limited', gamesPerTeam: g } — one round object whose fixtures are
//                                    a g-regular graph (generatePartialRoundRobinPairs),
//                                    every team playing exactly g games.
// Absent/undefined defaults to a single full cycle — today's only behaviour,
// unchanged.
function createLeagueState(teams, num_teams, leagueConfig){
    const mode = leagueConfig?.mode === 'limited' ? 'limited' : 'legs';

    if (mode === 'limited') {
        const pairs = generatePartialRoundRobinPairs(teams, leagueConfig.gamesPerTeam);

        return {
            teams: teams,
            rounds: [
                {
                    name: "Round Robin",
                    type: "roundRobin",
                    groups: [teams],
                    // Generation input only — read once by generateFixtures's
                    // roundRobin branch and stripped immediately after. Never
                    // part of the persisted round shape.
                    pairs,
                    results: [],
                    totalGames: 0,
                    completedGames: 0,
                    fixtures: []
                }
            ],
            currentRound: 0
        };
    }

    const legs = Math.max(1, Math.trunc(Number(leagueConfig?.legs)) || 1);

    return {
        teams: teams,
        rounds: Array.from({ length: legs }, (_, index) => ({
            name: legName(index, legs),
            type: "roundRobin",
            // One pool holding the team ids, identical across every leg — see
            // docs/division-state.md. Wrapping `teams` again made the pool's
            // single member an array, which fixture generation pairs with a
            // BYE and every other consumer filters away.
            groups: [teams],
            results: [],
            // The generated fixture count, which generateFixtures adds to —
            // seeding it with n(n-1)/2 double-counted every game. See
            // docs/division-state.md.
            totalGames: 0,
            completedGames: 0,
            fixtures: []
        })),
        currentRound: 0
    }
}

// "Round robin" for a single leg — unchanged from before this feature, so a
// leg count of 1 is byte-for-byte what today's generation already produces.
// Distinctly named per leg from two upward, since fixtures carry this as their
// `round` value and standings need to tell legs apart to combine them.
function legName(index, legs) {
    if (legs <= 1) return "Round robin";
    if (legs <= 2) return `Round Robin (Leg ${index + 1})`;
    return `Round Robin (Leg ${index + 1} of ${legs})`;
}

// Reads the two-mode config divisionFormats.js sends on create/rebuild. Absent
// entirely (an older client, or Classic's payload) is undefined, which
// createLeagueState reads as a single full cycle — no behaviour change for a
// caller that doesn't know about this feature.
function leagueConfigFromPayload(payload) {
    if (payload.round_robin_mode === 'limited') {
        return { mode: 'limited', gamesPerTeam: toCount(payload.games_per_team) };
    }

    if (payload.round_robin_mode === 'legs') {
        return { mode: 'legs', legs: toCount(payload.round_robin_legs) || 1 };
    }

    return undefined;
}

// A rebuild or reorder regenerates a division from scratch but the League mode
// itself is set once at creation (see docs/decisions.md) — this reads it back
// from the division's own state rather than asking the request to resupply it,
// so a team edit cannot silently collapse a multi-leg division back to one leg.
function leagueConfigFromState(state, teamCount) {
    const roundRobinRounds = (Array.isArray(state?.rounds) ? state.rounds : []).filter(
        (round) => round.type === "roundRobin"
    );

    if (roundRobinRounds.length > 1) {
        return { mode: 'legs', legs: roundRobinRounds.length };
    }

    const round = roundRobinRounds[0];
    const fullCycleGames = (teamCount * (teamCount - 1)) / 2;
    if (round && round.totalGames > 0 && round.totalGames < fullCycleGames) {
        return { mode: 'limited', gamesPerTeam: Math.round((round.totalGames * 2) / teamCount) };
    }

    return { mode: 'legs', legs: 1 };
}

function createClassicState(teams, num_teams, num_groups, qualifyingTeams) {
    const state = {
        teams: teams,
        rounds: [],
        currentRound: 0
    }

    state.rounds.push({
        name: "Pool Play",
        type: "roundRobin",
        groups: populateGroups(num_groups, teams),
        results: [],
        totalGames: 0,
        completedGames: 0,
        fixtures: []
    })

    num_teams = qualifyingTeams;

    while (num_teams>=2){
        // populate teams array with indices that link to rankings from previous rounds
        teams = Array.from({length: num_teams}, (_, i) => i);
        const round = {
            type: "knockout",
            results: [],
            totalGames: 0,
            completedGames: 0,
            fixtures: []
        };
        if (Number.isInteger(Math.log2(num_teams))){
            if (num_teams>8){
                round.name = "Round of " + num_teams;
            } else {
                switch (num_teams){
                    case 8:
                        round.name = "Quarterfinals";
                        break;
                    case 4:
                        round.name = "Semifinals";
                        break;
                    case 2:
                        round.name = "Finals";
                        break;
                    // Unreachable: the loop only runs while num_teams >= 2 and
                    // this arm only runs for powers of two, so the switch can
                    // only ever see 8, 4 or 2.
                    /* v8 ignore start */
                    default:
                        round.name = "Unknown";
                    /* v8 ignore stop */
                }
            }
            round.groups = populateGroups(num_teams/2, teams);

            // add teams for 3rd Place Playoffs
            if (round.name === "Finals"){
                round.groups.unshift([2,3]);
            }

            num_teams = num_teams/2;
        } else {
            // calculates how many teams go straight to the next round and how many need to play an extra round
            // teams qualifying straight to next round = 2 * no. of teams in next round - num_teams
            // teams playing in this round = 2 * ( num_teams - no. of teams in next round )
            // no. of teams in next round = 2 ^ integer part of log(2, num_teams) 

            round.name = "Round of " + num_teams;
            const qual = Math.pow(2, Math.floor(Math.log2(num_teams)));
            const straight = 2*qual - num_teams;

            // add one team groups for the teams going straight to next round
            round.groups = populateGroups(straight, teams.slice(0,straight));
            
            // add groups for teams playing in current round
            const remainingGroups = populateGroups(num_teams-qual, teams.slice(straight, num_teams));
            remainingGroups.forEach(group => {
                round.groups.push(group);
            });

            num_teams=qual;
        }
        state.rounds.push(round);
    }

    return state;
}

function populateGroups(numGroups, teamList) {
	let groups = [];
	numGroups = parseInt(numGroups);
	var teamsPerGroup = Math.ceil(teamList.length / numGroups);
	for (var groupNo = 1; groupNo <= numGroups; groupNo++) {
		var group = [];
		for (var index = 0; index < teamsPerGroup; index++) {
			if (index % 2 == 0) {
				var pos = index * numGroups + groupNo - 1;
			} else {
				var pos = (index + 1) * numGroups - groupNo;
			}
			if (teamList[pos] === undefined) continue;
			group.push(teamList[pos]);
		}
		groups.push(group);
	}
	// console.log('Groups populated', groups);
	return groups;
}

// Exported for unit tests only. Application code goes through createDivision,
// which wraps these in a database transaction; the generation logic itself is
// pure and is tested directly.
export {
    generateDivisionDetails,
    createLeagueState,
    createClassicState,
    populateGroups,
    validateTeamNames,
    readTeamEntries,
    formatOf,
    toCount,
    validateStructure,
    leagueConfigFromPayload,
    leagueConfigFromState
};

// const division = createClassicState(["Team1", "Team2", "team3","team4","team5","team6","team7","team8","team9"], 9, 2, 6);
// console.dir(generateFixtures(division.rounds), {depth: null});