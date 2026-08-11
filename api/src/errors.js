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
	// Editing a division's teams. A team id the caller sends has to be one this
	// division already holds — otherwise the request either names a team from
	// somewhere else or is simply confused, and both are refusals rather than a
	// silent reinterpretation.
	TEAM_NOT_IN_DIVISION: [400, "A team does not belong to this division"],
	// The second half of the rebuild gate. The status check can be wrong; a
	// completed fixture cannot.
	DIVISION_HAS_RESULTS: [409, "This division already has results"],
	// A group or qualifier count the new team count cannot support. Refused
	// rather than corrected — the organiser chose these numbers.
	INVALID_STRUCTURE: [400, "The group and qualifier counts do not fit the number of teams"],
	FORMAT_NOT_IMPLEMENTED: [400, "This format is not available yet"],
	UNSUPPORTED_FORMAT: [400, "This format is not supported"],
	// A round whose type no fixture generator handles. Distinct from
	// UNSUPPORTED_FORMAT, which is about the division's format: this is one round
	// inside an otherwise valid structure.
	UNSUPPORTED_ROUND_TYPE: [400, "This round type is not supported"],

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
	// Lifecycle transitions. Each names the state the caller is in, not the one
	// they asked for, so the message tells them why the transition was refused.
	TOURNAMENT_ALREADY_STARTED: [409, "This tournament has already started"],
	TOURNAMENT_NOT_STARTED: [409, "This tournament has not started yet"],
	TOURNAMENT_FINISHED: [409, "This tournament has already finished"],

	// Saving a schedule. One code per rule rather than one INVALID_SCHEDULE: the
	// message is display-ready by contract, and "that schedule is invalid" tells
	// the organiser nothing about which rule they broke. `details` carries the
	// offending entry ids so the client can point at them.
	//
	// The server rejects the impossible and nothing else — court balance and rest
	// between matches are the organiser's judgement. See docs/schedule.md.
	SCHEDULE_MALFORMED: [400, "The schedule is not in a recognised format"],
	SCHEDULE_TIME_INVALID: [400, "An entry ends before it starts"],
	SCHEDULE_DAY_OUT_OF_RANGE: [400, "An entry falls outside the tournament dates"],
	SCHEDULE_FIXTURE_UNKNOWN: [400, "A scheduled match does not belong to this tournament"],
	SCHEDULE_FIXTURE_REPEATED: [400, "A match is scheduled more than once"],
	SCHEDULE_COURT_CLASH: [409, "Two entries use the same court at the same time"],
	SCHEDULE_TEAM_CLASH: [409, "A team is scheduled in two places at once"],
	SCHEDULE_ROUND_ORDER: [409, "A match is scheduled before the round feeding it has finished"],

	// Fixtures. A status is never one of these: it is derived from the scores
	// and the organiser's intent, never sent. See docs/decisions.md.
	FIXTURE_NOT_FOUND: [404, "Fixture not found"],
	INVALID_SCORE: [400, "Scores must be whole numbers of zero or more"],
	FIXTURE_NOT_READY: [400, "This match does not have both teams yet"],

	// Field-level input failures, raised by assertText in utils/validation.js
	// before a value reaches Postgres, where an over-length varchar would
	// otherwise become a 500 that names nothing. The messages stay static like
	// every other one here; `details` carries the field, its limit and the
	// length that was sent, so the client can point at the offending input.
	FIELD_TOO_LONG: [400, "One of the fields is too long"],
	FIELD_INVALID: [400, "One of the fields is not valid"],

	// Raised by the auth rate limiter, not by a service. It goes through the
	// catalogue like everything else so the 429 arrives in the standard envelope;
	// a bare rejection from the middleware would be the only response in the
	// application that does not.
	TOO_MANY_REQUESTS: [429, "Too many attempts. Please wait a minute and try again"],

	// The health endpoint reporting that the database did not answer. An expected
	// condition rather than a fault: reporting it is the endpoint's whole job.
	SERVICE_UNAVAILABLE: [503, "The service is not ready"],

	// Generic.
	MALFORMED_JSON: [400, "Request body is not valid JSON"],
	ROUTE_NOT_FOUND: [404, "Not found"],
	NOT_IMPLEMENTED: [501, "This feature is not available yet"]
};
