import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";

const db = DatabaseConnection();

// function used to create the division for a tournament based on user input
// returns the id of the created division, which is used to link fixtures to the division and for future updates to the division
async function createDivision(tournamentId, details, userId, client = db) {
    try {

        const divisionSql = "INSERT INTO divisions (id, tournament_id, name, num_teams, type, state) VALUES ($1, $2, $3, $4, $5, $6)";
        const divisionId = uuidv4();
        await client.query(divisionSql, [divisionId, tournamentId, details.name, details.num_teams, details.type, details.state || JSON.stringify({})]);
        
        return divisionId;
    } catch (err) {
        throw new Error(err.message ||"DATABASE_ERROR");
    }
}

// updates the order of the teams stored in the list of the state column of the division
// to update team names use function updateTeam
async function updateTeams(divisionId, userId, teams) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");
        
        const sql = "UPDATE divisions SET state = jsonb_set(state, '{teams}', $1::jsonb) WHERE id = $2 RETURNING num_groups";
        const result = await client.query(sql, [JSON.stringify(teams), divisionId]);
        
        if (!result.success) return ("UPDATE_TEAMS_ERROR");
        await client.query("COMMIT");
        return result.message;
    } catch (err) {
        await client.query("ROLLBACK");
        return (err.message || "UPDATE_TEAMS_ERROR");
    } finally {
        client.release();
    }
}

// used to update the name of a specific team
async function updateTeam(teamId, newTeamName) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const sql = "UPDATE teams SET name = $1 WHERE id = $2";
        await client.query(sql, [newTeamName, teamId]);

        await client.query("COMMIT");
        return { message: "Team updated" };
    } catch (error) {
        await client.query("ROLLBACK");
        return (error.message || "UPDATE_TEAM_ERROR");
    } finally {
        client.release();
    }
}

// updates the groups for the division, which are stored in the state column of the division as a json object
// this update will only trigger before the tournament has started when the user changes the teams of the division
async function updateGroups(divisionId, userId, groups, fixtures) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            "UPDATE divisions SET state = jsonb_set(state, '{rounds,0,groups}', $1::jsonb) WHERE id=$2;",
            [JSON.stringify(groups), divisionId]
        );        

        await client.query("COMMIT");
        return { message: "Updated groups" };
    } catch (error) {
        await client.query("ROLLBACK");
        return (error.message || "UPDATE_GROUPS_ERROR");
    } finally {
        client.release();
    }
}

// used for round progression, updates the rounds and currentRound values in the state object of the division
// also used for updating number of completed games in a round when fixtures are updated
async function updateRounds(divisionId, userId, updatedRounds, updatedFixtures, nextRound) {
    const client = await db.pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `UPDATE divisions SET state = jsonb_set(jsonb_set(state, '{rounds}', $1::jsonb), '{currentRound}', $2::jsonb) WHERE id=$3::INTEGER`,
            [JSON.stringify(updatedRounds), JSON.stringify(nextRound), divisionId]
        );

        await client.query("COMMIT");
        return { message: "Round progressed" };
    } catch (error) {
        await client.query("ROLLBACK");
        return (error.message || "UPDATE_ROUNDS_ERROR");
    } finally {
        client.release();
    }
}

async function getDivisionDetails(tournamentId) {
    const client = await db.pool.connect();
    try {
        const details = {};

        const divisionsRes = await client.query("SELECT * FROM divisions WHERE tournament_id = $1", [tournamentId]);
        if (divisionsRes.rows.length === 0) {
            return ("DIVISIONS_NOT_FOUND");
        }

        details.divisions = divisionsRes.rows.map(division => ({
            ...division,
            fixtures: []
        }));

        for (let i = 0; i < details.divisions.length; i++) {
            const fixturesRes = await client.query("SELECT * FROM fixtures WHERE division_id = $1 ORDER BY match_no", [details.divisions[i].id]);
            details.divisions[i].fixtures = fixturesRes.rows;
        }

        return details;
    } catch (err) {
        return (err.message || "GET_DIVISION_DETAILS_ERROR");
    } finally {
        client.release();
    }
}

export const divisionsRepository = {
    createDivision,
    updateTeams,
    updateTeam,
    updateGroups,
    updateRounds,
    getDivisionDetails
};