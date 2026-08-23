import express from 'express';
import { userController } from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const userRouter = express.Router();
userRouter.use(express.json());

// Only these two are throttled. Guessing a password and farming accounts are the
// attacks that repetition buys; the rest of the API gains an attacker nothing.
userRouter.post('/signup', authLimiter, userController.signup);
userRouter.post('/login', authLimiter, userController.login);
userRouter.post('/logout', userController.logout);
userRouter.get('/profile', requireAuth, userController.getUserProfile);
userRouter.get('/profile/tournaments', requireAuth, userController.getMyTournaments);
userRouter.get('/profile/saved-tournaments', requireAuth, userController.getMySavedTournaments);
userRouter.get('/check-login', userController.checkLogin);

export default userRouter;