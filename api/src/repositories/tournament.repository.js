import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db";

const db = DatabaseConnection();

async function createTournament(details, userId) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");
        const tournamentId = uuidv4();
        
        const tournamentSql = "INSERT INTO tournaments (id, name, location, start_date, end_date, created_by, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";
        const result = await client.query(tournamentSql, [tournamentId, details.name, details.location, details.start_date, details.end_date, userId, details.description]);

        await client.query("COMMIT");
        return {tournamentId};
    } catch (err) {
        await client.query("ROLLBACK");
        throw new Error("DATABASE_ERROR");
    } finally {
        client.release();
    }
}
