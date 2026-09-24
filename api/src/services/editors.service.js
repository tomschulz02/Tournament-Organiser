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
    removeEditor
};
