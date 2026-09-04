import { describe, it, expect } from "vitest";
import { buildChangeKey, buildTournamentEtag, matchesEtag } from "../../../src/utils/etag.js";

const EARLIER = new Date("2026-08-01T10:00:00.000Z");
const LATER = new Date("2026-08-01T12:00:00.000Z");

describe("buildChangeKey", () => {
    it("takes the tournament's stamp when it has no divisions", () => {
        expect(buildChangeKey({ tournament: { last_update: EARLIER }, divisions: [] })).toBe(String(EARLIER.getTime()));
    });

    // A division changing is a change to the tournament's page, so the key has
    // to move even though the tournament row did not.
    it("takes a division's stamp when it is the later one", () => {
        const key = buildChangeKey({
            tournament: { last_update: EARLIER },
            divisions: [{ last_update: LATER }, { last_update: EARLIER }]
        });

        expect(key).toBe(String(LATER.getTime()));
    });

    it("takes the tournament's stamp when it is the later one", () => {
        const key = buildChangeKey({
            tournament: { last_update: LATER },
            divisions: [{ last_update: EARLIER }]
        });

        expect(key).toBe(String(LATER.getTime()));
    });

    it("reads a timestamp string as well as a Date", () => {
        expect(buildChangeKey({ tournament: { last_update: "2026-08-01T10:00:00.000Z" } })).toBe(
            String(EARLIER.getTime())
        );
    });

    // The column is documented NOT NULL, but a null must not become a key that
    // could collide with a real one — it means "unknown", and unknown must
    // always refetch.
    it.each([
        ["a null stamp", { tournament: { last_update: null } }],
        ["a missing stamp", { tournament: {} }],
        ["no tournament at all", { tournament: null }],
        ["an unparseable stamp", { tournament: { last_update: "not a date" } }]
    ])("returns null for %s", (_label, input) => {
        expect(buildChangeKey(input)).toBeNull();
    });

    it("ignores a null division stamp but still uses the ones present", () => {
        const key = buildChangeKey({
            tournament: { last_update: null },
            divisions: [{ last_update: null }, { last_update: LATER }]
        });

        expect(key).toBe(String(LATER.getTime()));
    });

    it("defaults the divisions list", () => {
        expect(buildChangeKey({ tournament: { last_update: EARLIER } })).toBe(String(EARLIER.getTime()));
    });
});

describe("buildTournamentEtag", () => {
    it("produces a quoted, stable value", () => {
        const etag = buildTournamentEtag("1000", "user-1");

        expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
        expect(buildTournamentEtag("1000", "user-1")).toBe(etag);
    });

    // The whole point of the step. Two readers of the same unchanged tournament
    // receive different payloads, because `creator` depends on who is asking.
    it("differs by viewer for the same data", () => {
        const organiser = buildTournamentEtag("1000", "user-1");
        const otherUser = buildTournamentEtag("1000", "user-2");
        const anonymous = buildTournamentEtag("1000", null);

        expect(new Set([organiser, otherUser, anonymous]).size).toBe(3);
    });

    it("differs by data for the same viewer", () => {
        expect(buildTournamentEtag("1000", "user-1")).not.toBe(buildTournamentEtag("1001", "user-1"));
    });

    it("treats undefined and null viewers as the same anonymous reader", () => {
        expect(buildTournamentEtag("1000", undefined)).toBe(buildTournamentEtag("1000", null));
    });

    // A user id in a header is echoed by clients and stored by caches. There is
    // no reason to put one there.
    it("does not embed the user id", () => {
        expect(buildTournamentEtag("1000", "user-1")).not.toContain("user-1");
    });

    it("returns null when there is no change key, so no validator is offered", () => {
        expect(buildTournamentEtag(null, "user-1")).toBeNull();
        expect(buildTournamentEtag("", "user-1")).toBeNull();
    });
});

describe("matchesEtag", () => {
    const etag = '"abc123"';

    it("matches an exact value", () => {
        expect(matchesEtag('"abc123"', etag)).toBe(true);
    });

    it("matches one entry in a list", () => {
        expect(matchesEtag('"other", "abc123"', etag)).toBe(true);
    });

    it("does not match a different value", () => {
        expect(matchesEtag('"different"', etag)).toBe(false);
    });

    it("matches the wildcard", () => {
        expect(matchesEtag("*", etag)).toBe(true);
    });

    // Nothing here produces a weak validator, so a W/ prefix came from
    // somewhere else and is not ours to treat as equal.
    it("does not match a weak form of the same value", () => {
        expect(matchesEtag('W/"abc123"', etag)).toBe(false);
    });

    it.each([
        ["no header", undefined, etag],
        ["an empty header", "", etag],
        ["no etag to compare against", '"abc123"', null]
    ])("is false given %s", (_label, header, candidate) => {
        expect(matchesEtag(header, candidate)).toBe(false);
    });

    // The naive split(",") mis-tokenizes a candidate that itself contains a
    // comma. Low real-world risk — this application's own ETags are base64url
    // digests and can never contain one — but a third-party or proxy-supplied
    // If-None-Match value legally could.
    it("mis-tokenizes a candidate that contains a comma", () => {
        expect(matchesEtag('"ab,cd"', '"ab,cd"')).toBe(false);
    });
});
