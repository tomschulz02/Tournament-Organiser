import { createHash } from "node:crypto";

// The validator for GET /api/tournaments/:tournamentId.
//
// Two halves, and both are load-bearing.
//
// The change key is when the data last moved: the greatest last_update across
// the tournament row and its divisions. divisions.last_update is stamped by
// trg_divisions_last_updated and by the queries that write state; tournaments
// by trg_tournaments_last_updated. See docs/database.md.
//
// The viewer is the half that is easy to miss. The payload carries `creator`
// and `loggedIn`, which depend on who is asking rather than on when anything
// changed. A validator built from the timestamp alone would describe two
// genuinely different representations with one value, and the organiser's
// payload — management controls and all — would be served to a signed-out
// reader on a 304. Hashing the viewer in makes that impossible: a different
// viewer simply never matches.

export function buildChangeKey({ tournament, divisions = [] }) {
    const stamps = [tournament?.last_update, ...divisions.map((division) => division?.last_update)]
        .map(toMillis)
        .filter((value) => value !== null);

    if (stamps.length === 0) {
        // Nothing to compare against. Treated as "unknown, always refetch"
        // rather than inventing a key that could collide with a real one.
        return null;
    }

    return String(Math.max(...stamps));
}

function toMillis(value) {
    if (value === null || value === undefined) return null;

    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
}

// Hashed rather than concatenated so the header carries no user id. A viewer
// already knows their own, but an ETag is echoed back by clients and stored by
// caches, and there is no reason to put an identifier in either.
export function buildTournamentEtag(changeKey, viewerUserId) {
    if (!changeKey) return null;

    const digest = createHash("sha256")
        .update(`${changeKey}|${viewerUserId ?? "anonymous"}`)
        .digest("base64url")
        .slice(0, 27);

    return `"${digest}"`;
}

// If-None-Match is a list by specification, even though this application's own
// client always sends one value. A weak validator is not produced here, so a
// W/ prefix can only have come from somewhere else and is not treated as equal.
export function matchesEtag(headerValue, etag) {
    if (!headerValue || !etag) return false;
    if (headerValue.trim() === "*") return true;

    return headerValue
        .split(",")
        .map((candidate) => candidate.trim())
        .includes(etag);
}
