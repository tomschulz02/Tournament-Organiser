// Shared request-shape checks. Nothing here knows about the domain — a value is
// either the right shape or it is not, and the caller decides what that means.

// A malformed id can never match a row, so a controller answers "not found"
// rather than sending it to Postgres, where `$1::uuid` raises a syntax error and
// surfaces as a 500.
//
// Deliberately narrow: v1 to v5 with the RFC 4122 variant bits, so the nil UUID
// and a v7 are both rejected. Nothing in this application issues either.
export function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
