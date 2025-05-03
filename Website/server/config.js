// Updated config.js using PostgreSQL (pg) instead of MySQL
import pkg from "pg";
import bcrypt from "bcrypt";
const { Pool } = pkg;
const saltRounds = 10;

class DBConnection {
	constructor() {
		if (DBConnection.instance) return DBConnection.instance;

		this.pool = new Pool({
			connectionString: process.env.DATABASE_URL,
			ssl: {
				rejectUnauthorized: false,
			},
			max: 20, // max number of clients in the pool
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

			const sql = "INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email";
			this.query(sql, [username, hash, email], callback);
		});
	}

	loginUser(username, password, callback) {
		const sql = "SELECT * FROM users WHERE email = $1";
		this.query(sql, [username], (res) => {
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
		const sql = `INSERT INTO tournaments (name, date, location, description, format, num_teams, num_groups, knockout, state, created_by, collection_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`;
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
			details.collection,
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

	getAllTournaments(callback) {
		const query = "SELECT * FROM tournaments WHERE collection_id IS NULL;";
		this.query(query, [], callback);
	}

	getAllCollections(callback) {
		const query =
			"SELECT c.*, COUNT(t.id) AS tournament_count FROM collections c JOIN tournaments t ON c.id = t.collection_id GROUP BY c.id;";
		this.query(query, [], callback);
	}

	createCollection(name, userId, callback) {
		const sql = "INSERT INTO collections (name, user_id) VALUES ($1, $2) RETURNING id";
		this.query(sql, [name, userId], (res) => {
			if (!res.success) return callback(res);
			return callback({ success: true, object: true, message: res.message[0].id });
		});
	}

	joinTournament(userId, tournamentId, callback) {
		const sql = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES ($1, $2)";
		this.query(sql, [userId, tournamentId], callback);
	}

	getFixtures(tournamentId, callback) {
		const sql = "SELECT * FROM fixtures WHERE tournament_id = $1";
		this.query(sql, [tournamentId], callback);
	}

	async getTournamentDetails(tournamentId, callback) {
		const client = await this.pool.connect();
		try {
			const details = {};

			const tournamentRes = await client.query("SELECT * FROM tournaments WHERE id = $1", [tournamentId]);
			if (tournamentRes.rows.length === 0) {
				throw new Error("Tournament not found");
			}

			details.details = tournamentRes.rows[0];

			const fixturesRes = await client.query("SELECT * FROM fixtures WHERE tournament_id = $1 ORDER BY match_no", [
				tournamentId,
			]);
			details.fixtures = fixturesRes.rows;

			callback({ success: true, object: true, message: details });
		} catch (err) {
			callback({ success: false, object: true, message: err });
		} finally {
			client.release();
		}
	}

	async getTournamentDetailsByCollectionId(collectionId, callback) {
		const client = await this.pool.connect();
		try {
			const tournaments = [];

			const collectionRes = await client.query("SELECT name FROM collections WHERE id = $1", [collectionId]);
			const collectionName = collectionRes.rows[0]?.name;

			const tournamentRes = await client.query("SELECT * FROM tournaments WHERE collection_id = $1", [collectionId]);
			if (tournamentRes.rows.length === 0) {
				throw new Error("Tournament not found");
			}

			await Promise.all(
				tournamentRes.rows.map(async (tournament) => {
					const fixturesRes = await client.query("SELECT * FROM fixtures WHERE tournament_id = $1 ORDER BY match_no", [
						tournament.id,
					]);
					tournaments.push({
						details: tournament,
						fixtures: fixturesRes.rows,
					});
				})
			);

			callback({ success: true, object: true, message: tournaments, collection: collectionName });
		} catch (err) {
			callback({ success: false, object: true, message: err });
		} finally {
			client.release();
		}
	}

	getResults(tournamentId, callback) {
		const sql = "SELECT * FROM fixtures WHERE tournament_id = $1 AND status = 'COMPLETED'";
		this.query(sql, [tournamentId], callback);
	}

	getSavedTournaments(userId, callback) {
		const sql = "SELECT tournament_id FROM saved_tournaments WHERE user_id = $1";
		this.query(sql, [userId], callback);
	}

	getUserCollections(userId, callback) {
		const sql = "SELECT id, name FROM collections WHERE user_id = $1";
		this.query(sql, [userId], callback);
	}

	unfollowTournament(userId, tournamentId, callback) {
		const sql = "DELETE FROM saved_tournaments WHERE user_id = $1 AND tournament_id = $2";
		this.query(sql, [userId, tournamentId], callback);
	}

	updateFixture(fixtureId, score, status, callback) {
		const sql = "UPDATE fixtures SET result = $1, status = $2 WHERE id = $3";
		this.query(sql, [score, status, fixtureId], callback);
	}

	startTournament(tournamentId, userID, callback) {
		const sql = "UPDATE tournaments SET status = 'Ongoing' WHERE id = $1 AND created_by = $2";
		this.query(sql, [tournamentId, userID], callback);
	}

	test() {
		console.log("test");
	}
}

export default DBConnection;
