// The formats a division can be created as, and the rules a division has to
// satisfy before it can be added.
//
// No component lives in this file. The lint config forbids a module exporting
// both a component and a plain function, and every one of these is shared
// between the division modal, the divisions section and the review modal.

// `type` is the value the creation endpoint expects, so nothing downstream has
// to map a display label back to a payload value — that mapping was where the
// old form kept a dead 'single_elim' branch alive.
//
// Single Elimination is not offered. generateDivisionDetails throws
// FORMAT_NOT_IMPLEMENTED for it, so it would be a dead option.
export const FORMATS = [
	{
		type: 'league',
		label: 'Round Robin',
		summary: 'Every team plays every other team once. One table decides it, with no knockout at the end.',
		best: 'Best for smaller divisions where everyone should get the same number of matches.',
		// Nothing to configure, so the modal goes straight from Basics to Teams.
		configurable: false,
	},
	{
		type: 'classic',
		label: 'Pool Play + Knockout',
		summary: 'Teams are split into pools that play among themselves, then the best go through to a knockout bracket.',
		best: 'Best for larger divisions, and where the finish should be a final rather than a table.',
		configurable: true,
	},
];

// The floor for the knockout stage. One qualifier is not a bracket.
export const MIN_KNOCKOUT_TEAMS = 2;

// Two teams is the smallest thing that can play a match.
export const MIN_TEAMS = 2;

export const DIVISION_NAME_MAX = 100;

export const TEAM_NAME_MAX = 100;

export function getFormat(type) {
	return FORMATS.find((format) => format.type === type) || null;
}

export function getFormatLabel(type) {
	return getFormat(type)?.label || 'No format chosen';
}

export function isConfigurableFormat(type) {
	return Boolean(getFormat(type)?.configurable);
}

// Local only, and never sent. Divisions and their teams are created fresh by the
// server, which generates their real ids itself.
export function createDivisionId() {
	return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Also local only, and stripped before a division is saved.
//
// A counter rather than the array index: the index stops identifying a row the
// moment rows can be reordered, and React would then reuse one team's input for
// another. Exact rather than random, because a team list can grow faster than
// createDivisionId's millisecond.
let teamKeyCount = 0;

export function createTeamKey() {
	teamKeyCount += 1;

	return `team-${teamKeyCount}`;
}

export function createEmptyDivision() {
	return {
		id: createDivisionId(),
		name: '',
		type: '',
		num_groups: 2,
		knockout_teams: 4,
		teams: [],
	};
}

// The hard check, run when Add Division is clicked and again when Create
// Tournament is. Returns a map of field to message; an empty map is a pass.
//
// The structural rules are the server's own, from validateStructure in
// api/src/services/divisions.service.js: at least one group, no more groups
// than teams, and no more qualifiers than teams. Being stricter here would
// refuse configurations the API accepts.
export function validateDivision(division) {
	const errors = {};

	const name = division.name.trim();
	if (name.length === 0) {
		errors.name = 'Give this division a name.';
	} else if (division.name.length > DIVISION_NAME_MAX) {
		errors.name = `That name is a little long. Keep it to ${DIVISION_NAME_MAX} characters.`;
	}

	if (!division.type) {
		errors.type = 'Choose how this division will be played.';
	}

	const teamCount = division.teams.length;

	if (teamCount < MIN_TEAMS) {
		errors.teams = `A division needs at least ${MIN_TEAMS} teams. ${
			teamCount === 0 ? 'None have been added yet.' : 'Only one has been added so far.'
		}`;
	} else if (division.teams.some((team) => team.name.trim().length === 0)) {
		errors.teams = 'One of the teams has no name yet.';
	} else {
		// Trimmed and case-insensitive, the same comparison createDivision makes
		// before answering DUPLICATE_TEAM.
		const seen = new Set();
		const duplicate = division.teams.find((team) => {
			const key = team.name.trim().toLowerCase();
			if (seen.has(key)) return true;
			seen.add(key);
			return false;
		});

		if (duplicate) {
			errors.teams = `Two teams are both called "${duplicate.name.trim()}". Every team needs its own name.`;
		}
	}

	if (isConfigurableFormat(division.type) && teamCount >= MIN_TEAMS) {
		const groups = Number(division.num_groups);
		const qualifiers = Number(division.knockout_teams);

		if (!Number.isInteger(groups) || groups < 1) {
			errors.num_groups = 'There has to be at least one pool.';
		} else if (groups > teamCount) {
			errors.num_groups = `${groups} pools needs at least ${groups} teams, and this division has ${teamCount}.`;
		}

		if (!Number.isInteger(qualifiers) || qualifiers < MIN_KNOCKOUT_TEAMS) {
			errors.knockout_teams = `At least ${MIN_KNOCKOUT_TEAMS} teams have to reach the knockout.`;
		} else if (qualifiers > teamCount) {
			errors.knockout_teams = `Only ${teamCount} teams are in this division, so ${qualifiers} cannot advance.`;
		}
	}

	return errors;
}

// Parses a pasted block of team names: splits on newlines then commas, trims
// each piece, drops empty pieces, truncates to TEAM_NAME_MAX, and drops any
// piece that matches (trimmed, case-insensitive) either existingNames or an
// earlier piece already kept from this same call. Structural validation
// (duplicates across separate actions, empty names) still only happens in
// validateDivision at Save, same as the one-at-a-time addTeam path.
export function parseBulkTeamNames(text, existingNames) {
	const seen = new Set(existingNames.map((name) => name.trim().toLowerCase()));
	const names = [];

	for (const line of text.split('\n')) {
		for (const piece of line.split(',')) {
			const trimmed = piece.trim();
			if (trimmed.length === 0) continue;

			const truncated = trimmed.slice(0, TEAM_NAME_MAX);
			const key = truncated.toLowerCase();
			if (seen.has(key)) continue;

			seen.add(key);
			names.push(truncated);
		}
	}

	return names;
}

export function isDivisionValid(division) {
	return Object.keys(validateDivision(division)).length === 0;
}
