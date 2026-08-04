import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from 'jsonwebtoken';
import userRouter from "./routes/users.route.js";
import divisionRouter from "./routes/divisions.route.js";
import fixtureRouter from "./routes/fixtures.route.js";
import tournamentRouter from "./routes/tournaments.route.js";

const app = express();
app.use(express.json());
app.use(cors({
    origin:
		process.env.NODE_ENV === 'development'
			? [process.env.FRONTEND_URL, 'http://localhost:5173']
			: process.env.FRONTEND_URL,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	headers: ['Content-Type, Authorization'],
	credentials: true,
	optionsSuccessStatus: 200,
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
const SECRET_KEY = process.env.JWT_SECRET;

// token check
const publicRoutes = ["/api/users/login", "/api/users/signup"];
app.use((req, res, next) => {
    console.log("Incoming request:", req.method, req.path);
    if (publicRoutes.includes(req.path)) {
        console.log("Public route accessed:", req.path);
        return next();
    }

    const token = req.cookies.token;
    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
    } catch (error) {
        req.user = null;
    }

    next();
});

// routes
app.use("/api/users", userRouter);
app.use("/api/divisions", divisionRouter);
app.use("/api/fixtures", fixtureRouter);
app.use("/api/tournaments", tournamentRouter);

export default app;