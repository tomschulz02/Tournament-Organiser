import { progressionService } from "../services/progression.service.js";

// Maps service error names to HTTP responses. Anything not listed is a 500.
const ERROR_STATUS = {
    DIVISION_NOT_FOUND: [404, "Division not found"],
    ROUND_NOT_FOUND: [404, "Round not found"],
    NOT_TOURNAMENT_OWNER: [403, "You do not own this tournament"],
    ROUND_NOT_COMPLETE: [409, "This round still has unplayed fixtures"],
    NO_NEXT_ROUND: [409, "This is the final round"],
    NEXT_ROUND_ALREADY_STARTED: [409, "The next round has already started"],
    INVALID_RESULTS: [400, "Invalid results list"],
    WRONG_QUALIFIER_COUNT: [400, "Wrong number of qualifying teams"],
    DUPLICATE_TEAM: [400, "A team appears more than once"],
    TEAM_NOT_IN_ROUND: [400, "A team did not play in this round"]
};

function sendError(res, err) {
    const mapped = ERROR_STATUS[err.message];
    if (mapped) {
        return res.status(mapped[0]).json({ error: mapped[1] });
    }

    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
}

// Read only. Returns the default ranking and the teams that would qualify, for
// the organiser to review and optionally amend before confirming.
async function getProgression(req, res) {
    try {
        const { divisionId } = req.params;
        const proposal = await progressionService.getProposal(divisionId, req.user.id);

        res.status(200).json({ success: true, message: "Progression proposal", data: proposal });
    } catch (err) {
        sendError(res, err);
    }
}

// Writes the confirmed ranking and advances the division to the next round.
async function commitProgression(req, res) {
    try {
        const { divisionId } = req.params;
        const { teams } = req.body;

        const result = await progressionService.commit(divisionId, req.user.id, teams);

        res.status(200).json({ success: true, message: "Round progressed", data: result });
    } catch (err) {
        sendError(res, err);
    }
}

export const divisionController = {
    getProgression,
    commitProgression
};
