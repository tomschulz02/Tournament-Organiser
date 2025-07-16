const formatOptions = {
	combi: 'C',
	single: 'SE',
	double: 'DE',
	round: 'CP',
};

const testingTournament = {
	tournamentName: 'Test',
	startDate: '2025-07-17',
	location: 'Pretoria',
	description: '',
	tournamentCollection: '',
	format: 'single',
	type: 'indoor',
	teamCount: 18,
	numGroups: 4,
	knockoutRound: 8,
	teams: [
		'Team 1',
		'Team 2',
		'Team 3',
		'Team 4',
		'Team 5',
		'Team 6',
		'Team 7',
		'Team 8',
		'Team 9',
		'Team 10',
		'Team 11',
		'Team 12',
		'Team 13',
		'Team 14',
		'Team 15',
		'Team 16',
		'Team 17',
		'Team 18',
	],
};

// formatCombiTournamentForStorage(testingTournament);

export function formatCombiTournamentForStorage(data) {
	if (data['format'] === 'single') {
		data['numGroups'] = Math.pow(2, Math.floor(Math.log2(data['teamCount'])));
		data['knockoutRound'] = data['numGroups'] / 2;
	}

	var format = {
		name: data['tournamentName'],
		date: data['startDate'],
		location: data['location'],
		description: data['description'] == '' ? 'Default description' : data['description'],
		format: formatOptions[data['format']] || 'C',
		num_teams: data['teamCount'],
		num_groups: data['numGroups'] || 0,
		knockout: parseInt(data['knockoutRound']) == 0 ? false : true,
		state: {
			// groups: populateGroups(data["numGroups"], data["teams"]),
			type: data['type'],
			teams: data['teams'],
			rounds: [],
			currentRound: 0,
		},
		created_by: data['user'],
		collection: data['tournamentCollection'] != '' ? data['tournamentCollection'] : null,
		fixtures: [],
	};

	format['fixtures'] = generateFixturesCombi(
		populateGroups(data['numGroups'], data['teams']),
		parseInt(data['knockoutRound']),
		format.state.rounds
	);

	// console.log(format);

	return format;
}

export function generateFixturesCombi(groups, knockout, rounds) {
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
	// console.log('Fixtures generated for groups', fixtures);

	var matchNo = 1;
	var sortedFixtures = [];

	var totalMatches = 0;
	fixtures.forEach((group) => {
		totalMatches += group.length;
	});

	rounds.push({ round: 'Group Stage', matches: totalMatches, completed: 0, groups: groups, standings: [] });

	//sort unordered group matches
	var round = 0;
	while (matchNo <= totalMatches) {
		fixtures.forEach((group, index) => {
			const mpr = Math.floor(groups[index].length / 2);
			for (var i = round * mpr; i < (round + 1) * mpr && i < group.length; i++) {
				const fix = {
					match_no: matchNo,
					team1: group[i][0],
					team2: group[i][1],
					status: 'WAITING',
					round: `Pool ${String.fromCharCode(65 + index)}`,
					next_game: null,
				};
				matchNo++;
				sortedFixtures.push(fix);
			}
		});
		round++;
	}
	// console.log('Fixtures sorted for groups');

	//generate knockout fixtures
	for (; knockout > 0; ) {
		switch (knockout) {
			case 12:
				for (var i = 0; i < 8; i++) {
					sortedFixtures.push({
						match_no: matchNo,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `Round of 24`,
						next_game: matchNo + 8,
					});
					matchNo++;
				}
				knockout = knockout - 4;
				rounds.push({ round: 'Round of 24', matches: 8, completed: 0, groups: [], qualifyingTeams: 24, standings: [] });
				break;
			case 8:
				var dec = 1;
				for (var i = 0; i < 8; i++) {
					sortedFixtures.push({
						match_no: matchNo,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `Round of 16`,
						next_game: i < 4 ? matchNo + 8 : matchNo + 8 - dec,
					});
					matchNo++;
					if (i >= 4) dec += 2;
				}
				knockout = knockout - 4;
				rounds.push({ round: 'Round of 16', matches: 8, completed: 0, groups: [], qualifyingTeams: 16, standings: [] });
				break;
			case 6:
				for (var i = 0; i < 4; i++) {
					sortedFixtures.push({
						match_no: matchNo,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `Round of 12`,
						next_game: matchNo + 4,
					});
					matchNo++;
				}
				knockout = knockout - 2;
				rounds.push({ round: 'Round of 12', matches: 4, completed: 0, groups: [], qualifyingTeams: 12, standings: [] });
				break;
			case 4:
				var dec = 1;
				for (var i = 0; i < 4; i++) {
					sortedFixtures.push({
						match_no: matchNo,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `Quarterfinals`,
						next_game: i < 2 ? matchNo + 4 : matchNo + 4 - dec,
					});
					matchNo++;
					if (i >= 2) dec += 2;
				}
				knockout = knockout - 2;
				rounds.push({
					round: 'Quarterfinals',
					matches: 4,
					completed: 0,
					groups: [],
					qualifyingTeams: 8,
					standings: [],
				});
				break;
			case 2:
				for (var i = 0; i < 2; i++) {
					sortedFixtures.push({
						match_no: matchNo,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `Semifinals`,
						next_game: i == 0 ? matchNo + 2 : matchNo + 1,
					});
					matchNo++;
				}
				knockout = knockout - 1;
				rounds.push({ round: 'Semifinals', matches: 2, completed: 0, groups: [], qualifyingTeams: 4, standings: [] });
				break;
			case 1:
				sortedFixtures.push(
					{
						match_no: matchNo++,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `3rd Place Playoff`,
						next_game: null,
					},
					{
						match_no: matchNo,
						team1: 'TBD',
						team2: 'TBD',
						status: 'WAITING',
						round: `Finals`,
						next_game: null,
					}
				);
				knockout = knockout - 1;
				rounds.push({ round: 'Finals', matches: 2, completed: 0, groups: [], qualifyingTeams: 4, standings: [] });
				break;

			default:
				break;
		}
	}
	// console.log('Fixtures generated for knockout rounds');

	return sortedFixtures;
}

// populates the groups based on the number of groups and list of teams provided by user.
// populates the groups group-by-group by using a formula based on the number of groups,
// the current group index and the current index of the team.
// i figured out that teams that would be at an even index in the group (0,2,6,etc) share a formula
// to find which team in a seeded team list should be in the group, same as well for the odd indices
export function populateGroups(numGroups, teamList) {
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

export function formatTournamentsForBrowse(tournaments, collections, tournamentHash, collectionHash) {
	var result = [];
	tournaments.forEach((tour) => {
		var date = getDate(tour.date);
		const tournament = {
			id: 't_' + tournamentHash.encode(tour.id),
			name: tour.name,
			date: date,
			location: tour.location,
			type: tour['state']['type'],
			format: expandFormat(tour.format),
			classification: 'tournament',
		};
		result.push(tournament);
	});
	collections.forEach((col) => {
		result.push({
			id: 'c_' + collectionHash.encode(col.id),
			name: col.name,
			num_tournaments: col.tournament_count,
			type: 'collection',
			classification: 'collection',
		});
	});
	return result;
}

export function formatTournamentView(tournament, tournamentHash, following) {
	const remainingFixtures = separateFixturesAndResults(
		tournament.fixtures,
		tournament.details.status
	).remainingFixtures;
	const results = separateFixturesAndResults(tournament.fixtures, tournament.details.status).results;

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
	return pages;
}

function expandFormat(symbol) {
	var format;
	switch (symbol) {
		case 'C':
			format = 'Pool Play + Knockout';
			break;
		case 'SE':
			format = 'Single Elimination';
			break;
		case 'DE':
			format = 'Double Elimination';
			break;
		case 'KOTB':
			format = 'King Of The Beach';
			break;
		case 'KOTC':
			format = 'King Of The Court';
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
	start = start.toISOString().split('T')[0];

	return start;
}

function separateFixturesAndResults(fixtures, tourStatus) {
	const remainingFixtures = [];
	let results = [];
	const cancelled = [];

	fixtures.forEach((fix) => {
		var result = fix.result;
		if (fix.status == 'CANCELLED') {
			fix.editable = false;
			cancelled.push(fix);
		} else if (!result || fix.status != 'COMPLETED') {
			fix.editable =
				(fix.status == 'WAITING' || fix.status == 'ONGOING') &&
				fix.team1 != 'TBD' &&
				fix.team2 != 'TBD' &&
				tourStatus == 'Ongoing';
			remainingFixtures.push(fix);
		} else {
			fix.editable = false;
			results.push(fix);
		}
	});

	results = results.concat(cancelled);

	return { remainingFixtures, results };
}

function determineStandings(rounds, results, format) {
	const allStandings = [];
	if (format == 'C' || format == 'SE') {
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
					(round.round == 'Group Stage' && result.round.includes('Pool')) ||
					round.round == result.round ||
					(round.round == 'Finals' && result.round.includes('Playoff'))
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
		} else if (set[0] < set[1]) {
			resObject[1].setsWon++;
			resObject[0].setsLost++;
		}
	});
	resObject[0].won = resObject[0].setsWon > resObject[1].setsWon;
	resObject[1].won = resObject[1].setsWon > resObject[0].setsWon;
	return resObject;
}

export function determineQualifiedTeams({ rounds, teams, fixtures, currentRound, previousStandings }) {
	// rounds[currentRound] = { ...rounds[currentRound], standings: previousStandings };
	currentRound = parseInt(currentRound) + 1;
	let updatedFixtures = [];
	if (rounds[currentRound].round === 'Finals' || currentRound === rounds.length) {
		// if the current round is the finals or the last round, we just pair the teams in the knockout format
		for (let i = 0; i < teams.length; i += 2) {
			const team1 = teams[i];
			const team2 = teams[i + 1];
			if (team1 && team2) {
				rounds[currentRound].groups.push([team1, team2]);
			} else if (team1) {
				rounds[currentRound].groups.push([team1, 'TBD']);
			} else if (team2) {
				rounds[currentRound].groups.push(['TBD', team2]);
			}
		}

		for (let i = fixtures.length - 1; i >= 0; i--) {
			const fixture = {
				id: fixtures[fixtures.length - 1 - i].id,
				team1: rounds[currentRound].groups[i][0] ?? 'TBD',
				team2: rounds[currentRound].groups[i][1] ?? 'TBD',
			};
			updatedFixtures.push(fixture);
		}
	} else {
		const gap = rounds[currentRound].qualifyingTeams - rounds[currentRound].matches * 2;
		for (let i = gap; i < teams.length - rounds[currentRound].matches; i++) {
			const team1 = teams[i];
			const team2 = teams[teams.length - (i - gap) - 1];
			if (team1 && team2) {
				rounds[currentRound].groups.push([team1, team2]);
			}
		}
		for (let i = 0; i < gap; i++) {
			rounds[currentRound + 1].groups.push([teams[i], 'TBD']);
		}

		// update the fixtures for the next round

		for (let i = currentRound; i < rounds.length; i++) {
			if (rounds[i].groups.length > 0) {
				fixtures.forEach((fix, index) => {
					if (fix.round == rounds[i].round) {
						const fixture = {
							id: fix.id,
							team1: rounds[i].groups[index][0] ?? 'TBD',
							team2: rounds[i].groups[index][1] ?? 'TBD',
						};
						updatedFixtures.push(fixture);
					}
				});
			}
		}
	}

	return { rounds, updatedFixtures, currentRound };
}
