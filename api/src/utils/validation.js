import { AppError } from "../errors.js";

// Shared request-shape checks. Nothing here knows about the domain — a value is
// either the right shape or it is not, and the caller decides what that means.
//
// The one exception is assertText, which throws. Field length is the same
// question everywhere it is asked, and the answer is always a 400 naming the
// field, so having each service restate that produced nothing but repetition.

// A malformed id can never match a row, so a controller answers "not found"
// rather than sending it to Postgres, where `$1::uuid` raises a syntax error and
// surfaces as a 500.
//
// Deliberately narrow: v1 to v5 with the RFC 4122 variant bits, so the nil UUID
// and a v7 are both rejected. Nothing in this application issues either.
export function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Checks one free-text field a service has been handed, before it reaches
// Postgres.
//
// Without this, a value longer than the column arrives as a pg length error:
// a 500 that names nothing, from a request the caller could have fixed. The
// field name goes in AppError's `details`, which reaches the client through
// `data` — catalogue messages are static, so that is where "which field" lives.
//
// `max` is the column width from docs/database.md where the column is bounded,
// and an application limit where it is not. Callers pass it, because the number
// belongs with the field it describes rather than in a table over here.
export function assertText(value, field, { max, required = true }) {
    if (value === undefined || value === null || value === "") {
        if (required) {
            throw new AppError("MISSING_FIELDS", { details: { field } });
        }
        return;
    }

    // A number or an object would survive as far as the insert and fail there,
    // or worse, be coerced into something nobody asked for.
    if (typeof value !== "string") {
        throw new AppError("FIELD_INVALID", { details: { field } });
    }

    if (value.length > max) {
        throw new AppError("FIELD_TOO_LONG", { details: { field, max, length: value.length } });
    }
}
