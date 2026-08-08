// Single source of truth for expected domain failures.
//
// Two kinds of failure exist. An expected domain failure is part of the API
// contract: it carries a code, an HTTP status and a client-safe message, and it
// is declared here. Everything else is an unexpected fault, is not named, and
// becomes a generic 500 with the detail logged rather than returned.
//
// Services throw an AppError naming a condition; they never name a status. The
// error middleware is the only place that turns a code into a response.
// See docs/decisions.md, "Typed Errors With A Central Handler".

export class AppError extends Error {
	// `cause` carries the underlying failure — a pg error, for instance — so the
	// Postgres code and constraint name survive as far as the log. `details`
	// carries anything the client needs and is surfaced through `data`, because
	// catalogue messages are static.
	constructor(code, { cause, details } = {}) {
		const [status, message] = ERRORS[code] ?? UNKNOWN_CODE;

		super(message, { cause });
		this.name = "AppError";
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

// An unrecognised code is a 500. That is deliberate: a condition nobody declared
// is by definition not an expected domain failure.
const UNKNOWN_CODE = [500, "Internal server error"];

// Messages are display-ready and static. The frontend passes them straight to
// showMessage, so they never contain a code, a SQL fragment, a stack or an
// internal identifier.
export const ERRORS = {
	// Round progression. Generalised from the ERROR_STATUS table that used to
	// live in divisions.controller.js.
	DIVISION_NOT_FOUND: [404, "Division not found"],
	ROUND_NOT_FOUND: [404, "Round not found"],
	NOT_TOURNAMENT_OWNER: [403, "You do not own this tournament"],
	ROUND_NOT_COMPLETE: [409, "This round still has unplayed fixtures"],
	NO_NEXT_ROUND: [409, "This is the final round"],
	NEXT_ROUND_ALREADY_STARTED: [409, "The next round has already started"],
	INVALID_RESULTS: [400, "Invalid results list"],
	WRONG_QUALIFIER_COUNT: [400, "Wrong number of qualifying teams"],
	DUPLICATE_TEAM: [400, "A team appears more than once"],
	TEAM_NOT_IN_ROUND: [400, "A team did not play in this round"],
	FORMAT_NOT_IMPLEMENTED: [400, "This format is not available yet"],
	UNSUPPORTED_FORMAT: [400, "This format is not supported"],

	// Accounts and sessions.
	MISSING_FIELDS: [400, "Missing required fields"],
	PASSWORDS_DO_NOT_MATCH: [400, "Passwords do not match"],
	// One message for both an unknown email and a wrong password, so the
	// response cannot be used to discover which accounts exist.
	INVALID_CREDENTIALS: [401, "Invalid email or password"],
	AUTH_REQUIRED: [401, "You must be logged in to do that"],
	EMAIL_ALREADY_REGISTERED: [409, "That email is already registered"],
	USERNAME_TAKEN: [409, "That username is already taken"],

	// Tournaments.
	TOURNAMENT_NOT_FOUND: [404, "Tournament not found"],
	// One code for both an unknown team id and one belonging to another user, so
	// the response cannot be used to discover which teams exist.
	TEAM_NOT_OWNED: [403, "You do not own one of the selected teams"],

	// Generic.
	MALFORMED_JSON: [400, "Request body is not valid JSON"],
	ROUTE_NOT_FOUND: [404, "Not found"],
	NOT_IMPLEMENTED: [501, "This feature is not available yet"]
};
