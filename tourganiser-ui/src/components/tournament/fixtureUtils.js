// Pure helpers shared by the two states of the Fixtures & Schedule tab, and by
// StandingsTab.
//
// A separate module because a file exporting both components and plain functions
// breaks Fast Refresh, which the lint config enforces.

export const ALL = '';

export const EMPTY_FILTERS = { divisionId: ALL, round: ALL, status: ALL, team: '', day: ALL, courtId: ALL };

// The stage a fixture is filtered by: coarser than its round, so the filter reads
// as the shape of the tournament rather than a list of every pool and leg.
export const PRELIMINARY_STAGE = 'Preliminary Round';
export const PLAYOFFS_STAGE = 'Playoffs';

// Sort keys for the stages. Knockout rounds sit between the two, nearest the
// final last. A round no division's state names comes after them all, before
// the playoffs.
const PRELIMINARY_RANK = 0;
const UNKNOWN_RANK = 150;
const PLAYOFFS_RANK = 200;

// Which stage a fixture belongs to, and where that stage sorts:
//   - Preliminary Round: every pool-play and round-robin round, whatever it is
//     called and however many pools or legs it has.
//   - Playoffs: every placement match — the 3rd place playoff and anything
//     named "<round> · <label>", such as "Semifinals · Places 5-8".
//   - Otherwise the knockout round's own name, ordered by how far it is from the
//     division's last round, so Quarterfinals, Semifinals, Finals in that order
//     whatever divisions they come from.
function buildStageLookup(divisions) {
	const roundTypes = new Map(); // `${divisionId}|${roundName}` -> type
	const distanceFromEnd = new Map(); // knockout round name -> rounds to the end

	divisions.forEach((division) => {
		const rounds = Array.isArray(division.state?.rounds) ? division.state.rounds : [];

		rounds.forEach((round, index) => {
			if (!round?.name) return;

			roundTypes.set(`${division.id}|${round.name}`, round.type);
			if (round.type === 'knockout') {
				distanceFromEnd.set(round.name, Math.max(distanceFromEnd.get(round.name) ?? 0, rounds.length - index));
			}
		});
	});

	return (fixture) => {
		// A pool fixture carries its pool, and its round reads "Pool Play · Pool A"
		// — the same separator a placement match uses, so the pool is checked
		// first.
		if (fixture.pool) return { stage: PRELIMINARY_STAGE, stageRank: PRELIMINARY_RANK };
		if (fixture.round === THIRD_PLACE_ROUND || isPlacementRound(fixture.round)) {
			return { stage: PLAYOFFS_STAGE, stageRank: PLAYOFFS_RANK };
		}

		const type = roundTypes.get(`${fixture.division_id}|${fixture.round}`);
		if (type && type !== 'knockout') return { stage: PRELIMINARY_STAGE, stageRank: PRELIMINARY_RANK };

		const distance = distanceFromEnd.get(fixture.round);
		return { stage: fixture.round || null, stageRank: distance === undefined ? UNKNOWN_RANK : 100 - distance };
	};
}

// The stages present among these fixtures, in tournament order.
export function orderedStages(fixtures = []) {
	const ranks = new Map();

	fixtures.forEach((fixture) => {
		if (fixture.stage && !ranks.has(fixture.stage)) ranks.set(fixture.stage, fixture.stageRank ?? UNKNOWN_RANK);
	});

	// Stable, so two stages with one rank keep the order they first appear in.
	return [...ranks.keys()].sort((left, right) => ranks.get(left) - ranks.get(right));
}

// Every division's fixtures in one list. division_id is already on each fixture;
// division_name is not, and the row needs it to show a badge. Each fixture is
// also given its stage, which the stage filter reads.
export function flattenFixtures(divisions = []) {
	const all = [];
	const stageOf = buildStageLookup(divisions);

	divisions.forEach((division) => {
		(division.fixtures ?? []).forEach((fixture) => {
			all.push({ ...fixture, division_name: division.name, ...stageOf(fixture) });
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
	// filters.round holds a stage. A fixture that never went through
	// flattenFixtures has none, and is matched on its round as before.
	if (filters.round && (fixture.stage ?? fixture.round) !== filters.round) return false;
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

// A fixture's round name is not always a round in state.rounds. The 3rd-place
// playoff carries its own name inside Finals, and a placement match is named
// "<round> · <label>" — "Semifinals · Places 5-8" — inside the round before the
// separator. The client mirror of roundHolding in fixtures.service.js.
const THIRD_PLACE_ROUND = '3rd Place Playoff';
export const PLACEMENT_SEPARATOR = ' · ';

export function isPlacementRound(fixtureRound) {
	return typeof fixtureRound === 'string' && fixtureRound.includes(PLACEMENT_SEPARATOR);
}

export function roundHolding(fixtureRound) {
	if (fixtureRound === THIRD_PLACE_ROUND) return 'Finals';
	if (isPlacementRound(fixtureRound)) return fixtureRound.slice(0, fixtureRound.indexOf(PLACEMENT_SEPARATOR));
	return fixtureRound;
}

// Whether a fixture belongs to the round for progression's purposes: its own
// matches and its placement matches, but not the 3rd-place playoff — see
// playedIn in progression.service.js.
function playedIn(round, fixture) {
	return fixture.round === round.name || (isPlacementRound(fixture.round) && roundHolding(fixture.round) === round.name);
}

// The fixtures an editor may enter a result for: those in the division's current
// round, which is the highest round in state.rounds holding a fixture with both
// teams bound. Mirrors assertCurrentRound in fixtures.service.js — the server is
// the gate, and this only decides where the control is offered.
export function editableFixtureIds(divisions = []) {
	const ids = new Set();

	divisions.forEach((division) => {
		const rounds = Array.isArray(division.state?.rounds) ? division.state.rounds : [];
		const fixtures = division.fixtures ?? [];
		const holdingIndex = (fixture) => rounds.findIndex((round) => round.name === roundHolding(fixture.round));
		const current = fixtures
			.filter((fixture) => fixture.team_1_id && fixture.team_2_id)
			.reduce((highest, fixture) => Math.max(highest, holdingIndex(fixture)), -1);

		fixtures.forEach((fixture) => {
			if (current !== -1 && holdingIndex(fixture) === current) ids.add(fixture.id);
		});
	});

	return ids;
}

// "you", or a name with the role it is held under now: "Priya (editor)". The
// server only sends enteredBy to the organiser and the tournament's editors.
export function enteredByLabel(enteredBy) {
	if (!enteredBy) return null;
	if (enteredBy.self) return 'you';

	return enteredBy.role ? `${enteredBy.name} (${enteredBy.role})` : enteredBy.name;
}

// Whether the division's current round can advance to another one.
//
// Deliberately a mirror of isRoundComplete in progression.service.js, down to
// its playedIn — a round's own fixtures and its placement matches, with no
// third-place special case — and treating a round with no fixtures as
// incomplete. The client's job is to
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

	const roundFixtures = (division.fixtures ?? []).filter((fixture) => playedIn(round, fixture));
	if (roundFixtures.length === 0) return false;

	// A cancelled match never happened, so it does not hold the round open.
	return roundFixtures.every((fixture) => fixture.status === 'COMPLETED' || fixture.status === 'CANCELLED');
}
