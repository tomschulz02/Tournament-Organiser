import DatabaseConnection from "../config/db.js";
import { tournamentRepository } from "../repositories/tournament.repository.js";
import { divisionsRepository } from "../repositories/divisions.repository.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";
import { divisionService } from "./divisions.service.js";
import { getISODate, getLongDate } from "../utils/DateHandler.js";
import { formatTournamentViewPayload } from "../utils/tournamentViewFormatter.js";
import { validateSchedule } from "../utils/scheduleValidator.js";
import { AppError } from "../errors.js";
import { assertText } from "../utils/validation.js";
import { buildChangeKey } from "../utils/etag.js";

const db = DatabaseConnection();

// tournaments.name and description are unbounded `text`, so these two limits are
// the application's rather than the schema's. They exist so that a request that
// is plainly not a tournament name is refused at the edge instead of being
// stored. location is varchar(50) and the number is the column's.
// See docs/database.md.
const TOURNAMENT_NAME_MAX = 100;
const TOURNAMENT_DESCRIPTION_MAX = 2000;
const TOURNAMENT_LOCATION_MAX = 50;

async function createTournament(tournamentData, userId) {
    const details = tournamentData?.details;
    if (!details) {
        throw new AppError("MISSING_FIELDS", { details: { field: "details" } });
    }

    assertText(details.name, "name", { max: TOURNAMENT_NAME_MAX });
    assertText(details.location, "location", { max: TOURNAMENT_LOCATION_MAX });
    // description is the one nullable free-text column of the three.
    assertText(details.description, "description", { max: TOURNAMENT_DESCRIPTION_MAX, required: false });

    // One transaction for the whole creation: the tournament, its divisions,
    // their teams and their fixtures commit together or not at all.
    //
    // This replaces a compensating delete. The database undoes a failed
    // transaction for free, whereas the delete was a hand-written undo that
    // could itself fail, and it could not cover the case it most needed to —
    // a failed tournament insert left no id to delete by.
    return await db.withTransaction(async (client) => {
        const { tournamentId } =
            await tournamentRepository.createTournament(details, userId, client);

        // Sequential, not Promise.all: a single pg client cannot run concurrent
        // queries. Nothing is lost — each division used to open its own
        // connection and they contended for the same pool.
        for (const division of tournamentData.divisions) {
            await divisionService.createDivision(division, tournamentId, userId, client);
        }

        return tournamentId;
    });
}

async function fetchTournaments() {
    const tournaments = await tournamentRepository.getAllTournaments();

    for (const tournament of tournaments){
        tournament.start_date = getLongDate(tournament.start_date);
        tournament.end_date = getISODate(tournament.end_date);
    }

    return groupTournamentsByStatus(tournaments);
}

async function fetchTournamentDetails(tournamentId, viewerUserId = null) {
    const tournament = await tournamentRepository.getTournamentById(tournamentId);
    if (!tournament) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const divisions = await divisionsRepository.getDivisionsByTournamentId(tournamentId);
    const divisionIds = divisions.map((division) => division.id);
    const [teamsByDivisionId, fixtures] = await Promise.all([
        getTeamsByDivision(divisions),
        fixturesRepository.getFixturesByDivisionIds(divisionIds)
    ]);

    const fixturesByDivisionId = groupByDivisionId(fixtures);
    const view = formatTournamentViewPayload({
        tournament,
        divisions,
        teamsByDivisionId,
        fixturesByDivisionId
    });

    return {
        creator: viewerUserId !== null && viewerUserId === tournament.created_by,
        // Derived from rows already loaded, so this costs no extra query. The
        // controller turns it into an ETag; it is not part of the payload.
        changeKey: buildChangeKey({ tournament, divisions }),
        view
    };
}

// --- lifecycle --------------------------------------------------------------
//
// Not Started -> Ongoing -> Finished, one way. Each transition loads the
// tournament so that "no such tournament" and "not yours" stay distinguishable;
// the repository used to conflate them by filtering on created_by and reporting
// zero rows affected for both.

async function startTournament(tournamentId, userId) {
    const tournament = await loadOwnedTournament(tournamentId, userId);

    if (statusOf(tournament) === "Ongoing") {
        throw new AppError("TOURNAMENT_ALREADY_STARTED");
    }
    if (statusOf(tournament) === "Finished") {
        throw new AppError("TOURNAMENT_FINISHED");
    }

    await tournamentRepository.startTournament(tournamentId);

    return { id: tournamentId, status: "Ongoing" };
}

async function endTournament(tournamentId, userId) {
    const tournament = await loadOwnedTournament(tournamentId, userId);

    if (statusOf(tournament) === "Not Started") {
        throw new AppError("TOURNAMENT_NOT_STARTED");
    }
    if (statusOf(tournament) === "Finished") {
        throw new AppError("TOURNAMENT_FINISHED");
    }

    await tournamentRepository.endTournament(tournamentId);

    return { id: tournamentId, status: "Finished" };
}

// Deletion is permitted from any status, including Ongoing. An organiser whose
// tournament collapsed halfway through still has to be able to remove it, and
// there is no state a half-played tournament could otherwise be left in. It is
// not silent: the client confirms first, naming what the cascade takes with it.
async function deleteTournament(tournamentId, userId) {
    await loadOwnedTournament(tournamentId, userId);

    await tournamentRepository.deleteTournament(tournamentId);

    return { id: tournamentId };
}

// --- composition ------------------------------------------------------------

// POST /api/tournaments/:tournamentId/divisions.
//
// Only while the tournament is Not Started: a division added afterwards would
// change what the saved schedule and the standings are describing. See
// docs/decisions.md.
//
// Everything about what a division is — the team list, the format, the ids, the
// fixtures — belongs to divisionService.createDivision, which is the same call
// createTournament makes. A division added here has to be indistinguishable
// from one created with the tournament, and that is only true if it goes
// through the same path. The transaction exists because createDivision requires
// a client and writes three tables.
async function addDivision(tournamentId, userId, division) {
    const tournament = await loadOwnedTournament(tournamentId, userId);

    if (statusOf(tournament) !== "Not Started") {
        throw new AppError("TOURNAMENT_ALREADY_STARTED");
    }

    return await db.withTransaction(async (client) =>
        divisionService.createDivision(division, tournamentId, userId, client)
    );
}

// --- schedule ---------------------------------------------------------------

// PUT /api/tournaments/:tournamentId/schedule.
//
// The generator stays in the client and the server validates on write, per
// docs/decisions.md. The whole schedule is replaced, not merged: the client
// holds the entire object and a partial save has no meaning.
//
// The ordering inside the transaction is the point of it. The lock is taken
// FIRST, before the fixtures are read, because a division rebuild takes the same
// lock to repair this column:
//
//   - a rebuild that committed before the lock was granted is visible to the
//     read that follows, so its deleted fixtures are refused here;
//   - a rebuild that has not reached its own lock yet cannot commit until this
//     write is done, and repairs whatever this wrote afterwards.
//
// Reading the fixtures before taking the lock would leave a window where both
// orders lose. See docs/schedule.md, "Who writes this column".
async function updateSchedule(tournamentId, userId, schedule) {
    const tournament = await loadOwnedTournament(tournamentId, userId);

    return await db.withTransaction(async (client) => {
        await tournamentRepository.getScheduleForUpdate(tournamentId, client);

        const divisions = await divisionsRepository.getDivisionsByTournamentId(tournamentId);
        const fixtures = await fixturesRepository.getFixturesByDivisionIds(
            divisions.map((division) => division.id)
        );
        // The officials rule needs team names, which the validator has no other
        // way to reach. Loaded here, inside the transaction and after the lock —
        // moving it before getScheduleForUpdate would reopen the window the lock
        // ordering closes. Same resolution getTeamsByDivision performs.
        const teamsByDivisionId = await getTeamsByDivision(divisions);

        validateSchedule(schedule, {
            startDate: tournament.start_date,
            endDate: tournament.end_date,
            divisions,
            fixtures,
            teamsByDivisionId
        });

        await tournamentRepository.updateSchedule(tournamentId, schedule, client);

        return { id: tournamentId, entries: schedule.entries?.length ?? 0 };
    });
}

// requireAuth proves the caller is logged in. This proves the tournament is
// theirs, and is the tournament-level counterpart of progression's loadDivision.
async function loadOwnedTournament(tournamentId, userId) {
    const tournament = await tournamentRepository.getTournamentById(tournamentId);
    if (!tournament) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    if (tournament.created_by !== userId) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    return tournament;
}

// A row created before status had a default carries null, which is the same
// thing as Not Started everywhere else in the code.
function statusOf(tournament) {
    return tournament.status || "Not Started";
}

export const tournamentService = {
    createTournament,
    fetchTournaments,
    fetchTournamentDetails,
    startTournament,
    endTournament,
    deleteTournament,
    addDivision,
    updateSchedule
}


function groupTournamentsByStatus(tournaments){
    const result = {
        upcoming: [],
        ongoing: [],
        completed: []
    };

    for (const tournament of tournaments){
        // A row with no status is skipped, not treated as the end of the list.
        // This was `break`, which hid every tournament after the first null one.
        if (tournament.status === null) continue;

        switch (tournament.status){
            case 'Not Started':
                result.upcoming.push(tournament);
                break;
            case 'Ongoing':
                result.ongoing.push(tournament);
                break;
            case 'Finished':
                result.completed.push(tournament);
                break;
            default:
                break;
        }
    }

    return result;
}

// Division membership lives in divisions.state.teams, not on the team row — see
// docs/division-state.md — so each division's teams are resolved from its own
// state. The formatter reorders them by state.teams itself.
async function getTeamsByDivision(divisions) {
    const grouped = new Map();

    for (const division of divisions) {
        const state = typeof division.state === "string" ? JSON.parse(division.state) : division.state;
        const teamIds = Array.isArray(state?.teams) ? state.teams : [];

        grouped.set(division.id, await divisionsRepository.getTeamsByIds(teamIds));
    }

    return grouped;
}

function groupByDivisionId(records) {
    return records.reduce((grouped, record) => {
        if (!grouped.has(record.division_id)) {
            grouped.set(record.division_id, []);
        }

        grouped.get(record.division_id).push(record);
        return grouped;
    }, new Map());
}
