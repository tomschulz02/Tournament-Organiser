import { progressionService } from "../services/progression.service.js";
import { divisionService } from "../services/divisions.service.js";

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

// The division's full intended team list, plus the structure it should be built
// around. The body is passed through untouched: which of a rename and a rebuild
// this is follows from the data, and that derivation is the service's.
async function updateDivision(req, res) {
    const { divisionId } = req.params;

    const result = await divisionService.updateDivision(divisionId, req.user.id, req.body);

    res.status(200).json({ success: true, message: "Division updated", data: result });
}

// The addTeam, updateTeam and removeTeam stubs were removed on 2026-08-10.
// updateDivision replaces all three — see docs/api.md.

export const divisionController = {
    getProgression,
    commitProgression,
    updateDivision
};
