import express from 'express';
import { tournamentController } from '../controllers/tournaments.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const tournamentRouter = express.Router();
tournamentRouter.use(express.json());

tournamentRouter.post('/create', requireAuth, tournamentController.createTournament);
// tournamentRouter.post('/start/:tournamentId',);
// tournamentRouter.post('/end/:tournamentId',);
// tournamentRouter.delete('/delete/:tournamentId',);

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
