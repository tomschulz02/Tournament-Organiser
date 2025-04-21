/* 
Back-end functions for the server
=================================
1. Handle sign-up and sign-in requests
2. Handle requests to create tournaments
3. Handle requests to join tournaments
4. Handle requests to get tournament information
5. Handle requests to get user information
6. Handle requests to get tournament results
7. Update tournament results
8. Add and view friends/other users

TODO:
 - add option for user to create separate brackets for male and female
    => User can indicate in tournament creation form if separate brackets are necessary
    => server will create two distinct tournaments with same details, one for male one for female
    => add flag on tournaments to show if tournament is gender specific so that when tournament details
        are fetched that both tournaments are returned
*/

// run with flag --watch to restart server on changes

// Importing required modules
import dotenv from "dotenv";
dotenv.config();
import DBConnection from "./config.js";
import { formatCombiTournamentForStorage, formatTournamentsForBrowse, formatTournamentView } from "./formatter.js";
import express, { json } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import path, { dirname } from "path";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import logger from "./logger.cjs";
const SECRET_KEY = process.env.SECRET;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const corsOptions = {
	origin:
		process.env.NODE_ENV === "development"
			? [process.env.FRONTEND_URL, "http://localhost:3000"]
			: process.env.FRONTEND_URL,
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	headers: ["Content-Type, Authorization"],
	credentials: true,
	optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(json());
app.use(cookieParser());
app.use(logger);
app.use(express.static(path.join(__dirname, "../")));

// Database connection
const db = new DBConnection();

// Request handling
// TODO

// token verification
const verifyToken = (req, res, next) => {
	const token = req.cookies.authToken;

	// console.log(token);

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
};

// Testing formatter methods
// simulated input for tournament creation
var format = {
	name: "Test",
	date: "2025-02-22",
	location: "Home",
	description: "this is a test description",
	structure: {
		format: "combi",
		numTeams: 16,
		numGroups: 4,
		knockout: 6,
		type: "beach",
	},
	teams: [
		"Team 1",
		"Team 2",
		"Team 3",
		"Team 4",
		"Team 5",
		"Team 6",
		"Team 7",
		"Team 8",
		"Team 9",
		"Team 10",
		"Team 11",
		"Team 12",
		"Team 13",
		"Team 14",
		"Team 15",
		"Team 16",
	],
};
// console.dir(formatCombiTournamentForStorage(format), { depth: null });

// app.use((req, res, next) => {
// 	console.log(`Incoming request: ${req.method} ${req.url}`);
// 	next();
// });

// check whether the user is logged in or not
app.get("/api/check-login", verifyToken, (req, res) => {
	if (!req.user)
		return res.status(401).json({
			error: "A valid token is required for authentication",
			loggedIn: false,
		});
	return res.status(200).json({ loggedIn: true, user: req.user.user });
});

app.get("/api/tournaments", (req, res) => {
	try {
		db.getAllTournaments((result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			}
			res.status(200).json({ message: formatTournamentsForBrowse(result.message) });
		});
	} catch (error) {
		console.log("Error: " + error);
		res.status(500).json({ message: "Server error" });
	}
});

// Get tournament information
app.get("/api/tournament/:id", verifyToken, (req, res) => {
	// Get tournament information
	try {
		const tournamentId = req.params.id;
		db.getTournamentDetails(tournamentId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			}
			// console.log(result);
			var loggedIn = false;
			var creator = false;
			if (req.user) {
				loggedIn = true;
				if (req.user.user === result["message"]["details"]["created_by"]) {
					creator = true;
				}
			}
			// console.log({ message: result, log: loggedIn, creator: creator });
			// filter out specific tournament information depending on user request parameters
			res.status(200).json({ message: formatTournamentView(result.message), loggedIn: loggedIn, creator: creator });
		});
	} catch (error) {
		console.log("Error: " + error);
		res.status(500).json({ message: "Server error" });
	}
});

// Get user information
app.get("/api/user/:id", (req, res) => {
	// Get user information
	try {
		const userId = req.params.id;
		console.log("Getting user information for user ID: " + userId);
		res.status(200).json({ message: "User information" });
		db.getUserDetails(userId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			} else {
				return res.status(200).json({ user: result.message });
			}
		});
		res.status(500).json({ message: "Server error" });
	} catch (error) {
		console.log("Error: " + error);
		res.status(500).json({ message: "Server error" });
	}
});

// Get tournament results
app.get("/api/tournament/:id/results", (req, res) => {
	// Get tournament results
	try {
		const tournamentId = req.params.id;
		console.log("Getting tournament results for tournament ID: " + tournamentId);

		db.getResults(tournamentId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			} else {
				return res.status(200).json({ message: result.message });
			}
			res.status(200).json({ message: "Tournament results" });
		});
	} catch (error) {
		res.status(500).json({ message: "Server error" });
	}
});

// Get friends
app.get("/api/user/:id/friends", verifyToken, (req, res) => {
	// Get friends
	try {
		const userId = req.params.id;
		console.log("Getting friends for user ID: " + userId);

		db.getFriends(userId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			} else {
				return res.status(200).json({ message: result.message });
			}
		});
	} catch (error) {
		res.status(500).json({ message: "Server error" });
	}
});

// get saved tournaments
app.get("/api/user/:id/tournaments", verifyToken, (req, res) => {
	// Get saved tournaments
	try {
		const userId = req.params.id;
		console.log("Getting saved tournaments for user ID: " + userId);

		db.getSavedTournaments(userId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			} else {
				return res.status(200).json({ message: result.message });
			}
		});
	} catch (error) {
		res.status(500).json({ message: "Server error" });
	}
});

// create account
app.post("/api/signup", async (req, res) => {
	try {
		const { username, email, password, confirmPassword } = req.body;
		// Add logic to save user to database

		db.createUser(username, email, password, (result) => {
			if (!result.success) {
				if (result.object && result.message.code === "ER_DUP_ENTRY") {
					return res.status(400).json({ error: "Email already exists" });
				} else {
					return res.status(500).json({ error: result.message });
				}
			}
		});

		db.loginUser(email, password, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}

			const token = jwt.sign(
				{
					user: result.message.username,
					email: result.message.email,
					id: result.message.idusers,
				},
				SECRET_KEY,
				{ expiresIn: "24h" }
			);

			res.cookie("authToken", token, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "strict",
				maxAge: 1000 * 60 * 60 * 24,
			});
			return res.status(200).json({
				message: "User account created successfully",
			});
		});
	} catch (error) {
		console.log(error);
		res.status(500).json({ error: "Failed to create account" });
	}
});

// sign in
app.post("/api/signin", async (req, res) => {
	try {
		const { email, password } = req.body;

		db.loginUser(email, password, (result) => {
			if (!result.success) {
				console.log(result);
				return res.status(400).json({ error: result.message });
			}

			const token = jwt.sign(
				{
					user: result.message.username,
					email: result.message.email,
					id: result.message.idusers,
				},
				SECRET_KEY,
				{ expiresIn: "24h" }
			);

			res.cookie("authToken", token, {
				httpOnly: true,
				secure: true,
				sameSite: "strict",
				maxAge: 1000 * 60 * 60 * 24,
			});
			return res.status(200).json({
				success: true,
				message: "User authenticated",
				user: result.message.username,
			});
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to sign in user" });
	}
});

// logout
app.post("/api/signout", verifyToken, async (req, res) => {
	res.clearCookie("authToken", {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
	});
	res.json({ success: true, message: "User logged out" });
});

// Update tournament results
app.post("/api/tournament/:id/results", verifyToken, (req, res) => {
	// Update tournament results
	try {
		const tournamentId = req.params.id;
		console.log("Updating tournament results for tournament ID: " + tournamentId);
		res.status(200).json({ message: "Tournament results updated successfully" });
	} catch (error) {
		res.status(500).json({ error: "Failed to update tournament results" });
	}
});

// Add friend
app.post("/api/user/:id/friends", verifyToken, (req, res) => {
	// Add friend
	try {
		const userId = req.params.id;
		console.log("Adding friend for user ID: " + userId);
		res.status(200).json({ message: "Friend added successfully" });
	} catch (error) {
		res.status(500).json({ error: "Failed to add friend" });
	}
});

// Create tournament
app.post("/api/tournament/create", verifyToken, (req, res) => {
	try {
		var data = JSON.parse(JSON.stringify(req.body));
		data["user"] = req.user.id;
		const { fixtures, ...details } = formatCombiTournamentForStorage(data);
		console.dir(details, { depth: null });
		// console.dir(fixtures, { depth: null });
		// Add logic to save tournament to database
		db.createTournament(details, fixtures, (result) => {
			console.log(result);
		});
		res.status(201).json({ message: "Tournament created successfully" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Failed to create tournament" });
	}
});

// Join tournament
app.post("/api/tournaments/:id/join", verifyToken, async (req, res) => {
	try {
		const { userId } = req.body;
		const { id } = req.params; // Access the tournament ID from the URL
		// Add logic to add user to tournament

		db.joinTournament(userId, id, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
		});

		res.status(200).json({ message: "User joined tournament successfully" });
	} catch (error) {
		res.status(500).json({ error: "Failed to join tournament" });
	}
});

app.get("*", (req, res) => {
	// console.log(`Catch-all triggered for: ${req.originalUrl}`);
	res.sendFile(path.join(__dirname, "../index.html"));
});

// Start the server
app.listen(5000, () => {
	console.log("Server is running on port 5000");
});
