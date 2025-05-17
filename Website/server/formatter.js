// formats the passed in data into a readable UI to send to the user
// Structure :

const tournamentData = {
	tournamentName: "Test",
	startDate: "2025-02-22",
	location: "Home",
	description: "this is a test description",
	format: "combi",
	teamCount: 18,
	numGroups: 4,
	knockoutRound: 8,
	type: "beach",
	teams: [
		"Team 1",
		"Team 2",
		"Team 3",
		"Team 4",
		"Team 5",
		"Team 6",
		"Team 7",
		"Team 8",
		"Team 9",
		"Team 10",
		"Team 11",
		"Team 12",
		"Team 13",
		"Team 14",
		"Team 15",
		"Team 16",
	],
};

const tournamentDataForView = {
	details: {
		id: 4,
		name: "TuksVolleyball Beach HS Tournament - Boys",
		date: "2025-05-23T22:00:00.000Z",
		location: "Pretoria",
		description:
			"The official TuksVolleyball Beach HST. Here you can find all information regarding the boys/mixed division",
		format: "C",
		num_teams: 8,
		num_groups: 2,
		knockout: true,
		state: {
			type: "beach",
			rounds: [
				{
					round: "Group Stage",
					groups: [
						["DSP 1", "DSJ 1", "DSJ 2", "Cooper"],
						["DSP 2", "DSP 3", "St. Vincent 1", "St. Vincent 2"],
					],
					matches: 12,
					completed: 12,
				},
				{ round: "Semifinals", groups: [], matches: 2, completed: 0 },
				{ round: "Finals", groups: [], matches: 1, completed: 0 },
			],
			currentRound: 0,
		},
		created_by: 4,
		status: "Ongoing",
		collection_id: 1,
	},
	fixtures: [
		{
			id: 70,
			tournament_id: 4,
			match_no: 1,
			team1: "DSP 1",
			team2: "Cooper",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool A",
			next_game: null,
		},
		{
			id: 75,
			tournament_id: 4,
			match_no: 2,
			team1: "DSJ 1",
			team2: "DSJ 2",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool A",
			next_game: null,
		},
		{
			id: 71,
			tournament_id: 4,
			match_no: 3,
			team1: "DSP 2",
			team2: "St. Vincent 2",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool B",
			next_game: null,
		},
		{
			id: 73,
			tournament_id: 4,
			match_no: 4,
			team1: "DSP 3",
			team2: "St. Vincent 1",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool B",
			next_game: null,
		},
		{
			id: 72,
			tournament_id: 4,
			match_no: 5,
			team1: "DSP 1",
			team2: "DSJ 2",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool A",
			next_game: null,
		},
		{
			id: 76,
			tournament_id: 4,
			match_no: 6,
			team1: "DSJ 1",
			team2: "Cooper",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool A",
			next_game: null,
		},
		{
			id: 74,
			tournament_id: 4,
			match_no: 7,
			team1: "DSP 2",
			team2: "St. Vincent 1",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool B",
			next_game: null,
		},
		{
			id: 78,
			tournament_id: 4,
			match_no: 8,
			team1: "DSP 3",
			team2: "St. Vincent 2",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool B",
			next_game: null,
		},
		{
			id: 82,
			tournament_id: 4,
			match_no: 9,
			team1: "DSP 1",
			team2: "DSJ 1",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool A",
			next_game: null,
		},
		{
			id: 77,
			tournament_id: 4,
			match_no: 10,
			team1: "DSJ 2",
			team2: "Cooper",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool A",
			next_game: null,
		},
		{
			id: 79,
			tournament_id: 4,
			match_no: 11,
			team1: "DSP 2",
			team2: "DSP 3",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool B",
			next_game: null,
		},
		{
			id: 83,
			tournament_id: 4,
			match_no: 12,
			team1: "St. Vincent 1",
			team2: "St. Vincent 2",
			status: "COMPLETED",
			result: [[1, 0]],
			round: "Pool B",
			next_game: null,
		},
		{
			id: 80,
			tournament_id: 4,
			match_no: 13,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Semifinals",
			next_game: 15,
		},
		{
			id: 81,
			tournament_id: 4,
			match_no: 14,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Semifinals",
			next_game: 15,
		},
		{
			id: 84,
			tournament_id: 4,
			match_no: 15,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Finals",
			next_game: null,
		},
	],
};

const nextRoundData = {
	rounds: [
		{
			round: "Group Stage",
			groups: [],
			matches: 24,
			completed: 24,
		},
		{
			round: "Quarterfinals",
			groups: [],
			matches: 4,
			completed: 0,
			qualifyingTeams: 8,
		},
		{
			round: "Semifinals",
			groups: [],
			matches: 2,
			completed: 0,
			qualifyingTeams: 4,
		},
		{
			round: "Finals",
			groups: [],
			matches: 2,
			completed: 0,
			qualifyingTeams: 4,
		},
	],
	teams: ["Team 1", "Team 2", "Team 14", "Team 12", "Team 8", "Team 7", "Team 6", "Team 13"],
	fixtures: [
		{
			id: 100,
			tournament_id: 5,
			match_no: 25,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Quarterfinals",
			next_game: 29,
			editable: false,
		},
		{
			id: 110,
			tournament_id: 5,
			match_no: 26,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Quarterfinals",
			next_game: 30,
			editable: false,
		},
		{
			id: 111,
			tournament_id: 5,
			match_no: 27,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Quarterfinals",
			next_game: 30,
			editable: false,
		},
		{
			id: 112,
			tournament_id: 5,
			match_no: 28,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Quarterfinals",
			next_game: 29,
			editable: false,
		},
		{
			id: 114,
			tournament_id: 5,
			match_no: 29,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Semifinals",
			next_game: 31,
			editable: false,
		},
		{
			id: 113,
			tournament_id: 5,
			match_no: 30,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Semifinals",
			next_game: 31,
			editable: false,
		},
		{
			id: 115,
			tournament_id: 5,
			match_no: 31,
			team1: "TBD",
			team2: "TBD",
			status: "WAITING",
			result: null,
			round: "Finals",
			next_game: null,
			editable: false,
		},
	],
	currentRound: 0,
};

// console.dir(determineQualifiedTeams(nextRoundData), { depth: null });
// formatCombiTournamentForStorage(tournamentData);
// console.dir(formatTournamentView(tournamentDataForView, { encode: (id) => id }, true), { depth: null });

export function formatCombiTournamentForStorage(data) {
	var format = {
		name: data["tournamentName"],
		date: data["startDate"],
		location: data["location"],
		description: data["description"] == "" ? "Default description" : data["description"],
		format: "C",
		num_teams: data["teamCount"],
		num_groups: data["numGroups"] || 0,
		knockout: parseInt(data["knockoutRound"]) == 0 ? false : true,
		state: {
			// groups: populateGroups(data["numGroups"], data["teams"]),
			type: data["type"],
			rounds: [],
			currentRound: 0,
		},
		created_by: data["user"],
		collection: data["tournamentCollection"] != "" ? data["tournamentCollection"] : null,
		fixtures: [],
	};
	// console.log(format.state.rounds);
	// format.state.rounds[0].groups = populateGroups(data["numGroups"], data["teams"]);

	format["fixtures"] = generateFixturesCombi(
		populateGroups(data["numGroups"], data["teams"]),
		parseInt(data["knockoutRound"]),
		format.state.rounds
	);

	// console.dir(format, { depth: null });
	return format;
}

function generateFixturesCombi(groups, knockout, rounds) {
	// console.log(groups, knockout);
	var fixtures = [];
	// generate all possible fixtures for groups (unordered)
	groups.forEach((group, groupIndex) => {
		const numrounds = group.length % 2 == 0 ? group.length - 1 : group.length;
		var groupFixtures = [];

		for (var round = 1; round <= numrounds; round++) {
			var i = 1;
			var remainingTeams = [...group];
			while (remainingTeams.length > 0) {
				if (i == 1) {
					if (remainingTeams[0] != remainingTeams.at(-round)) {
						groupFixtures.push([remainingTeams[0], remainingTeams.at(-round)]);
						remainingTeams.splice(-round, 1);
					}
					remainingTeams.splice(0, 1);

					i++;
				}

				if (i > 1 && i < Math.ceil(group.length / 2)) {
					var index = round % 4;
					if (round >= 4) {
						index = group.length % 2 == 0 ? index + 1 : 1;
					}

					if (remainingTeams[0] != remainingTeams.at(-index)) {
						groupFixtures.push([remainingTeams[0], remainingTeams.at(-index)]);
						remainingTeams.splice(-index, 1);
					}
					remainingTeams.splice(0, 1);
					i++;
				}

				if (i == Math.ceil(group.length / 2)) {
					if (remainingTeams[0] != remainingTeams.at(-1)) {
						groupFixtures.push([remainingTeams[0], remainingTeams.at(-1)]);
					}
					remainingTeams = [];
				}
			}
		}
		fixtures.push(groupFixtures);
	});
	var matchNo = 1;
	var sortedFixtures = [];

	var totalMatches = 0;
	fixtures.forEach((group) => {
		totalMatches += group.length;
	});

	rounds.push({ round: "Group Stage", matches: totalMatches, completed: 0, groups: groups, standings: [] });

	//sort unordered group matches
	var round = 0;
	while (matchNo <= totalMatches) {
		fixtures.forEach((group, index) => {
			const mpr = Math.floor(groups[index].length / 2);
			for (var i = round * mpr; i < (round + 1) * mpr; i++) {
				const fix = {
					match_no: matchNo,
					team1: group[i][0],
					team2: group[i][1],
					status: "WAITING",
					round: `Pool ${String.fromCharCode(65 + index)}`,
					next_game: null,
				};
				matchNo++;
				sortedFixtures.push(fix);
			}
		});
		round++;
	}

	//generate knockout fixtures
	switch (knockout) {
		case 12:
			for (var i = 0; i < 8; i++) {
				sortedFixtures.push({
					match_no: matchNo,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `Round of 24`,
					next_game: matchNo + 8,
				});
				matchNo++;
			}
			knockout = knockout - 4;
			rounds.push({ round: "Round of 24", matches: 8, completed: 0, groups: [], qualifyingTeams: 24, standings: [] });
		case 8:
			var dec = 1;
			for (var i = 0; i < 8; i++) {
				sortedFixtures.push({
					match_no: matchNo,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `Round of 16`,
					next_game: i < 4 ? matchNo + 8 : matchNo + 8 - dec,
				});
				matchNo++;
				if (i >= 4) dec += 2;
			}
			knockout = knockout - 4;
			rounds.push({ round: "Round of 16", matches: 8, completed: 0, groups: [], qualifyingTeams: 16, standings: [] });
		case 6:
			for (var i = 0; i < 4; i++) {
				sortedFixtures.push({
					match_no: matchNo,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `Round of 12`,
					next_game: matchNo + 4,
				});
				matchNo++;
			}
			knockout = knockout - 2;
			rounds.push({ round: "Round of 12", matches: 4, completed: 0, groups: [], qualifyingTeams: 12, standings: [] });
		case 4:
			var dec = 1;
			for (var i = 0; i < 4; i++) {
				sortedFixtures.push({
					match_no: matchNo,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `Quarterfinals`,
					next_game: i < 2 ? matchNo + 4 : matchNo + 4 - dec,
				});
				matchNo++;
				if (i >= 2) dec += 2;
			}
			knockout = knockout - 2;
			rounds.push({ round: "Quarterfinals", matches: 4, completed: 0, groups: [], qualifyingTeams: 8, standings: [] });
		case 2:
			for (var i = 0; i < 2; i++) {
				sortedFixtures.push({
					match_no: matchNo,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `Semifinals`,
					next_game: i == 0 ? matchNo + 2 : matchNo + 1,
				});
				matchNo++;
			}
			knockout = knockout - 1;
			rounds.push({ round: "Semifinals", matches: 2, completed: 0, groups: [], qualifyingTeams: 4, standings: [] });
		case 1:
			sortedFixtures.push(
				{
					match_no: matchNo++,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `3rd Place Playoff`,
					next_game: null,
				},
				{
					match_no: matchNo,
					team1: "TBD",
					team2: "TBD",
					status: "WAITING",
					round: `Finals`,
					next_game: null,
				}
			);
			rounds.push({ round: "Finals", matches: 2, completed: 0, groups: [], qualifyingTeams: 4, standings: [] });
			break;

		default:
			break;
	}

	return sortedFixtures;
}

// populates the groups based on the number of groups and list of teams provided by user.
// populates the groups group-by-group by using a formula based on the number of groups,
// the current group index and the current index of the team.
// i figured out that teams that would be at an even index in the group (0,2,6,etc) share a formula
// to find which team in a seeded team list should be in the group, same as well for the odd indices
export function populateGroups(numGroups, teamList) {
	// console.log(numGroups, teamList);
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
	return groups;
}

export function formatTournamentsForBrowse(tournaments, collections, tournamentHash, collectionHash) {
	var result = [];
	tournaments.forEach((tour) => {
		var date = getDate(tour.date);
		const tournament = {
			id: "t_" + tournamentHash.encode(tour.id),
			name: tour.name,
			date: date,
			location: tour.location,
			type: tour["state"]["type"],
			format: expandFormat(tour.format),
			classification: "tournament",
		};
		result.push(tournament);
	});
	collections.forEach((col) => {
		result.push({
			id: "c_" + collectionHash.encode(col.id),
			name: col.name,
			num_tournaments: col.tournament_count,
			type: "collection",
			classification: "collection",
		});
	});
	return result;
}

export function formatTournamentView(tournament, tournamentHash, following) {
	// console.dir(tournament, { depth: null });
	const remainingFixtures = separateFixturesAndResults(
		tournament.fixtures,
		tournament.details.status
	).remainingFixtures;
	const results = separateFixturesAndResults(tournament.fixtures, tournament.details.status).results;
	// console.log("Test");
	// console.log("RESULTS", results);
	var pages = {
		details: {
			id: tournamentHash.encode(tournament.details.id),
			name: tournament.details.name,
			description: tournament.details.description,
			format: expandFormat(tournament.details.format),
			teams: tournament.details.num_teams,
			startDate: getDate(tournament.details.date),
			status: tournament.details.status,
			upcomingFixtures: remainingFixtures.slice(0, 10),
			results: results.slice(0, 10),
			following: following,
			location: tournament.details.location,
			type: tournament.details.state.type,
		},
		fixtures: {
			remainingFixtures: remainingFixtures,
			results: results,
			rounds: tournament.details.state.rounds,
			currentRound: parseInt(tournament.details.state.currentRound),
		},
		standings: determineStandings(tournament.details.state.rounds, results, tournament.details.format),
		teams: tournament.details.state.teams,
	};
	// tournament.details.state.rounds.forEach((round) => {
	// 	pages.standings.push(determineStandings(round.groups, results, tournament.details.format));
	// });
	// console.dir(pages.standings, { depth: null });
	// console.log("SUCCESS");
	return pages;
}

function expandFormat(symbol) {
	var format;
	switch (symbol) {
		case "C":
			format = "Pool Play + Knockout";
			break;
		case "SE":
			format = "Single Elimination";
			break;
		case "DE":
			format = "Double Elimination";
			break;
		case "KOTB":
			format = "King Of The Beach";
			break;
		case "KOTC":
			format = "King Of The Court";
			break;
		default:
			format = null;
			break;
	}
	return format;
}

function getDate(date) {
	var start = new Date(date);
	start.setUTCDate(start.getUTCDate() + 1);
	start = start.toISOString().split("T")[0];

	return start;
}

function separateFixturesAndResults(fixtures, tourStatus) {
	var remainingFixtures = [];
	var results = [];

	fixtures.forEach((fix) => {
		var result = fix.result;
		if (!result || fix.status != "COMPLETED") {
			fix.editable =
				(fix.status == "WAITING" || fix.status == "ONGOING") &&
				fix.team1 != "TBD" &&
				fix.team2 != "TBD" &&
				tourStatus == "Ongoing";
			remainingFixtures.push(fix);
		} else {
			// console.log("RESULT", result);
			// fix.result = JSON.parse(result);
			fix.editable = false;
			results.push(fix);
		}
	});

	return { remainingFixtures, results };
}

function determineStandings(rounds, results, format) {
	// console.log({ teams, results, format });
	const allStandings = [];
	if (format == "C") {
		rounds.forEach((round) => {
			const teams = round.groups;
			const standings = { round: round.round, groups: [] };
			teams.forEach((group) => {
				var groupStandings = [];
				group.forEach((team) => {
					groupStandings.push({
						name: team,
						pointsFor: 0,
						pointsAgainst: 0,
						setsWon: 0,
						setsLost: 0,
						won: 0,
						lost: 0,
						played: 0,
						pointsRatio: 0,
						setsRatio: 0,
					});
				});
				standings.groups.push(groupStandings);
			});

			// updates standings based on the results of the fixtures
			results.forEach((result) => {
				if (
					(round.round == "Group Stage" && result.round.includes("Pool")) ||
					round.round == result.round ||
					(round.round == "Finals" && result.round.includes("Playoff"))
				) {
					var res = determineResult(result);
					if (res == null) return;
					res.forEach((team) => {
						standings.groups.forEach((group) => {
							group.forEach((groupTeam) => {
								if (groupTeam.name == team.name) {
									groupTeam.pointsFor += team.pointsFor;
									groupTeam.pointsAgainst += team.pointsAgainst;
									groupTeam.setsWon += team.setsWon;
									groupTeam.setsLost += team.setsLost;
									groupTeam.played++;
									if (team.won) groupTeam.won++;
									else groupTeam.lost++;
								}
							});
						});
					});
				}
			});

			// updates calculated values for each team in the standings
			standings.groups.forEach((group) => {
				group.forEach((team) => {
					team.pointsRatio = team.pointsFor / team.pointsAgainst || 0;
					team.setsRatio = team.setsWon / team.setsLost || 0;
					// team.played = team.won + team.lost;
				});
			});

			// sorts the standings based on the points ratio and sets ratio
			standings.groups.forEach((group) => {
				group.sort((a, b) => b.won - a.won || b.setsRatio - a.setsRatio || b.pointsRatio - a.pointsRatio);
			});

			allStandings.push(standings);
		});
	}
	// console.log("STANDINGS", standings);
	return allStandings;
}

function determineResult(result) {
	var resObject = [
		{ name: result.team1, pointsFor: 0, pointsAgainst: 0, setsWon: 0, setsLost: 0, won: false },
		{ name: result.team2, pointsFor: 0, pointsAgainst: 0, setsWon: 0, setsLost: 0, won: false },
	];
	result.result.map((set) => {
		resObject[0].pointsFor += set[0];
		resObject[0].pointsAgainst += set[1];
		resObject[1].pointsFor += set[1];
		resObject[1].pointsAgainst += set[0];
		if (set[0] > set[1]) {
			resObject[0].setsWon++;
			resObject[1].setsLost++;
		} else {
			resObject[1].setsWon++;
			resObject[0].setsLost++;
		}
	});
	resObject[0].won = resObject[0].setsWon > resObject[1].setsWon;
	resObject[1].won = resObject[1].setsWon > resObject[0].setsWon;
	// console.log("RESULT", resObject);
	return resObject;
}

export function determineQualifiedTeams({ rounds, teams, fixtures, currentRound, previousStandings }) {
	// rounds[currentRound] = { ...rounds[currentRound], standings: previousStandings };
	currentRound = parseInt(currentRound) + 1;
	const gap = rounds[currentRound].qualifyingTeams - rounds[currentRound].matches * 2;
	for (let i = gap; i < teams.length - rounds[currentRound].matches; i++) {
		const team1 = teams[i];
		const team2 = teams[teams.length - (i - gap) - 1];
		if (team1 && team2) {
			rounds[currentRound].groups.push([team1, team2]);
		}
	}
	for (let i = 0; i < gap; i++) {
		rounds[currentRound + 1].groups.push([teams[i], "TBD"]);
	}
	// update the fixtures for the next round
	let updatedFixtures = [];
	for (let i = currentRound; i < rounds.length; i++) {
		if (rounds[i].groups.length > 0) {
			fixtures.forEach((fix, index) => {
				if (fix.round == rounds[i].round) {
					const fixture = {
						id: fix.id,
						team1: rounds[i].groups[index][0] ?? "TBD",
						team2: rounds[i].groups[index][1] ?? "TBD",
					};
					updatedFixtures.push(fixture);
				}
			});
		}
	}

	return { rounds, updatedFixtures, currentRound };
}
