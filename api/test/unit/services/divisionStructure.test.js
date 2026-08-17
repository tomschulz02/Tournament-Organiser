import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

// The server's half of the shared expectation fixture.
//
// tourganiser-ui/src/components/create/divisionPreview.js carries a port of this
// arithmetic so the creation review can show real pools and a real bracket
// before anything is persisted — see docs/decisions.md. That duplication is only
// safe because both sides are held against one file that neither computes.
//
// This suite therefore asserts the fixture and nothing derived from it. If it
// goes red, the server's generation has moved and the client's has not.
vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { createClassicState, populateGroups } = await import("../../../src/services/divisions.service.js");

const expectations = JSON.parse(
    readFileSync(new URL("../../../../shared/division-structure.json", import.meta.url), "utf8")
);

// Enough teams for every qualifier count in the fixture. The pool count is
// irrelevant to the knockout rounds — they hold rank placings, not teams.
const KNOCKOUT_TEAMS = Array.from({ length: 16 }, (_, index) => `t${index + 1}`);

describe("populateGroups against the shared expectation fixture", () => {
    expectations.pools.forEach((expectation) => {
        it(`draws ${expectation.label}`, () => {
            // The list is its own indices, so the produced groups are directly
            // comparable to the membership the fixture states.
            const teams = Array.from({ length: expectation.teams }, (_, index) => index);

            expect(populateGroups(expectation.pools, teams)).toEqual(expectation.membership);
        });
    });
});

describe("createClassicState against the shared expectation fixture", () => {
    expectations.knockouts.forEach((expectation) => {
        it(`shapes the knockout for ${expectation.label}`, () => {
            const state = createClassicState(KNOCKOUT_TEAMS, KNOCKOUT_TEAMS.length, 2, expectation.qualifiers);
            // Round 0 is Pool Play; the knockout follows it.
            const rounds = state.rounds.slice(1);

            expect(rounds.map((round) => round.name)).toEqual(expectation.rounds.map((round) => round.name));
            expect(rounds.map((round) => round.groups)).toEqual(expectation.rounds.map((round) => round.groups));

            // A group of fewer than two is a bye and generates no fixture, which
            // is the rule generateKnockoutFixtures applies.
            expect(rounds.map((round) => round.groups.filter((group) => group.length >= 2).length))
                .toEqual(expectation.rounds.map((round) => round.matches));
        });
    });
});
