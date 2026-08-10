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

function isScore(value) {
    return Number.isInteger(value) && value >= 0;
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
            result = generateRoundRobinFixtures(matchNo, round);
        } else if (round.type === 'knockout'){
            result = generateKnockoutFixtures(matchNo, round);
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