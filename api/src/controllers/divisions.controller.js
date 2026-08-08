import { progressionService } from "../services/progression.service.js";

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

export const divisionController = {
    getProgression,
    commitProgression
};
