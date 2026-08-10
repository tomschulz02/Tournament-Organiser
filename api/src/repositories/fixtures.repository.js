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

// Fetches a fixture together with the tournament it belongs to and that
// tournament's owner, so the service can authorise before mutating anything.
// The tournament-level counterpart is tournamentRepository.getTournamentById;
// this is the fixture-level one, joining fixtures to divisions to tournaments.
async function getFixtureWithOwner(fixtureId) {
    try {
        const sql = `
            SELECT f.*, d.tournament_id, t.created_by
            FROM fixtures f
            JOIN divisions d ON d.id = f.division_id
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE f.id = $1::uuid`;
        const rows = await db.query(sql, [fixtureId]);

        return rows[0] || null;
    } catch (error) {
        throw new Error("Failed to fetch fixture", { cause: error });
    }
}

// Writes a result. The status is decided by the service from the scores and the
// organiser's intent — it is never taken from the client.
//
// `client` is required, not defaulted: a result is only ever written alongside
// the division's completedGames count, and the two have to commit together. The
// service owns that transaction, as it does for tournament creation.
async function updateResult(fixtureId, score, status, client) {
    try {
        const sql = "UPDATE fixtures SET team_1_result = $1, team_2_result = $2, status = $3 WHERE id = $4::uuid";
        await client.query(sql, [score[0], score[1], status, fixtureId]);

        return { message: "Fixture updated" };
    } catch (error) {
        throw new Error("Failed to update fixture", { cause: error });
    }
}

// Counts the finished fixtures of one round, for divisions.state's
// completedGames. Recounted rather than incremented: an increment is wrong the
// moment a result is edited rather than added.
//
// Takes round names rather than one name because the Finals round holds the
// third-place playoff as well, under its own name. Requires the client so the
// count sees the result written earlier in the same transaction.
async function countCompletedInRounds(divisionId, roundNames, client) {
    try {
        const sql = `
            SELECT count(*)::int AS completed
            FROM fixtures
            WHERE division_id = $1::uuid AND round = ANY($2::text[]) AND status = 'COMPLETED'`;
        const result = await client.query(sql, [divisionId, roundNames]);

        return result.rows[0].completed;
    } catch (error) {
        throw new Error("Failed to count completed fixtures", { cause: error });
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
    getFixtureWithOwner,
    updateResult,
    countCompletedInRounds,
    createFixture,
    updateFixtures
};
