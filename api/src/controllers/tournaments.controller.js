import { tournamentService } from "../services/tournaments.service.js";
import { AppError } from "../errors.js";
import { isUuid } from "../utils/validation.js";
import { buildTournamentEtag, matchesEtag } from "../utils/etag.js";

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

    const viewerUserId = req.user?.id || null;
    const tournament = await tournamentService.fetchTournamentDetails(tournamentId, viewerUserId);

    // This response differs by session cookie — `creator` and `loggedIn` both
    // do — so no shared cache may hand one reader's copy to another. Vary says
    // that; no-cache lets a client store the body but never reuse it without
    // asking, which is what makes the ETag below the only thing deciding.
    res.set("Vary", "Cookie");
    res.set("Cache-Control", "no-cache");

    // Covers the viewer as well as the data. See src/utils/etag.js for why the
    // timestamp alone would be wrong.
    const etag = buildTournamentEtag(tournament.changeKey, viewerUserId);
    if (etag) {
        res.set("ETag", etag);

        if (matchesEtag(req.headers["if-none-match"], etag)) {
            // 304 carries no body by specification, which is fine alongside the
            // envelope: the client already holds the payload this validates.
            return res.status(304).end();
        }
    }

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

// Save/unsave a tournament to the caller's profile. No ownership check —
// any authenticated user may save any tournament, including their own; only
// requireAuth plus "the tournament exists" (for save) apply. See
// docs/decisions.md.
async function saveTournament(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    await tournamentService.saveTournament(tournamentId, req.user.id);

    res.status(200).json({ success: true, message: "Tournament saved", data: { tournamentId } });
}

async function unsaveTournament(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    await tournamentService.unsaveTournament(tournamentId, req.user.id);

    res.status(200).json({ success: true, message: "Tournament unsaved", data: { tournamentId } });
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

// Sets or clears the tournament's scoresheet template selection. What a valid
// templateKey is belongs to tournamentService.updateScoresheetTemplate; this
// reads the id and the body and nothing else.
async function updateScoresheetTemplate(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await tournamentService.updateScoresheetTemplate(
        tournamentId,
        req.user.id,
        req.body?.scoresheetTemplate ?? null
    );

    res.status(200).json({ success: true, message: "Scoresheet template updated", data });
}

// add a new division to an already created tournament. The body is the same
// division payload the creation page sends, and is passed through untouched:
// what a valid division is belongs to divisionService.createDivision.
async function addDivision(req, res){
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const id = await tournamentService.addDivision(tournamentId, req.user.id, req.body);

    res.status(201).json({ success: true, message: "Division added", data: { id } });
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
    updateSchedule,
    addDivision,
    updateScoresheetTemplate
}
