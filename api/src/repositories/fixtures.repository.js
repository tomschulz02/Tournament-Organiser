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
        // Repositories always throw and never log. The underlying error is kept
        // as cause so the Postgres code survives; the error middleware logs it.
        throw new Error("Failed to fetch fixtures", { cause: err });
    }
}

// fetches all completed fixtures for a given division, used to display the results in the frontend
async function getResults(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1 AND status = 'COMPLETED'";
        const result = await db.query(sql, [divisionId]);
        
        return result;
    } catch (err) {
        throw new Error("Failed to fetch results", { cause: err });
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
        throw new Error("Failed to fetch fixtures by division", { cause: error });
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

        // No such fixture. Returning here without a COMMIT or ROLLBACK left the
        // transaction open until the client was released; it now rolls back.
        if (updateRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return null;
        }

        await client.query("COMMIT");
        return { message: "Fixture updated" };
    } catch (error) {
        await client.query("ROLLBACK");
        throw new Error("Failed to update fixture", { cause: error });
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

// used to create the initial fixtures of the division
async function createFixture(fixtureId, divisionId, matchNo, team1, team2, team1Placeholder, team2Placeholder, round, client = db){
    try{
        const sql = "INSERT INTO fixtures (id, division_id, match_no, team_1, team_2, team_1_placeholder, team_2_placeholder, round) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)";
        await client.query(sql, [fixtureId, divisionId, matchNo, team1, team2, team1Placeholder, team2Placeholder, round]);
    } catch (error) {
        // Previously returned a string, which the caller ignored, so a failed
        // insert was silent.
        throw new Error("Failed to create fixture", { cause: error });
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
        throw new Error("Failed to update fixtures", { cause: error });
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
