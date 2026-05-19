import DatabaseConnection from "../config/db";
import { v4 as uuidv4 } from "uuid";

const db = DatabaseConnection();

// fetches all fixtures for a given division, used to display the fixtures in the frontend
async function getFixtures(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1";
        const result = await db.query(sql, [divisionId]);
        
        if (!result.success) return ("GET_FIXTURES_ERROR");
        return result.message;
    } catch (err) {
        return (err.message || "GET_FIXTURES_ERROR");
    }
}

// fetches all completed fixtures for a given division, used to display the results in the frontend
async function getResults(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1 AND status = 'COMPLETED'";
        const result = await db.query(sql, [divisionId]);
        
        if (!result.success) return ("GET_RESULTS_ERROR");
        return result.message;
    } catch (err) {
        return (err.message || "GET_RESULTS_ERROR");
    }
}

// updates the result of a fixture, used to update the result of a fixture in the frontend and for round progression
async function updateResult(fixtureId, score, status, rounds) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const updateRes = await client.query(
            "UPDATE fixtures SET team_1_result = $1, team_2_result = $2, status = $3 WHERE id = $4 RETURNING division_id",
            [score[0], score[1], status, fixtureId]
        );

        if (updateRes.rows.length === 0) {
            return ("FIXTURE_NOT_FOUND");
        }

        await client.query("COMMIT");
        return { message: "Fixture updated" };
    } catch (error) {
        await client.query("ROLLBACK");
        return (error.message || "UPDATE_FIXTURE_ERROR");
    } finally {
        client.release();
    }
}

// used to create the initial fixtures of the division
async function createFixture(divisionId, matchNo, team1, team2, status, team1Score, team2Score){
    const client = await db.pool.connect();
    try{
        await client.query("BEGIN");

        const sql = "INSERT INTO fixtures (id, division_id, match_no, team_1, team_2, status, team_1_result, team_2_result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id";
        const fixtureId = uuidv4();
        const result = await client.query(sql, [fixtureId, divisionId, matchNo, team1, team2, status, team1Score, team2Score]);

        await client.query("COMMIT");
        return result.rows[0].id;
    } catch (error) {
        await client.query("ROLLBACK");
        return (error.message || "CREATE_FIXTURE_ERROR");
    } finally {
        client.release();
    }
}

// used to update the team names in fixtures after a round has been completed
async function updateFixtures(divisionId, fixtures) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        for (const fixture of fixtures) {
            const sql = "UPDATE fixtures SET team_1 = $1, team_2 = $2 WHERE id = $3";
            await client.query(sql, [fixture.team_1, fixture.team_2, fixture.id]);
        }

        await client.query("COMMIT");
        return { message: "Fixtures updated" };
    } catch (error) {
        await client.query("ROLLBACK");
        return (error.message || "UPDATE_FIXTURES_ERROR");
    } finally {
        client.release();
    }
}

export const fixturesRepository = {
    getFixtures,
    getResults,
    updateResult,
    createFixture,
    updateFixtures
};