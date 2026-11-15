import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { generatePartialRoundRobinPairs } = await import("../../../src/services/fixtures.service.js");
const {
    MATCHUP_DRAW_METHODS,
    readMatchupMethod,
    matchupDrawFromState,
    storedMatchupDraw,
    matchupDrawFor,
    matchupOrder
} = await import("../../../src/utils/matchupDraw.js");

const teamsOf = (count) => Array.from({ length: count }, (_, index) => `t${index + 1}`);

describe("readMatchupMethod", () => {
    it("reads absent as seed order and passes the two methods through", () => {
        expect(readMatchupMethod(undefined)).toBe("SEED");
        expect(readMatchupMethod(null)).toBe("SEED");
        MATCHUP_DRAW_METHODS.forEach((method) => expect(readMatchupMethod(method)).toBe(method));
    });

    it("gives null for anything else, for the caller to refuse", () => {
        expect(readMatchupMethod("random")).toBeNull();
        expect(readMatchupMethod(1)).toBeNull();
    });
});

describe("matchupDrawFromState", () => {
    it("reads a stored random draw", () => {
        expect(matchupDrawFromState({ matchupDraw: { method: "RANDOM", seed: 4 } })).toEqual({ method: "RANDOM", seed: 4 });
    });

    it("reads absent or malformed values as seed order", () => {
        expect(matchupDrawFromState({})).toEqual({ method: "SEED" });
        expect(matchupDrawFromState(null)).toEqual({ method: "SEED" });
        expect(matchupDrawFromState({ matchupDraw: { method: "RANDOM" } })).toEqual({ method: "SEED" });
        expect(matchupDrawFromState({ matchupDraw: { method: "RANDOM", seed: "4" } })).toEqual({ method: "SEED" });
        expect(matchupDrawFromState({ matchupDraw: "RANDOM" })).toEqual({ method: "SEED" });
    });
});

describe("storedMatchupDraw", () => {
    it("stores a random draw and nothing for seed order", () => {
        expect(storedMatchupDraw({ method: "RANDOM", seed: 4 })).toEqual({ method: "RANDOM", seed: 4 });
        expect(storedMatchupDraw({ method: "SEED" })).toBeUndefined();
        expect(storedMatchupDraw(undefined)).toBeUndefined();
    });
});

describe("matchupDrawFor", () => {
    it("gives seed order no seed", () => {
        expect(matchupDrawFor("SEED", { method: "RANDOM", seed: 4 })).toEqual({ method: "SEED" });
    });

    it("keeps a random draw's seed unless reshuffling", () => {
        expect(matchupDrawFor("RANDOM", { method: "RANDOM", seed: 4 })).toEqual({ method: "RANDOM", seed: 4 });

        const reshuffled = matchupDrawFor("RANDOM", { method: "RANDOM", seed: 4 }, true);
        expect(reshuffled.method).toBe("RANDOM");
        expect(Number.isInteger(reshuffled.seed)).toBe(true);
    });

    it("draws a new seed when there is none to keep", () => {
        [undefined, { method: "SEED" }, { method: "RANDOM" }].forEach((previous) => {
            const draw = matchupDrawFor("RANDOM", previous);
            expect(draw.method).toBe("RANDOM");
            expect(draw.seed).toBeGreaterThanOrEqual(0);
            expect(draw.seed).toBeLessThan(2 ** 31);
        });
    });
});

describe("matchupOrder", () => {
    it("leaves the teams in seed order unless the draw is random", () => {
        const teams = teamsOf(6);

        expect(matchupOrder(teams, { method: "SEED" })).toBe(teams);
        expect(matchupOrder(teams, undefined)).toBe(teams);
    });

    it("shuffles a copy, the same way for the same seed", () => {
        const teams = teamsOf(10);
        const first = matchupOrder(teams, { method: "RANDOM", seed: 21 });

        expect(teams).toEqual(teamsOf(10));
        expect([...first].sort()).toEqual([...teams].sort());
        expect(first).not.toEqual(teams);
        expect(matchupOrder(teams, { method: "RANDOM", seed: 21 })).toEqual(first);
        expect(matchupOrder(teams, { method: "RANDOM", seed: 22 })).not.toEqual(first);
    });

    // The circulant construction only uses positions, so any order of the teams
    // still gives every team exactly g games with no repeated or self pairs.
    it("keeps the pair construction's guarantees for every shuffled order", () => {
        for (let count = 4; count <= 12; count++) {
            for (let games = 1; games <= count - 2; games++) {
                if ((count * games) % 2 !== 0) continue;

                for (const seed of [1, 2, 3, 99]) {
                    const teams = teamsOf(count);
                    const pairs = generatePartialRoundRobinPairs(matchupOrder(teams, { method: "RANDOM", seed }), games);
                    const played = new Map(teams.map((team) => [team, 0]));
                    const seen = new Set();

                    pairs.forEach(([a, b]) => {
                        expect(a).not.toBe(b);
                        const key = [a, b].sort().join("|");
                        expect(seen.has(key)).toBe(false);
                        seen.add(key);
                        played.set(a, played.get(a) + 1);
                        played.set(b, played.get(b) + 1);
                    });

                    teams.forEach((team) => expect(played.get(team)).toBe(games));
                }
            }
        }
    });
});
