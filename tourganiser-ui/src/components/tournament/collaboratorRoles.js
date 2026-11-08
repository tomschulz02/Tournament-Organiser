// The roles an organiser can give someone, least first. The server decides what
// each one allows — see api/src/utils/tournamentPermissions.js. This only names
// and describes them.
export const ROLES = [
	{ value: 'SCORER', label: 'Scorer', description: 'Enters results for the current round.' },
	{
		value: 'MATCH_MANAGER',
		label: 'Match Manager',
		description: 'Also corrects results in earlier rounds, edits the schedule, advances rounds and prints scoresheets.',
	},
	{
		value: 'CO_ORGANISER',
		label: 'Co-organiser',
		description: 'Also edits teams and divisions, chooses the scoresheet, and starts and ends the tournament.',
	},
];

export const DEFAULT_ROLE = 'SCORER';

export const roleLabel = (role) => ROLES.find((entry) => entry.value === role)?.label ?? role;

// The viewer's role, read back from the capability flags the tournament payload
// sends as data.can. The server sends booleans, not a role name, and each role
// holds every flag of the roles below it (capabilitiesFor in
// api/src/utils/tournamentPermissions.js), so the role is the highest flag
// present. No flags means a spectator.
//
// Presentation only: it decides the order of the Overview's sections. Every
// action is still offered by its own flag and refused by the server.
export function viewerRole(can) {
	if (!can) return 'spectator';
	if (can.manageCollaborators || can.deleteTournament) return 'organiser';
	if (can.manageSetup) return 'co-organiser';
	if (can.enterAnyRoundResults || can.progressRounds || can.editSchedule || can.printScoresheets) return 'match-manager';
	if (can.enterCurrentRoundResults) return 'scorer';
	return 'spectator';
}
