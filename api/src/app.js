import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";


const app = express();
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}));
app.use(cookieParser());



export default app;