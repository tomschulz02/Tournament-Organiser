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
	populateGroups,
	generateFixturesCombi,
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
const db = new DBConnection();

// token verification
const verifyToken = (req, res, next) => {
	const token = req.cookies.authToken;

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

// check whether the user is logged in or not
app.get("/api/check-login", verifyToken, (req, res) => {
	if (!req.user)
		return res.status(401).json({
			error: "A valid token is required for authentication",
			loggedIn: false,
		});
	return res.status(200).json({ loggedIn: true, user: req.user.username });
});

app.get("/api/tournaments", (req, res) => {
	try {
		var tournaments = [],
			collections = [];
		if (cacheManager.get("all")) {
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

	if (id.startsWith("t_")) {
		classification = "tournament";
	} else if (id.startsWith("c_")) {
		classification = "collection";
	}
	const hashId = id.substring(2);
	const cacheId = req.user ? hashId + "_" + req.user.id : hashId + "_null";
	// Get tournament information
	try {
		if (classification === "tournament") {
			if (cacheManager.get(hashId + "_" + (req.user ? req.user.id : "null"))) {
				return res
					.status(200)
					.json({ success: true, ...cacheManager.get(id + "_" + (req.user ? req.user.id : "null")) });
			}
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
					responseObject = {
						message: formatTournamentView(result.message, tournamentHash, following),
						loggedIn: loggedIn,
						creator: creator,
					};
					cacheManager.set(cacheId, responseObject);
					return res.status(200).json({ success: true, ...responseObject });
				}
				responseObject = {
					message: formatTournamentView(result.message, tournamentHash, following),
					loggedIn: loggedIn,
					creator: creator,
				};
				cacheManager.set(cacheId, responseObject);
				return res.status(200).json({ success: true, ...responseObject });
			});
		} else if (classification === "collection") {
			const decodedId = collectionHash.decode(hashId);
			if (decodedId.length === 0) {
				return res.status(400).json({ error: "Invalid collection ID" });
			}
			const collectionId = decodedId[0];

			const tournamentsList = [];
			const collectionInfo = { name: "", tournamentIds: [] };
			if (cacheManager.get(hashId)) {
				collectionInfo.name = cacheManager.get(hashId).name;
				collectionInfo.tournamentIds = cacheManager.get(hashId).tournamentIds;

				//fetch all tournaments data
				let completed = 0;
				collectionInfo.tournamentIds.forEach((ID) => {
					if (cacheManager.get(ID + "_" + (req.user ? req.user.id : "null"))) {
						tournamentsList.push(cacheManager.get(ID + "_" + (req.user ? req.user.id : "null")));
						completed++;
						if (completed === collectionInfo.tournamentIds.length) {
							tournamentsList.sort((a, b) => a.message.details.name.localeCompare(b.message.details.name));
							return res.status(200).json({ success: true, message: tournamentsList, collection: collectionInfo.name });
						}
					} else {
						db.getTournamentDetails(tournamentHash.decode(ID)[0], (result) => {
							if (!result.success) {
								return res.status(500).json({ error: result.message });
							}

							if (req.user) {
								if (req.user.id === result["message"]["details"]["created_by"]) {
									const tournamentObject = {
										message: formatTournamentView(result.message, tournamentHash, true),
										loggedIn: true,
										creator: true,
									};
									cacheManager.set(ID + "_" + (req.user ? req.user.id : "null"), tournamentObject);
									tournamentsList.push(tournamentObject);
								} else {
									db.getSavedTournaments(req.user.id, (savedRes) => {
										let following = false;
										if (!savedRes.success) {
											following = false;
										} else {
											following = savedRes.message.some((id) => id.tournament_id === tournamentId);
										}
										const tournamentObject = {
											message: formatTournamentView(result.message, tournamentHash, following),
											loggedIn: true,
											creator: false,
										};
										cacheManager.set(ID + "_" + (req.user ? req.user.id : "null"), tournamentObject);
										tournamentsList.push(tournamentObject);
									});
								}
							} else {
								const tournamentObject = {
									message: formatTournamentView(result.message, tournamentHash, false),
									loggedIn: false,
									creator: false,
								};
								cacheManager.set(ID + "_" + (req.user ? req.user.id : "null"), tournamentObject);
								tournamentsList.push(tournamentObject);
							}
							completed++;
							if (completed === collectionInfo.tournamentIds.length) {
								tournamentsList.sort((a, b) => a.message.details.name.localeCompare(b.message.details.name));
								return res
									.status(200)
									.json({ success: true, message: tournamentsList, collection: collectionInfo.name });
							}
						});
					}
				});
			} else {
				db.getTournamentDetailsByCollectionId(collectionId, (result) => {
					if (!result.success) {
						return res.status(500).json({ error: result.message });
					}
					collectionInfo.name = result.collection;
					result.message.forEach((id) => {
						collectionInfo.tournamentIds.push(tournamentHash.encode(id.id));
					});
					cacheManager.set(hashId, collectionInfo);

					//fetch all tournaments data
					let completed = 0;
					collectionInfo.tournamentIds.forEach((ID) => {
						if (cacheManager.get(ID + "_" + (req.user ? req.user.id : "null"))) {
							tournamentsList.push(cacheManager.get(ID + "_" + (req.user ? req.user.id : "null")));
							completed++;
							if (completed === collectionInfo.tournamentIds.length) {
								tournamentsList.sort((a, b) => a.message.details.name.localeCompare(b.message.details.name));
								return res
									.status(200)
									.json({ success: true, message: tournamentsList, collection: collectionInfo.name });
							}
						} else {
							db.getTournamentDetails(tournamentHash.decode(ID)[0], (result) => {
								if (!result.success) {
									return res.status(500).json({ error: result.message });
								}
								console.log(result.message.details);
								if (req.user) {
									if (req.user.id === result["message"]["details"]["created_by"]) {
										const tournamentObject = {
											message: formatTournamentView(result.message, tournamentHash, true),
											loggedIn: true,
											creator: true,
										};
										cacheManager.set(ID + "_" + (req.user ? req.user.id : "null"), tournamentObject);
										tournamentsList.push(tournamentObject);
									} else {
										db.getSavedTournaments(req.user.id, (savedRes) => {
											let following = false;
											if (!savedRes.success) {
												following = false;
											} else {
												following = savedRes.message.some((id) => id.tournament_id === tournamentId);
											}
											const tournamentObject = {
												message: formatTournamentView(result.message, tournamentHash, following),
												loggedIn: true,
												creator: false,
											};
											cacheManager.set(ID + "_" + (req.user ? req.user.id : "null"), tournamentObject);
											tournamentsList.push(tournamentObject);
										});
									}
								} else {
									const tournamentObject = {
										message: formatTournamentView(result.message, tournamentHash, false),
										loggedIn: false,
										creator: false,
									};
									cacheManager.set(ID + "_" + (req.user ? req.user.id : "null"), tournamentObject);
									tournamentsList.push(tournamentObject);
								}
								completed++;
								if (completed === collectionInfo.tournamentIds.length) {
									tournamentsList.sort((a, b) => a.message.details.name.localeCompare(b.message.details.name));
									return res
										.status(200)
										.json({ success: true, message: tournamentsList, collection: collectionInfo.name });
								}
							});
						}
					});
				});
			}

			/* db.getTournamentDetailsByCollectionId(collectionId, (result) => {
				if (!result.success) {
					return res.status(500).json({ error: result.message });
				}
				if (result.message.length === 0) {
					return res.status(404).json({ error: "Collection not found" });
				}
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
					const tournaments = result.message.map((tournament) => {
						return formatTournamentView(tournament, tournamentHash, following);
					});
					responseObject = {
						message: tournaments,
						loggedIn: loggedIn,
						creator: creator,
						collection: result.collection,
					};
					cacheManager.set(cacheId, responseObject);
					return res.status(200).json(responseObject);
				}

			});*/
		} else {
			return res.status(404).json({ error: "Not found" });
		}
	} catch (error) {
		return res.status(500).json({ message: "Server error" });
	}
});

// Get user information
app.get("/api/user/:id", (req, res) => {
	// Get user information
	try {
		const userId = req.params.id;
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
		res.status(500).json({ message: "Server error" });
	}
});

// Get tournament results
app.get("/api/tournament/:id/results", (req, res) => {
	// Get tournament results
	try {
		const tournamentId = req.params.id;

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

		db.getUserCollections(userId, (result) => {
			if (!result.success) {
				return res.status(500).json({ error: result.message });
			} else {
				result.message.forEach((col) => {
					col.id = collectionHash.encode(col.id);
				});
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
					sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
		sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
		path: "/",
	});
	res.json({ success: true, message: "User logged out" });
});

// Update tournament results
app.post("/api/tournament/:id/results", verifyToken, (req, res) => {
	// Update tournament results
	try {
		const fixtureId = req.params.id;
		let { scores, status, hashId, rounds } = req.body;
		if (scores[0][0] === 0 && scores[0][1] === 0 && status == "COMPLETED") {
			status = "CANCELLED";
		}
		if (req.user) {
			db.updateFixture(fixtureId, JSON.stringify(scores), status, rounds, (result) => {
				if (!result.success) {
					return res.status(500).json({ error: result.message });
				}
				cacheManager.invalidate(hashId);
				res.status(200).json({ success: true, message: "Tournament results updated successfully" });
			});
		}
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Failed to update tournament results" });
	}
});

// Add friend
app.post("/api/user/friends", verifyToken, (req, res) => {
	// Add friend
	try {
		const userId = req.user.id;
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

		db.createTournament(details, fixtures, (result) => {
			cacheManager.invalidate("all");
			cacheManager.invalidate(collection);
			res.status(201).json(result);
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to create tournament" });
	}
});

app.post("/api/collection/create", verifyToken, (req, res) => {
	try {
		const { name } = req.body;
		const userId = req.user.id;
		db.createCollection(name, userId, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
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
			cacheManager.invalidate(id);
			res.status(200).json({ message: "User joined tournament successfully" });
		});
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
			cacheManager.invalidate(id);
			res.status(200).json({ message: "User left tournament successfully" });
		});
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
			cacheManager.invalidate(id);
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
			const groupCount = result.message[0].num_groups;
			const groups = populateGroups(groupCount, teams);
			const fixtures = generateFixturesCombi(groups, 0, []);
			console.log(fixtures);
			db.updateGroups(tournamentId, userId, groups, fixtures, (groupResult) => {
				console.error(groupResult);
				if (!groupResult.success) return res.status(400).json({ error: result.message });
				cacheManager.invalidate(id);
				return res.status(200).json({ success: true, message: "Tournament teams updated successfully" });
			});
		});
	} catch (error) {
		return res.status(500).json({ error: "Failed to update tournament teams" });
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
		db.updateRounds(
			{
				tournamentId,
				userId,
				updatedRounds: details.rounds,
				updatedFixtures: details.updatedFixtures,
				nextRound: details.currentRound,
			},
			(result) => {
				if (!result.success) {
					return res.status(400).json({ error: result.message });
				}
				cacheManager.invalidate(id);
				return res.status(200).json({ success: true, message: "Next round started" });
			}
		);
	} catch (error) {
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
			cacheManager.invalidate(id);
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
		db.deleteTournament(tournamentId, userId, (result) => {
			if (!result.success) {
				return res.status(400).json({ error: result.message });
			}
			cacheManager.invalidate(id);
			cacheManager.invalidate(cacheId.substring(2));
			cacheManager.invalidate("all");
			res.status(200).json({ success: true, message: "Tournament deleted successfully" });
		});
	} catch (error) {
		res.status(500).json({ error: "Failed to delete tournament" });
	}
});

app.get("*", (req, res) => {
	res.sendFile(path.join(__dirname, "../tourganiser-ui/build/index.html"));
});

// Start the server
app.listen(5000, () => {
	console.log("Server is running on port 5000");
});
