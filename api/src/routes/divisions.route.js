import express from 'express';
import { divisionController } from '../controllers/divisions.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const divisionRouter = express.Router();
divisionRouter.use(express.json());

// Round progression. GET proposes, POST commits.
// Both mutate or expose tournament data, so both require a session; the service
// additionally checks that the caller owns the tournament.
divisionRouter.get('/:divisionId/progression', requireAuth, divisionController.getProgression);
divisionRouter.post('/:divisionId/progression', requireAuth, divisionController.commitProgression);

// Declared, not implemented: all three answer 501. See tournaments.route.js for
// why the stubs carry requireAuth already.
divisionRouter.post('/:divisionId/teams', requireAuth, divisionController.addTeam);
divisionRouter.put('/:divisionId/teams/:teamId', requireAuth, divisionController.updateTeam);
divisionRouter.delete('/:divisionId/teams/:teamId', requireAuth, divisionController.removeTeam);

export default divisionRouter;
