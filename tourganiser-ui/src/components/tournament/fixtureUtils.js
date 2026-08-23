// Pure helpers shared by the two states of the Fixtures & Schedule tab, and by
// StandingsTab.
//
// A separate module because a file exporting both components and plain functions
// breaks Fast Refresh, which the lint config enforces.

export const ALL = '';

export const EMPTY_FILTERS = { divisionId: ALL, round: ALL, status: ALL, team: '', day: ALL, courtId: ALL };

// Every division's fixtures in one list. division_id is already on each fixture;
// division_name is not, and the row needs it to show a badge.
export function flattenFixtures(divisions = []) {
	const all = [];

	divisions.forEach((division) => {
		(division.fixtures ?? []).forEach((fixture) => {
			all.push({ ...fixture, division_name: division.name });
		});
	});

	// Ordered across the whole tournament, not per division — the point of the
	// flattened list is that match 12 of one division sits next to match 12 of
	// another. A missing match number sorts first, matching the backend's own
	// `match_no || 0` convention.
	return all.sort((a, b) => (a.match_no || 0) - (b.match_no || 0));
}

export function indexById(fixtures = []) {
	return new Map(fixtures.map((fixture) => [fixture.id, fixture]));
}

// Division, stage, status and team only. Date and court live on the schedule
// entry rather than the fixture, so they are applied where the entries are.
export function matchesFixtureFilters(fixture, filters) {
	if (!fixture) return false;
	if (filters.divisionId && fixture.division_id !== filters.divisionId) return false;
	if (filters.round && fixture.round !== filters.round) return false;
	if (filters.status && fixture.status !== filters.status) return false;

	const query = filters.team.trim().toLowerCase();
	if (!query) return true;

	return `${fixture.team1} ${fixture.team2}`.toLowerCase().includes(query);
}

// Whether anything that describes a fixture — rather than a slot — is narrowed.
// Breaks belong to the timetable, not to any fixture, so they are hidden once
// the reader is asking about fixtures.
export function hasFixtureFilter(filters) {
	return Boolean(filters.divisionId || filters.round || filters.status || filters.team.trim());
}

export function distinct(values) {
	return [...new Set(values.filter(Boolean))];
}

// Keyed on the enum, labelled with the server's display form of it.
export function distinctStatuses(fixtures = []) {
	const seen = new Map();

	fixtures.forEach((fixture) => {
		if (!seen.has(fixture.status)) {
			seen.set(fixture.status, { value: fixture.status, label: fixture.statusLabel || fixture.status });
		}
	});

	return [...seen.values()];
}

// result is [[teamOneScore, teamTwoScore], ...], one pair per set.
export function formatResult(result) {
	if (!Array.isArray(result) || result.length === 0) return null;

	return result.map(([one, two]) => `${one}-${two}`).join(', ');
}

// Sets won by each team, as [teamOne, teamTwo]. A set with equal scores counts
// for neither — docs/tournament-rules.md says so and applyFixtureToStandings
// already behaves that way, so the row and the standings table cannot disagree
// about who won a set.
//
// Null rather than [0, 0] for an unplayed fixture: nothing has been won yet, and
// the row renders an empty score cell rather than a zero.
export function setsWon(result) {
	if (!Array.isArray(result) || result.length === 0) return null;

	return result.reduce(
		([one, two], [scoreOne, scoreTwo]) => [one + (scoreOne > scoreTwo ? 1 : 0), two + (scoreTwo > scoreOne ? 1 : 0)],
		[0, 0],
	);
}

// The same result read by team rather than by set: [[teamOne...], [teamTwo...]],
// in set order, so a team's line can be rendered without walking the pairs.
export function setScores(result) {
	if (!Array.isArray(result) || result.length === 0) return null;

	return [result.map(([one]) => one), result.map(([, two]) => two)];
}

// Whether the division's current round can advance to another one.
//
// Deliberately a mirror of isRoundComplete in progression.service.js, down to
// matching fixtures on `round === round.name` with no third-place special case
// and treating a round with no fixtures as incomplete. The client's job is to
// predict the server, not to out-think it: any rule here that the server does
// not share would show a trigger that 409s, or hide one that would have worked.
//
// This computes nothing about rankings or qualifiers. Those are the backend's,
// per docs/tournament-rules.md, and the modal fetches them.
//
// Shared by StandingsTab (per-division "Start Next Round" trigger) and the
// Fixtures & Schedule round-complete banner.
export function canProgress(division) {
	const rounds = division.state?.rounds;
	if (!Array.isArray(rounds)) return false;

	const index = division.state?.currentRound ?? 0;
	const round = rounds[index];
	// The last round has nothing to advance to — the server answers NO_NEXT_ROUND.
	if (!round || !rounds[index + 1]) return false;

	const roundFixtures = (division.fixtures ?? []).filter((fixture) => fixture.round === round.name);
	if (roundFixtures.length === 0) return false;

	// A cancelled match never happened, so it does not hold the round open.
	return roundFixtures.every((fixture) => fixture.status === 'COMPLETED' || fixture.status === 'CANCELLED');
}
