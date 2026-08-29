import { AppError } from "../errors.js";

// Validates a whole schedule against the tournament it belongs to, for
// PUT /api/tournaments/:tournamentId/schedule.
//
// The generator stays in the client and the server validates on write — settled
// in docs/decisions.md. This is the only thing between the client and an
// arbitrary JSONB blob in tournaments.schedule, and later code trusts what it
// accepts, so it is deliberately strict about structure and deliberately silent
// about quality.
//
// It rejects the IMPOSSIBLE. It does not judge whether a schedule is GOOD: court
// balance, rest between matches and gap minimisation are the generator's
// business and the organiser's judgement. A partial schedule is legal, and one
// that places nothing is legal.
//
// This is not the client's validateScheduleEntry and does not share code with
// it. That one checks a single entry against what the browser is holding; this
// one checks the whole schedule against the fixtures the server can see. Same
// vocabulary, different job — see the handover's note on not importing across
// tiers.
//
// Every rejection names its own rule. One generic INVALID_SCHEDULE would tell
// the organiser nothing, and the catalogue's messages are display-ready by
// contract.

// 24:00 is reachable: an entry starting in the last slot of a day that runs to
// midnight ends there. Anything past it is not a time.
const TIME_PATTERN = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEADING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

export function validateSchedule(schedule, { startDate, endDate, divisions = [], fixtures = [], teamsByDivisionId = new Map() } = {}) {
    if (!isPlainObject(schedule)) {
        throw new AppError("SCHEDULE_MALFORMED");
    }

    const entries = schedule.entries ?? [];
    if (!Array.isArray(entries)) {
        throw new AppError("SCHEDULE_MALFORMED");
    }

    checkEntryShapes(entries);
    checkDaysInRange(entries, startDate, endDate);

    const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const placements = checkFixtureReferences(entries, fixturesById);

    checkCourtClashes(entries);
    checkCourtDivisions(placements, fixturesById, schedule.courts);
    checkTeamClashes(placements, fixturesById);
    checkRoundOrder(placements, fixturesById, buildRoundOrder(divisions));
    checkOfficials(placements, fixturesById, teamsByDivisionId);
}

// --- structure --------------------------------------------------------------
//
// normaliseSchedule on the client silently drops an entry missing id, day,
// startTime or endTime, so a malformed entry is invisible there — it vanishes
// from the view while staying in the column. That is exactly why these are
// refused here rather than tolerated.

function checkEntryShapes(entries) {
    const seenIds = new Set();

    for (const entry of entries) {
        if (!isPlainObject(entry)) {
            throw new AppError("SCHEDULE_MALFORMED");
        }

        if (!isNonEmptyString(entry.id) || seenIds.has(entry.id)) {
            throw new AppError("SCHEDULE_MALFORMED");
        }
        seenIds.add(entry.id);

        if (entry.type !== "fixture" && entry.type !== "break") {
            throw new AppError("SCHEDULE_MALFORMED", { details: { entryId: entry.id } });
        }

        if (entry.type === "fixture" && !isNonEmptyString(entry.fixtureId)) {
            throw new AppError("SCHEDULE_MALFORMED", { details: { entryId: entry.id } });
        }

        if (entry.courtId !== null && entry.courtId !== undefined && typeof entry.courtId !== "string") {
            throw new AppError("SCHEDULE_MALFORMED", { details: { entryId: entry.id } });
        }

        if (!DATE_PATTERN.test(entry.day)) {
            throw new AppError("SCHEDULE_MALFORMED", { details: { entryId: entry.id } });
        }

        if (!TIME_PATTERN.test(entry.startTime) || !TIME_PATTERN.test(entry.endTime)) {
            throw new AppError("SCHEDULE_MALFORMED", { details: { entryId: entry.id } });
        }

        // A zero-length entry is not a placement, and a backwards one is not
        // anything at all.
        if (entry.endTime <= entry.startTime) {
            throw new AppError("SCHEDULE_TIME_INVALID", { details: { entryId: entry.id } });
        }
    }
}

// The client regenerates `days` from the tournament's dates on every read, so an
// entry on a day outside them is not merely wrong — it is unreachable. See
// docs/schedule.md.
function checkDaysInRange(entries, startDate, endDate) {
    const start = toIsoDate(startDate);
    const end = toIsoDate(endDate) ?? start;

    // A tournament with no dates cannot constrain anything. The column is NOT
    // NULL, so this only covers a row read from somewhere unexpected.
    if (!start) {
        return;
    }

    for (const entry of entries) {
        if (entry.day < start || entry.day > end) {
            throw new AppError("SCHEDULE_DAY_OUT_OF_RANGE", { details: { entryId: entry.id, day: entry.day } });
        }
    }
}

// --- fixtures ---------------------------------------------------------------

// Returns the entries that place a fixture, in the order they were sent. An
// entry carrying a fixtureId is treated as a placement whatever its `type`
// says, so a break with a stray id cannot slip past the duplicate check.
function checkFixtureReferences(entries, fixturesById) {
    const placements = entries.filter((entry) => isNonEmptyString(entry.fixtureId));
    const seen = new Set();

    for (const entry of placements) {
        if (!fixturesById.has(entry.fixtureId)) {
            throw new AppError("SCHEDULE_FIXTURE_UNKNOWN", {
                details: { entryId: entry.id, fixtureId: entry.fixtureId }
            });
        }

        if (seen.has(entry.fixtureId)) {
            throw new AppError("SCHEDULE_FIXTURE_REPEATED", {
                details: { entryId: entry.id, fixtureId: entry.fixtureId }
            });
        }
        seen.add(entry.fixtureId);
    }

    return placements;
}

// --- clashes ----------------------------------------------------------------

// Two entries share a court when they name the same one, or when either spans
// every court. courtId null is what makes an all-courts break work, and the
// client's findEntryConflict reads it the same way.
function checkCourtClashes(entries) {
    for (const [left, right] of overlappingPairs(entries)) {
        const sharedCourt =
            (left.courtId ?? null) === (right.courtId ?? null) ||
            (left.courtId ?? null) === null ||
            (right.courtId ?? null) === null;

        if (sharedCourt) {
            throw new AppError("SCHEDULE_COURT_CLASH", { details: { entryIds: [left.id, right.id] } });
        }
    }
}

// A court reserved for a set of divisions takes only fixtures of those
// divisions. Without this a hand-placed fixture bypasses the constraint the
// generator keeps, and the generator's work becomes decorative. See
// docs/schedule.md.
//
// Lenient about structure, strict about the rule: a court whose divisions is
// missing, null, not an array, or empty is unrestricted. A break carries no
// fixtureId so it is not among the placements and is never checked. An entry
// naming a courtId no court has is not an error here — the client surfaces it
// under "Not shown on the grid", and checkEntryShapes deliberately does not
// require the court to exist.
function checkCourtDivisions(placements, fixturesById, courts) {
    const courtsById = new Map((Array.isArray(courts) ? courts : []).map((court) => [court.id, court]));

    for (const entry of placements) {
        const court = courtsById.get(entry.courtId);
        const divisions = court?.divisions;

        if (!Array.isArray(divisions) || divisions.length === 0) continue;

        const fixture = fixturesById.get(entry.fixtureId);
        if (!divisions.includes(fixture.division_id)) {
            throw new AppError("SCHEDULE_COURT_DIVISION", { details: { entryId: entry.id } });
        }
    }
}

// A team cannot be in two places at once, whatever court either match is on.
// A knockout fixture whose teams have not been bound yet carries nulls, and a
// null constrains nothing.
function checkTeamClashes(placements, fixturesById) {
    for (const [left, right] of overlappingPairs(placements)) {
        const leftTeams = teamsOf(fixturesById.get(left.fixtureId));
        const rightTeams = teamsOf(fixturesById.get(right.fixtureId));

        if (leftTeams.some((team) => rightTeams.includes(team))) {
            throw new AppError("SCHEDULE_TEAM_CLASH", { details: { entryIds: [left.id, right.id] } });
        }
    }
}

// A team may not officiate a match overlapping one it is playing in — the same
// hard rule the generator keeps, guarded here so a hand-typed name cannot break
// it. `officials` is free text: it is checked ONLY when it resolves to a real
// team of the fixture's own division. A string that resolves to no team ("Club
// referee", a person's name) is accepted untouched — Decision 10 — and getting
// that wrong quietly breaks the field for every organiser who types a name.
//
// Resolution is per division and case-insensitive, the same comparison
// validateTeamNames uses. It never crosses a division: two divisions may each
// have a "Team 3", and that is fine precisely because an official never crosses
// one. A break carries no fixtureId, so it is not among the placements and its
// officials — always '' — is never read. The preferences the generator applies
// (pool affinity, back-to-back) are judgement, not rules, and are not checked.
function checkOfficials(placements, fixturesById, teamsByDivisionId) {
    const lookupByDivision = buildOfficialLookup(teamsByDivisionId);

    for (const entry of placements) {
        const officials = typeof entry.officials === "string" ? entry.officials.trim() : "";
        if (officials === "") continue;

        const fixture = fixturesById.get(entry.fixtureId);
        const teamId = lookupByDivision.get(fixture.division_id)?.get(officials.toLowerCase());
        if (teamId === undefined) continue;

        for (const other of placements) {
            if (other.day !== entry.day) continue;
            if (other.startTime >= entry.endTime || other.endTime <= entry.startTime) continue;

            // `other` includes `entry` itself, which is how officiating your own
            // match — the overlap you most obviously cannot referee — is caught.
            if (teamsOf(fixturesById.get(other.fixtureId)).includes(teamId)) {
                throw new AppError("SCHEDULE_OFFICIAL_PLAYING", { details: { entryId: entry.id } });
            }
        }
    }
}

// division id -> (lower-cased team name -> team id). Duplicate names within a
// division cannot occur — validateTeamNames forbids them — so a name resolves to
// at most one team, which is what lets a bare name stand in for an id.
function buildOfficialLookup(teamsByDivisionId) {
    const source = teamsByDivisionId instanceof Map
        ? teamsByDivisionId.entries()
        : Object.entries(teamsByDivisionId ?? {});

    const byDivision = new Map();
    for (const [divisionId, teams] of source) {
        const lookup = new Map();
        for (const team of Array.isArray(teams) ? teams : []) {
            if (isNonEmptyString(team?.name)) {
                lookup.set(team.name.trim().toLowerCase(), team.id);
            }
        }
        byDivision.set(divisionId, lookup);
    }

    return byDivision;
}

// Every pair of entries that shares a day and overlaps in time. Quadratic, and
// deliberately so: a schedule is a few hundred entries at the very most, and a
// sweep line would be harder to read than the rule it enforces.
function* overlappingPairs(entries) {
    for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
            const left = entries[i];
            const right = entries[j];

            if (left.day !== right.day) continue;
            if (left.startTime >= right.endTime || left.endTime <= right.startTime) continue;

            yield [left, right];
        }
    }
}

// --- round order ------------------------------------------------------------

// A round cannot begin until the round feeding it has finished. The generator
// applies the same rule at generation time; this is the guard that it did.
// See docs/tournament-rules.md.
//
// Compared against every earlier round rather than only the immediately
// preceding one, because a partial schedule may leave the preceding round
// unplaced and the constraint from the one before it still holds.
//
// The constraint is per division. Two divisions running in parallel is correct.
function checkRoundOrder(placements, fixturesById, roundOrderByDivision) {
    const byDivision = new Map();

    for (const entry of placements) {
        const fixture = fixturesById.get(entry.fixtureId);
        const round = roundOrderByDivision.get(fixture.division_id)?.get(roundHolding(fixture.round));

        // A fixture whose round name is not in state.rounds cannot be placed in
        // the order, so it constrains nothing and nothing constrains it. That is
        // drift rather than an impossible schedule, and refusing to save because
        // of it would strand the organiser.
        if (round === undefined) continue;

        if (!byDivision.has(fixture.division_id)) {
            byDivision.set(fixture.division_id, []);
        }
        byDivision.get(fixture.division_id).push({ entry, round });
    }

    for (const placed of byDivision.values()) {
        // The latest finish of every round, then a running maximum over the
        // rounds in order, so each round is compared against everything before it.
        const latestEnd = new Map();
        for (const { entry, round } of placed) {
            const end = instant(entry.day, entry.endTime);
            if (!latestEnd.has(round) || end > latestEnd.get(round)) {
                latestEnd.set(round, end);
            }
        }

        const rounds = [...latestEnd.keys()].sort((a, b) => a - b);
        const latestEndBefore = new Map();
        let running = null;
        for (const round of rounds) {
            latestEndBefore.set(round, running);
            running = running === null || latestEnd.get(round) > running ? latestEnd.get(round) : running;
        }

        for (const { entry, round } of placed) {
            const mustFollow = latestEndBefore.get(round);
            if (mustFollow !== null && instant(entry.day, entry.startTime) < mustFollow) {
                throw new AppError("SCHEDULE_ROUND_ORDER", { details: { entryId: entry.id } });
            }
        }
    }
}

// A fixture's round name is not always a round name in state.rounds: the
// third-place playoff carries its own, while belonging to the Finals round. The
// same mapping lives in fixtures.service.js as roundHolding, and is repeated
// rather than imported because a util reaching into a service inverts the
// dependency. See docs/tournament-rules.md.
const THIRD_PLACE = "3rd Place Playoff";
const FINALS = "Finals";

function roundHolding(fixtureRound) {
    return fixtureRound === THIRD_PLACE ? FINALS : fixtureRound;
}

// Round names are unique within a division's state.rounds, and their position in
// that array is the order they are played in.
function buildRoundOrder(divisions) {
    const byDivision = new Map();

    for (const division of divisions) {
        // divisions.state is jsonb and comes back parsed, but a row written
        // before the column carried anything can arrive as a string or as null.
        const state = typeof division.state === "string" ? JSON.parse(division.state) : division.state;
        const rounds = Array.isArray(state?.rounds) ? state.rounds : [];

        const positions = new Map();
        rounds.forEach((round, position) => {
            if (isNonEmptyString(round?.name) && !positions.has(round.name)) {
                positions.set(round.name, position);
            }
        });

        byDivision.set(division.id, positions);
    }

    return byDivision;
}

// --- small helpers ----------------------------------------------------------

// Both parts are fixed width and zero padded, so string order is chronological
// order. 24:00 sorting after 23:59 falls out of that for free.
function instant(day, time) {
    return `${day}T${time}`;
}

function teamsOf(fixture) {
    return [fixture.team_1, fixture.team_2].filter((team) => team !== null && team !== undefined);
}

// tournaments.start_date and end_date are `date` columns, and src/config/db.js
// hands those through as the stored 'YYYY-MM-DD' string, so the value is already
// the day to compare against. It used to read the local components of a Date
// while DateHandler read the UTC ones, which is what rejected every save east of
// UTC. Anything that is not a calendar day constrains nothing.
function toIsoDate(value) {
    const match = typeof value === "string" ? value.match(LEADING_DATE_PATTERN) : null;
    return match ? match[0] : null;
}

function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}
