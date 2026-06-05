import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db.js";
import { fixturesRepository } from "../repositories/fixtures.repository.js";

const db = DatabaseConnection();

async function createFixture(divisionId, details, client = db){

}

export const fixtureService = {
    createFixture
}

// helper functions

export function generateFixtures(rounds){
    let matchNo = 0;
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
    const numGroups = round.groups.length;
    let previousGroupMatchesPerRound = 0;
    let matchesPerRound = 0;
    round.groups.forEach(group => {
        matchesPerRound += Math.floor(group.length/2);
    })

    round.groups.forEach((group, index) => {
        const numTeams = group.length;
        if (numTeams%2 !== 0){
            group.push("BYE");
        }
        const numRounds = group.length - 1;

        for (let currentRound = 1; currentRound <= numRounds; currentRound++){
            let remainingTeams = rotateGroupTeams(group, currentRound);
            let matchCount = 0;
            
            while (remainingTeams.length>1){
                const currentFixture = [remainingTeams[0], remainingTeams.at(-1)];
                remainingTeams = remainingTeams.filter(team => !currentFixture.includes(team));

                if (currentFixture[0] === "BYE" || currentFixture[1] === "BYE"){
                    continue;
                }

                matchCount++;
                const currentMatchNo = matchCount + (currentRound-1) * matchesPerRound + index * previousGroupMatchesPerRound;

                fixtures.push({
                    id: uuidv4(),
                    matchNo: currentMatchNo,
                    team1: currentFixture[0],
                    team2: currentFixture[1],
                    round: round.name,
                    placeholder1: false,
                    placeholder2: false
                });
                
                matchNo = currentMatchNo+1;
            }
        }
        previousGroupMatchesPerRound = Math.floor(numTeams/2);
    })

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