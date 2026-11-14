import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/config/db.js", async () => {
    const { dbMock } = await import("../../helpers/dbMock.js");
    return { default: () => dbMock.instance };
});

const { populateGroups } = await import("../../../src/services/divisions.service.js");
const {
    POOL_DRAW_METHODS,
    mulberry32,
    drawPools,
    readDrawMethod,
    poolDrawFromState,
    storedPoolDraw,
    poolDrawFor
} = await import("../../../src/utils/poolDraw.js");

const seeds = (count) => Array.from({ length: count }, (_, index) => index + 1);
const draw = (method, pools, teams, seed) => drawPools(method, populateGroups(pools, teams), teams, seed);

// Every team count the structure rules allow a pool count for: 1 to the number
// of teams — see validateStructure.
const SHAPES = [];
for (let teams = 2; teams <= 32; teams++) {
    for (let pools = 1; pools <= teams; pools++) SHAPES.push([teams, pools]);
}

describe("mulberry32", () => {
    it("gives the same sequence for the same seed, in [0, 1)", () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        const values = Array.from({ length: 50 }, () => a());

        expect(values).toEqual(Array.from({ length: 50 }, () => b()));
        expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    });

    it("gives a different sequence for a different seed", () => {
        expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    });
});

describe("drawPools", () => {
    it("draws the documented 12-team, 3-pool examples", () => {
        expect(draw("SNAKE", 3, seeds(12))).toEqual([[1, 6, 7, 12], [2, 5, 8, 11], [3, 4, 9, 10]]);
        expect(draw("STRAIGHT", 3, seeds(12))).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]);
    });

    it("returns the snake's own pools for SNAKE and for an unknown method", () => {
        const snake = populateGroups(3, seeds(10));

        expect(drawPools("SNAKE", snake, seeds(10))).toBe(snake);
        expect(drawPools("NOPE", snake, seeds(10))).toBe(snake);
    });

    it("keeps the snake's pool sizes and places every team once, for every shape", () => {
        SHAPES.forEach(([teams, pools]) => {
            const list = seeds(teams);
            const sizes = populateGroups(pools, list).map((group) => group.length);

            POOL_DRAW_METHODS.forEach((method) => {
                const drawn = draw(method, pools, list, 7);

                expect(drawn.map((group) => group.length), `${method} ${teams}/${pools}`).toEqual(sizes);
                expect(drawn.flat().sort((a, b) => a - b), `${method} ${teams}/${pools}`).toEqual(list);
            });
        });
    });

    it("fills a straight draw with consecutive seeds, pool by pool", () => {
        SHAPES.forEach(([teams, pools]) => {
            expect(draw("STRAIGHT", pools, seeds(teams)).flat()).toEqual(seeds(teams));
        });
    });

    describe("POTS", () => {
        it("puts pot 1 one per pool in seed order, and one team of each pot in each pool", () => {
            const drawn = draw("POTS", 3, seeds(12), 99);

            expect(drawn.map((group) => group[0])).toEqual([1, 2, 3]);
            drawn.forEach((group) => {
                expect(group.map((seed) => Math.floor((seed - 1) / 3))).toEqual([0, 1, 2, 3]);
            });
        });

        it("is identical for the same seed, for every shape", () => {
            SHAPES.forEach(([teams, pools]) => {
                expect(draw("POTS", pools, seeds(teams), 1234)).toEqual(draw("POTS", pools, seeds(teams), 1234));
            });
        });

        it("usually differs for a different seed", () => {
            const first = JSON.stringify(draw("POTS", 4, seeds(16), 0));
            const different = seeds(20).filter((seed) => JSON.stringify(draw("POTS", 4, seeds(16), seed)) !== first);

            expect(different.length).toBeGreaterThan(15);
        });

        it("re-applies the same choices to reordered seeds", () => {
            const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
            const swapped = ["a", "b", "c", "e", "d", "f", "g", "h", "i"];
            const before = draw("POTS", 3, names, 5);
            const after = draw("POTS", 3, swapped, 5);

            // d and e trade places and nothing else moves.
            const trade = (name) => (name === "d" ? "e" : name === "e" ? "d" : name);
            expect(after).toEqual(before.map((group) => group.map(trade)));
            expect(draw("POTS", 3, names, 5)).toEqual(before);
        });

        it("draws a short last pot into the pools the snake makes larger", () => {
            // 10 teams in 3 pools: the snake's sizes are 3, 3, 4.
            const drawn = draw("POTS", 3, seeds(10), 3);

            expect(drawn.map((group) => group.length)).toEqual([3, 3, 4]);
            expect(drawn[2][3]).toBe(10);
        });
    });
});

describe("readDrawMethod", () => {
    it("defaults an absent method to SNAKE", () => {
        expect(readDrawMethod(undefined)).toBe("SNAKE");
        expect(readDrawMethod(null)).toBe("SNAKE");
    });

    it("accepts the three methods and nothing else", () => {
        POOL_DRAW_METHODS.forEach((method) => expect(readDrawMethod(method)).toBe(method));
        expect(readDrawMethod("snake")).toBeNull();
        expect(readDrawMethod({ method: "POTS" })).toBeNull();
    });
});

describe("poolDrawFromState", () => {
    it("reads an absent or malformed draw as SNAKE", () => {
        expect(poolDrawFromState(null)).toEqual({ method: "SNAKE" });
        expect(poolDrawFromState({})).toEqual({ method: "SNAKE" });
        expect(poolDrawFromState({ poolDraw: { method: "POTS" } })).toEqual({ method: "SNAKE" });
        expect(poolDrawFromState({ poolDraw: { method: "MANUAL" } })).toEqual({ method: "SNAKE" });
    });

    it("reads a stored straight or pots draw", () => {
        expect(poolDrawFromState({ poolDraw: { method: "STRAIGHT", seed: 4 } })).toEqual({ method: "STRAIGHT" });
        expect(poolDrawFromState({ poolDraw: { method: "POTS", seed: 4 } })).toEqual({ method: "POTS", seed: 4 });
    });
});

describe("storedPoolDraw", () => {
    it("stores nothing for a snake draw", () => {
        expect(storedPoolDraw({ method: "SNAKE" })).toBeUndefined();
        expect(storedPoolDraw(undefined)).toBeUndefined();
    });

    it("stores the method, and the seed for pots only", () => {
        expect(storedPoolDraw({ method: "STRAIGHT", seed: 9 })).toEqual({ method: "STRAIGHT" });
        expect(storedPoolDraw({ method: "POTS", seed: 9 })).toEqual({ method: "POTS", seed: 9 });
    });
});

describe("poolDrawFor", () => {
    it("carries no seed for snake and straight", () => {
        expect(poolDrawFor("SNAKE", { method: "POTS", seed: 1 })).toEqual({ method: "SNAKE" });
        expect(poolDrawFor("STRAIGHT")).toEqual({ method: "STRAIGHT" });
    });

    it("keeps an existing pots seed", () => {
        expect(poolDrawFor("POTS", { method: "POTS", seed: 77 })).toEqual({ method: "POTS", seed: 77 });
    });

    it("makes a seed when there is none to keep, or on a redraw", () => {
        const fresh = poolDrawFor("POTS", { method: "STRAIGHT" });
        expect(fresh.method).toBe("POTS");
        expect(Number.isInteger(fresh.seed)).toBe(true);
        expect(poolDrawFor("POTS").method).toBe("POTS");

        const redrawn = new Set(
            Array.from({ length: 5 }, () => poolDrawFor("POTS", { method: "POTS", seed: 77 }, true).seed)
        );
        expect(redrawn.size).toBeGreaterThan(1);
    });
});

// The Teams tab leans on this: a pots draw's choices belong to the seed
// position, so a pot that is full before and after a team is added or removed
// keeps its pools. See poolByPosition in the UI's divisionPreview.js.
describe("a pots draw when the team count changes", () => {
    it("keeps every full pot's pools by position", () => {
        const poolOf = (drawn, team) => drawn.findIndex((group) => group.includes(team));

        for (let pools = 2; pools <= 6; pools++) {
            for (let teams = pools * 2; teams <= 30; teams++) {
                const before = draw("POTS", pools, seeds(teams), 314);
                const after = draw("POTS", pools, seeds(teams + 1), 314);
                const fullPots = Math.floor(teams / pools);

                seeds(fullPots * pools).forEach((team) => {
                    expect(poolOf(after, team), `${teams}/${pools} seed ${team}`).toBe(poolOf(before, team));
                });
            }
        }
    });
});
