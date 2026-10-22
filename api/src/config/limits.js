// Single source of truth for the size caps on what one request can ask for.
// errors.js builds its messages from these, so the number the organiser reads
// is the number the service enforces.
//
// They exist because generation and storage are proportional to them and the
// writes go one row at a time: without a cap, one signed-in account could ask
// for a league of millions of fixtures in a single transaction. See
// docs/api.md, "Security".

export const MAX_TEAMS_PER_DIVISION = 128;
export const MAX_DIVISIONS_PER_TOURNAMENT = 20;

// Kept in sync with MAX_ROUND_ROBIN_LEGS in
// tourganiser-ui/src/components/create/divisionFormats.js.
export const MAX_ROUND_ROBIN_LEGS = 10;

// The cap that actually bounds the write. The three above still allow 128 teams
// in one pool, or ten legs of them — tens of thousands of fixtures — so this is
// checked on what generation produced rather than on any one input.
export const MAX_FIXTURES_PER_DIVISION = 2000;

// Matches and breaks together. The validator's overlap check is quadratic in
// this, so it is a cost bound as well as a storage one.
export const MAX_SCHEDULE_ENTRIES = 2000;

// Passed to express.json. The default is 100kb, which a large tournament's
// schedule save can exceed; this fits MAX_SCHEDULE_ENTRIES entries with room,
// and the largest tournament the caps above allow.
export const MAX_JSON_BODY = "1mb";
