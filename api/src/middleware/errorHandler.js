import { AppError } from "../errors.js";

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

	// body-parser rejects an unparseable body with a SyntaxError carrying this
	// type. It is a client mistake rather than a fault, so it earns a 400 rather
	// than the generic 500 below.
	const failure = err.type === "entity.parse.failed" ? new AppError("MALFORMED_JSON", { cause: err }) : err;

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
