import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db";

const db = DatabaseConnection();

async function createDivision(tournamentId, details, userId) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const divisionSql = "INSERT INTO divisions (id, tournament_id, name, num_teams, type, state) VALUES ($1, $2, $3, $4, $5, $6)";
        const divisionId = uuidv4();
        await client.query(divisionSql, [divisionId, tournamentId, details.name, details.num_teams, details.type, '{}']);
        
        await client.query("COMMIT");

        return divisionId;
    } catch (err) {
        await client.query("ROLLBACK");
        throw new Error("DATABASE_ERROR");
    } finally {
        client.release();
    }
}