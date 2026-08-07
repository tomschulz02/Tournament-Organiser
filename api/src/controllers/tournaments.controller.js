import { tournamentService } from "../services/tournaments.service.js";

async function createTournament(req, res){
    try {
        const tournamentData = req.body;
        // requireAuth guarantees req.user is set on this route.
        const userId = req.user.id;

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
        const { tournamentId } = req.params;
        if (!isUuid(tournamentId)) {
            res.status(404).json({ success: false, error: "TOURNAMENT_NOT_FOUND" });
            return;
        }

        const tournament = await tournamentService.fetchTournamentDetails(tournamentId, req.user?.id || null);
        if (!tournament) {
            res.status(404).json({ success: false, error: "TOURNAMENT_NOT_FOUND" });
            return;
        }

        res.status(200).json({
            success: true,
            loggedIn: Boolean(req.user),
            creator: tournament.creator,
            message: tournament.message
        });
    } catch (error) {
        res.status(500).json({ error: error.message || "FETCH_TOURNAMENT_DETAILS_ERROR" });
    }
}

export const tournamentController = {
    createTournament,
    fetchTournaments,
    fetchTournamentDetails
}

function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
