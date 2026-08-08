import { tournamentService } from "../services/tournaments.service.js";
import { AppError } from "../errors.js";

// Controllers do not catch. Express 5 forwards a rejected promise from an async
// handler to the error middleware, which owns every status and message.

async function createTournament(req, res){
    const tournamentData = req.body;
    // requireAuth guarantees req.user is set on this route.
    const userId = req.user.id;

    const id = await tournamentService.createTournament(tournamentData, userId);

    res.status(201).json({ success: true, message: "Tournament created successfully", data: { id } });
}

async function fetchTournaments(req, res){
    //TODO: cache tournaments
    const tournaments = await tournamentService.fetchTournaments();

    res.status(200).json({ success: true, message: "Tournaments fetched", data: tournaments });
}

async function fetchTournamentDetails(req, res){
    const { tournamentId } = req.params;
    // A malformed id can never match a row, so it is a 404 rather than a query.
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const tournament = await tournamentService.fetchTournamentDetails(tournamentId, req.user?.id || null);

    res.status(200).json({
        success: true,
        message: "Tournament fetched",
        data: {
            loggedIn: Boolean(req.user),
            creator: tournament.creator,
            ...tournament.view
        }
    });
}

export const tournamentController = {
    createTournament,
    fetchTournaments,
    fetchTournamentDetails
}

function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
