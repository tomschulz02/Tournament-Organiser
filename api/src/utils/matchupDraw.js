import { randomInt } from "node:crypto";
import { mulberry32, shuffled } from "./poolDraw.js";

// Who plays whom in a League with a limited number of games per team. The
// circulant construction (generatePartialRoundRobinPairs) pairs teams by their
// positions in the list it is given; seed order is the default, and a random
// draw hands it the teams in a seeded shuffle instead. The rules are in
// docs/tournament-rules.md, "Matchups (limited round robin)"; the stored shape,
// state.matchupDraw, is in docs/division-state.md.
//
// Only the pairing input is shuffled. state.teams stays in seed order: it is the
// seeding, and seeding is the final tiebreak.

const SEED = "SEED";
const RANDOM = "RANDOM";

const MATCHUP_DRAW_METHODS = [SEED, RANDOM];

// A method name as a request sends it. Absent is seed order; anything else
// unrecognised is null, for the caller to refuse.
function readMatchupMethod(value) {
    if (value === undefined || value === null) return SEED;

    return MATCHUP_DRAW_METHODS.includes(value) ? value : null;
}

// The draw a stored state was generated with. Absent, or anything malformed, is
// seed order — the reading every division created before the setting existed
// gets.
function matchupDrawFromState(state) {
    const stored = state?.matchupDraw;

    if (stored?.method === RANDOM && Number.isInteger(stored.seed)) return { method: RANDOM, seed: stored.seed };

    return { method: SEED };
}

// The value written to state.matchupDraw: nothing for seed order, so the default
// has one representation.
function storedMatchupDraw(draw) {
    return draw?.method === RANDOM ? { method: RANDOM, seed: draw.seed } : undefined;
}

// A draw for `method`, keeping the seed of `previous` when both are random so
// that only an explicit reshuffle changes the matchups.
function matchupDrawFor(method, previous, reshuffle = false) {
    if (method !== RANDOM) return { method: SEED };

    const keep = !reshuffle && previous?.method === RANDOM && Number.isInteger(previous.seed);

    return { method: RANDOM, seed: keep ? previous.seed : randomInt(0, 2 ** 31) };
}

// The order the pair construction runs over: the teams as given for seed order,
// a seeded shuffle of them for a random draw.
function matchupOrder(teams, draw) {
    return draw?.method === RANDOM ? shuffled(teams, mulberry32(draw.seed)) : teams;
}

export {
    MATCHUP_DRAW_METHODS,
    readMatchupMethod,
    matchupDrawFromState,
    storedMatchupDraw,
    matchupDrawFor,
    matchupOrder
};
