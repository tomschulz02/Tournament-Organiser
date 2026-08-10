import {
	addMinutesToTime,
	buildCourtList,
	compareTimes,
	createFixtureEntry,
	getScheduledFixtureIds,
	isTimeRangeValid,
	normaliseSchedule,
	rangesOverlap,
	timeToMinutes,
} from './scheduleUtils';

function buildCandidateSlots(days, courts, startTime, endTime, durationMinutes) {
	const slots = [];
	const dayEndMinutes = timeToMinutes(endTime);

	for (const day of days) {
		for (const court of courts) {
			let cursor = timeToMinutes(startTime);

			while (cursor + durationMinutes <= dayEndMinutes) {
				slots.push({
					day: day.date,
					courtId: court.id,
					startTime: addMinutesToTime('00:00', cursor),
					endTime: addMinutesToTime('00:00', cursor + durationMinutes),
					sortKey: `${day.date}_${String(cursor).padStart(4, '0')}_${court.id}`,
				});

				cursor += durationMinutes;
			}
		}
	}

	return slots.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
}

// A round cannot begin until the round feeding it has finished. Nothing in the
// scoring model expressed that, so a semifinal would take an early slot on a
// later court while pool play was still running — plausible-looking and
// unplayable. See docs/tournament-rules.md; the server enforces the same rule on
// write.
//
// The constraint is per division. Two divisions running in parallel is correct
// and desirable, so this must never become a tournament-wide barrier.

// A fixture's round name is not always a round name in state.rounds: the
// third-place playoff carries its own while belonging to the Finals round.
const THIRD_PLACE_ROUND = '3rd Place Playoff';
const FINALS_ROUND = 'Finals';

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

// Day and time are both fixed width and zero padded, so string order is
// chronological order.
function toInstant(day, time) {
	return `${day}T${time}`;
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

function buildBlockedSlotChecker(entries) {
	return (slot) =>
		entries.some((entry) => {
			if (entry.day !== slot.day) return false;
			if (entry.courtId !== null && entry.courtId !== slot.courtId) return false;
			return rangesOverlap(entry.startTime, entry.endTime, slot.startTime, slot.endTime);
		});
}

// Ids where the payload carries them, names only as a fallback. The fixture set
// now spans every division, and two divisions may well both have a team called
// "Team A" — keying rest windows on the name alone would treat them as one team.
function getTeamKeys(fixture) {
	return [fixture.team_1_id || fixture.team1, fixture.team_2_id || fixture.team2].filter(Boolean);
}

// Scoped to the division for the same reason: "Pool A" exists in most divisions,
// and an unscoped key would pin every division's Pool A to one court.
function getFixtureCourtKey(fixture) {
	const key = fixture.poolKey || fixture.round;
	if (!key) return null;

	return `${fixture.division_id ?? ''}:${key}`;
}

function scoreSlot({
	slot,
	fixture,
	teamLastPlayed,
	courtAffinity,
	courtLoad,
	slotIndex,
	durationMinutes,
}) {
	let score = 0;
	const courtKey = getFixtureCourtKey(fixture);

	// Prefer earlier slots so the schedule stays compact and easy to read.
	score -= slotIndex * 2;

	// Strongly prefer keeping pool/group matches on the same court once a pattern exists.
	if (courtKey && courtAffinity[courtKey] === slot.courtId) {
		score += 180;
	} else if (courtKey && courtAffinity[courtKey] && courtAffinity[courtKey] !== slot.courtId) {
		score -= 35;
	}

	// Lightly balance court usage so one court is not overloaded while others sit empty.
	score -= (courtLoad[slot.courtId] || 0) * 4;

	// Avoid back-to-back matches where possible by heavily penalising short rest windows.
	for (const team of getTeamKeys(fixture)) {
		const lastPlayed = teamLastPlayed[team];
		if (!lastPlayed) continue;

		if (lastPlayed.day !== slot.day) {
			score += 10;
			continue;
		}

		const gap = timeToMinutes(slot.startTime) - timeToMinutes(lastPlayed.endTime);

		if (gap < 0) {
			score -= 10_000;
			continue;
		}

		if (gap < durationMinutes) {
			score -= 250;
		} else if (gap < durationMinutes * 2) {
			score -= 80;
		} else {
			score += Math.min(40, gap);
		}
	}

	return score;
}

function chooseBestSlot({ slots, fixture, teamLastPlayed, courtAffinity, courtLoad, durationMinutes }) {
	let best = null;

	slots.forEach((slot, index) => {
		const score = scoreSlot({
			slot,
			fixture,
			teamLastPlayed,
			courtAffinity,
			courtLoad,
			slotIndex: index,
			durationMinutes,
		});

		if (!best || score > best.score) {
			best = { slot, score };
		}
	});

	return best?.slot || null;
}

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
}) {
	/*
		This generator is intentionally heuristic rather than mathematically optimal.
		The goal is to produce realistic, editable tournament schedules quickly while
		keeping the algorithm easy to reason about and maintain.

		How it works:
		1. Build a flat list of candidate slots across every day and court.
		2. Preserve existing break entries and treat them as blocked time.
		3. Iterate fixtures in their existing generated order, round by round.
		4. Discard slots that would start a round before its division's earlier
		   rounds have finished.
		5. Score every remaining available slot for the current fixture.
		6. Pick the highest-scoring slot, assign the fixture, and update scheduling history.

		Round order is a hard constraint rather than a score: a schedule that puts
		a semifinal before pool play is not a worse schedule, it is an unplayable
		one, and the server refuses to store it.

		The scoring model tries to balance three practical tournament concerns:
		- Keep group/pool matches on the same court where possible.
		- Avoid teams playing back-to-back matches where possible.
		- Fill the schedule from earlier slots forward to use available capacity efficiently.

		If no slot is available for a fixture, we return it in `unscheduledFixtures` so the UI
		can warn the user clearly instead of silently dropping matches.
	*/
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
	const candidateSlots = buildCandidateSlots(schedule.days, courts, dailyStartTime, dailyEndTime, durationMinutes).filter(
		(slot) => !blockedByBreak(slot)
	);
	const teamLastPlayed = {};
	const courtAffinity = {};
	const courtLoad = {};
	const occupiedSlotKeys = new Set();
	const scheduledFixtureIds = getScheduledFixtureIds(schedule);
	const roundOrder = buildRoundOrder(divisions);
	const roundEndByDivision = new Map();
	// Round by round, so that every earlier round of a division has been placed
	// before anything is measured against it. The sort is stable, so fixtures
	// within one round keep their generated order and two runs over the same
	// input still produce the same schedule. An unordered fixture sorts with the
	// first round, which is where it already sat.
	const fixturesToSchedule = fixtures
		.filter((fixture) => !scheduledFixtureIds.has(fixture.id))
		.map((fixture) => ({ fixture, roundIndex: getRoundIndex(fixture, roundOrder) }))
		.sort((left, right) => (left.roundIndex ?? 0) - (right.roundIndex ?? 0));
	const unscheduledFixtures = [];

	for (const { fixture, roundIndex } of fixturesToSchedule) {
		const barrier = findRoundBarrier(roundEndByDivision, fixture.division_id, roundIndex);
		const availableSlots = candidateSlots.filter((slot) => {
			if (barrier !== null && toInstant(slot.day, slot.startTime) < barrier) {
				return false;
			}

			if (occupiedSlotKeys.has(`${slot.day}_${slot.courtId}_${slot.startTime}`)) {
				return false;
			}

			return !schedule.entries.some((entry) => {
				if (entry.day !== slot.day) return false;
				if (entry.courtId !== null && entry.courtId !== slot.courtId) return false;
				return rangesOverlap(entry.startTime, entry.endTime, slot.startTime, slot.endTime);
			});
		});

		const bestSlot = chooseBestSlot({
			slots: availableSlots,
			fixture,
			teamLastPlayed,
			courtAffinity,
			courtLoad,
			durationMinutes,
		});

		if (!bestSlot) {
			unscheduledFixtures.push(fixture);
			continue;
		}

		const entry = createFixtureEntry({
			day: bestSlot.day,
			courtId: bestSlot.courtId,
			startTime: bestSlot.startTime,
			endTime: bestSlot.endTime,
			fixtureId: fixture.id,
		});

		schedule.entries.push(entry);
		occupiedSlotKeys.add(`${bestSlot.day}_${bestSlot.courtId}_${bestSlot.startTime}`);
		courtLoad[bestSlot.courtId] = (courtLoad[bestSlot.courtId] || 0) + 1;
		recordRoundEnd(
			roundEndByDivision,
			fixture.division_id,
			roundIndex,
			toInstant(bestSlot.day, bestSlot.endTime)
		);

		const courtKey = getFixtureCourtKey(fixture);
		if (courtKey && !courtAffinity[courtKey]) {
			courtAffinity[courtKey] = bestSlot.courtId;
		}

		for (const team of getTeamKeys(fixture)) {
			teamLastPlayed[team] = {
				day: bestSlot.day,
				endTime: bestSlot.endTime,
			};
		}
	}

	schedule.entries.sort((left, right) => {
		if (left.day !== right.day) return left.day.localeCompare(right.day);
		if (left.startTime !== right.startTime) return compareTimes(left.startTime, right.startTime);
		return (left.courtId || '').localeCompare(right.courtId || '');
	});

	const warnings = [];
	if (unscheduledFixtures.length > 0) {
		warnings.push(
			`${unscheduledFixtures.length} fixture${unscheduledFixtures.length === 1 ? '' : 's'} could not be scheduled with the available capacity.`
		);
	}

	return {
		schedule,
		unscheduledFixtures,
		warnings,
	};
}
