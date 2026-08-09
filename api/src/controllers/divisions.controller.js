import { progressionService } from "../services/progression.service.js";
import { AppError } from "../errors.js";

// Controllers do not catch. The code-to-status-and-message table that used to
// live here is now the catalogue in src/errors.js, and the error middleware
// applies it.

// Read only. Returns the default ranking and the teams that would qualify, for
// the organiser to review and optionally amend before confirming.
async function getProgression(req, res) {
    const { divisionId } = req.params;
    const proposal = await progressionService.getProposal(divisionId, req.user.id);

    res.status(200).json({ success: true, message: "Progression proposal", data: proposal });
}

// Writes the confirmed ranking and advances the division to the next round.
async function commitProgression(req, res) {
    const { divisionId } = req.params;
    const { teams } = req.body;

    const result = await progressionService.commit(divisionId, req.user.id, teams);

    res.status(200).json({ success: true, message: "Round progressed", data: result });
}

// Declared but not built, like the tournament stubs. The paths are fixed and the
// UI wires to them; each answers 501 through the standard envelope. Team
// membership lives in divisions.state.teams, so implementing these means editing
// state, not a teams table — see docs/division-state.md.

async function addTeam() {
    throw new AppError("NOT_IMPLEMENTED");
}

async function updateTeam() {
    throw new AppError("NOT_IMPLEMENTED");
}

async function removeTeam() {
    throw new AppError("NOT_IMPLEMENTED");
}

export const divisionController = {
    getProgression,
    commitProgression,
    addTeam,
    updateTeam,
    removeTeam
};
