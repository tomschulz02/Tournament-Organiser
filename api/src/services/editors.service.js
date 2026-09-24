import { editorsRepository } from "../repositories/editors.repository.js";
import { tournamentRepository } from "../repositories/tournament.repository.js";
import { userRepository } from "../repositories/users.repository.js";
import { AppError } from "../errors.js";
import { assertText } from "../utils/validation.js";

// A tournament's editors. Every function here is organiser-only: an editor can
// enter results, but who else may do so is the organiser's decision alone.
//
// Membership is immediate in both directions — no invite, no acceptance. The
// schema would take a pending state later without reshaping anything; nothing
// here builds one. See docs/decisions.md.

async function listEditors(tournamentId, userId) {
    await loadOwnedTournament(tournamentId, userId);

    const editors = await editorsRepository.getEditors(tournamentId);

    return editors.map(toEditor);
}

// `identifier` is an email or a username, resolved by the same lookup sign-in
// uses, so an organiser can type whichever of the two they know.
async function addEditor(tournamentId, userId, identifier) {
    const tournament = await loadOwnedTournament(tournamentId, userId);

    // users.email and users.username are both varchar(100).
    assertText(identifier, "identifier", { max: 100 });

    const user = await userRepository.findUserByEmailOrUsername(identifier.trim());
    if (!user) {
        throw new AppError("USER_NOT_FOUND");
    }

    if (user.id === tournament.created_by) {
        throw new AppError("EDITOR_IS_ORGANISER");
    }

    if (await editorsRepository.isEditor(tournamentId, user.id)) {
        throw new AppError("EDITOR_ALREADY_ADDED");
    }

    await editorsRepository.addEditor(tournamentId, user.id);
    // The new editor's view of the tournament changes — they are offered score
    // entry — but nothing the ETag reads has moved. See touchTournament.
    await tournamentRepository.touchTournament(tournamentId);

    return { id: user.id, username: user.username };
}

// Removal takes effect the moment the row is gone. Results the editor already
// entered keep naming them: fixtures.entered_by is not touched.
async function removeEditor(tournamentId, userId, editorId) {
    await loadOwnedTournament(tournamentId, userId);

    const removed = await editorsRepository.removeEditor(tournamentId, editorId);
    if (!removed) {
        throw new AppError("EDITOR_NOT_FOUND");
    }

    await tournamentRepository.touchTournament(tournamentId);

    return { id: editorId };
}

// Suggestions for the "Add an editor" field. Usernames only, and never an email —
// an address is still accepted by addEditor, but only typed out in full, so this
// cannot be used to discover who is registered. See docs/decisions.md.
//
// People the organiser has worked with come first and are offered from the first
// keystroke, since they are already known to them. Everyone else needs a prefix
// of SEARCH_MIN_LENGTH characters, and the route is rate-limited on top.
export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_LIMIT = 5;

async function searchCandidates(tournamentId, userId, query) {
    await loadOwnedTournament(tournamentId, userId);

    const text = typeof query === "string" ? query.trim().toLowerCase() : "";
    // Longer than any username can be, so nothing could match.
    if (text.length > 100) {
        return [];
    }

    const pattern = text ? `${escapeLike(text)}%` : null;
    const workedWith = await editorsRepository.getWorkedWith(userId, tournamentId, pattern, SEARCH_LIMIT);

    let others = [];
    if (text.length >= SEARCH_MIN_LENGTH && workedWith.length < SEARCH_LIMIT) {
        const known = new Set(workedWith.map((user) => user.id));
        const found = await editorsRepository.searchByUsernamePrefix(userId, tournamentId, pattern, SEARCH_LIMIT + workedWith.length);
        others = found.filter((user) => !known.has(user.id)).slice(0, SEARCH_LIMIT - workedWith.length);
    }

    // No ids leave the server: the username is all the client needs to add them.
    return [
        ...workedWith.map((user) => ({ username: user.username, workedWith: true })),
        ...others.map((user) => ({ username: user.username, workedWith: false }))
    ];
}

// The typed text is data, not a pattern: a % or _ in it matches itself.
function escapeLike(text) {
    return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// requireAuth proves the caller is logged in. This proves the tournament is
// theirs — the same check tournaments.service.js's loadOwnedTournament makes.
async function loadOwnedTournament(tournamentId, userId) {
    const tournament = await tournamentRepository.getTournamentById(tournamentId);
    if (!tournament) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    if (tournament.created_by !== userId) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    return tournament;
}

function toEditor(row) {
    return { id: row.id, username: row.username, addedAt: row.created_at ?? null };
}

export const editorService = {
    listEditors,
    addEditor,
    removeEditor,
    searchCandidates
};

export { escapeLike };
