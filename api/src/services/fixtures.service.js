import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";

const db = DatabaseConnection();

async function createFixture(divisionId, details, client = db){
    try {
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

        await fixturesRepository.createFixture(details.id, divisionId, details.matchNo, team1, team2, placeholder1, placeholder2, details.round);
    } catch (error) {
        throw new Error(error);
    }
}

export const fixtureService = {
    createFixture
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