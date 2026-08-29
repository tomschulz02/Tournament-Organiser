import express from 'express';
import { tournamentController } from '../controllers/tournaments.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const tournamentRouter = express.Router();
tournamentRouter.use(express.json());

tournamentRouter.post('/create', requireAuth, tournamentController.createTournament);

// Lifecycle. Resource-first paths per docs/api.md, replacing the verb-first
// forms these routes were once sketched with. requireAuth proves identity; the
// service proves the tournament is the caller's.
tournamentRouter.post('/:tournamentId/start', requireAuth, tournamentController.startTournament);
tournamentRouter.post('/:tournamentId/end', requireAuth, tournamentController.endTournament);
tournamentRouter.delete('/:tournamentId', requireAuth, tournamentController.deleteTournament);

// Save/unsave a tournament to the caller's profile. Any authenticated user may
// save any tournament except one they created themselves — the service refuses
// that with CANNOT_SAVE_OWN_TOURNAMENT, since a creator's own tournament is
// already on their profile as a created tournament.
tournamentRouter.post('/:tournamentId/save', requireAuth, tournamentController.saveTournament);
tournamentRouter.delete('/:tournamentId/save', requireAuth, tournamentController.unsaveTournament);

// Saves the whole schedule. The generator stays in the client and this is where
// the server validates on write — see docs/schedule.md for what it checks.
tournamentRouter.put('/:tournamentId/schedule', requireAuth, tournamentController.updateSchedule);

// Sets or clears the tournament's scoresheet template selection. See
// docs/handover-scoresheets.md for what a template key means.
tournamentRouter.put('/:tournamentId/scoresheet-template', requireAuth, tournamentController.updateScoresheetTemplate);

// Route to add a division after a tournament has been created
tournamentRouter.post('/:tournamentId/divisions', requireAuth, tournamentController.addDivision);

tournamentRouter.get('/:tournamentId', tournamentController.fetchTournamentDetails);
tournamentRouter.get('/', tournamentController.fetchTournaments);

export default tournamentRouter;
