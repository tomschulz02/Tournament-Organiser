import { AppError } from "../errors.js";
import { divisionsRepository } from "../repositories/divisions.repository.js";
import { generateFixtures, fixtureService } from "./fixtures.service.js";
import { v4 as uuidv4 } from "uuid";

// `client` is required, not defaulted: a division is only ever created as part
// of creating a tournament, inside that transaction. createTournament owns the
// boundary — see docs/decisions.md.
async function createDivision(details, tournamentId, userId, client){
    const divisionId = uuidv4();

    // A team is either an existing one, carrying an id, or a new one carrying a
    // name. An id from the client is untrusted and must be confirmed to belong
    // to the organiser before it is linked; see docs/decisions.md.
    const suppliedIds = details.teams.filter((team) => team.id).map((team) => team.id);
    const ownedById = new Map();

    if (suppliedIds.length > 0) {
        const supplied = await divisionsRepository.getTeamsByIds(suppliedIds);
        for (const team of supplied) {
            if (team.user_id === userId) ownedById.set(team.id, team);
        }

        if (suppliedIds.some((id) => !ownedById.has(id))) {
            throw new AppError("TEAM_NOT_OWNED");
        }
    }

    // A new team is nothing but its name, so an entry carrying neither is not a
    // team. teams.name is NOT NULL; without this it is a 500.
    if (details.teams.some((team) => !team.id && !team.name?.trim())) {
        throw new AppError("MISSING_FIELDS");
    }

    // The same team twice in one division would corrupt standings and fixture
    // generation, whether it repeats as an id or as a name.
    const names = details.teams.map((team) =>
        (team.id ? ownedById.get(team.id).name : team.name).trim().toLowerCase()
    );

    if (new Set(suppliedIds).size !== suppliedIds.length || new Set(names).size !== names.length) {
        throw new AppError("DUPLICATE_TEAM");
    }

    // insert teams into DB, returns team ids for rounds and fixtures
    const teamIds = [];
    for (let team of details.teams) {
        // Absent, not null: TournamentCreation.jsx omits the key entirely for a
        // new team, so a === null test would take the existing-team branch and
        // push undefined into state.teams.
        if (!team.id){
            teamIds.push(await divisionsRepository.createTeam(team.name, userId, client));
        } else {
            teamIds.push(team.id);
        }
    }

    details.teams = teamIds;

    //generate division details
    const division = generateDivisionDetails(details.type, details.teams, details.num_teams, details.num_groups, details.knockout_teams)
    division.name = details.name;
    division.num_teams = details.num_teams;

    // generate fixture details
    const generatedFixtures = generateFixtures(division.state.rounds);
    division.state.rounds = generatedFixtures.rounds;

    //store division in database
    await divisionsRepository.createDivision(divisionId, tournamentId, division, userId, client);

    //store fixtures in database
    // Sequential and awaited, for the same reason as the divisions loop in
    // createTournament: one pg client cannot run concurrent queries.
    for (const fixture of generatedFixtures.fixtures) {
        await fixtureService.createFixture(divisionId, fixture, client);
    }

    return divisionId;
}

export const divisionService = {
    createDivision
}



// Helper Functions

function generateDivisionDetails(format, teams, num_teams, num_groups=1, qualifyingTeams=0){
    let division = {};
    if (format === 'classic'){
        division.type = "Classic";
        division.state = createClassicState(teams, num_teams, num_groups, qualifyingTeams);
    } else if (format === 'league'){
        division.type = "League";
        division.state = createLeagueState(teams, num_teams);
    } else if (format === 'single_elim'){
        throw new AppError("FORMAT_NOT_IMPLEMENTED");
        /* v8 ignore next 2 -- unreachable: kept as a note of the intended shape */
        division.type = "Single Elimination";
        numGroups = Math.ceil(num_teams/2);
    } else if (format === 'double_elim'){
        throw new AppError("FORMAT_NOT_IMPLEMENTED");
        /* v8 ignore next -- unreachable: kept as a note of the intended shape */
        division.type = "Double Elimination";
    } else {
        throw new AppError("UNSUPPORTED_FORMAT");
    }

    return division;
}

function createLeagueState(teams, num_teams){
    return {
        teams: teams,
        rounds: [
            {
                name: "Round robin",
                type: "roundRobin",
                groups: [
                    [teams]
                ],
                results: [],
                totalGames: (num_teams*(num_teams-1))/2,
                completedGames: 0,
                fixtures: []
            }
        ],
        currentRound: 0
    }
}

function createClassicState(teams, num_teams, num_groups, qualifyingTeams) {
    const state = {
        teams: teams,
        rounds: [],
        currentRound: 0
    }

    state.rounds.push({
        name: "Pool Play",
        type: "roundRobin",
        groups: populateGroups(num_groups, teams),
        results: [],
        totalGames: 0,
        completedGames: 0,
        fixtures: []
    })

    num_teams = qualifyingTeams;

    while (num_teams>=2){
        // populate teams array with indices that link to rankings from previous rounds
        teams = Array.from({length: num_teams}, (_, i) => i);
        const round = {
            type: "knockout",
            results: [],
            totalGames: 0,
            completedGames: 0,
            fixtures: []
        };
        if (Number.isInteger(Math.log2(num_teams))){
            if (num_teams>8){
                round.name = "Round of " + num_teams;
            } else {
                switch (num_teams){
                    case 8:
                        round.name = "Quarterfinals";
                        break;
                    case 4:
                        round.name = "Semifinals";
                        break;
                    case 2:
                        round.name = "Finals";
                        break;
                    // Unreachable: the loop only runs while num_teams >= 2 and
                    // this arm only runs for powers of two, so the switch can
                    // only ever see 8, 4 or 2.
                    /* v8 ignore start */
                    default:
                        round.name = "Unknown";
                    /* v8 ignore stop */
                }
            }
            round.groups = populateGroups(num_teams/2, teams);

            // add teams for 3rd Place Playoffs
            if (round.name === "Finals"){
                round.groups.unshift([2,3]);
            }

            num_teams = num_teams/2;
        } else {
            // calculates how many teams go straight to the next round and how many need to play an extra round
            // teams qualifying straight to next round = 2 * no. of teams in next round - num_teams
            // teams playing in this round = 2 * ( num_teams - no. of teams in next round )
            // no. of teams in next round = 2 ^ integer part of log(2, num_teams) 

            round.name = "Round of " + num_teams;
            const qual = Math.pow(2, Math.floor(Math.log2(num_teams)));
            const straight = 2*qual - num_teams;

            // add one team groups for the teams going straight to next round
            round.groups = populateGroups(straight, teams.slice(0,straight));
            
            // add groups for teams playing in current round
            const remainingGroups = populateGroups(num_teams-qual, teams.slice(straight, num_teams));
            remainingGroups.forEach(group => {
                round.groups.push(group);
            });

            num_teams=qual;
        }
        state.rounds.push(round);
    }

    return state;
}

function populateGroups(numGroups, teamList) {
	let groups = [];
	numGroups = parseInt(numGroups);
	var teamsPerGroup = Math.ceil(teamList.length / numGroups);
	for (var groupNo = 1; groupNo <= numGroups; groupNo++) {
		var group = [];
		for (var index = 0; index < teamsPerGroup; index++) {
			if (index % 2 == 0) {
				var pos = index * numGroups + groupNo - 1;
			} else {
				var pos = (index + 1) * numGroups - groupNo;
			}
			if (teamList[pos] === undefined) continue;
			group.push(teamList[pos]);
		}
		groups.push(group);
	}
	// console.log('Groups populated', groups);
	return groups;
}

// Exported for unit tests only. Application code goes through createDivision,
// which wraps these in a database transaction; the generation logic itself is
// pure and is tested directly.
export {
    generateDivisionDetails,
    createLeagueState,
    createClassicState,
    populateGroups
};

// const division = createClassicState(["Team1", "Team2", "team3","team4","team5","team6","team7","team8","team9"], 9, 2, 6);
// console.dir(generateFixtures(division.rounds), {depth: null});