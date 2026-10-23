import { editorService } from "../services/editors.service.js";
import { AppError } from "../errors.js";
import { isUuid } from "../utils/validation.js";

// Controllers do not catch. Express 5 forwards a rejected promise from an async
// handler to the error middleware, which owns every status and message.
//
// All three are organiser-only; the service checks ownership.

async function listEditors(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await editorService.listEditors(tournamentId, req.user.id);

    res.status(200).json({ success: true, message: "Editors fetched", data });
}

// The body is `{ identifier }` — an email or a username.
async function addEditor(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await editorService.addEditor(tournamentId, req.user.id, req.body?.identifier);

    res.status(201).json({ success: true, message: "Editor added", data });
}

// ?q= is whatever has been typed so far. What it may match is the service's.
async function searchEditorCandidates(req, res) {
    const { tournamentId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }

    const data = await editorService.searchCandidates(tournamentId, req.user.id, req.query?.q);

    res.status(200).json({ success: true, message: "Suggestions fetched", data });
}

async function removeEditor(req, res) {
    const { tournamentId, userId } = req.params;
    if (!isUuid(tournamentId)) {
        throw new AppError("TOURNAMENT_NOT_FOUND");
    }
    // A malformed id can never be an editor's.
    if (!isUuid(userId)) {
        throw new AppError("EDITOR_NOT_FOUND");
    }

    const data = await editorService.removeEditor(tournamentId, req.user.id, userId);

    res.status(200).json({ success: true, message: "Editor removed", data });
}

export const editorController = {
    listEditors,
    addEditor,
    removeEditor,
    searchEditorCandidates
};
