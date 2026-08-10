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
        // Repositories always throw and never log. The underlying error is kept
        // as cause so the Postgres code survives; the error middleware logs it.
        throw new Error("Failed to create tournament", { cause: err });
    }
}

// fetches info on all tournaments for the browse page in the frontend
async function getAllTournaments() {
    try {
        const sql = "SELECT * FROM tournaments;";
        const result = await db.query(sql, []);

        return result;
    } catch (err) {
        throw new Error("Failed to fetch tournaments", { cause: err });
    }
}

async function getTournamentById(tournamentId) {
    try {
        const sql = "SELECT * FROM tournaments WHERE id = $1 LIMIT 1;";
        const result = await db.query(sql, [tournamentId]);

        return result[0] || null;
    } catch (err) {
        throw new Error("Failed to fetch tournament", { cause: err });
    }
}

// The three lifecycle statements. Each is a single statement, so none of them
// needs a transaction of its own, and none of them filters on created_by:
// ownership is the service's to decide, because a repository that returns zero
// rows cannot say whether the tournament was missing or simply someone else's.
// See docs/decisions.md.

// starts the tournament
async function startTournament(tournamentId) {
    try {
        const sql = "UPDATE tournaments SET status = 'Ongoing' WHERE id = $1";
        await db.query(sql, [tournamentId]);

        return { message: "Tournament started" };
    } catch (err) {
        throw new Error("Failed to start tournament", { cause: err });
    }
}

// used to end the tournament and stop any further updates to the tournament
async function endTournament(tournamentId) {
    try {
        const sql = "UPDATE tournaments SET status = 'Finished' WHERE id = $1";
        await db.query(sql, [tournamentId]);

        return { message: "Tournament ended" };
    } catch (err) {
        throw new Error("Failed to end tournament", { cause: err });
    }
}

// used to delete the tournament. Divisions, fixtures and saved rows go with it
// through the schema's cascades — see docs/database.md.
async function deleteTournament(tournamentId) {
    try {
        const sql = "DELETE FROM tournaments WHERE id = $1";
        await db.query(sql, [tournamentId]);

        return { message: "Tournament deleted" };
    } catch (err) {
        throw new Error("Failed to delete tournament", { cause: err });
    }
}

// Persists a schedule to tournaments.schedule.
//
// A schedule is tournament-wide, not per-division: divisions share the same
// physical courts, so scheduling them independently could double-book one.
// This moved here from the divisions repository on 2026-08-08; there is no
// last_update column on tournaments to stamp.
async function updateSchedule(tournamentId, schedule) {
    try {
        const sql = "UPDATE tournaments SET schedule = $1::jsonb WHERE id = $2::uuid";
        await db.query(sql, [JSON.stringify(schedule), tournamentId]);

        return { message: "Schedule updated" };
    } catch (error) {
        throw new Error("Failed to update schedule", { cause: error });
    }
}

export const tournamentRepository = {
    createTournament,
    getAllTournaments,
    getTournamentById,
    startTournament,
    endTournament,
    deleteTournament,
    updateSchedule
};
