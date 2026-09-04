import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";
import { divisionsRepository } from "../repositories/divisions.repository.js";
import { AppError } from "../errors.js";

const db = DatabaseConnection();

// The try/catch that used to wrap this only stringified the error with
// new Error(error), destroying it. There is nothing to add here, so the failure
// propagates untouched and the error middleware logs it.
async function createFixture(divisionId, details, client = db){
    let team1, team2, placeholder1, placeholder2 = null;
    if (details.placeholder1){
        placeholder1 = "Rank " + (details.team1 + 1);
    } else {
        team1 = details.team1;
    }

    if (details.placeholder2){
        placeholder2 = "Rank " + (details.team2 + 1);
    } else {
        team2 = details.team2;
    }

    await fixturesRepository.createFixture(details.id, divisionId, details.matchNo, team1, team2, placeholder1, placeholder2, details.round, client);
}

// Records a result.
//
// The client sends scores and an intent; it never sends a status. Which of the
// four statuses this is follows from the scores and from `finished`, and that
// derivation is the server's — see docs/decisions.md and docs/tournament-rules.md.
//
// The write and the division's completedGames count commit together, so the
// stored count can never disagree with the fixture rows it summarises.
async function updateResult(fixtureId, userId, sets, finished) {
    const fixture = await fixturesRepository.getFixtureWithOwner(fixtureId);
    if (!fixture) {
        throw new AppError("FIXTURE_NOT_FOUND");
    }

    // requireAuth proves the caller is logged in. This proves the tournament is
    // theirs, the same check progression's loadDivision makes one level up.
    if (fixture.created_by !== userId) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    // A knockout placeholder still reading "Rank 1" has nobody to score.
    if (!fixture.team_1 || !fixture.team_2) {
        throw new AppError("FIXTURE_NOT_READY");
    }

    const scored = validateSets(sets);
    // Only a literal true finishes a match. Anything else — absent, a string,
    // a truthy number — leaves it in progress, which is the recoverable side.
    const status = deriveStatus(scored, finished === true);

    return await db.withTransaction(async (client) => {
        await assertRoundNotLocked(fixture, client);

        await fixturesRepository.updateResult(
            fixtureId,
            [scored.map((set) => set[0]), scored.map((set) => set[1])],
            status,
            client
        );

        const completedGames = await syncCompletedGames(fixture, client);

        return { id: fixtureId, status, completedGames };
    });
}

// A round is locked for editing the moment progression commits its results —
// the same moment state.currentRound moves past it, so the previous round's
// fixtures freeze exactly when the next one starts. Re-fetches the state
// syncCompletedGames also fetches, rather than sharing one read, so this check
// stays a self-contained guard the transaction can fail on before any write.
async function assertRoundNotLocked(fixture, client) {
    const state = normalizeState(await divisionsRepository.getStateForUpdate(fixture.division_id, client));
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];
    const round = rounds.find((round) => round.name === roundHolding(fixture.round));

    if (round && Array.isArray(round.results) && round.results.length > 0) {
        throw new AppError("ROUND_LOCKED");
    }
}

// Rewrites the stored completedGames for the round this fixture sits in.
//
// Recounted from the fixture rows rather than incremented: an increment is
// wrong the moment a result is edited rather than added, and wrong again when a
// finished match is reopened. Nothing maintained this field before — the UI's
// round progress bar sat at zero because of it.
async function syncCompletedGames(fixture, client) {
    const state = normalizeState(await divisionsRepository.getStateForUpdate(fixture.division_id, client));
    const rounds = Array.isArray(state.rounds) ? state.rounds : [];

    const roundIndex = rounds.findIndex((round) => round.name === roundHolding(fixture.round));
    // A fixture whose round is not in state is not counted anywhere. That is a
    // malformed division rather than an error in this request, so the result is
    // still recorded.
    if (roundIndex === -1) {
        // The state write below is what normally moves the division's stamp, and
        // it is being skipped — but the result was still written, and the view
        // shows it. Stamp anyway, or the tournament's ETag stays put and readers
        // keep their cached page.
        await divisionsRepository.touchDivision(fixture.division_id, client);
        return null;
    }

    const completedGames = await fixturesRepository.countCompletedInRounds(
        fixture.division_id,
        fixtureRoundsOf(rounds[roundIndex].name),
        client
    );

    const updatedRounds = rounds.map((round, index) =>
        index === roundIndex ? { ...round, completedGames } : round
    );

    await divisionsRepository.updateStateRounds(fixture.division_id, updatedRounds, client);

    return completedGames;
}

// The third-place playoff carries its own round name but lives inside the
// Finals round — see generateKnockoutFixtures. These two functions are that one
// exception, read in each direction.

// Which round in state.rounds holds a fixture carrying this round name.
function roundHolding(fixtureRound) {
    return fixtureRound === THIRD_PLACE ? FINALS : fixtureRound;
}

// Which fixture round names belong to this round in state.rounds.
function fixtureRoundsOf(roundName) {
    return roundName === FINALS ? [FINALS, THIRD_PLACE] : [roundName];
}

const FINALS = "Finals";
const THIRD_PLACE = "3rd Place Playoff";

// Scores arrive as [[teamOneScore, teamTwoScore], ...], one pair per set. An
// empty list is valid and clears the result, which is how a match is reopened.
function validateSets(sets) {
    if (sets === undefined || sets === null) {
        return [];
    }

    if (!Array.isArray(sets)) {
        throw new AppError("INVALID_SCORE");
    }

    return sets.map((set) => {
        if (!Array.isArray(set) || set.length !== 2) {
            throw new AppError("INVALID_SCORE");
        }

        const [one, two] = set;
        if (!isScore(one) || !isScore(two)) {
            throw new AppError("INVALID_SCORE");
        }

        return [one, two];
    });
}

// 999 is generous enough for any real sport's single-set score while still
// rejecting fat-fingered or malicious values like 999999999.
const MAX_SET_SCORE = 999;

function isScore(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_SET_SCORE;
}

// The four statuses, per docs/tournament-rules.md. CANCELLED is the one the
// organiser used to set directly; the 0-0 convention that ScoreUpdateModal has
// always described in its caption is now a server rule.
function deriveStatus(sets, finished) {
    if (sets.length === 0) {
        return "UPCOMING";
    }

    if (!finished) {
        return "LIVE";
    }

    if (sets.length === 1 && sets[0][0] === 0 && sets[0][1] === 0) {
        return "CANCELLED";
    }

    return "COMPLETED";
}

function normalizeState(state) {
    if (!state) return { teams: [], rounds: [], currentRound: 0 };
    if (typeof state === "string") {
        try {
            return JSON.parse(state);
        } catch {
            return { teams: [], rounds: [], currentRound: 0 };
        }
    }
    return state;
}

export const fixtureService = {
    createFixture,
    updateResult
}

// helper functions

export function generateFixtures(rounds){
    let matchNo = 1;
    let fixtures = [];
    rounds.forEach(round => {
        let result;
        if (round.type === 'roundRobin'){
            // A limited-games-per-team League round carries its precomputed
            // pairs on `pairs` (set by divisions.service.js's createLeagueState)
            // instead of being derived from `groups` by the circle method — see
            // docs/division-state.md. The pairs are generation input only, never
            // stored: stripped once the fixtures they describe exist.
            if (Array.isArray(round.pairs)) {
                result = generatePartialRoundRobinFixtures(matchNo, round);
                delete round.pairs;
            } else {
                result = generateRoundRobinFixtures(matchNo, round);
            }
        } else if (round.type === 'knockout'){
            result = generateKnockoutFixtures(matchNo, round);
        } else {
            // Without this the next line reads matchNo off undefined, and an
            // unrecognised round type surfaced as "Cannot read properties of
            // undefined" — a 500 the controllers could not map to anything.
            throw new AppError("UNSUPPORTED_ROUND_TYPE", { details: { type: round.type } });
        }

        matchNo = result.matchNo;
        fixtures.push(result.fixtures);

        result.fixtures.forEach(fixture => {
            round.fixtures.push(fixture.id);
        })
        round.totalGames += result.fixtures.flat().length;
    });

    fixtures = fixtures.flat();
    return {rounds, fixtures};
}

function generateRoundRobinFixtures(matchNo, round){
    const fixtures = [];
    const maxRounds = Math.max(...round.groups.map(group => 
        group.length % 2 === 0
            ? group.length - 1
            : group.length
    ));

    for (let currentRound = 1; currentRound <= maxRounds; currentRound++){
        for (const group of round.groups){
            const currentFixtures = getFixturesForRound(group, currentRound);

            for (const [team1, team2] of currentFixtures){
                if (team1 === "BYE" || team2 === "BYE"){
                    continue;
                }

                fixtures.push({
                    id: uuidv4(),
                    matchNo: matchNo++,
                    team1: team1,
                    team2: team2,
                    round: round.name,
                    placeholder1: false,
                    placeholder2: false
                });
            }
        }
    }

    return {fixtures, matchNo};
}

// One fixture per pair in round.pairs, in order — the limited-games-per-team
// counterpart to generateRoundRobinFixtures's circle method. round.pairs is
// team-id pairs from generatePartialRoundRobinPairs, not a group to derive
// pairs from, so there is no rotation or bye-handling here at all.
function generatePartialRoundRobinFixtures(matchNo, round){
    const fixtures = round.pairs.map(([team1, team2]) => ({
        id: uuidv4(),
        matchNo: matchNo++,
        team1,
        team2,
        round: round.name,
        placeholder1: false,
        placeholder2: false
    }));

    return {fixtures, matchNo};
}

// A g-regular graph over teamIds via the circulant construction: teams sit in
// their seed order around a circle, and each "distance" d from 1..k connects
// every team to the ones d positions away in either direction, giving every
// team degree 2k. An odd g on an even team count adds the single diametrically
// opposite distance (n/2), which pairs each team with exactly one other team
// rather than two, contributing the odd "+1". See docs/division-state.md — this
// is a different mathematical object from a full round-robin cycle (a g-regular
// graph, not K_n), not a truncation of generateRoundRobinFixtures's circle
// method, which produces an uneven schedule if truncated whenever n is odd.
export function generatePartialRoundRobinPairs(teamIds, gamesPerTeam){
    const n = teamIds.length;
    const g = Number(gamesPerTeam);

    if (!Number.isInteger(g) || g <= 0 || g >= n - 1) {
        throw new AppError("INVALID_GAMES_PER_TEAM", { details: { teamCount: n, gamesPerTeam } });
    }

    if ((n * g) % 2 !== 0) {
        throw new AppError("GAMES_PER_TEAM_PARITY", { details: { teamCount: n, gamesPerTeam: g } });
    }

    const pairs = [];
    const fullDistances = Math.floor(g / 2);

    // A fixed distance d < n/2 walked over every i gives one n-edge cycle
    // (0,d), (d,2d)... wrapping around — every team appears in exactly two of
    // its edges (as i and as i's predecessor), so this is degree 2 per
    // distance with no duplicate edges to filter.
    for (let d = 1; d <= fullDistances; d++) {
        for (let i = 0; i < n; i++) {
            pairs.push([teamIds[i], teamIds[(i + d) % n]]);
        }
    }

    if (g % 2 === 1) {
        // Only reachable when n is even (the parity check above guarantees it
        // for odd g), so n/2 is a whole number and each team has exactly one
        // diametrically opposite partner.
        const half = n / 2;
        for (let i = 0; i < half; i++) {
            pairs.push([teamIds[i], teamIds[i + half]]);
        }
    }

    return pairs;
}

function generateKnockoutFixtures(matchNo, round){
    const fixtures = [];
    round.groups.forEach((group, index) => {
        if (group.length < 2) return;

        fixtures.push({
            id: uuidv4(),
            matchNo: matchNo++,
            team1: group[0],
            team2: group[1],
            round: (round.name === "Finals" && index === 0) ? "3rd Place Playoff" : round.name,
            placeholder1: Number.isInteger(group[0]),
            placeholder2: Number.isInteger(group[1]),
        })
    })

    return {fixtures, matchNo};
}

function rotateGroupTeams(group, rounds){
    const fixedTeam = group[0];
    const rotatingTeams = group.slice(1);

    for (let i = 1; i < rounds; i++){
        rotatingTeams.unshift(rotatingTeams.pop());
    }

    return [fixedTeam, ...rotatingTeams];
}

function getFixturesForRound(group, round){
    let currentGroup = [...group];
    if (currentGroup.length%2 !== 0){
        currentGroup.push("BYE");
    }

    currentGroup = rotateGroupTeams(currentGroup, round);

    const fixtures = [];

    while (currentGroup.length>=2){
        const currentFixture = [currentGroup[0], currentGroup.at(-1)];
        currentGroup = currentGroup.filter(team => !currentFixture.includes(team));

        fixtures.push(currentFixture);
    }

    return fixtures;
}

// Exported for unit tests only. Application code goes through generateFixtures
// and fixtureService.
export {
    generateRoundRobinFixtures,
    generateKnockoutFixtures,
    rotateGroupTeams,
    getFixturesForRound,
    validateSets,
    deriveStatus,
    roundHolding,
    fixtureRoundsOf
};