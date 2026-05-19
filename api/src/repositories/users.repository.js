import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db";

const db = DatabaseConnection();
const saltRounds = 10;

// used for user registration
async function createUser(username, email, password) {
	const client = await db.pool.connect();
	try {
		await client.query("BEGIN");

		const sql = "INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email";
		const result = await client.query(sql, [username, password, email]);
		
		await client.query("COMMIT");
		return result.message[0];
	} catch (err) {
		await client.query("ROLLBACK");
		return (err.message || "USER_CREATION_ERROR");
	} finally {
		client.release();
	}
}

// user login
async function loginUser(username, password) {
	try {
		const sql = "SELECT * FROM users WHERE email = $1";
		const result = await db.query(sql, [username]);
		
		if (!result.success || result.message.length === 0) {
			return ("USER_NOT_FOUND");
		}

		const user = result.message[0];
		const isMatch = await bcrypt.compare(password, user.password);
		
		if (!isMatch) {
			return ("INCORRECT_PASSWORD");
		}

		return user;
	} catch (err) {
		return (err.message || "LOGIN_ERROR");
	}
}

// used for adding another user as a friend
async function addFriend(userId, friendId) {
	try {
		const sql = "INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)";
		const result = await db.query(sql, [userId, friendId]);
		
		if (!result.success) return ("ADD_FRIEND_ERROR");
		return result.message;
	} catch (err) {
		return (err.message || "ADD_FRIEND_ERROR");
	}
}

// fetches all friends for a certain user
async function getFriends(userId) {
	try {
		const sql = "SELECT * FROM friends WHERE user_id = $1";
		const result = await db.query(sql, [userId]);
		
		if (!result.success) return ("GET_FRIENDS_ERROR");
		return result.message;
	} catch (err) {
		return (err.message || "GET_FRIENDS_ERROR");
	}
}

// used to save a tournament to the user's profile, allowing them to easily access it later and receive updates on it
async function joinTournament(userId, tournamentId) {
	try {
		const sql = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES ($1, $2)";
		const result = await db.query(sql, [userId, tournamentId]);
		
		if (!result.success) return ("JOIN_TOURNAMENT_ERROR");
		return result.message;
	} catch (err) {
		return (err.message || "JOIN_TOURNAMENT_ERROR");
	}
}

// fetches all tournaments that the user has saved to their profile
async function getSavedTournaments(userId) {
	try {
		const sql = "SELECT tournament_id FROM saved_tournaments WHERE user_id = $1";
		const result = await db.query(sql, [userId]);
		
		if (!result.success) return ("GET_SAVED_TOURNAMENTS_ERROR");
		return result.message;
	} catch (err) {
		return (err.message || "GET_SAVED_TOURNAMENTS_ERROR");
	}
}

// used to remove a tournament from the user's saved tournaments
async function unfollowTournament(userId, tournamentId) {
	try {
		const sql = "DELETE FROM saved_tournaments WHERE user_id = $1 AND tournament_id = $2";
		const result = await db.query(sql, [userId, tournamentId]);
		
		if (!result.success) return ("UNFOLLOW_TOURNAMENT_ERROR");
		return result.message;
	} catch (err) {
		return (err.message || "UNFOLLOW_TOURNAMENT_ERROR");
	}
}

export const userRepository = {
	createUser,
	loginUser,
	addFriend,
	getFriends,
	joinTournament,
	getSavedTournaments,
	unfollowTournament
};