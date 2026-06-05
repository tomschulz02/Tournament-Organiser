import { tournamentService } from "../services/tournaments.service.js";

async function createTournament(req, res){
    try {
        const {tournamentData} = req.body;
        const userId = req.user.id;

        const result = await tournamentService.createTournament(tournamentData, userId);

        res.status(200).json({success: true, message: "Tournament created successfully", id: result});
    } catch (error) {
        res.status(500).json({ error: error.message || "CREATE_TOURNAMENT_ERROR" });
    }
}

export const tournamentController = {
    createTournament,
}