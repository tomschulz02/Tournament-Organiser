import { tournamentRepository } from "../repositories/tournament.repository";
import { divisionService } from "./divisions.service";

async function createTournament(tournamentData, userId) {
    let tournamentId = 0;
    try {
        //create tournament
        tournamentId = await tournamentRepository.createTournament(tournamentData.details, userId);

        //create divisions
        await Promise.all(
            tournamentData.divisions.map( division => 
                divisionService.createDivision(division, tournamentId, userId)
            )
        )

        return tournamentId;
    } catch (error) {
        await tournamentRepository.deleteTournament(tournamentId, userId);
        throw new Error("DATABASE_ERROR");
    }
}

export const tournamentService = {
    createTournament
}