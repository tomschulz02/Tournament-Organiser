import DatabaseConnection from "../config/db.js";

const db = DatabaseConnection();

// tournament_editors: one row per user granted result entry on one tournament.
// A row is the whole membership — there is no pending state, so adding inserts
// and removing deletes. See docs/database.md.

// The tournament's current editors, oldest first, with the username the
// Settings page shows. Email is deliberately not selected: an editor's address
// is theirs, and the organiser only needed it once, to find them.
async function getEditors(tournamentId) {
    try {
        const sql = `
            SELECT u.id, u.username, e.created_at
            FROM tournament_editors e
            JOIN users u ON u.id = e.user_id
            WHERE e.tournament_id = $1::uuid
            ORDER BY e.created_at ASC`;
        return await db.query(sql, [tournamentId]);
    } catch (err) {
        // Repositories always throw and never log. The underlying error is kept
        // as cause so the Postgres code survives; the error middleware logs it.
        throw new Error("Failed to fetch editors", { cause: err });
    }
}

// Whether this user currently holds an editor row on this tournament.
async function isEditor(tournamentId, userId) {
    try {
        const sql = "SELECT 1 FROM tournament_editors WHERE tournament_id = $1::uuid AND user_id = $2::uuid LIMIT 1";
        const rows = await db.query(sql, [tournamentId, userId]);

        return rows.length > 0;
    } catch (err) {
        throw new Error("Failed to check editor", { cause: err });
    }
}

// The unique index on (tournament_id, user_id) is the real guard against a
// double insert; the service checks first only so it can answer with a message.
async function addEditor(tournamentId, userId) {
    try {
        const sql = "INSERT INTO tournament_editors (tournament_id, user_id) VALUES ($1::uuid, $2::uuid)";
        await db.query(sql, [tournamentId, userId]);
    } catch (err) {
        throw new Error("Failed to add editor", { cause: err });
    }
}

// Returns whether a row went, so the service can refuse removing someone who
// was never an editor rather than reporting a success that changed nothing.
async function removeEditor(tournamentId, userId) {
    try {
        const sql = "DELETE FROM tournament_editors WHERE tournament_id = $1::uuid AND user_id = $2::uuid RETURNING user_id";
        const rows = await db.query(sql, [tournamentId, userId]);

        return rows.length > 0;
    } catch (err) {
        throw new Error("Failed to remove editor", { cause: err });
    }
}

export const editorsRepository = {
    getEditors,
    isEditor,
    addEditor,
    removeEditor
};
