import DatabaseConnection from "../config/db.js";
import { tournamentRepository } from "../repositories/tournament.repository.js";
import { divisionsRepository } from "../repositories/divisions.repository.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";
import { divisionService } from "./divisions.service.js";
import { getISODate, getLongDate } from "../utils/DateHandler.js";
import { formatTournamentViewPayload } from "../utils/tournamentViewFormatter.js";
import { AppError } from "../errors.js";

const db = DatabaseConnection();

async function createTournament(tournamentData, userId) {
    // One transaction for the whole creation: the tournament, its divisions,
    // their teams and their fixtures commit together or not at all.
    //
    // This replaces a compensating delete. The database undoes a failed
    // transaction for free, whereas the delete was a hand-written undo that
    // could itself fail, and it could not cover the case it most needed to —
    // a failed tournament insert left no id to delete by.
    return await db.withTransaction(async (client) => {
        const { tournamentId } =
            await tournamentRepository.createTournament(tournamentData.details, userId, client);

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
    deleteTournament
}


function groupTournamentsByStatus(tournaments){
    const result = {
        upcoming: [],
        ongoing: [],
        completed: []
    };

    for (const tournament of tournaments){
        if (tournament.status === null) break;

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
