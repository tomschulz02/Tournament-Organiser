import { tournamentService } from "../services/tournaments.service.js";

async function createTournament(req, res){
    try {
        const tournamentData = req.body;
        const userId = req.user.id;

        console.log(tournamentData);
        

        const result = await tournamentService.createTournament(tournamentData, userId);

        res.status(200).json({success: true, message: "Tournament created successfully", id: result});
    } catch (error) {
        res.status(500).json({ error: error.message || "CREATE_TOURNAMENT_ERROR" });
    }
}

async function fetchTournaments(req, res){
    try {
        //TODO: cache tournaments
        const tournaments = await tournamentService.fetchTournaments();

        res.status(200).json({success: true, message: tournaments})
    } catch (error) {
        res.status(500).json({ error: error.message || "FETCH_TOURNAMENT_ERROR" });
    }
}

async function fetchTournamentDetails(req, res){
    try {
        
    } catch (error) {
        res.status(500).json({ error: error.message || "FETCH_TOURNAMENT_DETAILS_ERROR" });
    }
}

export const tournamentController = {
    createTournament,
    fetchTournaments,
    fetchTournamentDetails
}