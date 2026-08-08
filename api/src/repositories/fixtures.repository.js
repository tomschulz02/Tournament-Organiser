import DatabaseConnection from "../config/db.js";
import { v4 as uuidv4 } from "uuid";

const db = DatabaseConnection();

// fetches all fixtures for a given division, used to display the fixtures in the frontend
async function getFixtures(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1";
        const result = await db.query(sql, [divisionId]);
        
        return result;
    } catch (err) {
        return (err.message || "GET_FIXTURES_ERROR");
    }
}

// fetches all completed fixtures for a given division, used to display the results in the frontend
async function getResults(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1 AND status = 'COMPLETED'";
        const result = await db.query(sql, [divisionId]);
        
        return result;
    } catch (err) {
        return (err.message || "GET_RESULTS_ERROR");
    }
}

async function getFixturesByDivisionIds(divisionIds) {
    if (!Array.isArray(divisionIds) || divisionIds.length === 0) {
        return [];
    }

    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = ANY($1::uuid[]) ORDER BY division_id, match_no ASC;";
        return await db.query(sql, [divisionIds]);
    } catch (error) {
        throw new Error(error.message || "GET_FIXTURES_BY_DIVISION_IDS_ERROR");
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
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

// used to create the initial fixtures of the division
async function createFixture(fixtureId, divisionId, matchNo, team1, team2, team1Placeholder, team2Placeholder, round, client = db){
    try{
        const sql = "INSERT INTO fixtures (id, division_id, match_no, team_1, team_2, team_1_placeholder, team_2_placeholder, round) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)";
        const result = await client.query(sql, [fixtureId, divisionId, matchNo, team1, team2, team1Placeholder, team2Placeholder, round]);
    } catch (error) {
        return (error.message || "CREATE_FIXTURE_ERROR");
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
        console.error(error);
        throw new Error("UPDATE_FIXTURES_ERROR");
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

export const fixturesRepository = {
    getFixtures,
    getResults,
    getFixturesByDivisionIds,
    updateResult,
    createFixture,
    updateFixtures
};
