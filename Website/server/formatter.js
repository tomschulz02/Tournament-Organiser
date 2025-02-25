// formats the passed in data into a readable UI to send to the user
// Structure :

/* {
    "name": "Test",
    "date": "2025-02-22",
    "location": "Home",
    "description": "this is a test description",
    "structure": {
        "format": "combi",
        "numTeams": 16,
        "numGroups": 4,
        "knockout": 6,
        "type": "beach",
    },
    "teams": [
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
        "Team 16"
    ]
} */
export function formatCombiTournamentForStorage(data) {
	var format = {
		name: data["name"],
		date: data["date"],
		location: data["location"],
		description: data["description"] == undefined ? "Default description" : data["description"],
		format: "C",
		num_teams: data["structure"]["numTeams"],
		num_groups: data["structure"]["numGroups"] || 0,
		knockout: data["structure"]["knockout"] || 0,
		state: {
			groups: populateGroups(data["structure"]["numGroups"], data["teams"]),
			type: data["structure"]["type"],
		},
		created_by: data["user"],
		fixtures: [],
	};

	format["fixtures"] = generateFixturesCombi(format["state"]["groups"], data["structure"]["knockout"]);

	return format;
}

function generateFixturesCombi(groups, knockout) {
	var fixtures = [];
	// generate all possible fixtures for groups (unordered)
	groups.forEach((group, groupIndex) => {
		const rounds = group.length % 2 == 0 ? group.length - 1 : group.length;
		var groupFixtures = [];

		for (var round = 1; round <= rounds; round++) {
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

	//sort unordered group matches
	while (matchNo <= totalMatches) {
		var round = 0;
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
		case 1:
			sortedFixtures.push({
				match_no: matchNo,
				team1: "TBD",
				team2: "TBD",
				status: "WAITING",
				round: `Finals`,
				next_game: null,
			});
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
