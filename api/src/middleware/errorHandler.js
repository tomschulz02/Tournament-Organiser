import { AppError } from "../errors.js";

// JSON is UTF-8 by definition, so a body declaring any other charset is refused
// the same way a body that is not JSON at all is, rather than as a fault. A
// compression body-parser cannot undo gets a message of its own, since "send
// JSON" would not tell the sender what was wrong.
const BODY_PARSER_ERRORS = new Map([
	["entity.parse.failed", "MALFORMED_JSON"],
	["entity.too.large", "PAYLOAD_TOO_LARGE"],
	["charset.unsupported", "UNSUPPORTED_MEDIA_TYPE"],
	["encoding.unsupported", "UNSUPPORTED_CONTENT_ENCODING"]
]);

// The single place a failure becomes a response, and the single place a failure
// is logged. Nothing below this line in the stack catches, so the cause chain
// arrives here intact.
//
// It must take four arguments or Express will register it as an ordinary
// middleware and never reach it. Sits last in app.js, after notFound.
export function errorHandler(err, req, res, next) {
	// The response has already begun, so there is nothing left to send. Hand it
	// to Express, which closes the connection.
	if (res.headersSent) {
		return next(err);
	}

	// body-parser rejects an unparseable, over-size or wrongly encoded body with
	// an error carrying one of these types. All are client mistakes rather than
	// faults, so they earn a 4xx rather than the generic 500 below.
	const parserCode = BODY_PARSER_ERRORS.get(err.type);
	const failure = parserCode ? new AppError(parserCode, { cause: err }) : err;

	// An expected domain failure. It is part of the contract, so its message is
	// safe to return and there is nothing to log.
	if (failure instanceof AppError) {
		return res.status(failure.status).json({
			success: false,
			message: failure.message,
			data: failure.details ?? null
		});
	}

	// An unexpected fault. The detail goes to the log, never to the client.
	// console.error prints the cause chain along with the stack.
	console.error(failure);

	return res.status(500).json({
		success: false,
		message: "Internal server error",
		data: null
	});
}
