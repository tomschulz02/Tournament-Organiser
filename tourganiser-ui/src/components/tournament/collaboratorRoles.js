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
