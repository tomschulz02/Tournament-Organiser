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

function buildBlockedSlotChecker(entries) {
	return (slot) =>
		entries.some((entry) => {
			if (entry.day !== slot.day) return false;
			if (entry.courtId !== null && entry.courtId !== slot.courtId) return false;
			return rangesOverlap(entry.startTime, entry.endTime, slot.startTime, slot.endTime);
		});
}

function getTeamKeys(fixture) {
	return [fixture.team1, fixture.team2].filter(Boolean);
}

function getFixtureCourtKey(fixture) {
	return fixture.poolKey || fixture.round || null;
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
		3. Iterate fixtures in their existing generated order.
		4. Score every currently available slot for the current fixture.
		5. Pick the highest-scoring slot, assign the fixture, and update scheduling history.

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
	const fixturesToSchedule = fixtures.filter((fixture) => !scheduledFixtureIds.has(fixture.id));
	const unscheduledFixtures = [];

	for (const fixture of fixturesToSchedule) {
		const availableSlots = candidateSlots.filter((slot) => {
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
