import express from 'express';

const userRouter = express.Router();
userRouter.use(express.json());


export default userRouter;