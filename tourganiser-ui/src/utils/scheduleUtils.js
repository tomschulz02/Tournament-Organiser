import { flattenFixtures } from '../components/tournament/fixtureUtils';
import { divisionColorStyle } from './divisionColors';

export const SCHEDULE_VERSION = 1;
export const DEFAULT_SCHEDULE_START = '09:00';
export const DEFAULT_SCHEDULE_END = '18:00';
export const DEFAULT_SLOT_MINUTES = 30;

// The orientation each printed layout defaults to when nothing has been saved.
// The grid runs courts across the page and reads better landscape; the list is
// a single column of rows and reads better portrait — the same pairing
// scheduleExportDocument.js's @page rules have always used.
export const DEFAULT_PRINT_ORIENTATION = { grid: 'landscape', list: 'portrait' };

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
					enabled: day.enabled !== false,
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
			enabled: existing?.enabled !== false,
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

// Orders two courtIds the way the organiser laid the courts out, which is their
// position in schedule.courts — the array buildCourtList builds by index and
// that the print grid's columns and the courts panel already treat as
// authoritative.
//
// String-comparing the ids is what this replaces, and it was wrong the moment a
// tournament had ten courts: "court-10".localeCompare("court-2") is negative,
// because '1' sorts before '2' at the first differing character, so Court 10
// came before Court 2 everywhere entries were listed. Parsing a number out of
// the id would fix that case and break the next one — a court renamed "Centre
// Court" has no number to parse. Position has neither problem.
//
// A courtId of null is a break spanning every court that day, so it sorts
// first within its time group: it reads as the heading for what follows rather
// than as an entry filed under some arbitrary column.
export function compareByCourtOrder(schedule) {
	const order = new Map((schedule?.courts || []).map((court, index) => [court.id, index]));

	return (leftCourtId, rightCourtId) => {
		const left = courtRank(leftCourtId, order);
		const right = courtRank(rightCourtId, order);

		if (left !== right) return left - right;

		// Same rank means both are null, or both name courts this schedule no
		// longer has. Compare the ids themselves so the order is at least
		// stable rather than dependent on input order.
		return String(leftCourtId ?? '').localeCompare(String(rightCourtId ?? ''));
	};
}

// A court the schedule does not list sorts after every court it does, rather
// than before them or in the middle — a stale reference should be visible at
// the end, not silently interleaved with real courts.
function courtRank(courtId, order) {
	if (courtId == null || courtId === '') return -1;

	const index = order.get(courtId);

	return index === undefined ? order.size : index;
}

// `schedule` is optional only so that a caller with entries and no courts to
// hand still gets day/time ordering. Pass it wherever it exists — without it
// every court ties and the order falls through to entry id, which is arbitrary.
export function sortScheduleEntries(entries = [], schedule = null) {
	const compareCourts = compareByCourtOrder(schedule);

	return [...entries].sort((left, right) => {
		if (left.day !== right.day) return left.day.localeCompare(right.day);
		if (left.startTime !== right.startTime) return compareTimes(left.startTime, right.startTime);

		const byCourt = compareCourts(left.courtId, right.courtId);
		if (byCourt !== 0) return byCourt;

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
		// null per type means "nothing saved, compute the smart default" — see
		// normalisePrintLayouts. A brand-new schedule has never been printed.
		print: { grid: null, list: null },
	};
}

// --- printed layouts --------------------------------------------------------
//
// Where the organiser has chosen the page breaks of the printed schedule, per
// layout type. Presentation only, the same posture docs/schedule.md already
// documents for `settings` and `days`: the server stores this as given and
// validates nothing about it, because there is nothing here that can be
// impossible — only arrangements that are more or less useful to read.
//
// A layout of null means the organiser has never saved one for that type, and
// every consumer falls back to the smart default (computeSmartDefaultRowBreaks
// and computeSmartDefaultCourtBreaks below). That is also what an old schedule
// stored before this key existed normalises to, so nothing regresses.
//
// Row breaks are indices into a day's own row list — a break at 7 means the
// page ends after row 6 and the next begins at row 7 — keyed by day id, so a
// day removed from the tournament takes its breaks with it. Court breaks name
// the court id each new column group *starts* with, rather than an index, for
// the same reason: a court removed from the schedule invalidates only its own
// break instead of silently shifting every one after it.
//
// An empty array is meaningful and is preserved: a day with `[]` prints on one
// page because that is what was asked for, which is not the same as a day with
// no entry at all, which falls back to the smart default.
export function normalisePrintLayouts(rawPrint) {
	return {
		grid: normalisePrintLayout(rawPrint?.grid, 'grid'),
		list: normalisePrintLayout(rawPrint?.list, 'list'),
	};
}

function normalisePrintLayout(raw, type) {
	if (!raw || typeof raw !== 'object') return null;

	return {
		orientation:
			raw.orientation === 'portrait' || raw.orientation === 'landscape'
				? raw.orientation
				: DEFAULT_PRINT_ORIENTATION[type],
		// The list has no court columns to group, so it carries no court breaks
		// however the stored payload was written.
		courtBreaks:
			type === 'grid' && Array.isArray(raw.courtBreaks)
				? raw.courtBreaks.filter((courtId) => typeof courtId === 'string' && courtId !== '')
				: [],
		rowBreaksByDay: normaliseRowBreaksByDay(raw.rowBreaksByDay),
	};
}

function normaliseRowBreaksByDay(raw) {
	if (!raw || typeof raw !== 'object') return {};

	const result = {};

	Object.entries(raw).forEach(([dayId, indices]) => {
		if (!Array.isArray(indices)) return;

		// Row 0 is the top of the day and can never be a break — a page break
		// before the first row would produce an empty leading page.
		result[dayId] = [...new Set(indices.map(Number))]
			.filter((index) => Number.isInteger(index) && index > 0)
			.sort((a, b) => a - b);
	});

	return result;
}

export function serialisePrintLayouts(print) {
	const grid = serialisePrintLayout(print?.grid, 'grid');
	const list = serialisePrintLayout(print?.list, 'list');

	// Nothing saved for either type writes null rather than a pair of nulls, so
	// a schedule that has never been printed stores no shape at all.
	if (!grid && !list) return null;

	return { grid, list };
}

function serialisePrintLayout(layout, type) {
	if (!layout) return null;

	const serialised = {
		orientation: layout.orientation || DEFAULT_PRINT_ORIENTATION[type],
		rowBreaksByDay: normaliseRowBreaksByDay(layout.rowBreaksByDay),
	};

	if (type === 'grid') {
		serialised.courtBreaks = Array.isArray(layout.courtBreaks) ? layout.courtBreaks : [];
	}

	return serialised;
}

// Splits `list` at explicit break positions rather than at a fixed size. This
// is what replaced the old fixed-size chunker: the same output for a schedule
// nobody has arranged (the smart defaults below produce the old boundaries),
// and an arbitrary arrangement once an organiser has moved one.
//
// A break index is the first row of the *next* chunk. Indices at or past the
// end of the list are ignored rather than producing an empty trailing page —
// that is how a saved layout survives a day getting shorter without needing to
// be rewritten. An empty list still yields one empty chunk, preserving the
// one-page-per-day floor the fixed-size chunker always had.
export function chunkAtBreaks(list, breakIndices = []) {
	const bounds = [...new Set(breakIndices)]
		.filter((index) => Number.isInteger(index) && index > 0 && index < list.length)
		.sort((a, b) => a - b);

	const chunks = [];
	let start = 0;

	bounds.forEach((bound) => {
		chunks.push(list.slice(start, bound));
		start = bound;
	});

	chunks.push(list.slice(start));

	return chunks;
}

// How far back from a full page the default will look for a natural place to
// break. Small on purpose: the point is to avoid splitting a run of
// simultaneous fixtures or to end a page on an empty slot, not to leave a page
// visibly short of content.
const NATURAL_BREAK_WINDOW = 2;

// The breaks a layout starts from before anybody edits it. `rowsPerPage` is the
// conservative estimate of what one sheet holds, so the search only ever moves
// a break *earlier* — a page that comes out slightly short prints with some
// blank space at the foot, whereas one that comes out long silently overflows.
//
// `isNaturalBreak(index)` is optional and answers whether breaking immediately
// before `index` reads well: for the grid, that the row above is empty; for the
// list, that the row starts a new time. Without it the boundaries are exactly
// the fixed-size ones.
export function computeSmartDefaultRowBreaks(rowCount, rowsPerPage, isNaturalBreak = null) {
	if (!Number.isInteger(rowsPerPage) || rowsPerPage < 1) return [];

	const breaks = [];
	let start = 0;

	while (rowCount - start > rowsPerPage) {
		const target = start + rowsPerPage;
		let chosen = target;

		if (isNaturalBreak) {
			for (let candidate = target; candidate >= target - NATURAL_BREAK_WINDOW && candidate > start + 1; candidate -= 1) {
				if (isNaturalBreak(candidate)) {
					chosen = candidate;
					break;
				}
			}
		}

		breaks.push(chosen);
		start = chosen;
	}

	return breaks;
}

// The court id each default column group starts with. Ids rather than indices
// for the same reason the saved layout uses them — see normalisePrintLayouts.
export function computeSmartDefaultCourtBreaks(courts, courtsPerGroup) {
	const breaks = [];

	for (let index = courtsPerGroup; index < courts.length; index += courtsPerGroup) {
		breaks.push(courts[index].id);
	}

	return breaks;
}

// Court-id breaks turned into the indices chunkAtBreaks takes. A break naming a
// court that is no longer in the schedule simply matches nothing, which is the
// same graceful outcome pruneStalePrintLayout reaches deliberately — this is
// the safety net, not the mechanism.
export function courtBreakIndices(courts, courtBreaks = []) {
	const starts = new Set(courtBreaks);

	return courts.map((court, index) => (index > 0 && starts.has(court.id) ? index : -1)).filter((index) => index > 0);
}

// Drops the parts of a saved layout that point at a day or a court the schedule
// no longer has, so the rest of it still applies and what is missing falls back
// to the smart default. `dropped` is what the organiser-only staleness notice
// is shown for; it never rewrites what is stored, only what is used on this
// load — see docs/schedule.md.
export function pruneStalePrintLayout(layout, { dayIds = [], courtIds = [] } = {}) {
	if (!layout) return { layout: null, dropped: false };

	let dropped = false;
	const rowBreaksByDay = {};

	Object.entries(layout.rowBreaksByDay || {}).forEach(([dayId, indices]) => {
		if (!dayIds.includes(dayId)) {
			dropped = true;
			return;
		}

		rowBreaksByDay[dayId] = indices;
	});

	const courtBreaks = (layout.courtBreaks || []).filter((courtId) => {
		if (courtIds.includes(courtId)) return true;

		dropped = true;
		return false;
	});

	return { layout: { ...layout, rowBreaksByDay, courtBreaks }, dropped };
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

	// Hoisted out of the object literal below because the entry sort needs it:
	// entries are ordered by their court's position in this array, so it has to
	// exist before they are sorted rather than alongside them.
	const courts = Array.isArray(rawSchedule.courts)
		? rawSchedule.courts.map((court, index) => ({
				id: court.id || `court-${index + 1}`,
				name: court.name || `Court ${index + 1}`,
				// Absent or non-array means unrestricted. An old saved schedule
				// has no divisions key on any court and loads as [].
				divisions: Array.isArray(court.divisions) ? court.divisions : [],
		  }))
		: [];

	return {
		version: rawSchedule.version || SCHEDULE_VERSION,
		days: normaliseTournamentDays(startDate, endDate, rawSchedule.days || base.days),
		courts,
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
				})),
			{ courts },
		),
		settings: {
			dayStartTime: rawSchedule.settings?.dayStartTime || DEFAULT_SCHEDULE_START,
			dayEndTime: rawSchedule.settings?.dayEndTime || DEFAULT_SCHEDULE_END,
			slotMinutes: Number(rawSchedule.settings?.slotMinutes) || DEFAULT_SLOT_MINUTES,
		},
		print: normalisePrintLayouts(rawSchedule.print),
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
	if (schedule.days.find((day) => day.date === candidate.day)?.enabled === false) {
		return 'This day is excluded from scheduling.';
	}
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
		entries: sortScheduleEntries(entries, schedule),
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

// Time first, then court order. The court tiebreak used to be missing
// altogether, which left entries sharing a start time in whatever order they
// happened to be stored in — so the printed list could show the same day's
// 09:00 matches in a different order from the grid beside it.
export function getDayEntries(schedule, day) {
	const compareCourts = compareByCourtOrder(schedule);

	return schedule.entries
		.filter((entry) => entry.day === day)
		.sort((left, right) => compareTimes(left.startTime, right.startTime) || compareCourts(left.courtId, right.courtId));
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
// This is the PRINTED grid's arithmetic. The board stopped using it on
// 2026-09-10 and positions its blocks from getEntryDayPlacement's minutes
// instead; a sheet of paper has no way to draw a block at an arbitrary offset
// and keep the row it is in legible, so print keeps whole rows.
//
// Arithmetic in minutes rather than a lookup in the row list, so an entry's drawn
// position and a cell's occupied state are derived from the same expression and
// cannot disagree. Occupancy used to be walked in rows and was therefore only
// correct against the row set of the moment.
//
// `snapped` is true when the entry does not begin and end on a boundary. It is
// then drawn over the rows that contain it — its stored times are never changed.
// Nothing reads the flag since the board retired its approximate treatment; it is
// left on the return because print is the caller that would want it if the
// printed grid ever marks the same thing. `inDay` is false when the entry falls
// outside the configured hours altogether; widening the day to reach it is what
// the 2026-08-13 change removed, so it is listed off the grid instead.
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

// Where an entry sits on that axis in minutes rather than in rows, which is what
// the board draws from. The two offsets are getEntryRowPlacement's own, taken
// before it rounds them: the row form is what print still wants, the minute form
// is what a block positioned at its real start and length wants.
//
// axisMinutes is the drawn length of the day, not dayEndTime - dayStartTime.
// buildGridRowTimes rounds the row count up, so a day whose hours are not a whole
// number of slots is drawn slightly longer than it is configured — and an entry
// in that last part of the final row is on the grid. inDay agrees with
// getEntryRowPlacement's exactly: ceil(endOffset / slotMinutes) <= rowCount is
// endOffset <= rowCount * slotMinutes.
export function getEntryDayPlacement(entry, { start, slotMinutes, rowCount }) {
	const dayStart = timeToMinutes(start);
	const startOffset = timeToMinutes(entry.startTime) - dayStart;
	const endOffset = timeToMinutes(entry.endTime) - dayStart;
	const axisMinutes = rowCount * slotMinutes;

	return {
		startOffset,
		endOffset,
		axisMinutes,
		inDay: startOffset >= 0 && endOffset > startOffset && endOffset <= axisMinutes,
	};
}

// What a drag on the board snaps to. Five minutes, on every grid.
//
// It was briefly a fraction of a grid row — a quarter, floored to five — which
// tied the lengths an organiser could draw back to the grid, the exact coupling
// the rest of this work removed. On a 60-minute grid it made a 25-minute match
// undrawable: the increment was 15 and the lengths on offer were 15, 30, 45, 60.
// A flat five is finer than the grid ever was, is the same number everywhere so
// there is nothing to learn, and at the board's row height is a 7px step on an
// hourly grid — small, but a step, not a slide.
//
// Below five a gesture is asking for precision a mouse does not have, and the
// entry editor's own time inputs remain the honest way to say "12:37".
export const SNAP_MINUTES = 5;

export function snapToIncrement(minutes, increment) {
	const step = Math.max(1, Math.round(increment));

	return Math.round(minutes / step) * step;
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
			enabled: day.enabled !== false,
		})),
		courts: schedule.courts.map((court) => ({
			id: court.id,
			name: court.name,
			divisions: Array.isArray(court.divisions) ? court.divisions : [],
		})),
		entries: sortScheduleEntries(schedule.entries, schedule).map((entry) => ({
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
		print: serialisePrintLayouts(schedule.print),
	};
}

// A schedule spans the tournament, not a division. Divisions share the same
// physical courts, so scheduling them independently could double-book one; one
// combined entry list makes that impossible to express, because every conflict
// check runs against all of it.
//
// divisionName is set only when there is more than one division — with one, the
// label is on every row and says nothing. Shared by ScheduleMakerModal (the
// editable board) and ScheduleTab/the export document (read-only), so both
// build the same fixture shape from the same divisions data.
export function buildTournamentSchedule(tournament, divisions = []) {
	const schedule = getScheduleForTournament(tournament || {});
	const fixtures = normaliseFixtures(flattenFixtures(divisions));

	if (divisions.length < 2) {
		return { schedule, fixtures };
	}

	return {
		schedule,
		fixtures: fixtures.map((fixture) => ({
			...fixture,
			divisionName: fixture.division_name,
			searchText: `${fixture.searchText} ${String(fixture.division_name || '').toLowerCase()}`,
		})),
	};
}

// The four presentational helpers below are shared by the schedule maker's own
// live grid/list view and by ScheduleExportView.jsx's printed/exported pages —
// both read the same entry shape, so one definition rather than two that could
// drift.

export function getEntryLabel(entry, fixturesById) {
	if (entry.type === 'break') return entry.title;

	const fixture = fixturesById[entry.fixtureId];
	if (!fixture) return 'Fixture unavailable';

	return `${fixture.team1} vs ${fixture.team2}`;
}

export function getEntrySecondary(entry, fixturesById) {
	if (entry.type === 'break') {
		return entry.courtId ? 'Court-specific break' : 'Venue-wide break';
	}

	const fixture = fixturesById[entry.fixtureId];
	if (!fixture) return 'Fixture not found';

	const context = `${fixture.round} - Match ${fixture.matchNo}`;
	return fixture.divisionName ? `${fixture.divisionName} - ${context}` : context;
}

export function getEntryOfficials(entry) {
	if (entry.type === 'break') return '';

	return entry.officials ? 'Officials: ' + entry.officials : '';
}

// Same colour a fixture's division carries everywhere else in the app (the
// Overview cards, the division selector, Fixtures & Schedule's own rows).
// `divisions` — the tournament's full division list — has to be passed through
// from the caller for that to hold: getDivisionAccent assigns colours by each
// division's position among its siblings, not from the id alone, so two
// callers that disagree about the sibling list can disagree about the colour
// even for the same division. (This module previously called
// divisionColorStyle with the id alone, which is what let the schedule board,
// list view and printed/exported pages drift to a different colour than the
// rest of the app the moment a fixture was placed on the schedule.)
//
// Gated on divisionName the same way the text label already is: with a single
// division there is nothing to tell apart, so buildTournamentSchedule leaves
// divisionName unset and this withholds the colour too rather than tinting
// every entry identically.
export function getEntryDivisionStyle(entry, fixturesById, divisions = []) {
	if (entry.type === 'break') return undefined;

	const fixture = fixturesById[entry.fixtureId];
	if (!fixture || fixture.divisionName == null) return undefined;

	return divisionColorStyle(fixture.division_id, divisions);
}
