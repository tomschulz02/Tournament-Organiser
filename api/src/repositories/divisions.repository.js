import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";

const db = DatabaseConnection();

// function used to create the division for a tournament based on user input
// returns the id of the created division, which is used to link fixtures to the division and for future updates to the division
async function createDivision(divisionId, tournamentId, details, userId, client = db) {
    try {

        const divisionSql = "INSERT INTO divisions (id, tournament_id, name, num_teams, type, state) VALUES ($1, $2, $3, $4, $5, $6)";
        await client.query(divisionSql, [divisionId, tournamentId, details.name, details.num_teams, details.type, details.state || JSON.stringify({})]);
        
        return divisionId;
    } catch (err) {
        console.log('DIVISION_ERROR: ', err);
        
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
        
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        return (err.message || "UPDATE_TEAMS_ERROR");
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

// used to create a new team
async function createTeam(name, divisionId){
    try {
        const teamId = uuidv4();
        await db.query('INSERT INTO teams (id, name, division_id) VALUES ($1, $2, $3);', [teamId, name, divisionId]);

        return teamId;
    } catch (error) {
        throw new Error('TEAM_CREATION_ERROR_DB');
    }
}

// fetch team name by id
async function getTeamNames(divisionId){
    try {
        const result = await db.query('SELECT id, name FROM teams WHERE division_id=$1;', [divisionId]);

        return result;
    } catch (error){
        throw new Error('TEAM_FETCH_ERROR_DB');
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
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
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
        console.error(error);
        throw new Error("UPDATE_GROUPS_ERROR");
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
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

        // divisions.id is a uuid. This previously cast to INTEGER and threw on every call.
        await client.query(
            `UPDATE divisions SET state = jsonb_set(jsonb_set(state, '{rounds}', $1::jsonb), '{currentRound}', $2::jsonb), last_update = now() WHERE id = $3::uuid`,
            [JSON.stringify(updatedRounds), JSON.stringify(nextRound), divisionId]
        );

        await client.query("COMMIT");
        return { message: "Round progressed" };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        throw new Error("UPDATE_ROUNDS_ERROR");
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

// Fetches a division together with the id of the user who owns its tournament,
// so the service can authorise before mutating anything.
async function getDivisionWithOwner(divisionId) {
    try {
        const sql = `
            SELECT d.id, d.tournament_id, d.name, d.state, d.schedule, t.created_by
            FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = $1::uuid`;
        const rows = await db.query(sql, [divisionId]);

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error(error);
        throw new Error("GET_DIVISION_ERROR");
    }
}

// Looks up teams by their ids, taken from state.teams.
//
// The teams table has no division_id column — division membership lives in
// divisions.state.teams. getTeamsByDivisionIds and getTeamNames still query a
// division_id that does not exist; see docs/known-limitations.md.
async function getTeamsByIds(teamIds) {
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return [];
    }

    try {
        const sql = "SELECT id, name FROM teams WHERE id = ANY($1::uuid[]);";
        return await db.query(sql, [teamIds]);
    } catch (error) {
        console.error(error);
        throw new Error("GET_TEAMS_ERROR");
    }
}

async function getFixturesByDivisionId(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1::uuid ORDER BY match_no ASC;";
        return await db.query(sql, [divisionId]);
    } catch (error) {
        console.error(error);
        throw new Error("GET_FIXTURES_ERROR");
    }
}

// Persists a schedule to the dedicated jsonb column added 2026-08-07.
async function updateSchedule(divisionId, schedule) {
    try {
        const sql = "UPDATE divisions SET schedule = $1::jsonb, last_update = now() WHERE id = $2::uuid";
        await db.query(sql, [JSON.stringify(schedule), divisionId]);

        return { message: "Schedule updated" };
    } catch (error) {
        console.error(error);
        throw new Error("UPDATE_SCHEDULE_ERROR");
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
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

async function getDivisionsByTournamentId(tournamentId) {
    try {
        const sql = "SELECT * FROM divisions WHERE tournament_id = $1 ORDER BY name ASC;";
        return await db.query(sql, [tournamentId]);
    } catch (error) {
        throw new Error(error.message || "GET_DIVISIONS_ERROR");
    }
}

async function getTeamsByDivisionIds(divisionIds) {
    if (!Array.isArray(divisionIds) || divisionIds.length === 0) {
        return [];
    }

    try {
        const sql = "SELECT * FROM teams WHERE division_id = ANY($1::uuid[]) ORDER BY division_id, name ASC;";
        return await db.query(sql, [divisionIds]);
    } catch (error) {
        throw new Error(error.message || "GET_TEAMS_ERROR");
    }
}

export const divisionsRepository = {
    createDivision,
    updateTeams,
    updateTeam,
    updateGroups,
    updateRounds,
    getDivisionDetails,
    getDivisionWithOwner,
    getTeamsByIds,
    getFixturesByDivisionId,
    updateSchedule,
    getDivisionsByTournamentId,
    getTeamsByDivisionIds,
    createTeam,
    getTeamNames
};
