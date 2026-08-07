import express from 'express';
import { tournamentController } from '../controllers/tournaments.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const tournamentRouter = express.Router();
tournamentRouter.use(express.json());

tournamentRouter.post('/create', requireAuth, tournamentController.createTournament);
// tournamentRouter.post('/join/:tournamentId',);
// tournamentRouter.post('/leave/:tournamentId',);
// tournamentRouter.post('/start/:tournamentId',);
// tournamentRouter.post('/end/:tournamentId',);
// tournamentRouter.delete('/delete/:tournamentId',);
tournamentRouter.get('/:tournamentId', tournamentController.fetchTournamentDetails);
tournamentRouter.get('/', tournamentController.fetchTournaments);

export default tournamentRouter;
