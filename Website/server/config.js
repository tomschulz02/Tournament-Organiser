// Updated config.js using PostgreSQL (pg) instead of MySQL
import pkg from "pg";
import bcrypt from "bcrypt";
const { Pool } = pkg;
const saltRounds = 10;

class DBConnection {
	constructor() {
		if (DBConnection.instance) return DBConnection.instance;

		this.pool = new Pool({
			host: process.env.DB_HOST,
			user: process.env.POSTGRES_USER,
			password: process.env.DB_PASSWORD,
			port: process.env.POSTGRES_PORT,
			database: process.env.DB_DATABASE,
			max: 50,
		});

		this.pool
			.connect()
			.then((client) => {
				console.log("PostgreSQL pool connected successfully.");
				client.release();
			})
			.catch((err) => console.error("Error connecting to PostgreSQL pool:", err));

		DBConnection.instance = this;
	}

	query(sql, params, callback) {
		const values = params || [];
		this.pool.query(sql, values, (err, result) => {
			if (err) return callback({ success: false, object: true, message: err });
			return callback({ success: true, object: true, message: result.rows });
		});
	}

	createUser(username, email, password, callback) {
		bcrypt.hash(password, saltRounds, (err, hash) => {
			if (err) return callback({ success: false, object: true, message: err });

			const sql = "INSERT INTO users (username, password, email) VALUES ($1, $2, $3)";
			this.query(sql, [username, hash, email], callback);
		});
	}

	loginUser(username, password, callback) {
		const sql = "SELECT * FROM users WHERE email = $1";
		this.query(sql, [username], (res) => {
			console.log(res);
			if (!res.success || res.message.length === 0)
				return callback({ success: false, object: false, message: "User does not exist" });

			bcrypt.compare(password, res.message[0].password, (err, match) => {
				if (err) return callback({ success: false, object: true, message: err });
				if (!match) return callback({ success: false, object: false, message: "Incorrect Password" });
				return callback({ success: true, object: true, message: res.message[0] });
			});
		});
	}

	addFriend(userId, friendId, callback) {
		const sql = "INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)";
		this.query(sql, [userId, friendId], callback);
	}

	getFriends(userId, callback) {
		const sql = "SELECT * FROM friends WHERE user_id = $1";
		this.query(sql, [userId], callback);
	}

	createTournament(details, fixtures, callback) {
		const sql = `INSERT INTO tournaments (name, date, location, description, format, num_teams, num_groups, knockout, state, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`;
		const values = [
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

		this.pool.query(sql, values, (err, result) => {
			if (err) return callback({ success: false, object: true, message: err });
			const tournamentId = result.rows[0].id;

			const saveSql = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES ($1, $2)";
			this.query(saveSql, [details.created_by, tournamentId], () => {});

			const fixtureSql = `INSERT INTO fixtures (tournament_id, match_no, team1, team2, status, round, next_game)
				VALUES ($1, $2, $3, $4, $5, $6, $7)`;

			const insertFixtures = fixtures.map((f) => {
				return this.pool.query(fixtureSql, [
					tournamentId,
					f.match_no,
					f.team1,
					f.team2,
					f.status,
					f.round,
					f.next_game,
				]);
			});

			Promise.all(insertFixtures)
				.then(() => callback({ success: true, object: false, message: "Tournament created" }))
				.catch((err) => callback({ success: false, object: true, message: err }));
		});
	}

	// You can continue rewriting the other methods similarly...

	test() {
		console.log("test");
	}
}

export default DBConnection;

/* 
createCollection(name, userId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "INSERT INTO collections (name, user_id) VALUES (?, ?)";

			connection.query(query, [name, userId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				console.log("Collection created");

				connection.release();

				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result.insertId });
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

				connection.release();
				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}

	getUserCollections(userId, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT id, name FROM collections WHERE user=?;";
			connection.query(query, [userId], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				connection.release();
				if (err) return callback({ success: false, object: true, message: err });
				else return callback({ success: true, object: true, message: result });
			});
		});
	}
*/
