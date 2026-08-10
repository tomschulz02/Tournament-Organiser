import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from 'jsonwebtoken';
import userRouter from "./routes/users.route.js";
import divisionRouter from "./routes/divisions.route.js";
import fixtureRouter from "./routes/fixtures.route.js";
import tournamentRouter from "./routes/tournaments.route.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use(cors({
    origin:
		process.env.NODE_ENV === 'development'
			? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174']
			: process.env.FRONTEND_URL,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	credentials: true,
	optionsSuccessStatus: 200,
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
const SECRET_KEY = process.env.JWT_SECRET;

// Populates req.user from the session cookie. This middleware never rejects a
// request — it sets req.user to null when there is no valid token. Routes that
// must not be reachable anonymously use requireAuth from ../middleware/requireAuth.js
const publicRoutes = ["/api/users/login", "/api/users/signup"];
app.use((req, res, next) => {
    if (publicRoutes.includes(req.path)) {
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

// Order matters. notFound turns an unmatched route into an AppError, and
// errorHandler must be last or Express will not treat it as error middleware.
app.use(notFound);
app.use(errorHandler);

export default app;