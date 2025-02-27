// import env variables and necessary modules
import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2";
import bcrypt from "bcrypt";
const saltRounds = 10;

class DBConnection {
	constructor() {
		// create connection to database using a pool
		this.pool = mysql.createPool({
			host: process.env.DB_HOST,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			port: process.env.DB_PORT,
			database: process.env.DB_DATABASE,
			connectionLimit: 50,
		});
	}

	exampleQuery() {
		// Example of how to query the database
		// connect to database and display errors if any occur
		this.pool.getConnection(function (err, connection) {
			// throw an error if connection fails
			if (err) throw err;

			// queries go here
			console.log("Connected to database as ID " + connection.threadId);

			// close the connection
			connection.release();

			// handle error after the release
			if (err) throw err;
			console.log("Connection closed");
		});
	}

	createUser(username, email, password, callback) {
		// query to insert a new user into the database with username, email, and hashed password
		this.pool.getConnection(function (err, connection) {
			// connection error
			if (err) {
				console.log(err);
				return callback({ success: false, object: true, message: err });
			}

			// hash password
			bcrypt.hash(password, saltRounds, function (err, hash) {
				// hash error
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				var query = "INSERT INTO users (username, password, email) VALUES (?, ?, ?)";

				// insert user into database
				connection.query(query, [username, hash, email], function (err, result) {
					// query error
					if (err) {
						connection.release();
						return callback({ success: false, object: true, message: err });
					}

					console.log("User created");

					connection.release();

					if (err) callback({ success: false, object: true, message: err });
					else callback({ success: true, object: true, message: result });
				});
			});
		});
	}

	loginUser(username, password, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM users WHERE email = ?";

			connection.query(query, [username], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				// check if user exists
				if (result.length === 0) {
					connection.release();
					return callback({
						success: false,
						object: false,
						message: "User does not exist",
					});
				}

				// check if password is correct
				bcrypt.compare(password, result[0].password, function (err, res) {
					if (err) {
						connection.release();
						return callback({ success: false, object: true, message: err });
					}

					console.log(result[0]);

					if (res) {
						callback({ success: true, object: true, message: result[0] });
					} else {
						callback({
							success: false,
							object: false,
							message: "Incorrect Password",
						});
					}
				});

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
			});
		});
	}

	addFriend(userId, friendId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "INSERT INTO friends (user_id, friend_id) VALUES (?, ?)";

			connection.query(query, [userId, friendId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("Friend added");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	getFriends(userId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM friends WHERE user_id = ?";

			connection.query(query, [userId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("Friends retrieved");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	createTournament(details, fixtures, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var columns = Object.keys(details).join(", ");
			var placeholders = Object.keys(details)
				.map(() => "?")
				.join(", ");
			var values = [
				details.name,
				details.date,
				details.location,
				details.description,
				details.format,
				details.num_teams,
				details.num_groups,
				details.knockout,
				JSON.stringify(details.state),
				details.created_by,
			];
			var query = `INSERT INTO tournaments (${columns}) VALUES (${placeholders})`;
			var id = 0;

			console.log(`Query: ${query} \nValues: ${values}`);
			connection.query(query, values, function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				id = result.insertId;

				console.log("Tournament created");

				const squery = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES (?, ?)";
				const created_by = details["created_by"];
				connection.query(squery, [created_by, id], function (err, result) {
					if (err) {
						connection.release();
						return callback({ success: false, object: true, message: err });
					}

					console.log("Tournament saved");
				});

				var fvalues = [];
				fixtures.forEach((f) => {
					fvalues.push([id, f.match_no, f.team1, f.team2, f.status, f.round, f.next_game]);
				});

				console.dir(fvalues, { depth: null });

				const fquery =
					"INSERT INTO fixtures (tournament_id, match_no, team1, team2, status, round, next_game) VALUES ?";
				connection.query(fquery, [fvalues], function (err, result) {
					if (err) {
						connection.release();
						return callback({ success: false, object: true, message: err });
					}

					console.log("Fixtures created");
				});
			});

			connection.release();

			if (err) return callback({ success: false, object: true, message: err });
			else
				return callback({
					success: true,
					object: false,
					message: "Tournament created",
				});
		});
	}

	joinTournament(userId, tournamentId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES (?, ?)";

			connection.query(query, [userId, tournamentId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("User joined tournament");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	getFixtures(tournamentId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM fixtures WHERE tournament_id = ?";

			connection.query(query, [tournamentId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("Fixtures retrieved");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	getTournamentDetails(tournamentId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM tournaments WHERE id = ?";

			var details = {};

			connection.query(query, [tournamentId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				// console.log(result);
				details["details"] = result[0];
				// console.log(details);

				query = "SELECT * FROM fixtures WHERE tournament_id = ?";

				connection.query(query, [tournamentId], function (err, res) {
					if (err) {
						connection.release();
						return callback({ success: false, object: true, message: err });
					}

					details["fixtures"] = res;

					connection.release();

					if (err) return callback({ success: false, object: true, message: err });
					else return callback({ success: true, object: true, message: details });
				});
			});
		});
	}

	getResults(tournamentId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM fixtures WHERE tournament_id = ? AND status IS 'COMPLETED'";

			connection.query(query, [tournamentId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("Results retrieved");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	getSavedTournaments(userId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM saved_tournaments WHERE user_id = ?";

			connection.query(query, [userId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("Tournaments retrieved");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	getAllTournaments(callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM tournaments;";
			connection.query(query, function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}
				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	test() {
		console.log("test");
	}
}

// export the module
export default DBConnection;
