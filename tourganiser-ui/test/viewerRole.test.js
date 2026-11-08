import { describe, it, expect } from 'vitest';
import { viewerRole } from '../src/components/tournament/collaboratorRoles';

// The flag sets capabilitiesFor in api/src/utils/tournamentPermissions.js
// sends, each role holding everything below it.
const SCORER = { enterCurrentRoundResults: true };
const MATCH_MANAGER = {
	...SCORER,
	enterAnyRoundResults: true,
	progressRounds: true,
	editSchedule: true,
	printScoresheets: true,
};
const CO_ORGANISER = { ...MATCH_MANAGER, manageSetup: true };
const ORGANISER = { ...CO_ORGANISER, manageCollaborators: true, deleteTournament: true };

describe('viewerRole', () => {
	it('reads each role from its full flag set', () => {
		expect(viewerRole(ORGANISER)).toBe('organiser');
		expect(viewerRole(CO_ORGANISER)).toBe('co-organiser');
		expect(viewerRole(MATCH_MANAGER)).toBe('match-manager');
		expect(viewerRole(SCORER)).toBe('scorer');
	});

	it('treats no flags, all-false flags and a missing object as a spectator', () => {
		expect(viewerRole({})).toBe('spectator');
		expect(viewerRole({ enterCurrentRoundResults: false, manageSetup: false })).toBe('spectator');
		expect(viewerRole(undefined)).toBe('spectator');
		expect(viewerRole(null)).toBe('spectator');
	});

	it('goes by the highest flag present', () => {
		expect(viewerRole({ deleteTournament: true })).toBe('organiser');
		expect(viewerRole({ manageCollaborators: true })).toBe('organiser');
		expect(viewerRole({ manageSetup: true })).toBe('co-organiser');
		expect(viewerRole({ enterAnyRoundResults: true })).toBe('match-manager');
		expect(viewerRole({ progressRounds: true })).toBe('match-manager');
		expect(viewerRole({ editSchedule: true })).toBe('match-manager');
		expect(viewerRole({ printScoresheets: true })).toBe('match-manager');
	});
});
