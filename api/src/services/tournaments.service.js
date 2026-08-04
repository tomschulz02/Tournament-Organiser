import { tournamentRepository } from "../repositories/tournament.repository.js";
import { divisionService } from "./divisions.service.js";
import { getISODate, getLongDate } from "../utils/DateHandler.js";

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
        console.log(error);
        await tournamentRepository.deleteTournament(tournamentId, userId);
        throw new Error("DATABASE_ERROR");
    }
}

async function fetchTournaments() {
    try {
        const tournaments = await tournamentRepository.getAllTournaments();

        for (const tournament of tournaments){
            tournament.start_date = getLongDate(tournament.start_date);
            tournament.end_date = getISODate(tournament.end_date);
        }

        return groupTournamentsByStatus(tournaments);
    } catch (error) {
        throw new Error("FETCH_TOURNAMENTS_ERROR");
    }
}

export const tournamentService = {
    createTournament,
    fetchTournaments
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