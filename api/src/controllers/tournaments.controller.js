import { tournamentService } from "../services/tournaments.service.js";
import { AppError } from "../errors.js";
import { isUuid } from "../utils/validation.js";

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

// The three lifecycle actions. Each takes only the id and the session; the
// transition itself is not a parameter, so there is no body to validate. The
// service owns both ownership and whether the transition is legal.

async function startTournament(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await tournamentService.startTournament(tournamentId, req.user.id);

    res.status(200).json({ success: true, message: "Tournament started", data });
}

async function endTournament(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await tournamentService.endTournament(tournamentId, req.user.id);

    res.status(200).json({ success: true, message: "Tournament ended", data });
}

async function deleteTournament(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await tournamentService.deleteTournament(tournamentId, req.user.id);

    res.status(200).json({ success: true, message: "Tournament deleted", data });
}

// Declared but not built. The routes exist so the paths are fixed and the UI can
// wire to them properly; each answers 501 through the standard envelope. See
// docs/api.md for the paths and why they are stubs rather than omissions.
// Replace the throw with a service call when the feature lands.

async function saveTournament() {
    throw new AppError("NOT_IMPLEMENTED");
}

async function unsaveTournament() {
    throw new AppError("NOT_IMPLEMENTED");
}

// The schedule is sent whole, under `schedule`, exactly as the client holds it.
// The controller reads the id and the body and nothing else: what a valid
// schedule is belongs to api/src/utils/scheduleValidator.js, and whether this
// tournament is the caller's belongs to the service.
async function updateSchedule(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await tournamentService.updateSchedule(tournamentId, req.user.id, req.body?.schedule);

    res.status(200).json({ success: true, message: "Schedule saved", data });
}

export const tournamentController = {
    createTournament,
    fetchTournaments,
    fetchTournamentDetails,
    startTournament,
    endTournament,
    deleteTournament,
    saveTournament,
    unsaveTournament,
    updateSchedule
}
