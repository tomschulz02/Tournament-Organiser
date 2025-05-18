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
import path, { dirname } from "path";
dotenv.config();
import {
	formatCombiTournamentForStorage,
	formatTournamentsForBrowse,
	formatTournamentView,
	determineQualifiedTeams,
} from "./formatter.js";
import DBConnection from "./config.js";
import express, { json } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
// import path, { dirname } from "path";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import logger from "./logger.cjs";
import Hashids from "hashids";
import CacheManager from "./utils/CacheManager.js";
import { error } from "console";
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

const tournamentHash = new Hashids("finest salt in all the land", 10);
const collectionHash = new Hashids("a mountain of salt", 10);

const cacheManager = new CacheManager();

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(json());
app.use(cookieParser());
app.use(logger);
app.use(express.static(path.join(__dirname, "../")));

// Database connection
// const { default: DBConnection } = await import("./config.js");
const db = new DBConnection();

// console.log(process.env);

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
	// console.log("User logged in: " + JSON.stringify(req.user));
	return res.status(200).json({ loggedIn: true, user: req.user.username });
});

app.get("/api/tournaments", (req, res) => {
	try {
		var tournaments = [],
			collections = [];
		if (cacheManager.get("all")) {
			// console.log("Cache hit for all tournaments");
			return res.status(200).json({ message: cacheManager.get("all") });
		}
		db.getAllTournaments((result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			}
			tournaments = result.message;

			db.getAllCollections((cRes) => {
				if (!cRes.success) {
					return res.status(500).json({ error: cRes.message });
				}
				collections = cRes.message;
				const all = formatTournamentsForBrowse(tournaments, collections, tournamentHash, collectionHash);
				cacheManager.set("all", all);
				res.status(200).json({ message: all });
			});
		});
	} catch (error) {
		res.status(500).json({ message: "Server error" });
	}
});

// Get tournament information
app.get("/api/tournament/:id", verifyToken, (req, res) => {
	const { id } = req.params;
	var classification = null;
	var responseObject = null;
	if (cacheManager.get(id + "_" + (req.user ? req.user.id : "null"))) {
		return res.status(200).json(cacheManager.get(id + "_" + (req.user ? req.user.id : "null")));
	}
	if (id.startsWith("t_")) {
		classification = "tournament";
	} else if (id.startsWith("c_")) {
		classification = "collection";
	}
	const hashId = id.substring(2);
	const cacheId = req.user ? id + "_" + req.user.id : id + "_null";
	// Get tournament information
	try {
		if (classification === "tournament") {
			const decodedId = tournamentHash.decode(hashId);
			if (decodedId.length === 0) {
				return res.status(400).json({ error: "Invalid tournament ID" });
			}
			const tournamentId = decodedId[0];
			db.getTournamentDetails(tournamentId, (result) => {
				if (!result.success) {
					return res.status(500).json({ error: result.message });
				}
				if (result.message.details == undefined) {
					return res.status(404).json({ error: "Tournament not found" });
				}
				// console.log(req.user);
				var loggedIn = false;
				var creator = false;
				var following = false;
				if (req.user) {
					loggedIn = true;
					if (req.user.id === result["message"]["details"]["created_by"]) {
						creator = true;
						following = true;
					} else {
						db.getSavedTournaments(req.user.id, (savedRes) => {
							if (!savedRes.success) {
								following = false;
							} else {
								following = savedRes.message.some((id) => id.tournament_id === tournamentId);
							}
						});
					}
					// console.log("Here");
					responseObject = {
						message: formatTournamentView(result.message, tournamentHash, following),
						loggedIn: loggedIn,
						creator: creator,
					};
					// console.log("Hello");
					cacheManager.set(cacheId, responseObject);
					return res.status(200).json(responseObject);
				}
				responseObject = {
					message: formatTournamentView(result.message, tournamentHash, following),
					loggedIn: loggedIn,
					creator: creator,
				};
				cacheManager.set(cacheId, responseObject);
				return res.status(200).json(responseObject);
			});
		} else if (classification === "collection") {
			const decodedId = collectionHash.decode(hashId);
			if (decodedId.length === 0) {
				return res.status(400).json({ error: "Invalid collection ID" });
			}
			const collectionId = decodedId[0];
			db.getTournamentDetailsByCollectionId(collectionId, (result) => {
				if (!result.success) {
					return res.status(500).json({ error: result.message });
				}
				if (result.message.length === 0) {
					return res.status(404).json({ error: "Collection not found" });
				}
				// console.log(result.message);
				var loggedIn = false;
				var creator = false;
				var following = false;
				if (req.user) {
					loggedIn = true;
					db.getSavedTournaments(req.user.id, (savedRes) => {
						const tournaments = result.message.map((tournament) => {
							if (req.user.id === result["message"][0]["details"]["created_by"]) {
								creator = true;
								following = true;
							} else if (!savedRes.success) {
								following = false;
							} else {
								following = savedRes.message.some((id) => id.tournament_id === tournament.details.id);
							}
							return formatTournamentView(tournament, tournamentHash, following);
						});
						// console.log(tournaments);
						responseObject = {
							message: tournaments,
							loggedIn: loggedIn,
							creator: creator,
							collection: result.collection,
						};
						cacheManager.set(cacheId, responseObject);
						return res.status(200).json(responseObject);
					});
				} else {
					// console.log(result);
					const tournaments = result.message.map((tournament) => {
						// console.log(tournament.details);
						return formatTournamentView(tournament, tournamentHash, following);
					});
					// console.log(tournaments);
					responseObject = {
						message: tournaments,
						loggedIn: loggedIn,
						creator: creator,
						collection: result.collection,
					};
					cacheManager.set(cacheId, responseObject);
					return res.status(200).json(responseObject);
				}

				// console.log(tournaments);
			});
		} else {
			return res.status(404).json({ error: "Not found" });
		}
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
app.get("/api/user/friends", verifyToken, (req, res) => {
	// Get friends
	try {
		const userId = req.user.id;
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
app.get("/api/user/tournaments", verifyToken, (req, res) => {
	// Get saved tournaments
	try {
		const userId = req.user.id;
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

app.get("/api/collections", verifyToken, (req, res) => {
	// Get user collections
	try {
		const userId = req.user.id;
		// console.log("Getting collections for user ID: " + userId);

		db.getUserCollections(userId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			} else {
				result.message.forEach((col) => {
					col.id = collectionHash.encode(col.id);
				});
				// console.log(result.message);
				return res.status(200).json(result);
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
					return res.status(400).json({ error: "Email already in use" });
				} else {
					return res.status(500).json({ error: result.message });
				}
			}
			db.loginUser(email, password, (result) => {
				if (!result.success) {
					return res.status(400).json({ error: result.message });
				}

				const token = jwt.sign(
					{
						username: result.message.username,
						email: result.message.email,
						id: result.message.id,
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
					success: true,
					message: "User account created successfully",
					user: result.message.username,
				});
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
				return res.status(400).json({ error: result.message });
			}
			const token = jwt.sign(
				{
					username: result.message.username,
					email: result.message.email,
					id: result.message.id,
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
		const fixtureId = req.params.id;
		const { scores, status, hashId, rounds } = req.body;
		// console.log({ scores, status, hashId });
		if (req.user) {
			db.updateFixture(fixtureId, JSON.stringify(scores), status, rounds, (result) => {
				// console.log(result);
				if (!result.success) {
					return res.status(500).json({ error: result.message });
				}
				// console.log(result);
				cacheManager.invalidate(hashId);
				res.status(200).json({ success: true, message: "Tournament results updated successfully" });
			});
		}
	} catch (error) {
		res.status(500).json({ error: "Failed to update tournament results" });
	}
});

// Add friend
app.post("/api/user/friends", verifyToken, (req, res) => {
	// Add friend
	try {
		const userId = req.user.id;
		console.log("Adding friend for user ID: " + userId);
		res.status(200).json({ success: true, message: "Friend added successfully" });
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
		const collection = collectionHash.decode(details.collection)[0];
		details["collection"] = collection;
		// console.dir(details, { depth: null });
		// console.dir(fixtures, { depth: null });
		// Add logic to save tournament to database
		db.createTournament(details, fixtures, (result) => {
			// console.log(result);
			cacheManager.invalidate("all");
			cacheManager.invalidate("c_" + details.collection);
			res.status(201).json(result);
		});
	} catch (error) {
		// console.error(error);
		res.status(500).json({ error: "Failed to create tournament" });
	}
});

app.post("/api/collection/create", verifyToken, (req, res) => {
	try {
		const { name } = req.body;
		// console.log("User object: " + JSON.stringify(req.user));
		const userId = req.user.id;
		// console.log("Creating collection for user ID: " + userId);
		db.createCollection(name, userId, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
			console.log({ ...result, message: collectionHash.encode(result.message) });
			res.status(201).json({ ...result, message: collectionHash.encode(result.message) });
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to create collection" });
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

app.post("/api/tournaments/:id/leave", verifyToken, async (req, res) => {
	try {
		const { userId } = req.body;
		const { id } = req.params;

		db.unfollowTournament(userId, id, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
		});

		res.status(200).json({ message: "User left tournament successfully" });
	} catch (error) {
		res.status(500).json({ error: "Failed to leave tournament" });
	}
});

app.post("/api/tournament/:id/start", verifyToken, async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.id;
		const decodedId = tournamentHash.decode(id);
		if (decodedId.length === 0) {
			return res.status(400).json({ error: "Invalid tournament ID" });
		}
		const tournamentId = decodedId[0];
		db.startTournament(tournamentId, userId, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
			cacheManager.invalidate("t_" + id);
			res.status(200).json({ success: true, message: "Tournament started successfully" });
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to start tournament" });
	}
});

app.post("/api/tournament/:id/advance", verifyToken, async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.id;
	} catch (error) {
		res.status(500).json({ error: "Failed to start next round" });
	}
});

app.post("/api/tournament/:id/updateTeams", verifyToken, async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.id;
		const { teams } = req.body;
		const decodedId = tournamentHash.decode(id);
		if (decodedId.length === 0) {
			return res.status(400).json({ error: "Invalid tournament ID" });
		}
		const tournamentId = decodedId[0];
		db.updateTeams(tournamentId, userId, teams, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
			cacheManager.invalidate("t_" + id);
			res.status(200).json({ success: true, message: "Tournament teams updated successfully" });
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to update tournament teams" });
	}
});

app.post("/api/tournament/:id/updateRounds", verifyToken, async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.id;
		const { rounds, qualifiedTeams, standings, fixtures, currentRound } = req.body;
		const decodedId = tournamentHash.decode(id);
		if (decodedId.length === 0) {
			return res.status(400).json({ error: "Invalid tournament ID" });
		}
		const tournamentId = decodedId[0];
		const details = determineQualifiedTeams({
			rounds: rounds,
			teams: qualifiedTeams,
			fixtures: fixtures,
			currentRound: currentRound,
			previousStandings: standings,
		});
		// console.dir({ details, tournamentId, userId }, { depth: null });
		db.updateRounds(
			{
				tournamentId,
				userId,
				updatedRounds: details.rounds,
				updatedFixtures: details.updatedFixtures,
				nextRound: details.currentRound,
			},
			(result) => {
				// console.log(result);
				if (!result.success) {
					return res.status(400).json({ error: result.message });
				}
				cacheManager.invalidate("t_" + id);
				return res.status(200).json({ success: true, message: "Next round started" });
			}
		);
	} catch (error) {
		console.log(error);
		res.status(500).json({ error: "Failed to update tournament" });
	}
});

app.put("/api/tournament/:id/end", verifyToken, async (req, res) => {
	try {
		const { id } = req.params;
		const userID = req.user.id;
		const decodedId = tournamentHash.decode(id);
		if (decodedId.length === 0) {
			return res.status(400).json({ error: "Invalid tournament ID" });
		}
		const tournamentId = decodedId[0];

		db.endTournament(tournamentId, userID, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
			cacheManager.invalidate("t_" + id);
			return res.status(200).json({ success: true, message: "Tournament Ended" });
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to end tournament" });
	}
});

app.delete("/api/tournament/:id", verifyToken, async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.id;
		const { cacheId } = req.body;
		const decodedId = tournamentHash.decode(id);
		if (decodedId.length === 0) {
			return res.status(400).json({ error: "Invalid tournament ID" });
		}
		const tournamentId = decodedId[0];
		console.log("Deleting tournament with ID: " + tournamentId);
		db.deleteTournament(tournamentId, userId, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
			console.log("Decaching tournament with ID: " + cacheId);
			cacheManager.invalidate(cacheId);
			res.status(200).json({ success: true, message: "Tournament deleted successfully" });
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to delete tournament" });
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
