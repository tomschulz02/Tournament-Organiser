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
        const numRounds = numTeams % 2 === 0 ? numTeams - 1 : numTeams;

        for (let currentRound = 1; currentRound <= numRounds; currentRound++){
            let remainingTeams = [...group];
            let matchCount = 0;
            
            while (remainingTeams.length>1){
                let currentFixture = [];
                
                if (matchCount === 0 && remainingTeams.length>2){ // first fixture of round
                    if (remainingTeams.length-currentRound === 0){
                        remainingTeams.splice(0,1);
                        continue;
                    }

                    currentFixture = [
                        remainingTeams[0],
                        remainingTeams[remainingTeams.length-currentRound]
                    ];
                } else if (matchCount < Math.floor(numTeams/2)-1) { // rest of the fixtures for this round minus the last one
                    let index = currentRound % 4;
                    if (currentRound >= 4) {
                        index = numTeams % 2 === 0 ? index + 1 : 1;
                    }

                    if (remainingTeams[0] === remainingTeams.at(-index)){
                        remainingTeams.splice(0,1);
                        continue;
                    }

                    currentFixture = [
                        remainingTeams[0],
                        remainingTeams.at(-index)
                    ];
                    // currentFixture = [
                    //     remainingTeams[0],
                    //     remainingTeams[remainingTeams.length-currentRound+1]
                    // ];
                } else { // last fixture of the round
                    currentFixture = [
                        remainingTeams[0],
                        remainingTeams[1]
                    ];
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

                remainingTeams = remainingTeams.filter(team => !currentFixture.includes(team));
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