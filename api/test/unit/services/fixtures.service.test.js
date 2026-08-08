import { describe, it, expect, beforeEach, vi } from "vitest";

const uuidState = vi.hoisted(() => ({ next: 0 }));

vi.mock("uuid", () => ({ v4: () => `uuid-${++uuidState.next}` }));

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

vi.mock("../../../src/repositories/fixtures.repository.js", () => ({
    fixturesRepository: { createFixture: vi.fn() }
}));

const {
    fixtureService,
    generateFixtures,
    generateRoundRobinFixtures,
    generateKnockoutFixtures,
    rotateGroupTeams,
    getFixturesForRound
} = await import("../../../src/services/fixtures.service.js");
const { fixturesRepository } = await import("../../../src/repositories/fixtures.repository.js");
const { resetDbMock } = await import("../../helpers/dbMock.js");
const { makeRound } = await import("../../helpers/fixtures.js");

beforeEach(() => {
    uuidState.next = 0;
    resetDbMock();
    fixturesRepository.createFixture.mockReset();
});

describe("rotateGroupTeams", () => {
    it("leaves the group untouched for the first round", () => {
        expect(rotateGroupTeams(["a", "b", "c", "d"], 1)).toEqual(["a", "b", "c", "d"]);
    });

    it("holds the first team fixed and rotates the rest", () => {
        // The circle method: one team stays put, everyone else moves round.
        expect(rotateGroupTeams(["a", "b", "c", "d"], 2)).toEqual(["a", "d", "b", "c"]);
        expect(rotateGroupTeams(["a", "b", "c", "d"], 3)).toEqual(["a", "c", "d", "b"]);
    });
});

describe("getFixturesForRound", () => {
    it("pairs the ends inwards", () => {
        expect(getFixturesForRound(["a", "b", "c", "d"], 1)).toEqual([["a", "d"], ["b", "c"]]);
    });

    it("adds a BYE to an odd group so one team sits out", () => {
        expect(getFixturesForRound(["a", "b", "c"], 1)).toEqual([["a", "BYE"], ["b", "c"]]);
    });

    it("gives an empty group a single BYE and therefore no pairings", () => {
        expect(getFixturesForRound([], 1)).toEqual([]);
    });

    it("produces only a BYE pairing for a group of one", () => {
        expect(getFixturesForRound(["a"], 1)).toEqual([["a", "BYE"]]);
    });
});

describe("generateRoundRobinFixtures", () => {
    it("produces every pairing exactly once for an even group", () => {
        const round = makeRound({ name: "Pool Play", groups: [["a", "b", "c", "d"]] });

        const { fixtures, matchNo } = generateRoundRobinFixtures(1, round);

        expect(fixtures).toHaveLength(6);
        expect(matchNo).toBe(7);
        expect(fixtures.map((fixture) => [fixture.team1, fixture.team2])).toEqual([
            ["a", "d"], ["b", "c"],
            ["a", "c"], ["d", "b"],
            ["a", "b"], ["c", "d"]
        ]);
        expect(fixtures.every((fixture) => fixture.round === "Pool Play")).toBe(true);
        expect(fixtures.every((fixture) => fixture.placeholder1 === false && fixture.placeholder2 === false)).toBe(true);
    });

    it("skips the BYE pairings of an odd group", () => {
        const round = makeRound({ groups: [["a", "b", "c"]] });

        const { fixtures } = generateRoundRobinFixtures(1, round);

        expect(fixtures).toHaveLength(3);
        expect(fixtures.some((fixture) => fixture.team1 === "BYE" || fixture.team2 === "BYE")).toBe(false);
    });

    it("interleaves match numbers across pools, round by round", () => {
        const round = makeRound({ groups: [["a", "b"], ["c", "d"]] });

        const { fixtures } = generateRoundRobinFixtures(1, round);

        expect(fixtures.map((fixture) => [fixture.matchNo, fixture.team1, fixture.team2])).toEqual([
            [1, "a", "b"],
            [2, "c", "d"]
        ]);
    });

    it("produces nothing when there are no groups", () => {
        const round = makeRound({ groups: [] });

        expect(generateRoundRobinFixtures(1, round)).toEqual({ fixtures: [], matchNo: 1 });
    });
});

describe("generateKnockoutFixtures", () => {
    it("creates one fixture per pairing, flagging positional entries as placeholders", () => {
        const round = makeRound({ name: "Semifinals", type: "knockout", groups: [[0, 3], [1, 2]] });

        const { fixtures, matchNo } = generateKnockoutFixtures(5, round);

        expect(matchNo).toBe(7);
        expect(fixtures).toEqual([
            { id: "uuid-1", matchNo: 5, team1: 0, team2: 3, round: "Semifinals", placeholder1: true, placeholder2: true },
            { id: "uuid-2", matchNo: 6, team1: 1, team2: 2, round: "Semifinals", placeholder1: true, placeholder2: true }
        ]);
    });

    it("names the first group of the Finals round as the third-place playoff", () => {
        const round = makeRound({ name: "Finals", type: "knockout", groups: [[2, 3], [0, 1]] });

        const { fixtures } = generateKnockoutFixtures(1, round);

        expect(fixtures.map((fixture) => fixture.round)).toEqual(["3rd Place Playoff", "Finals"]);
    });

    it("skips single-team groups, which are byes into the next round", () => {
        const round = makeRound({ name: "Round of 6", type: "knockout", groups: [[0], [1], [2, 5], [3, 4]] });

        const { fixtures } = generateKnockoutFixtures(1, round);

        expect(fixtures).toHaveLength(2);
        expect(fixtures.map((fixture) => fixture.matchNo)).toEqual([1, 2]);
    });

    it("does not flag real team ids as placeholders", () => {
        const round = makeRound({ name: "Finals", type: "knockout", groups: [["team-a", "team-b"]] });

        const { fixtures } = generateKnockoutFixtures(1, round);

        expect(fixtures[0]).toMatchObject({ placeholder1: false, placeholder2: false });
    });
});

describe("generateFixtures", () => {
    it("numbers matches continuously across rounds and returns a flat fixture list", () => {
        const rounds = [
            makeRound({ name: "Pool Play", groups: [["a", "b"]] }),
            makeRound({ name: "Finals", type: "knockout", groups: [[0, 1]] })
        ];

        const result = generateFixtures(rounds);

        expect(result.fixtures.map((fixture) => fixture.matchNo)).toEqual([1, 2]);
        expect(result.rounds).toBe(rounds);
    });

    it("writes the fixture ids and game count back onto each round", () => {
        const rounds = [makeRound({ name: "Pool Play", groups: [["a", "b", "c", "d"]] })];

        generateFixtures(rounds);

        expect(rounds[0].fixtures).toHaveLength(6);
        expect(rounds[0].totalGames).toBe(6);
    });

    it("mutates the rounds it is given, so calling it twice double-counts", () => {
        const rounds = [makeRound({ name: "Pool Play", groups: [["a", "b"]] })];

        generateFixtures(rounds);
        generateFixtures(rounds);

        expect(rounds[0].totalGames).toBe(2);
        expect(rounds[0].fixtures).toHaveLength(2);
    });

    it("throws on a round whose type it does not recognise", () => {
        // Currently a bare TypeError from reading .matchNo of undefined.
        // test/known-bugs asserts the named error this should raise instead.
        expect(() => generateFixtures([makeRound({ type: "swiss" })])).toThrow();
    });
});

describe("fixtureService.createFixture", () => {
    it("stores real team ids when both teams are known", async () => {
        await fixtureService.createFixture("div-1", {
            id: "f1",
            matchNo: 3,
            team1: "team-a",
            team2: "team-b",
            round: "Pool Play",
            placeholder1: false,
            placeholder2: false
        });

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f1", "div-1", 3, "team-a", "team-b", undefined, null, "Pool Play"
        );
    });

    it("converts positional entries into Rank labels and leaves the team columns unset", async () => {
        await fixtureService.createFixture("div-1", {
            id: "f2",
            matchNo: 9,
            team1: 0,
            team2: 3,
            round: "Semifinals",
            placeholder1: true,
            placeholder2: true
        });

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f2", "div-1", 9, undefined, undefined, "Rank 1", "Rank 4", "Semifinals"
        );
    });

    it("handles one placeholder and one real team", async () => {
        await fixtureService.createFixture("div-1", {
            id: "f3",
            matchNo: 4,
            team1: "team-a",
            team2: 1,
            round: "Semifinals",
            placeholder1: false,
            placeholder2: true
        });

        expect(fixturesRepository.createFixture).toHaveBeenCalledWith(
            "f3", "div-1", 4, "team-a", undefined, undefined, "Rank 2", "Semifinals"
        );
    });

    it("does not forward the transaction client to the repository", async () => {
        // The client parameter is accepted but never passed on, so these inserts
        // run on the pool rather than joining the caller's transaction.
        const client = { query: vi.fn() };

        await fixtureService.createFixture("div-1", { id: "f4", matchNo: 1, team1: "a", team2: "b", round: "R" }, client);

        expect(fixturesRepository.createFixture).toHaveBeenCalledTimes(1);
        expect(fixturesRepository.createFixture.mock.calls[0]).toHaveLength(8);
    });

    it("wraps a repository failure", async () => {
        fixturesRepository.createFixture.mockRejectedValueOnce(new Error("CREATE_FIXTURE_ERROR"));

        await expect(
            fixtureService.createFixture("div-1", { id: "f5", matchNo: 1, team1: "a", team2: "b", round: "R" })
        ).rejects.toThrow("CREATE_FIXTURE_ERROR");
    });
});
