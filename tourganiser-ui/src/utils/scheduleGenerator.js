import {
	buildCourtList,
	compareTimes,
	createFixtureEntry,
	isTimeRangeValid,
	minutesToTime,
	normaliseSchedule,
	rangesOverlap,
	timeToMinutes,
} from './scheduleUtils';

/*
	The schedule generator.

	The objectives and the hard constraints are written down in docs/schedule.md
	under "Generation objectives". This file implements them and nothing else. If
	a rule here is not in that section, one of the two is wrong.

	Two ideas carry the whole thing.

	FEASIBILITY IS SEPARATE FROM PREFERENCE. A slot either satisfies every hard
	constraint or it is not a candidate at all. Nothing below can buy off a hard
	constraint with a good enough score, which is what let the previous generator
	place a team in back-to-back matches whenever the arithmetic happened to
	favour it.

	THE COMPARISON IS LEXICOGRAPHIC, NOT WEIGHTED. Two candidate slots are
	compared on the first objective, and only where they tie is the second
	consulted. The generator this replaced summed weights — court affinity +180
	against earliness -2 per slot index — so ninety slots of delay cost exactly
	one affinity bonus, and `slotIndex` counted the *filtered available* slots, so
	the same slot scored differently on every iteration. There are no weights here
	to tune and none to drift.

	Because the first objective is the slot's start instant and slots are of fixed
	size, compactness falls out of the structure rather than being scored: take
	the earliest feasible time, then choose among the courts free at that time.

	Under capacity a fixture is left unplaced and the warning names the constraint
	that blocked it. Backtracking would place more of them and is deliberately not
	here — docs/schedule.md decided to surface the failure rather than solve it.
*/

// docs/schedule.md: at least one slot between a team's two matches on one day.
const REST_SLOTS = 1;

// A fixture's round name is not always a round name in state.rounds: the
// third-place playoff carries its own while belonging to the Finals round.
const THIRD_PLACE_ROUND = '3rd Place Playoff';
const FINALS_ROUND = 'Finals';

// The formatter's own sentinel for a knockout slot with no team bound yet. See
// getTeamKeys.
const UNBOUND_TEAM_NAME = 'TBD';

// --- the slot grid ----------------------------------------------------------

// Every place a fixture could go, in the order the objectives want them
// considered: day, then time, then court. That ordering is not cosmetic — the
// first objective is the instant and the final tiebreak is court order, so a
// linear scan of this list resolves both without a sort.
//
// Day bounds are a hard constraint and are enforced here by construction: a slot
// that would end after dayEndTime is never built, so nothing downstream has to
// check for one.
function buildCandidateSlots(days, courts, startTime, endTime, durationMinutes) {
	const slots = [];
	const dayEndMinutes = timeToMinutes(endTime);
	const firstMinute = timeToMinutes(startTime);

	days.filter((day) => day.enabled !== false).forEach((day) => {
		for (let cursor = firstMinute; cursor + durationMinutes <= dayEndMinutes; cursor += durationMinutes) {
			courts.forEach((court, courtIndex) => {
				slots.push({
					day: day.date,
					courtId: court.id,
					courtIndex,
					// The divisions this court is reserved for. Empty means it
					// takes any division. Attached here so findSlotFailure can
					// check it without a courtId lookup — the list is built once
					// and scanned per fixture.
					divisions: Array.isArray(court.divisions) ? court.divisions : [],
					startMinutes: cursor,
					startTime: minutesToTime(cursor),
					endTime: minutesToTime(cursor + durationMinutes),
					// Day and time are both fixed width and zero padded, so
					// string order is chronological order.
					instant: `${day.date}T${minutesToTime(cursor)}`,
				});
			});
		}
	});

	return slots;
}

// Existing breaks are preserved and treated as blocked time. They are the only
// entries that survive generation, they never move while it runs, and they are
// the only ones that can sit off a slot boundary — so they are filtered out of
// the candidate list once, up front, and court exclusivity below reduces to "has
// this slot already been used".
function buildBlockedSlotChecker(entries) {
	return (slot) =>
		entries.some((entry) => {
			if (entry.day !== slot.day) return false;
			if (entry.courtId !== null && entry.courtId !== slot.courtId) return false;
			return rangesOverlap(entry.startTime, entry.endTime, slot.startTime, slot.endTime);
		});
}

// --- identity ---------------------------------------------------------------

// The teams a fixture actually commits, as keys that cannot collide across
// divisions.
//
// An unbound knockout slot carries a placeholder rather than a team — `Rank 1`,
// `Winner of SF1`, `TBD` — and constrains nothing, which is how the server's
// validator treats a null `team_1`. This matters more here than it did before:
// team exclusivity used to be a penalty that a slot could outscore, and is now a
// hard constraint, so conflating two divisions' "Rank 1" would forbid two
// semifinals from ever running at once and report them unschedulable.
//
// Ids where the payload carries them, names only as a fallback, and the division
// scopes both — two divisions may well each have a "Team A".
function getTeamKeys(fixture) {
	return [1, 2].map((side) => getTeamKey(fixture, side)).filter(Boolean);
}

function getTeamKey(fixture, side) {
	const scope = fixture.division_id ?? '';
	const id = fixture[`team_${side}_id`];

	if (id) return `${scope}:${id}`;
	if (fixture[`team_${side}_placeholder`]) return null;

	const name = fixture[`team${side}`];
	if (!name || name === UNBOUND_TEAM_NAME) return null;

	return `${scope}:${name}`;
}

// Scoped to the division for the same reason: "Pool A" exists in most divisions,
// and an unscoped key would pin every division's Pool A to one court.
function getFixtureCourtKey(fixture) {
	const key = fixture.poolKey || fixture.round;
	if (!key) return null;

	return `${fixture.division_id ?? ''}:${key}`;
}

// --- round order ------------------------------------------------------------
//
// A round cannot begin until the round feeding it has finished. Nothing in the
// scoring model expressed that, so a semifinal would take an early slot on a
// later court while pool play was still running — plausible-looking and
// unplayable. See docs/tournament-rules.md; the server enforces the same rule on
// write.
//
// The constraint is per division. Two divisions running in parallel is correct
// and desirable, so this must never become a tournament-wide barrier.

function buildRoundOrder(divisions = []) {
	const byDivision = new Map();

	divisions.forEach((division) => {
		const rounds = Array.isArray(division?.state?.rounds) ? division.state.rounds : [];
		const positions = new Map();

		rounds.forEach((round, position) => {
			if (round?.name && !positions.has(round.name)) {
				positions.set(round.name, position);
			}
		});

		byDivision.set(division.id, positions);
	});

	return byDivision;
}

// null means "unordered": a fixture whose round is not in its division's
// state.rounds, or whose division was not supplied. It constrains nothing and
// nothing constrains it, which is the same treatment the server's validator
// gives it.
function getRoundIndex(fixture, roundOrder) {
	const name = fixture.round === THIRD_PLACE_ROUND ? FINALS_ROUND : fixture.round;
	const position = roundOrder.get(fixture.division_id)?.get(name);

	return position === undefined ? null : position;
}

// The latest any earlier round of this division finishes. A fixture of this
// round may not start before it.
function findRoundBarrier(roundEndByDivision, divisionId, roundIndex) {
	if (roundIndex === null) return null;

	const rounds = roundEndByDivision.get(divisionId);
	if (!rounds) return null;

	let latest = null;
	rounds.forEach((end, index) => {
		if (index < roundIndex && (latest === null || end > latest)) {
			latest = end;
		}
	});

	return latest;
}

function recordRoundEnd(roundEndByDivision, divisionId, roundIndex, end) {
	if (roundIndex === null) return;

	const rounds = roundEndByDivision.get(divisionId) || new Map();
	if (!rounds.has(roundIndex) || end > rounds.get(roundIndex)) {
		rounds.set(roundIndex, end);
	}

	roundEndByDivision.set(divisionId, rounds);
}

// --- what has been placed so far --------------------------------------------

// Indexed for the four questions the constraints and objectives ask, rather than
// scanned. Every placement the generator makes is one whole slot, so a start
// minute identifies it and adjacency is arithmetic.
function createPlacementState() {
	return {
		usedSlots: new Set(), // `${day}_${courtId}_${startMinutes}`
		teamSlots: new Map(), // teamKey -> day -> Set of startMinutes
		courtHandover: new Map(), // `${day}_${courtId}_${endMinutes}` -> divisionId
		courtAffinity: new Map(), // `${divisionId}:${poolKey}` -> courtId
		roundEndByDivision: new Map(),
	};
}

function slotKey(slot) {
	return `${slot.day}_${slot.courtId}_${slot.startMinutes}`;
}

function playsAt(state, teamKey, day, startMinutes) {
	return Boolean(state.teamSlots.get(teamKey)?.get(day)?.has(startMinutes));
}

function recordPlacement(state, slot, fixture, durationMinutes) {
	state.usedSlots.add(slotKey(slot));

	// Keyed on the minute this entry ENDS, so the slot that starts there can ask
	// "what was on this court immediately before me" with one lookup.
	state.courtHandover.set(
		`${slot.day}_${slot.courtId}_${slot.startMinutes + durationMinutes}`,
		fixture.division_id ?? null
	);

	getTeamKeys(fixture).forEach((team) => {
		const byDay = state.teamSlots.get(team) || new Map();
		const starts = byDay.get(slot.day) || new Set();

		starts.add(slot.startMinutes);
		byDay.set(slot.day, starts);
		state.teamSlots.set(team, byDay);
	});

	const affinityKey = getFixtureCourtKey(fixture);
	if (affinityKey && !state.courtAffinity.has(affinityKey)) {
		state.courtAffinity.set(affinityKey, slot.courtId);
	}
}

// --- feasibility ------------------------------------------------------------

// The hard constraints, and nothing else. Returns the name of the first one this
// slot fails, or null when the slot is a candidate.
//
// The order is not arbitrary: each check assumes the ones before it passed, so a
// slot reported as failing on `rest` is a slot where rest is the SOLE reason it
// cannot be used. That is what makes the warnings in describeFailure honest —
// they can say "the only free slots would leave a team playing back to back"
// rather than blaming capacity for everything.
function findSlotFailure(slot, fixture, state, { durationMinutes, barrier, teams }) {
	// A court reserved for a set of divisions is closed to every other, whether or
	// not anything is on it — so this comes before the usedSlots check. Reporting
	// "every court is booked" for a court that was never open to this division
	// would send the organiser to the wrong fix. A fixture with no division_id
	// belongs to no division and is refused by any restricted court, the same way
	// a division the court does not name is.
	if (slot.divisions.length > 0 && !slot.divisions.includes(fixture.division_id)) return 'division';

	if (state.usedSlots.has(slotKey(slot))) return 'court';

	if (teams.some((team) => playsAt(state, team, slot.day, slot.startMinutes))) return 'team';

	if (barrier !== null && slot.instant < barrier) return 'round';

	// One slot of rest, checked on BOTH sides. The handover phrased it as the
	// immediately preceding slot, but fixtures are not placed in time order —
	// within a round each takes the earliest slot left, so a fixture placed later
	// can land before one placed earlier. Checking only backwards would let that
	// pair end up back to back, which is the thing the rule exists to forbid.
	const restMinutes = durationMinutes * REST_SLOTS;
	const adjacent = teams.some(
		(team) =>
			playsAt(state, team, slot.day, slot.startMinutes - restMinutes) ||
			playsAt(state, team, slot.day, slot.startMinutes + restMinutes)
	);
	if (adjacent) return 'rest';

	return null;
}

// --- the objectives ---------------------------------------------------------

// A note on the second objective, "maximise rest beyond the hard minimum, where
// it costs nothing above" — it is not in the comparison below, because under the
// first objective it can never fire.
//
// Two candidate slots are only ever compared when they share an instant, and two
// slots at one instant give a team exactly the same rest whichever court they
// are on. Taking a later slot for the sake of a longer gap is the one thing the
// first objective forbids, and choosing which fixture should wait instead is
// global reasoning — backtracking, which docs/schedule.md rules out.
//
// So the objective is met the only way it can be: the hard rest minimum
// guarantees the floor, and nothing above it is ever available for free. A
// comparison here would be a branch that no input can reach. If the first
// objective ever stops being the slot's instant, this has to come back — as the
// step above changeover, per the priority order.

// 0 continues the division already on this court, 1 starts a court that was
// idle, 2 changes the court over from another division. Lower is better.
//
// Local by design. A global contiguity measure would be expensive and would
// start competing with finishing early, which the priority order puts above it.
function changeoverCost(slot, fixture, state) {
	const preceding = state.courtHandover.get(`${slot.day}_${slot.courtId}_${slot.startMinutes}`);

	if (preceding === undefined) return 1;

	return preceding === (fixture.division_id ?? null) ? 0 : 2;
}

// 0 when the pool has no established court yet or this is it, 1 otherwise.
function affinityCost(slot, fixture, state) {
	const key = getFixtureCourtKey(fixture);
	if (!key) return 0;

	const court = state.courtAffinity.get(key);
	if (court === undefined) return 0;

	return court === slot.courtId ? 0 : 1;
}

// The priority order from docs/schedule.md, as a comparison. Negative means the
// left slot is the better place for this fixture.
//
// The chain ends on court index, which is total: two slots that tie on every
// objective are distinguished by their column, so the same input always produces
// the same schedule.
function compareSlots(left, right, fixture, state) {
	// 1. Earliest time wins. With fixed-size slots, filling from the front is
	//    what minimises the finish time.
	if (left.instant !== right.instant) return left.instant < right.instant ? -1 : 1;

	// 2. More rest wins — see the note above; it cannot discriminate here.

	// 3. Fewer division changeovers wins.
	const changeoverDifference = changeoverCost(left, fixture, state) - changeoverCost(right, fixture, state);
	if (changeoverDifference !== 0) return changeoverDifference;

	// 4. Court affinity wins, last and least.
	const affinityDifference = affinityCost(left, fixture, state) - affinityCost(right, fixture, state);
	if (affinityDifference !== 0) return affinityDifference;

	return left.courtIndex - right.courtIndex;
}

// --- warnings ---------------------------------------------------------------

// Which constraint to name when several blocked a fixture. Ordered by how much
// the answer tells an organiser: "a team would have played back to back" points
// at a fix, "every court is busy" is the one they would have guessed.
const FAILURE_PRIORITY = ['division', 'rest', 'round', 'team', 'court'];

const FAILURE_REASONS = {
	division: 'no court is open to the fixture’s division. Open a court to that division, or add one.',
	rest: 'the only free slots would leave a team playing two matches back to back. Add a court or extend the day.',
	round: 'no free slot is left once the earlier rounds of the same division have finished. Extend the day or add another day.',
	team: 'the teams involved are already playing in every remaining slot. Add a court or extend the day.',
	court: 'every court is booked for the whole day. Add a court, extend the day, or shorten matches.',
};

// The most informative reason across every slot this fixture was refused. A
// fixture with no candidate slots at all — a day shorter than one match — has no
// reason recorded, and capacity is the true answer.
function describeFailure(failures) {
	return FAILURE_PRIORITY.find((reason) => failures.has(reason)) || 'court';
}

function buildWarnings(unplacedReasons) {
	const counts = new Map();

	unplacedReasons.forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));

	return FAILURE_PRIORITY.filter((reason) => counts.has(reason)).map((reason) => {
		const count = counts.get(reason);
		const noun = count === 1 ? 'fixture' : 'fixtures';

		return `${count} ${noun} could not be scheduled: ${FAILURE_REASONS[reason]}`;
	});
}

// --- officials --------------------------------------------------------------
//
// Assigned as a separate pass over the already-placed schedule, never during
// placement — docs/schedule.md, Decision 8. Letting officials influence which
// slot a fixture takes would trade a better schedule for an easier assignment and
// would restate the priority order next to compareSlots.
//
// One team per match. The name is written, which is sufficient ONLY because an
// official is always from the fixture's own division and team names are unique
// within a division. If either ever relaxes the field needs a team id.

// Every team of every division, keyed by division id. division.teams carries
// { id, name } in state.teams order.
function buildTeamsByDivision(divisions = []) {
	const byDivision = new Map();

	divisions.forEach((division) => {
		byDivision.set(division.id, Array.isArray(division.teams) ? division.teams : []);
	});

	return byDivision;
}

// teamId -> the pools it plays in, so "officiate within your own pool" can be
// checked. A team is in a pool when it plays a fixture carrying that poolKey.
function buildTeamPools(fixtures = []) {
	const pools = new Map();

	fixtures.forEach((fixture) => {
		if (!fixture.poolKey) return;

		[fixture.team_1_id, fixture.team_2_id].forEach((teamId) => {
			if (!teamId) return;
			const set = pools.get(teamId) || new Set();
			set.add(fixture.poolKey);
			pools.set(teamId, set);
		});
	});

	return pools;
}

// teamId -> the times it is playing, in minutes, per day. Built from the placed
// fixture entries so overlap is arithmetic.
function buildTeamPlay(entries, fixturesById) {
	const play = new Map();

	entries.forEach((entry) => {
		if (entry.type !== 'fixture' || !entry.fixtureId) return;
		const fixture = fixturesById.get(entry.fixtureId);
		if (!fixture) return;

		const interval = {
			day: entry.day,
			startMinutes: timeToMinutes(entry.startTime),
			endMinutes: timeToMinutes(entry.endTime),
		};

		[fixture.team_1_id, fixture.team_2_id].forEach((teamId) => {
			if (!teamId) return;
			const intervals = play.get(teamId) || [];
			intervals.push(interval);
			play.set(teamId, intervals);
		});
	});

	return play;
}

function teamPlaysOverlapping(play, teamId, entry) {
	const intervals = play.get(teamId);
	if (!intervals) return false;

	const start = timeToMinutes(entry.startTime);
	const end = timeToMinutes(entry.endTime);

	return intervals.some(
		(interval) => interval.day === entry.day && interval.startMinutes < end && interval.endMinutes > start
	);
}

// Plays in the slot beginning exactly where this entry ends, on the same day.
function teamPlaysNext(play, teamId, entry) {
	const intervals = play.get(teamId);
	if (!intervals) return false;

	const nextStart = timeToMinutes(entry.endTime);

	return intervals.some((interval) => interval.day === entry.day && interval.startMinutes === nextStart);
}

// Walks the placed fixture entries earliest first, giving each an officiating
// team. Mutates entry.officials in place and returns the number of matches left
// with no eligible team, for the warnings. See docs/schedule.md.
function assignOfficialsPass(entries, fixturesById, divisions) {
	const teamsByDivision = buildTeamsByDivision(divisions);
	const teamPools = buildTeamPools([...fixturesById.values()]);
	const play = buildTeamPlay(entries, fixturesById);
	const officiatedCount = new Map();

	const ordered = entries
		.filter((entry) => entry.type === 'fixture' && entry.fixtureId)
		.sort((left, right) => (left.day === right.day ? compareTimes(left.startTime, right.startTime) : left.day.localeCompare(right.day)));

	let unassigned = 0;

	for (const entry of ordered) {
		const fixture = fixturesById.get(entry.fixtureId);
		if (!fixture) continue;

		const candidates = (teamsByDivision.get(fixture.division_id) || []).filter(
			// Hard rule: a team never officiates a match overlapping one it is
			// playing, on any court. (The division rule is already met — the
			// candidates are that division's own teams.)
			(team) => !teamPlaysOverlapping(play, team.id, entry)
		);

		if (candidates.length === 0) {
			entry.officials = '';
			unassigned += 1;
			continue;
		}

		// Preferences, applied only after the hard filter and each able to yield:
		//   1. not playing in the immediately following slot;
		//   2. in the same pool as the fixture;
		//   3. has officiated fewer times so far.
		// The team id is the final tiebreak, so the pass is deterministic.
		const best = candidates
			.map((team) => ({
				team,
				playsNext: teamPlaysNext(play, team.id, entry) ? 1 : 0,
				samePool: fixture.poolKey && teamPools.get(team.id)?.has(fixture.poolKey) ? 0 : 1,
				officiated: officiatedCount.get(team.id) || 0,
			}))
			.sort(
				(a, b) =>
					a.playsNext - b.playsNext ||
					a.samePool - b.samePool ||
					a.officiated - b.officiated ||
					a.team.id.localeCompare(b.team.id)
			)[0].team;

		entry.officials = best.name;
		officiatedCount.set(best.id, (officiatedCount.get(best.id) || 0) + 1);
	}

	return unassigned;
}

function buildOfficialsWarning(unassigned) {
	if (unassigned === 0) return [];

	const noun = unassigned === 1 ? 'match' : 'matches';
	return [`${unassigned} ${noun} could not be assigned an official: no eligible team was free.`];
}

// --- generation -------------------------------------------------------------

export function generateAutomaticSchedule({
	baseSchedule,
	fixtures,
	divisions,
	startDate,
	endDate,
	courtCount,
	dailyStartTime,
	dailyEndTime,
	fixtureDurationMinutes,
	assignOfficials = false,
}) {
	const durationMinutes = Number(fixtureDurationMinutes);

	if (!courtCount || !durationMinutes || !isTimeRangeValid(dailyStartTime, dailyEndTime)) {
		return {
			schedule: baseSchedule,
			unscheduledFixtures: fixtures,
			warnings: ['Enter valid court, time, and duration values before generating the schedule.'],
		};
	}

	const normalised = normaliseSchedule(baseSchedule, { startDate, endDate });
	const preservedBreaks = normalised.entries.filter((entry) => entry.type === 'break');

	// The generator reassigns every slot, so the placement does not survive — but
	// the fixture-scoped text the organiser typed does. Keyed by fixtureId, so it
	// rides along to wherever the fixture is placed this run, even a different
	// court or time. A fixture left unplaced has no entry to carry it, which is
	// correct. Without this every officials value is destroyed on every
	// regeneration.
	const carriedText = new Map(
		normalised.entries
			.filter((entry) => entry.type === 'fixture' && entry.fixtureId)
			.map((entry) => [entry.fixtureId, { officials: entry.officials, notes: entry.notes }])
	);
	const courts = buildCourtList(Number(courtCount), normalised.courts);
	const schedule = {
		...normalised,
		courts,
		entries: [...preservedBreaks],
		settings: {
			...normalised.settings,
			dayStartTime: dailyStartTime,
			dayEndTime: dailyEndTime,
			slotMinutes: durationMinutes,
		},
	};

	const blockedByBreak = buildBlockedSlotChecker(preservedBreaks);
	const candidateSlots = buildCandidateSlots(
		schedule.days,
		courts,
		dailyStartTime,
		dailyEndTime,
		durationMinutes
	).filter((slot) => !blockedByBreak(slot));

	const state = createPlacementState();
	const roundOrder = buildRoundOrder(divisions);

	// Round by round, so that every earlier round of a division has been placed
	// before anything is measured against it. The sort is stable, so fixtures
	// within one round keep their generated order and two runs over the same
	// input still produce the same schedule. An unordered fixture sorts with the
	// first round, which is where it already sat.
	const fixturesToSchedule = fixtures
		.map((fixture) => ({ fixture, roundIndex: getRoundIndex(fixture, roundOrder) }))
		.sort((left, right) => (left.roundIndex ?? 0) - (right.roundIndex ?? 0));

	const unscheduledFixtures = [];
	const unplacedReasons = [];

	for (const { fixture, roundIndex } of fixturesToSchedule) {
		const context = {
			durationMinutes,
			barrier: findRoundBarrier(state.roundEndByDivision, fixture.division_id, roundIndex),
			teams: getTeamKeys(fixture),
		};

		let best = null;
		const failures = new Set();

		// Every feasible slot is compared, and the comparison alone decides. The
		// candidates are already in instant order, so this settles on the earliest
		// one and then picks among the courts free at that instant — but it is
		// compareSlots that says so, not the loop. Keeping the priority order in
		// one place is the whole point of the rewrite, and an early exit here
		// would be a second, silent statement of the first objective.
		for (const slot of candidateSlots) {
			const failure = findSlotFailure(slot, fixture, state, context);
			if (failure) {
				failures.add(failure);
				continue;
			}

			if (best === null || compareSlots(slot, best, fixture, state) < 0) {
				best = slot;
			}
		}

		if (best === null) {
			unscheduledFixtures.push(fixture);
			unplacedReasons.push(describeFailure(failures));
			continue;
		}

		const carried = carriedText.get(fixture.id) || {};
		schedule.entries.push(
			createFixtureEntry({
				day: best.day,
				courtId: best.courtId,
				startTime: best.startTime,
				endTime: best.endTime,
				fixtureId: fixture.id,
				officials: carried.officials || '',
				notes: carried.notes || '',
			})
		);

		recordPlacement(state, best, fixture, durationMinutes);
		recordRoundEnd(state.roundEndByDivision, fixture.division_id, roundIndex, `${best.day}T${best.endTime}`);
	}

	schedule.entries.sort((left, right) => {
		if (left.day !== right.day) return left.day.localeCompare(right.day);
		if (left.startTime !== right.startTime) return compareTimes(left.startTime, right.startTime);
		return (left.courtId || '').localeCompare(right.courtId || '');
	});

	// Officials are assigned over the finished schedule, only when asked. Off — the
	// default — leaves the officials carried from the previous run untouched
	// (Decision 8, and the toggle's honest off state).
	let officialsWarnings = [];
	if (assignOfficials) {
		const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
		const unassigned = assignOfficialsPass(schedule.entries, fixturesById, divisions || []);
		officialsWarnings = buildOfficialsWarning(unassigned);
	}

	return {
		schedule,
		unscheduledFixtures,
		warnings: [...buildWarnings(unplacedReasons), ...officialsWarnings],
	};
}
