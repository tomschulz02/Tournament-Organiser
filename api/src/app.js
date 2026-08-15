import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import jwt from 'jsonwebtoken';
import userRouter from "./routes/users.route.js";
import divisionRouter from "./routes/divisions.route.js";
import fixtureRouter from "./routes/fixtures.route.js";
import tournamentRouter from "./routes/tournaments.route.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import DatabaseConnection from "./config/db.js";
import { AppError } from "./errors.js";

const db = DatabaseConnection();

const app = express();

// Render terminates TLS and forwards, so the socket peer is always its proxy.
// Trusting exactly one hop makes req.ip the address the proxy recorded, which
// is what the auth rate limiter keys on. Without this every visitor would share
// a single bucket and ten attempts would lock out the whole application. One
// hop rather than `true`: the client cannot forge it, because the trusted proxy
// appends the real peer to X-Forwarded-For after any value the client sent.
app.set("trust proxy", 1);

// Express otherwise content-hashes every JSON response into a weak ETag of its
// own. That is wrong here in two ways: it would override the deliberate choice
// in tournaments.controller.js to send NO validator when the change key is
// unknown, and a hash of a body containing `creator` is a validator whose
// meaning nobody decided. The only ETag this application sends is the one it
// computes on purpose — see src/utils/etag.js.
app.set("etag", false);

// First, so the headers are set on every response including errors and 404s.
app.use(helmet());
app.use(express.json());
app.use(cors({
    origin:
		process.env.NODE_ENV === 'development'
			? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174']
			: process.env.FRONTEND_URL,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	// If-None-Match is not a CORS-safelisted request header, so sending it makes
	// the request non-simple: the browser preflights, and rejects the real
	// request unless the header is listed here.
	allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
	// The other half. Cross-origin JavaScript can only read the safelisted
	// response headers, and ETag is not one of them — without this the frontend
	// reads null, stores no validator and never revalidates, so the cache is
	// silently inert while appearing to work.
	//
	// Neither of these can be caught by the test suite: supertest has no CORS
	// layer, and the frontend tests stub fetch. They were found by loading the
	// real page against the real API.
	exposedHeaders: ['ETag'],
	credentials: true,
	optionsSuccessStatus: 200,
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Above the session middleware, so a health check neither needs a cookie nor
// pays for a JWT verification. `SELECT 1` is the cheapest question that still
// proves the pool hands back a working connection — "the process is up" alone
// would report healthy while every request 500s.
app.get("/api/health", async (req, res, next) => {
    try {
        await db.query("SELECT 1");
    } catch (error) {
        return next(new AppError("SERVICE_UNAVAILABLE", { cause: error }));
    }

    return res.json({ success: true, message: "OK", data: { database: "up" } });
});

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