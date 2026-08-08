import { tournamentRepository } from "../repositories/tournament.repository.js";
import { divisionsRepository } from "../repositories/divisions.repository.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";
import { divisionService } from "./divisions.service.js";
import { getISODate, getLongDate } from "../utils/DateHandler.js";
import { formatTournamentViewPayload } from "../utils/tournamentViewFormatter.js";
import { AppError } from "../errors.js";

async function createTournament(tournamentData, userId) {
    let tournamentId = 0;
    try {
        //create tournament
        tournamentId = (await tournamentRepository.createTournament(tournamentData.details, userId)).tournamentId;

        //create divisions
        await Promise.all(
            tournamentData.divisions.map( division =>
                divisionService.createDivision(division, tournamentId, userId)
            )
        )

        return tournamentId;
    } catch (error) {
        // Compensating delete, so a half-built tournament is not left behind. It
        // must not mask the failure that caused it, so its own failure is
        // discarded and the original error is rethrown untouched.
        await tournamentRepository.deleteTournament(tournamentId, userId).catch(() => {});
        throw error;
    }
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
    const [teams, fixtures] = await Promise.all([
        divisionsRepository.getTeamsByDivisionIds(divisionIds),
        fixturesRepository.getFixturesByDivisionIds(divisionIds)
    ]);

    const teamsByDivisionId = groupByDivisionId(teams);
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

export const tournamentService = {
    createTournament,
    fetchTournaments,
    fetchTournamentDetails
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

function groupByDivisionId(records) {
    return records.reduce((grouped, record) => {
        if (!grouped.has(record.division_id)) {
            grouped.set(record.division_id, []);
        }

        grouped.get(record.division_id).push(record);
        return grouped;
    }, new Map());
}
