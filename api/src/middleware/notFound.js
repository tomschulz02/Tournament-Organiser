import { AppError } from "../errors.js";

// Catch-all for unmatched routes. Sits immediately before the error middleware
// in app.js, so an unknown path produces the standard envelope rather than the
// HTML page Express serves by default.
export function notFound(req, res, next) {
	next(new AppError("ROUTE_NOT_FOUND"));
}
