import {
	buildCourtList,
	compareTimes,
	createFixtureEntry,
	DEFAULT_GENERATOR_SETTINGS,
	isTimeRangeValid,
	minutesToTime,
	normaliseGeneratorSettings,
	normaliseSchedule,
	sortScheduleEntries,
	timeToMinutes,
} from './scheduleUtils';

/*
	The schedule generator.

	The objectives, the rules and which of them may bend are written down in
	docs/schedule.md under "Generation objectives". This file implements them and
	nothing else. If a rule here is not in that section, one of the two is wrong.

	It schedules the way a person with a whiteboard would: walk the day from the
	first slot to the last, and at each time decide which matches play now, then
	which court each goes on.

	WHICH MATCHES PLAY NOW is decided by urgency, not by the order the fixtures
	were generated in. Order within a round is free. A match is ready when every
	earlier round of its division has been placed and has finished. Among the
	ready matches, the one whose teams have the most still to play goes first,
	because those teams are the ones that set the finishing time. Nothing idles
	while a ready match could legally fill the court.

	THREE RULES NEVER BEND: round order, one match per team at a time, and one
	match per court at a time, with the court division restrictions honoured. The
	server rejects a schedule that breaks any of them, so the generator never
	produces one.

	THE REST CAN BEND, AS LITTLE AS POSSIBLE. The minimum rest and the daily match
	limit are the organiser's rules. When the organiser allows it and the schedule
	cannot fit without bending them, a match may bend one, but only when the court
	would otherwise stand idle and the remaining time is running out. "Running
	out" is a slack margin, and the generator tries several margins and keeps the
	result that bends the least. The cost escalates for each team, so three teams
	each playing back to back once beats one team playing back to back to back.
	Running past the day's end time is the last resort. It is tried only when
	bending cannot fit everything, and only on the last day, a slot at a time.

	Every result is deterministic. The same input produces the same schedule.
*/

// docs/schedule.md: when the caller asks for no particular rest, it falls back to
// the fixture duration, which is numerically what the old rule always produced.
const DEFAULT_REST_MULTIPLE = 1;

// The latest minute an entry may end. endTime is HH:MM within one day, so an
// overrun can never cross midnight.
const LAST_MINUTE = 23 * 60 + 59;

// A fixture's round name is not always a round name in state.rounds: the
// third-place playoff carries its own while belonging to the Finals round, and a
// placement match names its round before " · ".
const THIRD_PLACE_ROUND = '3rd Place Playoff';
const FINALS_ROUND = 'Finals';
const PLACEMENT_SEPARATOR = ' · ';

function roundHolding(fixtureRound) {
	if (fixtureRound === THIRD_PLACE_ROUND) return FINALS_ROUND;

	const separator = String(fixtureRound).indexOf(PLACEMENT_SEPARATOR);
	return separator === -1 ? fixtureRound : fixtureRound.slice(0, separator);
}

// The formatter's own sentinel for a knockout slot with no team bound yet. See
// getTeamKey.
const UNBOUND_TEAM_NAME = 'TBD';

// --- identity ---------------------------------------------------------------

// The teams a fixture actually commits, as keys that cannot collide across
// divisions.
//
// An unbound knockout slot carries a placeholder rather than a team — `Rank 1`,
// `Winner of SF1`, `TBD` — and constrains nothing, which is how the server's
// validator treats a null `team_1`. Conflating two divisions' "Rank 1" would
// forbid two semifinals from ever running at once.
//
// Ids where the payload carries them, names only as a fallback, and the division
// scopes both — two divisions may well each have a "Team A".
function getTeams(fixture) {
	return [1, 2]
		.map((side) => ({ key: getTeamKey(fixture, side), name: fixture[`team${side}`] || '' }))
		.filter((team) => team.key !== null);
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
// A round cannot begin until every fixture of the rounds before it, in the same
// division, has been placed and has finished. See docs/tournament-rules.md; the
// server enforces the same rule on write. A round whose predecessor could not be
// placed in full is not placed at all — a semifinal scheduled while a pool match
// has nowhere to go would be unplayable the moment that match was hand-placed.
//
// The constraint is per division. Two divisions running in parallel is correct
// and desirable, so this must never become a tournament-wide barrier.

function buildRoundOrder(divisions = []) {
	const byDivision = new Map();

	divisions.forEach((division) => {
		const rounds = Array.isArray(division?.state?.rounds) ? division.state.rounds : [];
		const positions = new Map();
		// The positions of the knockout rounds, for the break before them.
		const knockout = new Set();

		rounds.forEach((round, position) => {
			if (round?.name && !positions.has(round.name)) {
				positions.set(round.name, position);
				if (round.type === 'knockout') knockout.add(position);
			}
		});

		byDivision.set(division.id, { positions, knockout });
	});

	return byDivision;
}

// null means "unordered": a fixture whose round is not in its division's
// state.rounds, or whose division was not supplied. It constrains nothing and
// nothing constrains it, which is the same treatment the server's validator
// gives it.
function getRoundIndex(fixture, roundOrder) {
	const name = roundHolding(fixture.round);
	const position = roundOrder.get(fixture.division_id)?.positions.get(name);

	return position === undefined ? null : position;
}

// --- preparation ------------------------------------------------------------

// Everything about a fixture that placement asks more than once, worked out once.
//
// A fixture's length is its round's own length where the organiser set one —
// keyed by the round it belongs to, so the 3rd place playoff takes the Finals
// length and "Semifinals · Places 5-8" the Semifinals one — and the default
// match length otherwise.
function prepareItems(fixtures, roundOrder, { durationMinutes, roundDurations }) {
	const items = fixtures.map((fixture, order) => ({
		fixture,
		order,
		duration: roundDurations[roundHolding(fixture.round)] || durationMinutes,
		divisionId: fixture.division_id,
		roundIndex: getRoundIndex(fixture, roundOrder),
		teams: getTeams(fixture),
		isKnockout: false,
		courtKey: getFixtureCourtKey(fixture),
		roundsAfter: 0,
	}));

	// How many rounds of the division still have to follow this one. A semifinal
	// with a final behind it is two rounds from the end, and that chain is as
	// much a part of the finishing time as a team's remaining pool matches.
	const roundsByDivision = new Map();
	items.forEach((item) => {
		if (item.roundIndex === null) return;
		const rounds = roundsByDivision.get(item.divisionId) || new Set();
		rounds.add(item.roundIndex);
		roundsByDivision.set(item.divisionId, rounds);
	});

	items.forEach((item) => {
		if (item.roundIndex === null) return;
		item.isKnockout = roundOrder.get(item.divisionId).knockout.has(item.roundIndex);
		item.roundsAfter = [...roundsByDivision.get(item.divisionId)].filter((index) => index > item.roundIndex).length;
	});

	return items;
}

function courtAccepts(court, fixture) {
	return court.divisions.length === 0 || court.divisions.includes(fixture.division_id);
}

// --- the time grid ----------------------------------------------------------

// The day, per court: when it opens, when it must be finished by, and the breaks
// it is closed for. Matches are then placed court by court from the opening
// time, each court moving on by the length of whatever it was given — which
// differs by round when the organiser gives rounds their own match lengths.
//
// A break closes the court until it ends, and the court picks up again the
// moment it does rather than at the next multiple of a match length. A lunch
// break ending at 12:45 therefore loses no time to a 13:00 restart. A break
// spanning every court moves every court; a break on one court moves only that
// court, so courts can run to different clocks.
//
// Day bounds are enforced by construction: no match is placed that would end
// after the day's end, except on the last day when the organiser allows an
// overrun, one match length at a time.
function buildTimetable(days, courts, breaks, { startMinutes, endMinutes, durationMinutes, overrunSlots }) {
	const enabledDays = days.filter((day) => day.enabled !== false);
	const breakSpans = breaks.map((entry) => ({
		day: entry.day,
		courtId: entry.courtId,
		start: timeToMinutes(entry.startTime),
		end: timeToMinutes(entry.endTime),
	}));

	const timetable = enabledDays.map((day, dayIndex) => {
		const isLastDay = dayIndex === enabledDays.length - 1;
		const limit = isLastDay ? Math.min(LAST_MINUTE, endMinutes + overrunSlots * durationMinutes) : endMinutes;

		return {
			day: day.date,
			dayIndex,
			limit,
			courts: courts.map((court, courtIndex) => ({
				id: court.id,
				courtIndex,
				// Empty means the court takes any division.
				divisions: Array.isArray(court.divisions) ? court.divisions : [],
				breaks: breakSpans.filter(
					(span) => span.day === day.date && (span.courtId === null || span.courtId === court.id)
				),
			})),
		};
	});

	// Capacity in matches of the default length, for the slack and for sharing
	// matches across days. An estimate once rounds have their own lengths, which
	// is all either use needs.
	timetable.forEach((entry) => {
		entry.capacity = entry.courts.reduce(
			(sum, court) => sum + countSlots(court, startMinutes, entry.limit, durationMinutes),
			0
		);
	});

	let later = 0;
	for (let index = timetable.length - 1; index >= 0; index -= 1) {
		timetable[index].laterCapacity = later;
		later += timetable[index].capacity;
	}

	return { days: timetable, startMinutes, endMinutes, durationMinutes, capacity: later };
}

// The first minute at or after `from` that the court is not under a break.
function skipBreaks(court, from) {
	let cursor = from;
	let moved = true;

	while (moved) {
		moved = false;
		court.breaks.forEach((span) => {
			if (span.start <= cursor && span.end > cursor) {
				cursor = span.end;
				moved = true;
			}
		});
	}

	return cursor;
}

// Whether a match of this length can start on the court at this minute.
function fitsOn(court, start, length, limit) {
	const end = start + length;
	return end <= limit && !court.breaks.some((span) => span.start < end && span.end > start);
}

// How many matches of `length` the court still has room for from `from`,
// restarting after each break the way placement does.
function countSlots(court, from, limit, length) {
	let slots = 0;
	let cursor = skipBreaks(court, from);

	while (cursor + length <= limit) {
		if (fitsOn(court, cursor, length, limit)) {
			slots += 1;
			cursor = skipBreaks(court, cursor + length);
		} else {
			// A break starts before this match would end: pick up after it.
			const blocking = court.breaks.filter((span) => span.start < cursor + length && span.end > cursor);
			cursor = skipBreaks(court, Math.max(...blocking.map((span) => span.end)));
		}
	}

	return slots;
}

// A candidate start: one day, one minute, one match length.
function makeInstant(entry, startMinutes, length, dayEndMinutes) {
	const startTime = minutesToTime(startMinutes);
	const endTime = minutesToTime(startMinutes + length);

	return {
		day: entry.day,
		dayIndex: entry.dayIndex,
		startMinutes,
		endMinutes: startMinutes + length,
		startTime,
		endTime,
		// Day and time are both fixed width and zero padded, so string order is
		// chronological order.
		instant: `${entry.day}T${startTime}`,
		end: `${entry.day}T${endTime}`,
		overrun: startMinutes + length > dayEndMinutes,
	};
}

// --- one pass ---------------------------------------------------------------

function createPassState(items) {
	const state = {
		unplaced: new Set(items),
		placements: [],
		// teamKey -> day -> [{ start, end }] in minutes.
		teamPlay: new Map(),
		teamRemaining: new Map(),
		// teamKey -> the instant its last match ended. Only ever grows, because
		// placement walks forward in time.
		teamLastEnd: new Map(),
		// teamKey -> how many times a rule has already been bent for it. Makes a
		// second bend for the same team dearer than a first bend for another.
		teamBends: new Map(),
		roundRemaining: new Map(), // divisionId -> roundIndex -> unplaced count
		roundEnd: new Map(), // divisionId -> roundIndex -> latest end instant
		courtHandover: new Map(), // `${day}_${courtId}_${endMinutes}` -> divisionId
		courtAffinity: new Map(), // courtKey -> courtId
		reasons: new Map(), // item -> Set of failure names
		cost: 0,
	};

	items.forEach((item) => {
		item.teams.forEach((team) => state.teamRemaining.set(team.key, (state.teamRemaining.get(team.key) || 0) + 1));

		if (item.roundIndex !== null) {
			const rounds = state.roundRemaining.get(item.divisionId) || new Map();
			rounds.set(item.roundIndex, (rounds.get(item.roundIndex) || 0) + 1);
			state.roundRemaining.set(item.divisionId, rounds);
		}
	});

	return state;
}

function noteFailure(state, item, reason) {
	const reasons = state.reasons.get(item) || new Set();
	reasons.add(reason);
	state.reasons.set(item, reasons);
}

function playedOn(state, teamKey, day) {
	return state.teamPlay.get(teamKey)?.get(day) || [];
}

// null unless every earlier round of the division is placed in full and has
// finished by now. Otherwise the instant the latest of them ended, or '' when
// there is none, which the break before knockout rounds is measured from.
function earlierRoundsEnd(item, instant, state) {
	if (item.roundIndex === null) return '';

	const remaining = state.roundRemaining.get(item.divisionId);
	const ends = state.roundEnd.get(item.divisionId);
	let latest = '';

	for (const [index, count] of remaining) {
		if (index >= item.roundIndex) continue;
		if (count > 0) return null;

		const end = ends?.get(index) || '';
		if (end > instant.instant) return null;
		if (end > latest) latest = end;
	}

	return latest;
}

function teamIsBusy(state, item, instant) {
	return item.teams.some((team) =>
		playedOn(state, team.key, instant.day).some(
			(played) => played.start < instant.endMinutes && instant.startMinutes < played.end
		)
	);
}

// The organiser's rules this placement would break, each naming the teams it
// breaks it for. Rest is measured as the gap on both sides. Placement walks
// forward, so only the backward gap can fail today, but the rule is about the
// gap, not the direction.
//
// The break before a knockout round is measured from the end of the rounds
// before it, on the same day only; a round that ended the day before has had
// the night.
function findBentRules(item, instant, state, rules, earlierEnd) {
	const bent = [];

	if (rules.knockoutGap !== null && item.isKnockout && earlierEnd.slice(0, 10) === instant.day) {
		const endMinutes = timeToMinutes(earlierEnd.slice(11));
		if (endMinutes + rules.knockoutGap > instant.startMinutes) bent.push({ rule: 'gap', teams: [] });
	}

	if (rules.restMinutes !== null) {
		const teams = item.teams.filter((team) =>
			playedOn(state, team.key, instant.day).some(
				(played) =>
					instant.startMinutes < played.end + rules.restMinutes &&
					played.start < instant.endMinutes + rules.restMinutes
			)
		);
		if (teams.length > 0) bent.push({ rule: 'rest', teams });
	}

	if (rules.maxPerDay !== null) {
		const teams = item.teams.filter((team) => playedOn(state, team.key, instant.day).length >= rules.maxPerDay);
		if (teams.length > 0) bent.push({ rule: 'daily', teams });
	}

	return bent;
}

// Each bend costs one more than the last bend for the same team. A bend that
// belongs to no team — the break before a knockout round — costs one.
function bendCost(bent, state) {
	return bent.reduce(
		(total, { teams }) =>
			total +
			(teams.length === 0 ? 1 : teams.reduce((sum, team) => sum + 1 + (state.teamBends.get(team.key) || 0), 0)),
		0
	);
}

// The longest wait, measured from each team's previous match on the same day.
// breached names the teams this placement leaves waiting longer than the limit.
// overdue says whether a team would breach it if the match waited one more match
// length, which is what moves the match up the queue.
//
// A wait is never a reason to refuse a match: refusing it would only make the
// team wait longer. It is played sooner where possible, and reported where not.
function findWaits(item, instant, state, rules) {
	if (rules.maxWait === null) return { breached: [], overdue: false };

	let overdue = false;
	const breached = item.teams.filter((team) => {
		const previous = playedOn(state, team.key, instant.day)
			.filter((played) => played.end <= instant.startMinutes)
			.reduce((latest, played) => Math.max(latest, played.end), -1);
		if (previous < 0) return false;

		const wait = instant.startMinutes - previous;
		if (wait + rules.durationMinutes > rules.maxWait) overdue = true;
		return wait > rules.maxWait;
	});

	return { breached, overdue };
}

// The longest chain of matches still hanging off this fixture: its busiest
// team's remaining matches, plus the knockout rounds that must follow.
function urgencyOf(item, state) {
	const teamLoad = item.teams.reduce((most, team) => Math.max(most, state.teamRemaining.get(team.key) || 0), 1);
	return teamLoad + item.roundsAfter;
}

// When the most recently busy of the two teams last finished. Earlier is better:
// it spreads rest evenly rather than feeding the same teams again.
function lastPlayedOf(item, state) {
	return item.teams.reduce((latest, team) => {
		const end = state.teamLastEnd.get(team.key) || '';
		return end > latest ? end : latest;
	}, '');
}

// Which ready match plays now. Lower is better on every key, and the fixture's
// own position is the total tiebreak that keeps generation deterministic.
function compareCandidates(left, right) {
	return (
		left.cost - right.cost ||
		Number(right.overdue) - Number(left.overdue) ||
		right.urgency - left.urgency ||
		(left.lastPlayed < right.lastPlayed ? -1 : left.lastPlayed > right.lastPlayed ? 1 : 0) ||
		left.item.order - right.item.order
	);
}

// 0 continues the division already on this court, 1 starts a court that was
// idle, 2 changes the court over from another division.
function changeoverCost(court, item, instant, state) {
	const preceding = state.courtHandover.get(`${instant.day}_${court.id}_${instant.startMinutes}`);

	if (preceding === undefined) return 1;

	return preceding === (item.divisionId ?? null) ? 0 : 2;
}

// 0 when the pool has no established court yet or this is it, 1 otherwise.
function affinityCost(court, item, state) {
	if (!item.courtKey) return 0;

	const established = state.courtAffinity.get(item.courtKey);
	if (established === undefined) return 0;

	return established === court.id ? 0 : 1;
}

// Which court the chosen match goes on. The preferences, in docs/schedule.md's
// order and each only when switched on, then a court reserved for this division
// before an open one (so the open one stays free for anyone), then court order.
function chooseCourt(courts, item, instant, state, rules) {
	const score = (court) => [
		rules.groupDivisions ? changeoverCost(court, item, instant, state) : 0,
		rules.courtAffinity ? affinityCost(court, item, state) : 0,
		court.divisions.length > 0 ? 0 : 1,
		court.courtIndex,
	];

	return courts.reduce((best, court) => {
		const left = score(court);
		const right = score(best);
		const difference = left.map((value, index) => value - right[index]).find((value) => value !== 0) || 0;
		return difference < 0 ? court : best;
	});
}

function recordPlacement(state, candidate, court, instant) {
	const { item, bent, cost, breached } = candidate;
	const waits = breached.length > 0 ? [{ rule: 'wait', teams: breached }] : [];

	state.placements.push({ item, instant, court, bent: [...bent, ...waits] });
	state.unplaced.delete(item);
	state.cost += cost + breached.length;

	item.teams.forEach((team) => {
		const byDay = state.teamPlay.get(team.key) || new Map();
		const played = byDay.get(instant.day) || [];
		played.push({ start: instant.startMinutes, end: instant.endMinutes });
		byDay.set(instant.day, played);
		state.teamPlay.set(team.key, byDay);

		state.teamRemaining.set(team.key, state.teamRemaining.get(team.key) - 1);
		state.teamLastEnd.set(team.key, instant.end);
	});

	bent.forEach(({ teams }) =>
		teams.forEach((team) => state.teamBends.set(team.key, (state.teamBends.get(team.key) || 0) + 1))
	);

	if (item.roundIndex !== null) {
		const remaining = state.roundRemaining.get(item.divisionId);
		remaining.set(item.roundIndex, remaining.get(item.roundIndex) - 1);

		const ends = state.roundEnd.get(item.divisionId) || new Map();
		if ((ends.get(item.roundIndex) || '') < instant.end) ends.set(item.roundIndex, instant.end);
		state.roundEnd.set(item.divisionId, ends);
	}

	state.courtHandover.set(`${instant.day}_${court.id}_${instant.endMinutes}`, item.divisionId ?? null);

	if (item.courtKey && !state.courtAffinity.has(item.courtKey)) {
		state.courtAffinity.set(item.courtKey, court.id);
	}
}

// One walk through the days. `margin` is null for a strict pass, where the
// organiser's rules are as hard as the others. Otherwise a rule may bend for a
// court that would stand idle, once the slack falls below the margin. Slack is
// the free court time left, in matches, minus the matches still to place.
// Placing a match leaves it unchanged and an idle court lowers it, so once it
// drops below the margin it stays there, and bending is confined to the tail of
// the schedule.
//
// Each court keeps its own clock. The walk always takes the earliest of them,
// together with every other court free at that same minute, and fills those
// courts the way it always has: the best ready match first, then the best court
// for it. A court left with nothing moves on to the next moment anything could
// change — another court coming free, or one shortest match length later.
function runPass(items, timetable, rules, { margin, spread }) {
	const state = createPassState(items);
	const { startMinutes, endMinutes: dayEndMinutes, durationMinutes } = timetable;
	const lastDayIndex = timetable.days.length > 0 ? timetable.days[timetable.days.length - 1].dayIndex : -1;
	const shortest = () => [...state.unplaced].reduce((least, item) => Math.min(least, item.duration), Infinity);

	for (const entry of timetable.days) {
		if (state.unplaced.size === 0) break;

		// Spreading across days: each day takes its share of what is left, in
		// proportion to its court time. The last day takes whatever remains.
		let quota = Infinity;
		if (spread && entry.dayIndex !== lastDayIndex) {
			const capacityLeft = entry.capacity + entry.laterCapacity;
			quota = capacityLeft > 0 ? Math.ceil((state.unplaced.size * entry.capacity) / capacityLeft) : Infinity;
		}

		let placedToday = 0;
		const clock = new Map(entry.courts.map((court) => [court.id, skipBreaks(court, startMinutes)]));

		while (state.unplaced.size > 0 && placedToday < quota) {
			const least = shortest();
			const live = entry.courts.filter((court) => clock.get(court.id) + least <= entry.limit);
			if (live.length === 0) break;

			const now = Math.min(...live.map((court) => clock.get(court.id)));
			const free = live.filter((court) => clock.get(court.id) === now);

			while (free.length > 0 && placedToday < quota) {
				const capacityLeft =
					entry.laterCapacity +
					entry.courts.reduce(
						(sum, court) => sum + countSlots(court, clock.get(court.id), entry.limit, durationMinutes),
						0
					);
				const mayBend = margin !== null && capacityLeft - state.unplaced.size < margin;
				let best = null;
				// Why each match could not take a court now. Kept only if a court is
				// left idle: a refusal while another match fills the court anyway
				// says nothing about why the refused match went unplaced.
				const refusals = [];

				for (const item of state.unplaced) {
					const courts = free.filter(
						(court) => courtAccepts(court, item.fixture) && fitsOn(court, now, item.duration, entry.limit)
					);
					if (courts.length === 0) continue;

					const instant = makeInstant(entry, now, item.duration, dayEndMinutes);

					const earlierEnd = earlierRoundsEnd(item, instant, state);
					if (earlierEnd === null) {
						refusals.push([item, 'round']);
						continue;
					}

					if (teamIsBusy(state, item, instant)) {
						refusals.push([item, 'team']);
						continue;
					}

					const bent = findBentRules(item, instant, state, rules, earlierEnd);
					if (bent.length > 0 && !mayBend) {
						bent.forEach(({ rule }) => refusals.push([item, rule]));
						continue;
					}

					const { breached, overdue } = findWaits(item, instant, state, rules);
					const candidate = {
						item,
						instant,
						bent,
						breached,
						overdue,
						courts,
						cost: bendCost(bent, state),
						urgency: urgencyOf(item, state),
						lastPlayed: lastPlayedOf(item, state),
					};

					if (best === null || compareCandidates(candidate, best) < 0) best = candidate;
				}

				if (best === null) {
					refusals.forEach(([item, reason]) => noteFailure(state, item, reason));
					break;
				}

				const court = chooseCourt(best.courts, best.item, best.instant, state, rules);
				recordPlacement(state, best, court, best.instant);
				clock.set(court.id, skipBreaks(court, best.instant.endMinutes));
				free.splice(free.indexOf(court), 1);
				placedToday += 1;
			}

			// The courts still free at `now` had nothing they could take. Move each
			// on to the next moment something could change.
			const step = state.unplaced.size > 0 ? shortest() : durationMinutes;
			const later = entry.courts.map((court) => clock.get(court.id)).filter((minute) => minute > now);
			const next = Math.min(now + step, ...later);
			free.forEach((court) => clock.set(court.id, skipBreaks(court, next)));
		}
	}

	return state;
}

// --- choosing between passes ------------------------------------------------

function summarise(state, dayEndMinutes) {
	let finish = '';
	let overrunMinutes = 0;
	let mostBends = 0;

	state.placements.forEach(({ instant }) => {
		if (instant.end > finish) finish = instant.end;
		if (instant.overrun) overrunMinutes = Math.max(overrunMinutes, instant.endMinutes - dayEndMinutes);
	});
	state.teamBends.forEach((count) => {
		mostBends = Math.max(mostBends, count);
	});

	return { placed: state.placements.length, overrunMinutes, cost: state.cost, mostBends, finish };
}

// Most fixtures placed, then the least overrun, then the least bending, then
// the fewest bends for any single team, then the earliest finish.
function compareResults(left, right) {
	const a = left.summary;
	const b = right.summary;

	return (
		b.placed - a.placed ||
		a.overrunMinutes - b.overrunMinutes ||
		a.cost - b.cost ||
		a.mostBends - b.mostBends ||
		(a.finish < b.finish ? -1 : a.finish > b.finish ? 1 : 0)
	);
}

// Slack margins to try, tightest first: 0, 1, 2, 4, … and finally one no slack
// can fall under, which bends wherever a court would otherwise idle.
function slackMargins(timetable) {
	const { capacity } = timetable;
	const margins = [];
	for (let margin = 0; margin <= capacity; margin = margin === 0 ? 1 : margin * 2) margins.push(margin);
	margins.push(capacity + 1);
	return margins;
}

function searchSchedule(items, context, { spread }) {
	const { rules, fitAll, allowOverrun, dayEndMinutes, durationMinutes } = context;
	let best = null;

	const consider = (state) => {
		const result = { state, summary: summarise(state, dayEndMinutes) };
		if (best === null || compareResults(result, best) < 0) best = result;
	};
	const complete = () => best !== null && best.summary.placed === items.length;

	const tryWithOverrun = (overrunSlots) => {
		const timetable = context.buildTimetable(overrunSlots);

		consider(runPass(items, timetable, rules, { margin: null, spread }));
		if (complete() && best.summary.cost === 0 && best.summary.overrunMinutes === 0) return;
		if (!fitAll) return;

		slackMargins(timetable).forEach((margin) => consider(runPass(items, timetable, rules, { margin, spread })));
	};

	tryWithOverrun(0);

	if (allowOverrun) {
		for (let slots = 1; !complete() && context.dayEndMinutes + (slots - 1) * durationMinutes < LAST_MINUTE; slots += 1) {
			tryWithOverrun(slots);
		}
	}

	return best;
}

// --- warnings ---------------------------------------------------------------

// Which constraint to name when several blocked a fixture. Ordered by how much
// the answer tells an organiser: "a team would have played back to back" points
// at a fix, "every court is busy" is the one they would have guessed.
const FAILURE_PRIORITY = ['division', 'daily', 'rest', 'gap', 'round', 'team', 'court'];

const FAILURE_REASONS = {
	division: 'no court is open to the fixture’s division. Open a court to that division, or add one.',
	rest: 'the only free slots would leave a team playing two matches back to back. Add a court or extend the day.',
	daily: 'the teams involved had already reached their daily match limit. Raise the limit, add a day, or let the generator bend rules.',
	gap: 'no free slot is left after the break before the knockout round. Shorten the break, extend the day, or let the generator bend rules.',
	round: 'no free slot is left once the earlier rounds of the same division have finished. Extend the day or add another day.',
	team: 'the teams involved are already playing in every remaining slot. Add a court or extend the day.',
	court: 'every court is booked for the whole day. Add a court, extend the day, or shorten matches.',
};

function describeFailure(item, state, courts) {
	if (!courts.some((court) => courtAccepts(court, item.fixture))) return 'division';

	const failures = state.reasons.get(item) || new Set();
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

function plural(count, singular, pluralForm = `${singular}s`) {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

// The rules the chosen schedule had to bend, grouped by rule, naming the entries
// and the teams it was bent for. The report the organiser is shown after
// generating, and the source of the warnings below.
function buildRuleBreaks(placements, entryIdByItem, { restMinutes, maxPerDay, maxWait, knockoutGap }) {
	const groups = new Map();
	const add = (rule, placement, teams) => {
		const group = groups.get(rule) || { rule, entryIds: [], teams: new Set() };
		group.entryIds.push(entryIdByItem.get(placement.item));
		teams.forEach((team) => group.teams.add(team.name || team.key));
		groups.set(rule, group);
	};

	placements.forEach((placement) => {
		placement.bent.forEach(({ rule, teams }) => add(rule, placement, teams));
		if (placement.instant.overrun) add('overrun', placement, []);
	});

	const describe = {
		rest: (group) =>
			`Minimum rest (${restMinutes} min) shortened for ${plural(group.teams.size, 'team')} in ${plural(group.entryIds.length, 'match', 'matches')}.`,
		daily: (group) =>
			`Daily limit of ${plural(maxPerDay, 'match', 'matches')} per team exceeded for ${plural(group.teams.size, 'team')} in ${plural(group.entryIds.length, 'match', 'matches')}.`,
		wait: (group) =>
			`Longest wait (${maxWait} min) exceeded for ${plural(group.teams.size, 'team')} in ${plural(group.entryIds.length, 'match', 'matches')}.`,
		gap: (group) =>
			`Break before knockout rounds (${knockoutGap} min) shortened in ${plural(group.entryIds.length, 'match', 'matches')}.`,
		overrun: (group) => `${plural(group.entryIds.length, 'match', 'matches')} run past the daily end time.`,
	};

	return ['rest', 'daily', 'gap', 'wait', 'overrun']
		.filter((rule) => groups.has(rule))
		.map((rule) => {
			const group = groups.get(rule);
			return { rule, entryIds: group.entryIds, teams: [...group.teams].sort(), message: describe[rule](group) };
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

// The rules and preferences are the keys of DEFAULT_GENERATOR_SETTINGS in
// scheduleUtils.js, passed at the top level. Anything not passed takes that
// default, so a caller that has never heard of a rule generates with it at its
// default.
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
	restMinutes: requestedRestMinutes,
	restEnabled = DEFAULT_GENERATOR_SETTINGS.restEnabled,
	maxPerDayEnabled = DEFAULT_GENERATOR_SETTINGS.maxPerDayEnabled,
	maxMatchesPerDay = DEFAULT_GENERATOR_SETTINGS.maxMatchesPerDay,
	maxWaitEnabled = DEFAULT_GENERATOR_SETTINGS.maxWaitEnabled,
	maxWaitMinutes = DEFAULT_GENERATOR_SETTINGS.maxWaitMinutes,
	knockoutGapEnabled = DEFAULT_GENERATOR_SETTINGS.knockoutGapEnabled,
	knockoutGapMinutes: requestedKnockoutGap,
	fitAll = DEFAULT_GENERATOR_SETTINGS.fitAll,
	allowOverrun = DEFAULT_GENERATOR_SETTINGS.allowOverrun,
	spreadDays = DEFAULT_GENERATOR_SETTINGS.spreadDays,
	courtAffinity = DEFAULT_GENERATOR_SETTINGS.courtAffinity,
	groupDivisions = DEFAULT_GENERATOR_SETTINGS.groupDivisions,
	assignOfficials = DEFAULT_GENERATOR_SETTINGS.assignOfficials,
	roundDurations = DEFAULT_GENERATOR_SETTINGS.roundDurations,
}) {
	const durationMinutes = Number(fixtureDurationMinutes);
	// Absent, blank or nonsensical means "whatever one match lasts", which is the
	// number the old rest rule always came out at. Zero is a real answer —
	// back-to-back matches allowed — so it is only rejected when it is not a
	// number at all.
	const parsedRestMinutes = Number(requestedRestMinutes);
	const restMinutes =
		Number.isFinite(parsedRestMinutes) && parsedRestMinutes >= 0 && requestedRestMinutes !== '' && requestedRestMinutes !== null
			? parsedRestMinutes
			: durationMinutes * DEFAULT_REST_MULTIPLE;
	const parsedMaxPerDay = Math.floor(Number(maxMatchesPerDay));
	const maxPerDay = maxPerDayEnabled && parsedMaxPerDay >= 1 ? parsedMaxPerDay : null;
	const parsedMaxWait = Number(maxWaitMinutes);
	const maxWait = maxWaitEnabled && maxWaitMinutes !== '' && parsedMaxWait >= 0 ? parsedMaxWait : null;
	// Like rest: blank or unreadable means one match length.
	const parsedKnockoutGap = Number(requestedKnockoutGap);
	const knockoutGapMinutes =
		requestedKnockoutGap !== '' && requestedKnockoutGap !== null && Number.isFinite(parsedKnockoutGap) && parsedKnockoutGap >= 0
			? parsedKnockoutGap
			: durationMinutes;
	const knockoutGap = knockoutGapEnabled ? knockoutGapMinutes : null;
	// Only the lengths that read as a positive whole number; the rest fall back to
	// the default match length.
	const savedRoundDurations = normaliseGeneratorSettings({ roundDurations }).roundDurations;

	if (!courtCount || !durationMinutes || !isTimeRangeValid(dailyStartTime, dailyEndTime)) {
		return {
			schedule: baseSchedule,
			unscheduledFixtures: fixtures,
			warnings: ['Enter valid court, time, and duration values before generating the schedule.'],
			report: null,
		};
	}

	const normalised = normaliseSchedule(baseSchedule, { startDate, endDate });
	const preservedBreaks = normalised.entries.filter((entry) => entry.type === 'break');

	// The generator reassigns every slot, so the placement does not survive — but
	// the fixture-scoped text the organiser typed does. Keyed by fixtureId, so it
	// rides along to wherever the fixture is placed this run. Without this every
	// officials value is destroyed on every regeneration.
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
			// slotMinutes is deliberately NOT written here. It is the height of a
			// grid row — how the board is drawn — and a fixture's length is its
			// own startTime/endTime. See docs/schedule.md.
			//
			// The rules this run used, so the panel opens on them next time.
			generator: normaliseGeneratorSettings({
				fixtureDurationMinutes: durationMinutes,
				restEnabled,
				restMinutes,
				maxPerDayEnabled,
				maxMatchesPerDay,
				maxWaitEnabled,
				maxWaitMinutes,
				knockoutGapEnabled,
				knockoutGapMinutes,
				fitAll,
				allowOverrun,
				spreadDays,
				courtAffinity,
				groupDivisions,
				assignOfficials,
				roundDurations,
			}),
		},
	};

	const startMinutes = timeToMinutes(dailyStartTime);
	const dayEndMinutes = timeToMinutes(dailyEndTime);
	const items = prepareItems(fixtures, buildRoundOrder(divisions), { durationMinutes, roundDurations: savedRoundDurations });
	const context = {
		rules: {
			restMinutes: restEnabled ? restMinutes : null,
			maxPerDay,
			maxWait,
			knockoutGap,
			durationMinutes,
			courtAffinity,
			groupDivisions,
		},
		fitAll,
		allowOverrun,
		dayEndMinutes,
		durationMinutes,
		buildTimetable: (overrunSlots) =>
			buildTimetable(schedule.days, courts, preservedBreaks, {
				startMinutes,
				endMinutes: dayEndMinutes,
				durationMinutes,
				overrunSlots,
			}),
	};

	let best = searchSchedule(items, context, { spread: spreadDays });

	// Spreading is a preference. When it costs a fixture its place, the
	// schedule that places more wins.
	if (spreadDays && best.summary.placed < items.length) {
		const packed = searchSchedule(items, context, { spread: false });
		if (packed.summary.placed > best.summary.placed) best = packed;
	}

	const { state } = best;
	const entryIdByItem = new Map();

	state.placements.forEach(({ item, instant, court }) => {
		const carried = carriedText.get(item.fixture.id) || {};
		const entry = createFixtureEntry({
			day: instant.day,
			courtId: court.id,
			startTime: instant.startTime,
			endTime: instant.endTime,
			fixtureId: item.fixture.id,
			officials: carried.officials || '',
			notes: carried.notes || '',
		});

		entryIdByItem.set(item, entry.id);
		schedule.entries.push(entry);
	});

	schedule.entries = sortScheduleEntries(schedule.entries, schedule);

	const unplacedItems = items.filter((item) => state.unplaced.has(item));
	const unscheduledFixtures = unplacedItems.map((item) => item.fixture);
	const unplacedReasons = unplacedItems.map((item) => describeFailure(item, state, courts));
	const ruleBreaks = buildRuleBreaks(state.placements, entryIdByItem, { restMinutes, maxPerDay, maxWait, knockoutGap });

	// Officials are assigned over the finished schedule, only when asked. Off — the
	// default — leaves the officials carried from the previous run untouched.
	let officialsWarnings = [];
	if (assignOfficials) {
		const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
		const unassigned = assignOfficialsPass(schedule.entries, fixturesById, divisions || []);
		officialsWarnings = buildOfficialsWarning(unassigned);
	}

	return {
		schedule,
		unscheduledFixtures,
		warnings: [...buildWarnings(unplacedReasons), ...ruleBreaks.map((group) => group.message), ...officialsWarnings],
		report: {
			total: fixtures.length,
			placed: state.placements.length,
			finish: best.summary.finish,
			ruleBreaks,
		},
	};
}
