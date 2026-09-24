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
// organiser's intent — it is never taken from the client. `enteredBy` is the
// user making the write, organiser or editor, and replaces whoever wrote last.
//
// `client` is required, not defaulted: a result is only ever written alongside
// the division's completedGames count, and the two have to commit together. The
// service owns that transaction, as it does for tournament creation.
async function updateResult(fixtureId, score, status, client, enteredBy) {
    try {
        const sql = "UPDATE fixtures SET team_1_result = $1, team_2_result = $2, status = $3, entered_by = $5::uuid WHERE id = $4::uuid";
        await client.query(sql, [score[0], score[1], status, fixtureId, enteredBy]);

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

// Deletes every fixture of one division and returns the ids that went, because
// tournaments.schedule references them and the caller has to know which entries
// to drop.
//
// Requires the client: the deletion, the team reconciliation that follows it and
// the schedule repair are one transaction. See divisionService.updateDivision.
async function deleteByDivisionId(divisionId, client) {
    try {
        const sql = "DELETE FROM fixtures WHERE division_id = $1::uuid RETURNING id;";
        const result = await client.query(sql, [divisionId]);

        return result.rows.map((row) => row.id);
    } catch (error) {
        throw new Error("Failed to delete fixtures", { cause: error });
    }
}

// Moves a knockout fixture to a new slot in a redrawn bracket: its number, its
// round name and its placeholders. The id — what the schedule references — is
// the point of keeping the row. Requires the client: it commits with the rest of
// the redraw. See divisionService.updateDivisionSettings.
async function updateFixtureSlot(fixtureId, matchNo, round, team1Placeholder, team2Placeholder, client) {
    try {
        const sql = "UPDATE fixtures SET match_no = $1, round = $2, team_1_placeholder = $3, team_2_placeholder = $4 WHERE id = $5::uuid";
        await client.query(sql, [matchNo, round, team1Placeholder, team2Placeholder, fixtureId]);
    } catch (error) {
        throw new Error("Failed to move fixture", { cause: error });
    }
}

// Deletes the named fixtures. An empty list needs no query.
async function deleteByIds(fixtureIds, client) {
    if (!Array.isArray(fixtureIds) || fixtureIds.length === 0) {
        return;
    }

    try {
        const sql = "DELETE FROM fixtures WHERE id = ANY($1::uuid[]);";
        await client.query(sql, [fixtureIds]);
    } catch (error) {
        throw new Error("Failed to delete fixtures", { cause: error });
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
    deleteByDivisionId,
    deleteByIds,
    updateFixtureSlot,
    updateFixtures
};
