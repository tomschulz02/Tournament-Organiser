// Where the tournament's schedule stands at a given moment: the slot being
// played, the next one, and earlier slots still waiting for results. Used by
// the Overview, the Fixtures & Schedule "Now" line and Standings.
//
// "Now" is always passed in as { date: 'YYYY-MM-DD', time: 'HH:MM' } and never
// read here, so every answer can be tested for any moment. scheduleClock turns
// the device's Date into that shape. The schedule has no timezone of its own:
// its times are the venue's wall clock, and the device clock is assumed to be
// on the same one.
//
// Only today counts. With no schedule, no fixture entries, or no tournament
// day falling on now's date, every helper returns an empty result rather than
// guessing.
//
// A separate module rather than part of fixtureUtils.js because scheduleUtils.js
// already imports fixtureUtils.js; importing back would make a cycle.

import { compareByCourtOrder, compareTimes, formatDateIso } from '../../utils/scheduleUtils';

const RESOLVED = new Set(['COMPLETED', 'CANCELLED']);

export function scheduleClock(date) {
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');

	return { date: formatDateIso(date), time: `${hours}:${minutes}` };
}

// Today's fixture entries grouped into slots by start time, earliest first.
// A slot ends when the last of its matches does: courts can run different
// match lengths from the same start. Breaks are not slots. Entries whose
// fixture is not in `fixtures` (a fixture deleted since it was scheduled) are
// left out.
//
// An entry's `day` is the date itself (YYYY-MM-DD, docs/schedule.md), so it is
// compared with now's date; the tournament's days only confirm that now falls
// on one of them.
export function todaysSlots(schedule, fixtures, now) {
	const day = (schedule?.days ?? []).find((candidate) => candidate.date === now?.date);
	if (!day) return [];

	const fixturesById = new Map((fixtures ?? []).map((fixture) => [fixture.id, fixture]));
	const compareCourts = compareByCourtOrder(schedule);
	const slots = new Map();

	(schedule.entries ?? [])
		.filter((entry) => entry.type === 'fixture' && entry.day === day.date && fixturesById.has(entry.fixtureId))
		.sort((left, right) => compareTimes(left.startTime, right.startTime) || compareCourts(left.courtId, right.courtId))
		.forEach((entry) => {
			const slot = slots.get(entry.startTime) ?? { startTime: entry.startTime, endTime: entry.endTime, matches: [] };
			if (compareTimes(entry.endTime, slot.endTime) > 0) slot.endTime = entry.endTime;
			slot.matches.push({ entry, fixture: fixturesById.get(entry.fixtureId) });
			slots.set(entry.startTime, slot);
		});

	return [...slots.values()];
}

// The slot whose time span contains now, or null between slots and outside
// the day's play.
export function currentSlot(schedule, fixtures, now) {
	return (
		todaysSlots(schedule, fixtures, now).find(
			(slot) => compareTimes(slot.startTime, now.time) <= 0 && compareTimes(now.time, slot.endTime) < 0,
		) ?? null
	);
}

// The first slot that has not started yet, or null once the last has.
export function nextSlot(schedule, fixtures, now) {
	return todaysSlots(schedule, fixtures, now).find((slot) => compareTimes(slot.startTime, now.time) > 0) ?? null;
}

// Slots that have finished with a match still neither completed nor cancelled,
// earliest first, each with `missing` listing those fixtures. A slot still
// being played is not here: its matches are live, not late.
export function slotsMissingResults(schedule, fixtures, now) {
	return todaysSlots(schedule, fixtures, now)
		.filter((slot) => compareTimes(slot.endTime, now.time) <= 0)
		.map((slot) => ({
			...slot,
			missing: slot.matches.map(({ fixture }) => fixture).filter((fixture) => !RESOLVED.has(fixture.status)),
		}))
		.filter((slot) => slot.missing.length > 0);
}

// The matches on court at now: everything in the current slot (a court that
// finished early still shows its result), plus any match from an earlier slot
// today that is still LIVE because it overran. In court order, each as
// { entry, fixture }.
//
// With no slots today there is nothing to place on a court, so it falls back
// to the LIVE fixtures by match number with a null entry: a tournament run
// without a schedule still shows what is being played.
export function onCourtNow(schedule, fixtures, now) {
	const slots = todaysSlots(schedule, fixtures, now);

	if (slots.length === 0) {
		return (fixtures ?? [])
			.filter((fixture) => fixture.status === 'LIVE')
			.sort((left, right) => (left.match_no || 0) - (right.match_no || 0))
			.map((fixture) => ({ entry: null, fixture }));
	}

	const current = slots.find(
		(slot) => compareTimes(slot.startTime, now.time) <= 0 && compareTimes(now.time, slot.endTime) < 0,
	);
	const overrun = slots
		.filter((slot) => slot !== current && compareTimes(slot.startTime, now.time) <= 0)
		.flatMap((slot) => slot.matches)
		.filter(({ fixture }) => fixture.status === 'LIVE');
	const compareCourts = compareByCourtOrder(schedule);

	// Overrunning matches first, so on a shared court the match still being
	// played sits above the one waiting for it. The sort is stable.
	return [...overrun, ...(current?.matches ?? [])].sort((left, right) =>
		compareCourts(left.entry.courtId, right.entry.courtId),
	);
}

// The day at a glance: one row per slot today, one cell per court in the
// schedule's court order. A cell is 'done' (completed or cancelled), 'live',
// 'missing' (its slot has finished without a result), 'upcoming' (scheduled,
// not yet played) or 'free' (nothing on that court in that slot).
export function dayTimeline(schedule, fixtures, now) {
	const courts = schedule?.courts ?? [];

	return todaysSlots(schedule, fixtures, now).map((slot) => {
		const finished = compareTimes(slot.endTime, now.time) <= 0;

		return {
			startTime: slot.startTime,
			cells: courts.map((court) => {
				const match = slot.matches.find(({ entry }) => entry.courtId === court.id);
				if (!match) return { courtId: court.id, state: 'free', fixture: null };

				const { status } = match.fixture;
				const state = RESOLVED.has(status)
					? 'done'
					: status === 'LIVE'
						? 'live'
						: finished
							? 'missing'
							: 'upcoming';

				return { courtId: court.id, state, fixture: match.fixture };
			}),
		};
	});
}

// Fixtures & Schedule's time groups for one day, with every run of finished
// slots folded into one segment. A group is { startTime, entries }, each entry a
// schedule entry with `type`, `endTime` and, for a fixture, its `fixture`.
//
// A slot is finished when every match in it is completed or cancelled: a fact
// about the results, not the clock, so a day already played folds whenever it is
// read. A slot holding only a break folds with its neighbours when both of them
// are finished, so lunch does not split a played morning in two.
//
// Returns segments in order: { type: 'group', group } or { type: 'fold', key,
// startTime, endTime, played, groups }, where `played` counts the matches.
export function foldFinishedGroups(groups) {
	const fixturesOf = (group) => group.entries.filter((entry) => entry.type !== 'break' && entry.fixture);
	const states = groups.map((group) => {
		const matches = fixturesOf(group);
		if (matches.length === 0) return 'break';
		return matches.every((entry) => RESOLVED.has(entry.fixture.status)) ? 'done' : 'open';
	});

	const neighbour = (index, step) => {
		for (let at = index + step; at >= 0 && at < states.length; at += step) {
			if (states[at] !== 'break') return states[at];
		}
		return null;
	};
	const finished = states.map((state, index) =>
		state === 'break' ? neighbour(index, -1) === 'done' && neighbour(index, 1) === 'done' : state === 'done',
	);

	const segments = [];
	groups.forEach((group, index) => {
		const last = segments[segments.length - 1];

		if (!finished[index]) {
			segments.push({ type: 'group', group });
			return;
		}

		if (last?.type === 'fold') {
			last.groups.push(group);
		} else {
			segments.push({ type: 'fold', key: group.startTime, startTime: group.startTime, groups: [group] });
		}
	});

	return segments.map((segment) => {
		if (segment.type !== 'fold') return segment;

		const entries = segment.groups.flatMap((group) => group.entries);
		const endTime = entries.reduce(
			(latest, entry) => (compareTimes(entry.endTime, latest) > 0 ? entry.endTime : latest),
			segment.startTime,
		);

		return { ...segment, endTime, played: entries.filter((entry) => entry.type !== 'break' && entry.fixture).length };
	});
}
