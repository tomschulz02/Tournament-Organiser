import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";

const db = DatabaseConnection();

// creates the tournament from the user input in the frontend
async function createTournament(details, userId, client = db) {
    try {
        const tournamentId = uuidv4();
        
        const tournamentSql = "INSERT INTO tournaments (id, name, location, start_date, end_date, created_by, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";
        const result = await client.query(tournamentSql, [tournamentId, details.name, details.location, details.start_date, details.end_date, userId, details.description]);

        return { tournamentId };
    } catch (err) {
        console.log(err)
        throw new Error(err.message || "DATABASE_ERROR");
    }
}

// fetches info on all tournaments for the browse page in the frontend
async function getAllTournaments() {
    try {
        const sql = "SELECT * FROM tournaments;";
        const result = await db.query(sql, []);
        
        return result;
    } catch (err) {
        return (err.message || "GET_TOURNAMENTS_ERROR");
    }
}

async function getTournamentById(tournamentId) {
    try {
        const sql = "SELECT * FROM tournaments WHERE id = $1 LIMIT 1;";
        const result = await db.query(sql, [tournamentId]);

        return result[0] || null;
    } catch (err) {
        throw new Error(err.message || "GET_TOURNAMENT_ERROR");
    }
}

// starts the tournament
async function startTournament(tournamentId, userId) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const sql = "UPDATE tournaments SET status = 'Ongoing' WHERE id = $1 AND created_by = $2";
        const result = await client.query(sql, [tournamentId, userId]);
        
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        return (err.message || "START_TOURNAMENT_ERROR");
    } finally {
        client.release();
    }
}

// used to end the tournament and stop any further updates to the tournament
async function endTournament(tournamentId, userId) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const sql = "UPDATE tournaments SET status = 'Finished' WHERE id = $1 AND created_by = $2";
        const result = await client.query(sql, [tournamentId, userId]);

        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        return (err.message || "END_TOURNAMENT_ERROR");
    } finally {
        client.release();
    }
}

// used to delete the tournament
async function deleteTournament(tournamentId, userId) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const sql = "DELETE FROM tournaments WHERE id = $1 AND created_by = $2";
        const result = await client.query(sql, [tournamentId, userId]);

        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        return (err.message || "DELETE_TOURNAMENT_ERROR");
    } finally {
        client.release();
    }
}

export const tournamentRepository = {
    createTournament,
    getAllTournaments,
    getTournamentById,
    startTournament,
    endTournament,
    deleteTournament
};
