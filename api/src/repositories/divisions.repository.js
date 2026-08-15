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

// updateTeams was removed on 2026-08-10. It wrote state.teams directly, and
// nothing called it: seed order now moves only through updateDivision, which
// rewrites state in full through replaceState.

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
//
// One statement, so it needs no transaction of its own — the same reasoning as
// the lifecycle statements in tournament.repository.js. It takes an optional
// client instead, because a rename is rarely alone: several arrive together from
// PUT /divisions/:divisionId, and during a rebuild they commit with the fixtures
// and the new state.
async function updateTeam(teamId, newTeamName, client = db) {
    try {
        const sql = "UPDATE teams SET name = $1 WHERE id = $2";
        await client.query(sql, [newTeamName, teamId]);

        return { message: "Team updated" };
    } catch (error) {
        throw new Error("Failed to update team", { cause: error });
    }
}

// Moves divisions.last_update without changing anything else.
//
// The tournament view's ETag is the greatest last_update across the tournament
// and its divisions, so a change the reader can see has to move one of them.
// Two writes affect the payload without touching a stamped row: a team rename
// writes only to `teams`, which has no such column, and recording a result on a
// fixture whose round is missing from state skips the state write. Both call
// this so the cached page does not keep showing the old data.
async function touchDivision(divisionId, client = db) {
    try {
        const sql = "UPDATE divisions SET last_update = now() WHERE id = $1::uuid";
        await client.query(sql, [divisionId]);

        return { message: "Division touched" };
    } catch (error) {
        throw new Error("Failed to touch division", { cause: error });
    }
}

// Removes teams by id, for the reconciliation half of a division rebuild.
//
// Requires the client: the rows the fixtures referenced have to go in the same
// transaction that deleted those fixtures, or the foreign key stops the delete.
async function deleteTeamsByIds(teamIds, client) {
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return { message: "No teams removed" };
    }

    try {
        const sql = "DELETE FROM teams WHERE id = ANY($1::uuid[]);";
        await client.query(sql, [teamIds]);

        return { message: "Teams removed" };
    } catch (error) {
        throw new Error("Failed to remove teams", { cause: error });
    }
}

// Replaces divisions.state outright, together with the stored team count.
//
// Wider than updateStateRounds and updateRounds, which patch parts of state. A
// rebuild regenerates every round from a different set of teams, so there is
// nothing in the old object worth merging into.
async function replaceState(divisionId, state, numTeams, client) {
    try {
        const sql = "UPDATE divisions SET state = $1::jsonb, num_teams = $2, last_update = now() WHERE id = $3::uuid";
        await client.query(sql, [JSON.stringify(state), numTeams, divisionId]);

        return { message: "Division rebuilt" };
    } catch (error) {
        throw new Error("Failed to replace division state", { cause: error });
    }
}

// updateGroups was removed on 2026-08-10 — known bug B6. It took a `fixtures`
// parameter it ignored and rewrote state.rounds[0].groups without regenerating
// the fixtures those groups no longer matched, and nothing called it. Group
// composition now changes only through updateDivision, which regenerates.

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
//
// The tournament's status comes back as tournament_status rather than status,
// because divisions carry no status of their own and a bare `status` here would
// read as though they did. It is the first half of the rebuild gate.
async function getDivisionWithOwner(divisionId) {
    try {
        const sql = `
            SELECT d.id, d.tournament_id, d.name, d.type, d.state, t.created_by, t.status AS tournament_status
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

// getDivisionDetails was removed on 2026-08-10, the last of the dead repository
// functions. Nothing called it, and what it did — divisions for a tournament,
// each with its fixtures — is getDivisionsByTournamentId plus
// getFixturesByDivisionIds, which is how the view actually assembles it. Its
// per-division fixture loop was also a query per division on its own client.

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
    updateTeam,
    touchDivision,
    deleteTeamsByIds,
    replaceState,
    updateRounds,
    getStateForUpdate,
    updateStateRounds,
    getDivisionWithOwner,
    getTeamsByIds,
    getFixturesByDivisionId,
    getDivisionsByTournamentId,
    createTeam
};
