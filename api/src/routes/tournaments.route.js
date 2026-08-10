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

// Declared, not implemented: all three answer 501. The routes exist so the paths
// are settled and the frontend can wire to them for real. requireAuth is on them
// now so the auth shape does not change when they are built; the service will
// additionally have to check ownership, per docs/decisions.md.
tournamentRouter.post('/:tournamentId/save', requireAuth, tournamentController.saveTournament);
tournamentRouter.delete('/:tournamentId/save', requireAuth, tournamentController.unsaveTournament);
tournamentRouter.put('/:tournamentId/schedule', requireAuth, tournamentController.updateSchedule);

tournamentRouter.get('/:tournamentId', tournamentController.fetchTournamentDetails);
tournamentRouter.get('/', tournamentController.fetchTournaments);

export default tournamentRouter;
