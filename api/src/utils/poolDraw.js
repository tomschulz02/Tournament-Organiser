import { randomInt } from "node:crypto";

// How a Classic division's seeds are placed into pools. The rules are in
// docs/tournament-rules.md, "Pool Draw"; the stored shape, state.poolDraw, is in
// docs/division-state.md.
//
// Nothing here decides how many teams a pool holds. Every draw is handed the
// snake's own pools and fills pools of exactly those sizes, because fixture
// counts, validateStructure and the qualifier maths all assume them.

const SNAKE = "SNAKE";
const STRAIGHT = "STRAIGHT";
const POTS = "POTS";

const POOL_DRAW_METHODS = [SNAKE, STRAIGHT, POTS];

// mulberry32: a small seeded generator, so the same seed gives the same draw.
// Not for anything secret — the seed is stored beside the pools it produced.
function mulberry32(seed) {
    let a = seed >>> 0;

    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Fisher-Yates, driven by the seeded generator.
function shuffled(items, random) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }

    return result;
}

// Consecutive seeds fill one pool at a time.
function straightPools(sizes, teamList) {
    let next = 0;

    return sizes.map((size) => {
        const pool = teamList.slice(next, next + size);
        next += size;

        return pool;
    });
}

// Pot k is the k-th run of one-team-per-pool seeds. Pot 1 goes in seed order,
// so seed 1 is in pool A; every later pot is shuffled across the pools that
// still have room. Only the last pot can be short, and the pools with room for
// it are the ones the snake made larger, so the sizes come out the same.
function potsPools(sizes, teamList, seed) {
    const random = mulberry32(seed);
    const pools = sizes.map(() => []);

    for (let pot = 0; pot * sizes.length < teamList.length; pot++) {
        const teams = teamList.slice(pot * sizes.length, (pot + 1) * sizes.length);
        const open = sizes.map((size, index) => index).filter((index) => sizes[index] > pot);
        const order = pot === 0 ? open : shuffled(open, random);

        teams.forEach((team, index) => pools[order[index]].push(team));
    }

    return pools;
}

// `snakeGroups` is populateGroups' result for the same pool count and team
// list. It is the SNAKE draw as it stands, and the source of every other
// draw's pool sizes. An unknown method is a snake draw.
function drawPools(method, snakeGroups, teamList, seed) {
    const sizes = snakeGroups.map((group) => group.length);

    if (method === STRAIGHT) return straightPools(sizes, teamList);
    if (method === POTS) return potsPools(sizes, teamList, seed);

    return snakeGroups;
}

// A method name as a request sends it. Absent is the default; anything else
// unrecognised is null, for the caller to refuse.
function readDrawMethod(value) {
    if (value === undefined || value === null) return SNAKE;

    return POOL_DRAW_METHODS.includes(value) ? value : null;
}

// The draw a stored state was generated with, in the shape generation takes.
// Absent, or anything malformed, is a snake draw — the same reading every
// division created before the setting existed gets.
function poolDrawFromState(state) {
    const stored = state?.poolDraw;

    if (stored?.method === STRAIGHT) return { method: STRAIGHT };
    if (stored?.method === POTS && Number.isInteger(stored.seed)) return { method: POTS, seed: stored.seed };

    return { method: SNAKE };
}

// The value written to state.poolDraw: nothing for a snake draw, so the default
// has one representation.
function storedPoolDraw(poolDraw) {
    if (poolDraw?.method === STRAIGHT) return { method: STRAIGHT };
    if (poolDraw?.method === POTS) return { method: POTS, seed: poolDraw.seed };

    return undefined;
}

// A draw for `method`, keeping the seed of `previous` when both are pots draws
// so that only an explicit redraw reshuffles.
function poolDrawFor(method, previous, redraw = false) {
    if (method !== POTS) return { method };

    const keep = !redraw && previous?.method === POTS && Number.isInteger(previous.seed);

    return { method: POTS, seed: keep ? previous.seed : randomInt(0, 2 ** 31) };
}

export {
    POOL_DRAW_METHODS,
    mulberry32,
    drawPools,
    readDrawMethod,
    poolDrawFromState,
    storedPoolDraw,
    poolDrawFor
};
