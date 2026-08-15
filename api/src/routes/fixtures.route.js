import express from 'express';
import { fixtureController } from '../controllers/fixtures.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const fixtureRouter = express.Router();
fixtureRouter.use(express.json());

// Recording a result. PUT rather than POST: sending the same scores twice
// leaves the fixture in the same state, and editing a result is the same call
// as entering one. requireAuth proves identity; the service proves the fixture
// belongs to the caller's tournament.
fixtureRouter.put('/:fixtureId/result', requireAuth, fixtureController.updateResult);

export default fixtureRouter;
