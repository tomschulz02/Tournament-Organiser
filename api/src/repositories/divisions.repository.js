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
        // Repositories always throw and never log. The underlying error is kept
        // as cause so the Postgres code survives; the error middleware logs it.
        throw new Error("Failed to create division", { cause: err });
    }
}

// updates the order of the teams stored in the list of the state column of the division
// to update team names use function updateTeam
async function updateTeams(divisionId, userId, teams) {
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");
        
        // No RETURNING: divisions has no num_groups column — group count is
        // derived from state.rounds[].groups.
        const sql = "UPDATE divisions SET state = jsonb_set(state, '{teams}', $1::jsonb) WHERE id = $2";
        await client.query(sql, [JSON.stringify(teams), divisionId]);

        await client.query("COMMIT");
        return { message: "Teams updated" };
    } catch (err) {
        await client.query("ROLLBACK");
        throw new Error("Failed to update teams", { cause: err });
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

// used to create a new team
//
// Takes the id rather than generating one, like createFixture. The service has
// to know every team id before it can build state.teams, but a team row cannot
// be written until its division exists — division_teams_fkey. Generating the id
// here would force those two facts into conflict.
async function createTeam(teamId, name, divisionId, client = db){
    try {
        await client.query('INSERT INTO teams (id, name, division_id) VALUES ($1, $2, $3);', [teamId, name, divisionId]);

        return teamId;
    } catch (error) {
        throw new Error("Failed to create team", { cause: error });
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
        throw new Error("Failed to update team", { cause: error });
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
        throw new Error("Failed to update groups", { cause: error });
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
        throw new Error("Failed to update rounds", { cause: error });
        /* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
    } finally {
        client.release();
    }
}

// Reads divisions.state for a read-modify-write, taking a row lock so two
// results recorded at once cannot each overwrite the other's completedGames.
//
// `client` is required: locking outside the transaction that does the write
// would release the lock immediately and achieve nothing.
async function getStateForUpdate(divisionId, client) {
    try {
        const sql = "SELECT state FROM divisions WHERE id = $1::uuid FOR UPDATE";
        const result = await client.query(sql, [divisionId]);

        return result.rows.length > 0 ? result.rows[0].state : null;
    } catch (error) {
        throw new Error("Failed to fetch division state", { cause: error });
    }
}

// Replaces state.rounds wholesale. Narrower than updateRounds, which also moves
// currentRound — recording a result advances no rounds.
async function updateStateRounds(divisionId, rounds, client) {
    try {
        const sql = "UPDATE divisions SET state = jsonb_set(state, '{rounds}', $1::jsonb), last_update = now() WHERE id = $2::uuid";
        await client.query(sql, [JSON.stringify(rounds), divisionId]);

        return { message: "Rounds updated" };
    } catch (error) {
        throw new Error("Failed to update rounds", { cause: error });
    }
}

// Fetches a division together with the id of the user who owns its tournament,
// so the service can authorise before mutating anything.
async function getDivisionWithOwner(divisionId) {
    try {
        const sql = `
            SELECT d.id, d.tournament_id, d.name, d.state, t.created_by
            FROM divisions d
            JOIN tournaments t ON t.id = d.tournament_id
            WHERE d.id = $1::uuid`;
        const rows = await db.query(sql, [divisionId]);

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        throw new Error("Failed to fetch division", { cause: error });
    }
}

// Looks up teams by their ids, taken from state.teams.
//
// Both teams.division_id and state.teams express membership. state.teams is
// authoritative for order — seeding is the whole reason it is an array — so
// resolution goes through the ids it holds rather than through division_id.
// A query by division_id would come back in no particular order. See
// docs/division-state.md.
async function getTeamsByIds(teamIds) {
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return [];
    }

    try {
        const sql = "SELECT id, name, division_id FROM teams WHERE id = ANY($1::uuid[]);";
        return await db.query(sql, [teamIds]);
    } catch (error) {
        throw new Error("Failed to fetch teams", { cause: error });
    }
}

async function getFixturesByDivisionId(divisionId) {
    try {
        const sql = "SELECT * FROM fixtures WHERE division_id = $1::uuid ORDER BY match_no ASC;";
        return await db.query(sql, [divisionId]);
    } catch (error) {
        throw new Error("Failed to fetch fixtures", { cause: error });
    }
}

async function getDivisionDetails(tournamentId) {
    const client = await db.pool.connect();
    try {
        const details = {};

        const divisionsRes = await client.query("SELECT * FROM divisions WHERE tournament_id = $1", [tournamentId]);
        // A tournament with no divisions is an empty collection, not a missing
        // one. The caller decides whether that is a problem; the repository
        // assigns no meaning to it, the same as getDivisionsByTournamentId.
        if (divisionsRes.rows.length === 0) {
            return { divisions: [] };
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
        throw new Error("Failed to fetch division details", { cause: err });
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
        throw new Error("Failed to fetch divisions", { cause: error });
    }
}

export const divisionsRepository = {
    createDivision,
    updateTeams,
    updateTeam,
    updateGroups,
    updateRounds,
    getStateForUpdate,
    updateStateRounds,
    getDivisionDetails,
    getDivisionWithOwner,
    getTeamsByIds,
    getFixturesByDivisionId,
    getDivisionsByTournamentId,
    createTeam
};
