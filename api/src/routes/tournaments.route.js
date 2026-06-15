import express from 'express';
import { tournamentController } from '../controllers/tournaments.controller.js';

const tournamentRouter = express.Router();
tournamentRouter.use(express.json());

tournamentRouter.post('/create', tournamentController.createTournament);
// tournamentRouter.post('/join/:tournamentId',);
// tournamentRouter.post('/leave/:tournamentId',);
// tournamentRouter.post('/start/:tournamentId',);
// tournamentRouter.post('/end/:tournamentId',);
// tournamentRouter.delete('/delete/:tournamentId',);
// tournamentRouter.get('/:tournamentId',);
// tournamentRouter.get('/',);

export default tournamentRouter;