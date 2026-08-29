import { fixtureService } from "../services/fixtures.service.js";
import { AppError } from "../errors.js";
import { isUuid } from "../utils/validation.js";

// Controllers do not catch. Express 5 forwards a rejected promise from an async
// handler to the error middleware, which owns every status and message.

// Records a result for one fixture.
//
// The body is `{ sets, finished }` and nothing else. There is deliberately no
// status and no round: both are the server's to decide, and accepting either
// would let the client put the fixture into a state its scores contradict.
async function updateResult(req, res) {
    const { fixtureId } = req.params;
    // A malformed id can never match a row, so it is a 404 rather than a query.
    if (!isUuid(fixtureId)) {
        throw new AppError("FIXTURE_NOT_FOUND");
    }

    const { sets, finished } = req.body;
    // requireAuth guarantees req.user is set on this route.
    const data = await fixtureService.updateResult(fixtureId, req.user.id, sets, finished);

    res.status(200).json({ success: true, message: "Result recorded", data });
}

export const fixtureController = {
    updateResult
};
