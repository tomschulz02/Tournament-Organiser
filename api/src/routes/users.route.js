import express from 'express';
import { userController } from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const userRouter = express.Router();
userRouter.use(express.json());

userRouter.post('/signup', userController.signup);
userRouter.post('/login', userController.login);
userRouter.post('/logout', userController.logout);
userRouter.get('/profile/:id', requireAuth, userController.getUserProfile);
userRouter.get('/check-login', userController.checkLogin);

export default userRouter;