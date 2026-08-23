import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";

const db = DatabaseConnection();

// used for user registration
async function createUser(username, email, password) {
	const client = await db.pool.connect();
	try {
		await client.query("BEGIN");

		const sql = "INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email, admin";
		const result = await client.query(sql, [username, password, email]);
		
		await client.query("COMMIT");
		return result.rows[0];
	} catch (err) {
		await client.query("ROLLBACK");
		// Rethrown with the pg error as cause so the service can tell a unique
		// constraint violation from an unexpected fault. Repositories assign no
		// HTTP meaning and never log — the error middleware does both.
		throw new Error("Failed to insert user", { cause: err });
		/* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
	} finally {
		client.release();
	}
}

// Looks up a user by email. Returns null when there is no match — the caller
// decides how to respond, so that a missing user and a bad password can be
// handled identically.
async function findUserByEmail(email) {
	try {
		const sql = "SELECT * FROM users WHERE email = $1";
		const rows = await db.query(sql, [email]);

		return rows.length > 0 ? rows[0] : null;
	} catch (err) {
		throw new Error("Failed to look up user by email", { cause: err });
	}
}

// used for adding another user as a friend
async function addFriend(userId, friendId) {
	try {
		const sql = "INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)";
		const result = await db.query(sql, [userId, friendId]);
		
		if (!result.success) throw new Error("ADD_FRIEND_ERROR");
		return result.message;
	} catch (err) {
		throw new Error(err.message || "ADD_FRIEND_ERROR");
	}
}

// fetches all friends for a certain user
async function getFriends(userId) {
	try {
		const sql = "SELECT * FROM friends WHERE user_id = $1";
		const result = await db.query(sql, [userId]);
		
		if (!result.success) throw new Error("GET_FRIENDS_ERROR");
		return result.message;
	} catch (err) {
		throw new Error(err.message || "GET_FRIENDS_ERROR");
	}
}

// used to save a tournament to the user's profile, allowing them to easily access it later and receive updates on it
async function joinTournament(userId, tournamentId) {
	try {
		const sql = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES ($1, $2)";
		return await db.query(sql, [userId, tournamentId]);
	} catch (err) {
		throw new Error(err.message || "JOIN_TOURNAMENT_ERROR");
	}
}

// fetches all tournaments that the user has saved to their profile
async function getSavedTournaments(userId) {
	try {
		const sql = "SELECT tournament_id FROM saved_tournaments WHERE user_id = $1";
		return await db.query(sql, [userId]);
	} catch (err) {
		throw new Error(err.message || "GET_SAVED_TOURNAMENTS_ERROR");
	}
}

// used to remove a tournament from the user's saved tournaments
async function unfollowTournament(userId, tournamentId) {
	try {
		const sql = "DELETE FROM saved_tournaments WHERE user_id = $1 AND tournament_id = $2";
		return await db.query(sql, [userId, tournamentId]);
	} catch (err) {
		throw new Error(err.message || "UNFOLLOW_TOURNAMENT_ERROR");
	}
}

export const userRepository = {
	createUser,
	findUserByEmail,
	addFriend,
	getFriends,
	joinTournament,
	getSavedTournaments,
	unfollowTournament
};