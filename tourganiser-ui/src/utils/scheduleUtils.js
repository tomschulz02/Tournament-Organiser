export const SCHEDULE_VERSION = 1;
export const DEFAULT_SCHEDULE_START = '09:00';
export const DEFAULT_SCHEDULE_END = '18:00';
export const DEFAULT_SLOT_MINUTES = 30;

export function createScheduleId(prefix = 'schedule') {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function parseDateOnly(value) {
	if (!value) return null;

	if (value instanceof Date) {
		return new Date(value.getFullYear(), value.getMonth(), value.getDate());
	}

	if (typeof value === 'string') {
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (match) {
			return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		}

		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
		}
	}

	return null;
}

export function formatDateIso(date) {
	if (!date) return '';

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

export function formatDateLabel(value) {
	const parsed = parseDateOnly(value);
	if (!parsed) return value || '';

	return new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	}).format(parsed);
}

export function normaliseTournamentDays(startDate, endDate, existingDays = []) {
	const start = parseDateOnly(startDate);
	const end = parseDateOnly(endDate) || start;

	if (!start || !end) {
		return existingDays.length > 0
			? existingDays.map((day, index) => ({
					id: day.id || createScheduleId('day'),
					date: day.date,
					label: day.label || `Day ${index + 1}`,
			  }))
			: [];
	}

	const cursor = new Date(start);
	const allDays = [];
	let index = 0;

	while (cursor <= end) {
		const date = formatDateIso(cursor);
		const existing = existingDays.find((day) => day.date === date);

		allDays.push({
			id: existing?.id || createScheduleId('day'),
			date,
			label: existing?.label || `Day ${index + 1}`,
		});

		cursor.setDate(cursor.getDate() + 1);
		index += 1;
	}

	return allDays;
}

export function timeToMinutes(time) {
	if (!time || typeof time !== 'string') return 0;
	const [hours = '0', minutes = '0'] = time.split(':');
	return Number(hours) * 60 + Number(minutes);
}

export function minutesToTime(totalMinutes) {
	const minutes = Math.max(0, totalMinutes);
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function addMinutesToTime(time, minutes) {
	return minutesToTime(timeToMinutes(time) + minutes);
}

export function compareTimes(a, b) {
	return timeToMinutes(a) - timeToMinutes(b);
}

export function isTimeRangeValid(startTime, endTime) {
	return compareTimes(endTime, startTime) > 0;
}

export function rangesOverlap(startA, endA, startB, endB) {
	return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}

export function sortScheduleEntries(entries = []) {
	return [...entries].sort((left, right) => {
		if (left.day !== right.day) return left.day.localeCompare(right.day);
		if (left.startTime !== right.startTime) return compareTimes(left.startTime, right.startTime);

		const leftCourt = left.courtId || '';
		const rightCourt = right.courtId || '';
		if (leftCourt !== rightCourt) return leftCourt.localeCompare(rightCourt);

		return left.id.localeCompare(right.id);
	});
}

// Takes any list of fixtures, not one division's. A schedule spans the
// tournament, so the caller flattens every division's fixtures into one list
// before normalising them.
export function normaliseFixtures(fixtures = []) {
	return fixtures.map((fixture, index) => {
		const id = fixture.id || fixture.fixtureId || createScheduleId('fixture');
		const team1 = fixture.team1 || fixture.team_1 || fixture.homeTeam || fixture.home_team || 'TBD';
		const team2 = fixture.team2 || fixture.team_2 || fixture.awayTeam || fixture.away_team || 'TBD';
		const matchNo = fixture.match_no || fixture.matchNo || index + 1;
		const round = fixture.round || fixture.stage || 'Fixture';
		const poolKey = fixture.group || fixture.pool || extractPoolKey(round);

		return {
			...fixture,
			id,
			team1,
			team2,
			matchNo,
			round,
			poolKey,
			searchText: `${team1} ${team2} ${round} ${matchNo}`.toLowerCase(),
		};
	});
}

export function extractPoolKey(round) {
	if (!round) return null;

	const text = String(round);
	const directMatch = text.match(/group\s+([a-z0-9]+)/i) || text.match(/pool\s+([a-z0-9]+)/i);
	if (directMatch) {
		return directMatch[0];
	}

	if (/quarter|semi|final/i.test(text)) return null;

	return text;
}

export function buildFixtureIndex(fixtures = []) {
	return fixtures.reduce((index, fixture) => {
		index[fixture.id] = fixture;
		return index;
	}, {});
}

export function getScheduledFixtureIds(schedule) {
	return new Set(schedule.entries.filter((entry) => entry.type === 'fixture' && entry.fixtureId).map((entry) => entry.fixtureId));
}

export function getUnscheduledFixtures(schedule, fixtures) {
	const scheduledIds = getScheduledFixtureIds(schedule);
	return fixtures.filter((fixture) => !scheduledIds.has(fixture.id));
}

export function buildCourtList(count, existingCourts = []) {
	return Array.from({ length: count }, (_, index) => {
		const existing = existingCourts[index];
		return {
			id: existing?.id || `court-${index + 1}`,
			name: existing?.name || `Court ${index + 1}`,
			// A court may be restricted to a set of division ids. Absent or empty
			// means unrestricted; normalising to [] lets every consumer read
			// court.divisions.length without a guard.
			divisions: Array.isArray(existing?.divisions) ? existing.divisions : [],
		};
	});
}

export function buildEmptySchedule({ startDate, endDate, existingDays = [] }) {
	return {
		version: SCHEDULE_VERSION,
		days: normaliseTournamentDays(startDate, endDate, existingDays),
		courts: [],
		entries: [],
		settings: {
			dayStartTime: DEFAULT_SCHEDULE_START,
			dayEndTime: DEFAULT_SCHEDULE_END,
			slotMinutes: DEFAULT_SLOT_MINUTES,
		},
	};
}

export function normaliseSchedule(rawSchedule, { startDate, endDate }) {
	const base = buildEmptySchedule({
		startDate,
		endDate,
		existingDays: rawSchedule?.days || [],
	});

	if (!rawSchedule) {
		return base;
	}

	return {
		version: rawSchedule.version || SCHEDULE_VERSION,
		days: normaliseTournamentDays(startDate, endDate, rawSchedule.days || base.days),
		courts: Array.isArray(rawSchedule.courts)
			? rawSchedule.courts.map((court, index) => ({
					id: court.id || `court-${index + 1}`,
					name: court.name || `Court ${index + 1}`,
					// Absent or non-array means unrestricted. An old saved schedule
					// has no divisions key on any court and loads as [].
					divisions: Array.isArray(court.divisions) ? court.divisions : [],
			  }))
			: [],
		entries: sortScheduleEntries(
			(rawSchedule.entries || [])
				.filter((entry) => entry?.id && entry?.day && entry?.startTime && entry?.endTime)
				.map((entry) => ({
					id: entry.id,
					type: entry.type === 'break' ? 'break' : 'fixture',
					day: entry.day,
					courtId: entry.courtId ?? null,
					startTime: entry.startTime,
					endTime: entry.endTime,
					fixtureId: entry.fixtureId || null,
					title: entry.title || '',
					officials: entry.officials || '',
					notes: entry.notes || '',
				}))
		),
		settings: {
			dayStartTime: rawSchedule.settings?.dayStartTime || DEFAULT_SCHEDULE_START,
			dayEndTime: rawSchedule.settings?.dayEndTime || DEFAULT_SCHEDULE_END,
			slotMinutes: Number(rawSchedule.settings?.slotMinutes) || DEFAULT_SLOT_MINUTES,
		},
	};
}

// A schedule spans the tournament, not a division — divisions share the same
// physical courts, so scheduling them independently could double-book one. The
// column moved from divisions.schedule to tournaments.schedule on 2026-08-08.
export function getScheduleForTournament(tournament = {}) {
	return normaliseSchedule(tournament.schedule || null, {
		startDate: tournament.startDate || tournament.start_date,
		endDate: tournament.endDate || tournament.end_date || tournament.startDate || tournament.start_date,
	});
}

export function createFixtureEntry({
	day,
	courtId,
	startTime,
	endTime,
	fixtureId,
	officials = '',
	notes = '',
}) {
	return {
		id: createScheduleId('entry'),
		type: 'fixture',
		day,
		courtId,
		startTime,
		endTime,
		fixtureId,
		title: '',
		officials,
		notes,
	};
}

export function createBreakEntry({
	day,
	startTime,
	endTime,
	title,
	courtId = null,
	notes = '',
}) {
	return {
		id: createScheduleId('entry'),
		type: 'break',
		day,
		courtId,
		startTime,
		endTime,
		fixtureId: null,
		title,
		officials: '',
		notes,
	};
}

export function findEntryConflict(entries, candidate, ignoreEntryId = null) {
	return entries.find((entry) => {
		if (entry.id === ignoreEntryId || entry.day !== candidate.day) {
			return false;
		}

		const sharedCourt =
			entry.courtId === candidate.courtId ||
			entry.courtId === null ||
			candidate.courtId === null;

		if (!sharedCourt) {
			return false;
		}

		return rangesOverlap(entry.startTime, entry.endTime, candidate.startTime, candidate.endTime);
	});
}

export function validateScheduleEntry(schedule, candidate, ignoreEntryId = null) {
	if (!candidate.day) return 'Choose a schedule day.';
	if (!candidate.startTime || !candidate.endTime) return 'Start time and end time are required.';
	if (!isTimeRangeValid(candidate.startTime, candidate.endTime)) return 'End time must be after the start time.';
	if (candidate.type === 'fixture' && !candidate.fixtureId) return 'Select a fixture to schedule.';
	if (candidate.type === 'break' && !candidate.title?.trim()) return 'Enter a break title.';

	const conflict = findEntryConflict(schedule.entries, candidate, ignoreEntryId);
	if (conflict) {
		return 'That timeslot overlaps an existing schedule entry.';
	}

	return '';
}

export function upsertScheduleEntry(schedule, nextEntry) {
	const entries = schedule.entries.some((entry) => entry.id === nextEntry.id)
		? schedule.entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry))
		: [...schedule.entries, nextEntry];

	return {
		...schedule,
		entries: sortScheduleEntries(entries),
	};
}

export function removeScheduleEntry(schedule, entryId) {
	return {
		...schedule,
		entries: schedule.entries.filter((entry) => entry.id !== entryId),
	};
}

export function getCourtName(schedule, courtId) {
	if (courtId === null || courtId === undefined) return 'All Courts';
	return schedule.courts.find((court) => court.id === courtId)?.name || 'Unassigned Court';
}

export function getDayEntries(schedule, day) {
	return schedule.entries.filter((entry) => entry.day === day).sort((left, right) => compareTimes(left.startTime, right.startTime));
}

export function calculateScheduledStats(schedule, fixtures) {
	const scheduledFixtures = schedule.entries.filter((entry) => entry.type === 'fixture').length;
	return {
		days: schedule.days.length,
		courts: schedule.courts.length,
		scheduledFixtures,
		totalFixtures: fixtures.length,
		unscheduledFixtures: Math.max(0, fixtures.length - scheduledFixtures),
	};
}

// The day's configured hours, and nothing else.
//
// This used to widen the day to contain its entries, so placing an entry moved
// the axis it was placed on. Every row below it shifted, the time column appeared
// to move, and counting down from a known time landed on the wrong row. The axis
// is a property of the settings; an entry is drawn on it or it is not.
export function getDayBounds(schedule) {
	return {
		start: schedule.settings.dayStartTime || DEFAULT_SCHEDULE_START,
		end: schedule.settings.dayEndTime || DEFAULT_SCHEDULE_END,
	};
}

export function getSlotMinutes(schedule) {
	return Number(schedule.settings.slotMinutes) || DEFAULT_SLOT_MINUTES;
}

export function buildTimeSlots(startTime, endTime, slotMinutes) {
	const slots = [];
	let cursor = timeToMinutes(startTime);
	const end = timeToMinutes(endTime);

	while (cursor < end) {
		slots.push(minutesToTime(cursor));
		cursor += slotMinutes;
	}

	return slots;
}

// The start time of every row on a day's grid, ascending. One per row, and no
// closing boundary — the row at index i runs from rowTimes[i] for slotMinutes.
//
// It used to add each entry's own start and end as extra boundaries, which is
// what made the axis a function of its contents: adding a 09:15 entry inserted a
// 09:15 row, so rows were unequal spans drawn at equal height and every reading
// of the time column below it was wrong.
//
// The rows are uniform instead. A day whose configured hours are not a whole
// number of slots gets one final row that runs past dayEndTime rather than a
// short row, because a short row drawn at full height is the fault this replaces.
export function buildGridRowTimes(schedule, bounds) {
	const slotMinutes = getSlotMinutes(schedule);
	const startMinutes = timeToMinutes(bounds.start);
	const rowCount = Math.max(0, Math.ceil((timeToMinutes(bounds.end) - startMinutes) / slotMinutes));

	return Array.from({ length: rowCount }, (_, index) => minutesToTime(startMinutes + index * slotMinutes));
}

// Where an entry sits on that axis, in rows. rowStart is a 1-based grid line and
// the entry occupies rowStart through rowStart + rowSpan - 1.
//
// Arithmetic in minutes rather than a lookup in the row list, so an entry's drawn
// position and a cell's occupied state are derived from the same expression and
// cannot disagree. Occupancy used to be walked in rows and was therefore only
// correct against the row set of the moment.
//
// `snapped` is true when the entry does not begin and end on a boundary. It is
// then drawn over the rows that contain it, and the caller marks it as
// approximate — its stored times are never changed. `inDay` is false when the
// entry falls outside the configured hours altogether; widening the day to reach
// it is what this change removes, so it is listed off the grid instead.
export function getEntryRowPlacement(entry, { start, slotMinutes, rowCount }) {
	const startMinutes = timeToMinutes(start);
	const startOffset = timeToMinutes(entry.startTime) - startMinutes;
	const endOffset = timeToMinutes(entry.endTime) - startMinutes;

	const firstRow = Math.floor(startOffset / slotMinutes);
	const lastRow = Math.ceil(endOffset / slotMinutes);

	return {
		rowStart: firstRow + 1,
		rowSpan: Math.max(1, lastRow - firstRow),
		snapped: startOffset % slotMinutes !== 0 || endOffset % slotMinutes !== 0,
		inDay: startOffset >= 0 && endOffset > startOffset && lastRow <= rowCount,
	};
}

export function getEntrySlotSpan(entry, slotMinutes) {
	return Math.max(1, Math.ceil((timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime)) / slotMinutes));
}

export function serialiseScheduleForSave(schedule) {
	return {
		version: schedule.version,
		days: schedule.days.map((day) => ({
			id: day.id,
			date: day.date,
			label: day.label,
		})),
		courts: schedule.courts.map((court) => ({
			id: court.id,
			name: court.name,
			divisions: Array.isArray(court.divisions) ? court.divisions : [],
		})),
		entries: sortScheduleEntries(schedule.entries).map((entry) => ({
			id: entry.id,
			type: entry.type,
			day: entry.day,
			courtId: entry.courtId,
			startTime: entry.startTime,
			endTime: entry.endTime,
			fixtureId: entry.fixtureId,
			title: entry.title,
			officials: entry.officials,
			notes: entry.notes,
		})),
		settings: {
			dayStartTime: schedule.settings.dayStartTime,
			dayEndTime: schedule.settings.dayEndTime,
			slotMinutes: schedule.settings.slotMinutes,
		},
	};
}
