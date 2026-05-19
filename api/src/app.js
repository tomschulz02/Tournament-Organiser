import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRouter from "./routes/users.route.js";
import divisionRouter from "./routes/divisions.route.js";
import fixtureRouter from "./routes/fixtures.route.js";
import tournamentRouter from "./routes/tournaments.route.js";

const app = express();
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// token check
publicRoutes = ["/api/users/login", "/api/users/register"];
app.use((req, res, next) => {
    if (publicRoutes.includes(req.path)) {
        return next();
    }

    const token = req.cookies.token;
    if (!token) {
        // TODO: add error message
        return res.status(401);
    }

    // token verification
    next();
});

// routes
app.use("/api/users", userRouter);
app.use("/api/divisions", divisionRouter);
app.use("/api/fixtures", fixtureRouter);
app.use("/api/tournaments", tournamentRouter);

export default app;