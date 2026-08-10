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

// The division's teams and structure, edited as one list. The service decides
// from the submitted ids whether this is a rename or a rebuild, and additionally
// checks that the caller owns the tournament.
divisionRouter.put('/:divisionId', requireAuth, divisionController.updateDivision);

// The per-team add, rename and remove routes were removed on 2026-08-10. Teams
// and structure cannot change independently, so three routes were three ways to
// leave a division inconsistent — see docs/api.md.

export default divisionRouter;
