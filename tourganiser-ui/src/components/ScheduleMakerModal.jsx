import React, { startTransition, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import { useMessage } from '../MessageContext';
import { useConfirm } from './ConfirmDialog';
import { useHelpTopic } from '../HelpContext';
import '../styles/schedule-maker.css';
import { generateAutomaticSchedule } from '../utils/scheduleGenerator';
import {
	addMinutesToTime,
	buildFixtureIndex,
	buildGridRowTimes,
	buildTournamentSchedule,
	calculateScheduledStats,
	createBreakEntry,
	createFixtureEntry,
	formatDateLabel,
	getCourtName,
	getDayBounds,
	getDayEntries,
	getEntryDayPlacement,
	getEntryDivisionStyle,
	getEntryLabel,
	getEntryOfficials,
	getEntrySecondary,
	getSlotMinutes,
	getUnscheduledFixtures,
	isTimeRangeValid,
	minutesToTime,
	pruneStalePrintLayout,
	removeScheduleEntry,
	serialiseScheduleForSave,
	SNAP_MINUTES,
	snapToIncrement,
	sortScheduleEntries,
	timeToMinutes,
	upsertScheduleEntry,
	validateScheduleEntry,
} from '../utils/scheduleUtils';
import { divisionColorStyle } from '../utils/divisionColors';
import SchedulePrintLayoutEditor from './SchedulePrintLayoutEditor';
import '../styles/schedule-print.css';

function scheduleReducer(state, action) {
	switch (action.type) {
		case 'reset':
			return action.payload;
		case 'replace':
			return action.payload;
		case 'updateSettings':
			return {
				...state,
				settings: {
					...state.settings,
					...action.payload,
				},
			};
		case 'setCourts':
			return {
				...state,
				courts: action.payload,
			};
		case 'setDays':
			return {
				...state,
				days: action.payload,
			};
		// Staged like every other in-progress change here: schedule.print is a
		// field of the same local schedule the dirty/discard/commit logic
		// already tracks, so a page-break edit rides along with the organiser's
		// normal save rather than needing a write of its own.
		case 'setPrintLayouts':
			return {
				...state,
				print: action.payload,
			};
		case 'upsertEntry':
			return upsertScheduleEntry(state, action.payload);
		case 'removeEntry':
			return removeScheduleEntry(state, action.payload);
		default:
			return state;
	}
}

function getDefaultViewMode() {
	if (typeof window === 'undefined') return 'grid';
	return window.innerWidth <= 768 ? 'list' : 'grid';
}

function getFixtureDivisionStyle(fixture, divisions = []) {
	if (!fixture || fixture.divisionName == null) return undefined;

	return divisionColorStyle(fixture.division_id, divisions);
}

function getSlotKey(day, courtId, startTime) {
	return `${day}_${courtId}_${startTime}`;
}

// The division names a court is restricted to, comma-joined, or '' when the court
// takes any division. An id with no matching division reads as "Unknown" rather
// than vanishing, so a stale restriction is visible rather than silent.
function courtDivisionLabel(court, divisions = []) {
	const ids = Array.isArray(court.divisions) ? court.divisions : [];
	if (ids.length === 0) return '';

	return ids.map((id) => divisions.find((division) => division.id === id)?.name || 'Unknown').join(', ');
}

// Two things can be dropped on a cell and they mean different things: a fixture
// from the sidebar creates an entry, an entry already on the grid moves one. The
// payload is prefixed so the drop handler can tell them apart — a bare id could
// be either.
const FIXTURE_DRAG = 'fixture:';
const ENTRY_DRAG = 'entry:';

function readDragPayload(event) {
	const payload = event.dataTransfer.getData('text/plain') || '';

	if (payload.startsWith(ENTRY_DRAG)) {
		return { kind: 'entry', id: payload.slice(ENTRY_DRAG.length) };
	}

	if (payload.startsWith(FIXTURE_DRAG)) {
		return { kind: 'fixture', id: payload.slice(FIXTURE_DRAG.length) };
	}

	return { kind: 'none', id: '' };
}

// Everything inside the modal that can take focus. Used to keep Tab inside it,
// which aria-modal="true" claims and only a focus trap delivers.
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The next `court-N` id that no current court already uses. The count of courts
// is not usable here: removing a middle court and adding one would reproduce an
// id still in use and orphan its entries. The highest trailing number in use
// plus one is stable against removals from anywhere in the list.
function nextCourtId(courts) {
	const highest = courts.reduce((max, court) => {
		const match = /(\d+)$/.exec(court.id || '');
		return match ? Math.max(max, Number(match[1])) : max;
	}, 0);

	return `court-${highest + 1}`;
}

function createSlotDraft(day, courtId, startTime, slotMinutes) {
	return {
		day,
		courtId,
		startTime,
		endTime: addMinutesToTime(startTime, slotMinutes),
	};
}

export default function ScheduleMakerModal({
	isOpen,
	tournament,
	divisions,
	tournamentName,
	canEdit,
	onClose,
	onSave,
}) {
	useHelpTopic('schedule-maker-modal');

	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const { schedule: initialSchedule, fixtures } = useMemo(
		() => buildTournamentSchedule(tournament, divisions),
		[tournament, divisions]
	);
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [viewMode, setViewMode] = useState(getDefaultViewMode);
	const [activeDay, setActiveDay] = useState(() => initialSchedule.days[0]?.date || '');
	const [panelMode, setPanelMode] = useState('overview');
	// Which of the three panels is showing below 900px, where they no longer fit
	// side by side and stacking them left the board a 280px window reached by
	// scrolling past the other two. Above 900px this is inert — the stylesheet
	// ignores it and all three panels show. The board is the default because it
	// is what the organiser came for; the other two are things they reach for.
	const [mobilePanel, setMobilePanel] = useState('board');
	const [selectedEntryId, setSelectedEntryId] = useState(null);
	// The fixture chosen from the unscheduled list, waiting for a slot to be
	// tapped. Dragging covers this on desktop and cannot work below 900px, where
	// the list and the board are never on screen together.
	const [pendingFixtureId, setPendingFixtureId] = useState(null);
	// Open state of the toolbar's overflow menu. Only its open/closed state is
	// React's — whether the menu exists as a control at all is a media query,
	// because a width measured in JavaScript cannot be trusted here.
	const [menuOpen, setMenuOpen] = useState(false);
	const [fixtureSearch, setFixtureSearch] = useState('');
	const [roundFilter, setRoundFilter] = useState('all');
	const [divisionFilter, setDivisionFilter] = useState('all');
	const [slotDraft, setSlotDraft] = useState(null);
	// Which placed entry is mid-drag, so the cells it currently occupies stay
	// droppable. Without it a nudge from 09:00 to 09:30 is refused by the entry's
	// own occupancy.
	const [draggingEntryId, setDraggingEntryId] = useState(null);
	const [breakDraft, setBreakDraft] = useState(null);
	const [courtDraft, setCourtDraft] = useState('');
	// The court whose division restriction is being edited in the inspector. Set
	// when a court header is clicked; a panelMode of 'court' shows the picker.
	const [courtConfigId, setCourtConfigId] = useState(null);
	// A working copy of the day settings while the settings panel is open. Applied
	// to schedule.settings on save; null when the panel is closed.
	const [settingsDraft, setSettingsDraft] = useState(null);
	// The schedule entries the last failed save named as the ones breaking a rule,
	// highlighted on the grid and scrolled into view. Cleared on the next save or
	// after a short delay.
	const [highlightEntryIds, setHighlightEntryIds] = useState([]);
	const [generatorDraft, setGeneratorDraft] = useState(() => ({
		courtCount: Math.max(1, initialSchedule.courts.length || 2),
		dailyStartTime: initialSchedule.settings.dayStartTime,
		dailyEndTime: initialSchedule.settings.dayEndTime,
		fixtureDurationMinutes: initialSchedule.settings.slotMinutes,
		// The gap a team is guaranteed between two matches on one day, in minutes.
		// Its own value rather than a multiple of the match length: matching the
		// duration is only the default, not the definition. See docs/schedule.md.
		restMinutes: initialSchedule.settings.slotMinutes,
		// Off by default: generation preserves whatever officials were typed and
		// assigns nothing. On, it assigns one team per match after placement.
		assignOfficials: false,
	}));
	const [entryForm, setEntryForm] = useState(null);
	const initialScheduleRef = useRef(null);
	const modalRef = useRef(null);
	const dayTabsRef = useRef(null);
	const overflowRef = useRef(null);
	const [schedule, dispatch] = useReducer(scheduleReducer, initialSchedule);
	const deferredSearch = useDeferredValue(fixtureSearch);

	useEffect(() => {
		if (!isOpen) return;

		document.body.classList.add('noscroll');
		return () => document.body.classList.remove('noscroll');
	}, [isOpen]);

	// Focus moves into the modal on open and back to whatever opened it on close.
	// Without this, Tab from an unfocused dialog walks the page behind it, which
	// aria-modal="true" says it will not.
	useEffect(() => {
		if (!isOpen) return;

		const previouslyFocused = document.activeElement;
		modalRef.current?.focus();

		return () => {
			if (previouslyFocused instanceof HTMLElement) {
				previouslyFocused.focus();
			}
		};
	}, [isOpen]);

	useEffect(() => {
		initialScheduleRef.current = initialSchedule;
	}, [initialSchedule]);

	// Scroll the first offending entry into view after a rejected save, then clear
	// the highlight after a few seconds so it does not linger over an edit. Runs
	// after the day switch that highlightOffendingEntries requests, so the entry is
	// on screen to be found.
	useEffect(() => {
		if (highlightEntryIds.length === 0) return;

		const node = modalRef.current?.querySelector(`[data-entry-id="${highlightEntryIds[0]}"]`);
		node?.scrollIntoView({ behavior: 'smooth', block: 'center' });

		const timer = setTimeout(() => setHighlightEntryIds([]), 6000);
		return () => clearTimeout(timer);
	}, [highlightEntryIds, activeDay]);

	// Outside click closes the overflow menu. Escape and selection are handled
	// where they happen; this is the third way, and the only one that needs a
	// listener outside the menu itself.
	useEffect(() => {
		if (!menuOpen) return;

		const onPointerDown = (event) => {
			if (!overflowRef.current?.contains(event.target)) setMenuOpen(false);
		};

		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	}, [menuOpen]);

	// The day strip is one line that scrolls, so the active day can be off-screen
	// after switching or on open with a long tournament. Instant scrollLeft, not
	// scrollIntoView or behavior: 'smooth' — the same approach TournamentShell
	// takes with its tab row, for the same reason.
	useEffect(() => {
		const list = dayTabsRef.current;
		if (!list) return;

		const active = list.querySelector(`[data-day="${CSS.escape(activeDay)}"]`);
		if (!active) return;

		const itemLeft = active.offsetLeft;
		const itemRight = itemLeft + active.offsetWidth;
		const viewLeft = list.scrollLeft;
		const viewRight = viewLeft + list.clientWidth;
		const margin = 12;

		if (itemLeft < viewLeft) {
			list.scrollLeft = Math.max(itemLeft - margin, 0);
		} else if (itemRight > viewRight) {
			list.scrollLeft = itemRight - list.clientWidth + margin;
		}
	}, [activeDay, mobilePanel]);

	const fixturesById = useMemo(() => buildFixtureIndex(fixtures), [fixtures]);
	const selectedEntry = useMemo(
		() => schedule.entries.find((entry) => entry.id === selectedEntryId) || null,
		[schedule.entries, selectedEntryId]
	);
	const roundOptions = useMemo(() => {
		return ['all', ...new Set(fixtures.map((fixture) => fixture.round).filter(Boolean))];
	}, [fixtures]);
	const unscheduledFixtures = useMemo(() => getUnscheduledFixtures(schedule, fixtures), [schedule, fixtures]);
	const filteredUnscheduledFixtures = useMemo(() => {
		const search = deferredSearch.trim().toLowerCase();

		return unscheduledFixtures.filter((fixture) => {
			const matchesDivision = divisionFilter === 'all' || String(fixture.division_id) === divisionFilter;
			const matchesRound = roundFilter === 'all' || fixture.round === roundFilter;
			const matchesSearch = !search || fixture.searchText.includes(search);
			return matchesDivision && matchesRound && matchesSearch;
		});
	}, [deferredSearch, divisionFilter, roundFilter, unscheduledFixtures]);
	const stats = useMemo(() => calculateScheduledStats(schedule, fixtures), [schedule, fixtures]);

	if (!isOpen) return null;

	const divisionList = divisions || [];
	const courtConfig = courtConfigId ? schedule.courts.find((court) => court.id === courtConfigId) || null : null;

	const markDirty = () => {
		if (!dirty) setDirty(true);
	};

	const replaceSchedule = (nextSchedule) => {
		dispatch({
			type: 'replace',
			payload: {
				...nextSchedule,
				entries: sortScheduleEntries(nextSchedule.entries, nextSchedule),
			},
		});
		markDirty();
	};

	const handleClose = async () => {
		if (dirty) {
			const confirmed = await confirm('You have unsaved schedule changes. Close without saving?');
			if (!confirmed) return;
		}

		onClose();
	};

	// Escape closes; Tab cycles within the modal. Handled here rather than on
	// window, because focus is already trapped inside and a document-level
	// listener would also fire for anything else that happens to be open.
	const handleKeyDown = (event) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			// The menu is the innermost thing open, so it closes first. Without
			// this, Escape from an open menu closes the whole modal.
			if (menuOpen) {
				setMenuOpen(false);
				return;
			}
			handleClose();
			return;
		}

		if (event.key !== 'Tab' || !modalRef.current) return;

		// offsetParent is null for anything display:none, which is how the hidden
		// export roots stay out of the cycle.
		const items = [...modalRef.current.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
		if (items.length === 0) return;

		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && (active === first || active === modalRef.current)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const payload = serialiseScheduleForSave(schedule);
			const result = await onSave(payload);

			if (result?.success === false) {
				// onSave has already shown the message. A structural rejection names
				// the offending entry (or pair) in its details; point the organiser
				// at it rather than leaving them to find which of many broke the rule.
				highlightOffendingEntries(result.data);
				return;
			}

			setHighlightEntryIds([]);
			initialScheduleRef.current = schedule;
			setDirty(false);
			showMessage('Schedule saved successfully.', 'success');
		} catch {
			showMessage('Failed to save the schedule. Please try again later.', 'error');
		} finally {
			setSaving(false);
		}
	};

	// The server's schedule errors carry the offending entry in `details`, as
	// `entryId` for a single-entry rule (officials, round order, court division) or
	// `entryIds` for a clash between two. Switch to the day the first one is on,
	// show the grid, and mark them; a useEffect scrolls the first into view.
	const highlightOffendingEntries = (data) => {
		const ids = [data?.entryId, ...(Array.isArray(data?.entryIds) ? data.entryIds : [])].filter(Boolean);
		if (ids.length === 0) return;

		const first = schedule.entries.find((entry) => ids.includes(entry.id));
		if (first) {
			setActiveDay(first.day);
			setViewMode('grid');
		}
		setHighlightEntryIds(ids);
	};

	const handleDiscard = async () => {
		const confirmed = await confirm('Discard all unsaved schedule changes?');
		if (!confirmed) return;

		dispatch({ type: 'reset', payload: initialScheduleRef.current || initialSchedule });
		setDirty(false);
		setSelectedEntryId(null);
		setPanelMode('overview');
	};

	// Reset and Discard are different actions and the labels have to carry that.
	// Discard reverts unsaved changes back to the last saved schedule. Reset
	// empties the schedule outright, including entries saved previously, which
	// otherwise can only be removed one at a time.
	//
	// It marks dirty rather than saving, so Discard undoes it right up until
	// Save. That is the safety net that makes it reasonable to offer at all.
	const handleReset = async () => {
		const fixtureCount = schedule.entries.filter((entry) => entry.type === 'fixture').length;
		const breakCount = schedule.entries.filter((entry) => entry.type === 'break').length;
		if (fixtureCount + breakCount === 0) return;

		const parts = [
			fixtureCount > 0 ? `${fixtureCount} placed fixture${fixtureCount === 1 ? '' : 's'}` : null,
			breakCount > 0 ? `${breakCount} break${breakCount === 1 ? '' : 's'}` : null,
		].filter(Boolean);

		// The count, not an abstract question — "are you sure?" tells nobody what
		// they are about to lose.
		const confirmed = await confirm(
			`Remove ${parts.join(' and ')} from the whole schedule? Nothing is saved until you save, so Discard will bring it back.`
		);
		if (!confirmed) return;

		dispatch({ type: 'replace', payload: { ...schedule, entries: [] } });
		setSelectedEntryId(null);
		setSlotDraft(null);
		setPendingFixtureId(null);
		setPanelMode('overview');
		setMobilePanel('board');
		markDirty();
		showMessage('Schedule cleared. Discard to bring it back.', 'success');
	};

	const handleAddCourt = () => {
		const nextName = courtDraft.trim();
		if (!nextName) {
			showMessage('Enter a court or field name first.', 'error');
			return;
		}

		dispatch({
			type: 'setCourts',
			payload: [
				...schedule.courts,
				{
					// Derived from the ids already in use, not the list length:
					// removing a middle court and then adding one would otherwise
					// reuse an id still on another court and orphan its entries.
					id: nextCourtId(schedule.courts),
					name: nextName,
					divisions: [],
				},
			],
		});
		setCourtDraft('');
		markDirty();
		showMessage(`${nextName} added to the tournament schedule.`, 'success');
	};

	// Removing a court never regenerates the list: buildCourtList reuses by index,
	// so rebuilding after a removal would rename every court after the gap and
	// orphan every entry beyond it. The court's own entries are dropped rather than
	// left orphaned — the fixtures among them return to the unscheduled list, and a
	// break pinned to the court goes with it. An all-courts break (courtId null)
	// stays.
	const handleRemoveCourt = async (courtId) => {
		const court = schedule.courts.find((item) => item.id === courtId);
		if (!court) return;

		const placedFixtures = schedule.entries.filter(
			(entry) => entry.courtId === courtId && entry.type === 'fixture'
		).length;

		if (placedFixtures > 0) {
			// Name what happens rather than warn that something is wrong: the
			// fixtures are not lost, they go back to the unscheduled list.
			const confirmed = await confirm(
				`Remove ${court.name}? Its ${placedFixtures} scheduled ${placedFixtures === 1 ? 'fixture' : 'fixtures'} will be returned to the unscheduled list.`
			);
			if (!confirmed) return;
		}

		dispatch({
			type: 'replace',
			payload: {
				...schedule,
				courts: schedule.courts.filter((item) => item.id !== courtId),
				entries: schedule.entries.filter((entry) => entry.courtId !== courtId),
			},
		});
		markDirty();
		showMessage(`${court.name} removed from the tournament schedule.`, 'success');
	};

	const handleAssignFixtureToSlot = (fixture, draft) => {
		if (!fixture || !draft) return;

		if (schedule.courts.length === 0) {
			showMessage('Add at least one court or field before scheduling fixtures.', 'error');
			return;
		}

		const candidate = createFixtureEntry({
			day: draft.day,
			courtId: draft.courtId,
			startTime: draft.startTime,
			endTime: draft.endTime,
			fixtureId: fixture.id,
		});

		const validationError = validateScheduleEntry(schedule, candidate);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		setPanelMode('overview');
		setSlotDraft(null);
		// Placed, so it is no longer pending. A rejected placement returns above
		// this line and leaves it pending, so another slot can be tried.
		setPendingFixtureId(null);
		// Back to the board so the organiser sees where it landed.
		setMobilePanel('board');
		markDirty();
		showMessage(`${fixture.team1} vs ${fixture.team2} scheduled.`, 'success');
	};

	// A move keeps the entry's duration and changes only where it sits. It is
	// validated the same way a new placement is — validateScheduleEntry takes an
	// ignoreEntryId, which exists for exactly this: the entry must not be found to
	// conflict with itself.
	const handleMoveEntry = (entryId, day, courtId, startTime) => {
		const entry = schedule.entries.find((item) => item.id === entryId);
		if (!entry) return;

		const durationMinutes = timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
		const candidate = {
			...entry,
			day,
			courtId,
			startTime,
			endTime: addMinutesToTime(startTime, durationMinutes),
		};

		const validationError = validateScheduleEntry(schedule, candidate, entry.id);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		setMobilePanel('board');
		markDirty();
		showMessage(`Moved to ${candidate.startTime} on ${getCourtName(schedule, candidate.courtId)}.`, 'success');
	};

	// Dragging an entry's own edge changes one of its times and nothing else. The
	// validation is the same call every other edit makes — this is a new gesture
	// over an existing path, not a new rule. A drag that lands back where it
	// started is not an edit and is dropped before it can mark the schedule dirty.
	const handleResizeEntry = (entryId, startTime, endTime) => {
		const entry = schedule.entries.find((item) => item.id === entryId);
		if (!entry) return;
		if (entry.startTime === startTime && entry.endTime === endTime) return;

		const candidate = { ...entry, startTime, endTime };

		const validationError = validateScheduleEntry(schedule, candidate, entry.id);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		// The inspector may be open on this very entry. Its form is a copy, so
		// without this the next Save Changes would write the old times back over
		// the resize.
		setEntryForm((current) => (current && current.id === entryId ? { ...current, startTime, endTime } : current));
		markDirty();
		showMessage(`Now ${startTime} - ${endTime}.`, 'success');
	};

	const handleDropOnSlot = (event, day, courtId, startTime) => {
		event.preventDefault();
		const payload = readDragPayload(event);

		if (payload.kind === 'entry') {
			handleMoveEntry(payload.id, day, courtId, startTime);
			return;
		}

		const fixture = fixturesById[payload.id];
		if (!fixture) return;

		handleAssignFixtureToSlot(
			fixture,
			createSlotDraft(day, courtId, startTime, schedule.settings.slotMinutes)
		);
	};

	// Fixture-first placement: choose a fixture, then choose where it goes.
	// Dragging already covers this direction on desktop and cannot work below
	// 900px, where the list and the board are never on screen at once.
	//
	// Tapping the pending fixture again cancels, which is the cheapest way out
	// and needs no extra control in the list.
	const handleSelectFixtureForPlacement = (fixtureId) => {
		if (pendingFixtureId === fixtureId) {
			setPendingFixtureId(null);
			return;
		}

		setPendingFixtureId(fixtureId);
		setMobilePanel('board');
	};

	// A tapped cell says only where, so the draft is one grid row long — that is
	// all a tap can mean. A drag on the board says how long as well and passes its
	// own end. Both arrive at the same picker and the same assignment path.
	const handleOpenSlotPicker = (day, courtId, startTime, endTime = '') => {
		const draft = endTime
			? { day, courtId, startTime, endTime }
			: createSlotDraft(day, courtId, startTime, schedule.settings.slotMinutes);

		// A fixture is waiting for somewhere to go, so this tap is the answer to
		// that rather than a request to open the picker. Same function the
		// slot-first path calls — a second entry point, not a second
		// implementation.
		if (pendingFixtureId) {
			const fixture = fixturesById[pendingFixtureId];
			if (fixture) {
				handleAssignFixtureToSlot(fixture, draft);
				return;
			}
			setPendingFixtureId(null);
		}

		setSelectedEntryId(null);
		setSlotDraft(draft);
		setPanelMode('slot');
		// The slot form lives in the inspector. Without this the organiser taps an
		// empty cell on a phone and nothing appears to happen.
		setMobilePanel('inspector');
	};

	// Clicking a court header opens its division picker in the inspector — the same
	// shape as opening a slot draft, reusing the inspector rather than adding a
	// second kind of popup.
	const handleOpenCourtConfig = (courtId) => {
		setSelectedEntryId(null);
		setSlotDraft(null);
		setPendingFixtureId(null);
		setCourtConfigId(courtId);
		setPanelMode('court');
		// The picker lives in the inspector. Without this the organiser taps a
		// court header on a phone and nothing appears to happen.
		setMobilePanel('inspector');
	};

	// Toggled per division rather than saved as a batch: the picker writes straight
	// to schedule.courts and the change is visible on the header. Dirty until the
	// schedule itself is saved, so Discard still brings the old restriction back.
	const handleSetCourtDivisions = (courtId, divisions) => {
		dispatch({
			type: 'setCourts',
			payload: schedule.courts.map((court) => (court.id === courtId ? { ...court, divisions } : court)),
		});
		markDirty();
	};

	// A disabled day stays in schedule.days rather than being removed — see
	// docs/schedule.md — so this is a toggle, not a delete/recreate.
	const handleToggleDayEnabled = (dayId) => {
		dispatch({
			type: 'setDays',
			payload: schedule.days.map((day) => (day.id === dayId ? { ...day, enabled: day.enabled === false } : day)),
		});
		markDirty();
	};

	// Day settings can be edited on their own, and are no longer a side effect of
	// automatic generation — the generator stopped writing slotMinutes on
	// 2026-09-10, so a grid chosen here survives a regeneration. The panel writes
	// to schedule.settings, which is the grid's axis alone; changing the slot
	// length re-rules the board and moves nothing, because an entry is drawn from
	// its own times rather than from the rows.
	const handleOpenSettings = () => {
		setSettingsDraft({
			dayStartTime: schedule.settings.dayStartTime,
			dayEndTime: schedule.settings.dayEndTime,
			slotMinutes: schedule.settings.slotMinutes,
		});
		setSelectedEntryId(null);
		setPanelMode('settings');
		setMobilePanel('inspector');
	};

	const handleSaveSettings = () => {
		if (!settingsDraft) return;

		const slotMinutes = Number(settingsDraft.slotMinutes);
		if (!isTimeRangeValid(settingsDraft.dayStartTime, settingsDraft.dayEndTime)) {
			showMessage('The day must end after it starts.', 'error');
			return;
		}
		if (!slotMinutes || slotMinutes < 5) {
			showMessage('A slot must be at least 5 minutes.', 'error');
			return;
		}

		dispatch({
			type: 'updateSettings',
			payload: {
				dayStartTime: settingsDraft.dayStartTime,
				dayEndTime: settingsDraft.dayEndTime,
				slotMinutes,
			},
		});
		setSettingsDraft(null);
		setPanelMode('overview');
		markDirty();
		showMessage('Day settings updated.', 'success');
	};

	// Closes whatever inspector sub-panel is open and returns to the overview,
	// without deleting or saving anything. The only way back from the entry editor
	// used to be Delete or placing another fixture; the generator and the court
	// picker had no way back at all.
	const handleBackToOverview = () => {
		setSelectedEntryId(null);
		setEntryForm(null);
		setSlotDraft(null);
		setBreakDraft(null);
		setPendingFixtureId(null);
		setCourtConfigId(null);
		setSettingsDraft(null);
		setPanelMode('overview');
	};

	const handleCreateBreak = () => {
		if (!breakDraft) return;

		const candidate = createBreakEntry({
			day: breakDraft.day,
			startTime: breakDraft.startTime,
			endTime: breakDraft.endTime,
			title: breakDraft.title,
			courtId: breakDraft.courtId || null,
			notes: breakDraft.notes,
		});

		const validationError = validateScheduleEntry(schedule, candidate);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		setBreakDraft(null);
		setPanelMode('overview');
		setMobilePanel('board');
		markDirty();
		showMessage('Break added to the schedule.', 'success');
	};

	// Dropping a placed entry back onto the unscheduled list removes it from the
	// schedule — the reverse of dragging a fixture out. A fixture returns to the
	// list it came from; a break simply disappears, since it was never in it. Only
	// entry drags are handled, so dropping a fixture pill back on the list is a
	// no-op.
	const handleUnscheduleDrop = (event) => {
		event.preventDefault();
		const payload = readDragPayload(event);
		if (payload.kind !== 'entry') return;

		const entry = schedule.entries.find((item) => item.id === payload.id);
		if (!entry) return;

		dispatch({ type: 'removeEntry', payload: payload.id });
		setDraggingEntryId(null);
		if (selectedEntryId === payload.id) {
			handleBackToOverview();
		}
		markDirty();

		const label = entry.type === 'break' ? 'Break' : 'Fixture';
		showMessage(`${label} removed from the schedule.`, 'success');
	};

	const handleDeleteEntry = async (entryId) => {
		const confirmed = await confirm('Delete this schedule entry?');
		if (!confirmed) return;

		dispatch({ type: 'removeEntry', payload: entryId });
		setSelectedEntryId(null);
		setPanelMode('overview');
		setMobilePanel('board');
		markDirty();
		showMessage('Schedule entry removed.', 'success');
	};

	const openEntryEditor = (entry) => {
		setSelectedEntryId(entry.id);
		setEntryForm({
			...entry,
			title: entry.title || '',
			officials: entry.officials || '',
			notes: entry.notes || '',
		});
		setPanelMode('entry');
		setMobilePanel('inspector');
	};

	const handleUpdateEntry = () => {
		if (!entryForm) return;

		const candidate = {
			...entryForm,
			courtId: entryForm.type === 'break' ? entryForm.courtId || null : entryForm.courtId,
		};

		const validationError = validateScheduleEntry(schedule, candidate, entryForm.id);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		markDirty();
		showMessage('Schedule entry updated.', 'success');
	};

	const handleGenerateSchedule = () => {
		const result = generateAutomaticSchedule({
			baseSchedule: schedule,
			fixtures,
			// For round order only: a round cannot begin until the round feeding
			// it has finished, and that order lives in each division's
			// state.rounds rather than on a fixture.
			divisions: divisionList,
			startDate: tournament.startDate || tournament.start_date,
			endDate: tournament.endDate || tournament.end_date || tournament.startDate || tournament.start_date,
			courtCount: Number(generatorDraft.courtCount),
			dailyStartTime: generatorDraft.dailyStartTime,
			dailyEndTime: generatorDraft.dailyEndTime,
			fixtureDurationMinutes: Number(generatorDraft.fixtureDurationMinutes),
			// Passed raw, not through Number(): an emptied field is Number('') === 0,
			// and a silent "no rest at all" is not what clearing a box means. The
			// generator falls back to the fixture duration for anything it cannot
			// read, which is the rest this generator has always given.
			restMinutes: generatorDraft.restMinutes,
			assignOfficials: generatorDraft.assignOfficials,
		});

		replaceSchedule(result.schedule);
		setPanelMode('overview');
		setMobilePanel('board');
		setViewMode('grid');

		if (result.warnings.length > 0) {
			// All of them, not the first. The generator returns one warning per
			// constraint that blocked something, and being told about the rest
			// minimum while the round-order failure stays hidden sends the
			// organiser to fix the wrong thing. See docs/schedule.md.
			showMessage(result.warnings.join(' '), 'warning', 9000);
		} else {
			showMessage('Automatic schedule generated. You can edit any slot afterwards.', 'success');
		}
	};

	// The fixtures panel only exists for an editor, so a read-only viewer gets a
	// two-option switcher and can never be left looking at a panel that is not
	// rendered.
	const mobilePanels = [
		...(canEdit ? [{ id: 'fixtures', label: 'Fixtures' }] : []),
		{ id: 'board', label: 'Board' },
		{ id: 'inspector', label: 'Inspector' },
	];
	const activeMobilePanel = mobilePanels.some((panel) => panel.id === mobilePanel) ? mobilePanel : 'board';

	// Opens the chosen layout as a standalone document in a new tab, driven by
	// whatever page breaks are currently staged.
	//
	// This modal keeps the Blob mechanism even though the live print route
	// (/tournaments/view/:id/print) no longer needs it: the modal is a
	// full-screen overlay over the rest of the app, so it is not a clean print
	// surface, and the schedule being printed here may not be saved yet, so
	// there is nothing at that route to print. Popping out is what makes both
	// true at once.
	//
	// Dynamically imported for the same reason ScheduleTab's own call did:
	// react-dom/server is only needed once this is actually clicked, not the
	// moment this already-lazy modal chunk loads.
	const handlePrint = async (type) => {
		try {
			const { openScheduleExportDocument } = await import('../utils/scheduleExportDocument');

			openScheduleExportDocument({
				schedule,
				fixturesById,
				tournamentName,
				tournamentId: tournament?.id,
				divisions: divisionList,
				type,
				layout: schedule.print?.[type] ?? null,
			});
		} catch {
			showMessage('Could not open the print view.', 'error');
		}
	};

	// Says once, on opening the panel, that staged breaks point at a day or court
	// this draft no longer has. It does not rewrite them: a stale break is
	// already inert everywhere it is read — a dead day's key is never looked up,
	// and courtBreakIndices matches no court for a dead id — and rewriting here
	// would mark the draft dirty for something the organiser did not do. The
	// next real edit drops them, because materialisePrintLayout rebuilds the
	// layout from the days that actually exist.
	const openPrintLayoutPanel = () => {
		const dayIds = schedule.days.map((day) => day.id);
		const courtIds = schedule.courts.map((court) => court.id);
		const grid = pruneStalePrintLayout(schedule.print?.grid ?? null, { dayIds, courtIds });
		const list = pruneStalePrintLayout(schedule.print?.list ?? null, { dayIds, courtIds });

		if (grid.dropped || list.dropped) {
			showMessage('This print layout may not reflect recent schedule changes.', 'info', 7000);
		}

		setPanelMode('print-layout');
		setMobilePanel('inspector');
	};

	const handlePrintLayoutChange = (type, nextLayout) => {
		dispatch({ type: 'setPrintLayouts', payload: { ...schedule.print, [type]: nextLayout } });
		markDirty();
	};

	const placedCount = schedule.entries.length;
	const pendingFixture = pendingFixtureId ? fixturesById[pendingFixtureId] : null;

	// One definition, rendered twice: inline in the toolbar above 768px and
	// inside the overflow menu below it. A media query decides which is visible,
	// so nothing here measures a width.
	//
	// Descriptors carry no handlers. Building an array of closures during render
	// that reach through to a ref — handleDiscard reads initialScheduleRef — is
	// what react-hooks flags as accessing refs during render. The id is data; the
	// work happens in runSecondaryAction at event time.
	const secondaryActions = [
		...(canEdit ? [{ id: 'break', label: 'Add Break' }] : []),
		// One action where there were two. Grid and list are now a choice made
		// inside the panel, alongside the page breaks that differ between them.
		{ id: 'print-layout', label: 'Edit Print Layout' },
		...(canEdit
			? [
					{ id: 'discard', label: 'Discard Changes', disabled: !dirty },
					{ id: 'reset', label: 'Reset Schedule', disabled: placedCount === 0 },
			  ]
			: []),
	];

	const runSecondaryAction = (id) => {
		switch (id) {
			case 'break':
				setBreakDraft({
					day: activeDay,
					startTime: schedule.settings.dayStartTime,
					endTime: addMinutesToTime(schedule.settings.dayStartTime, schedule.settings.slotMinutes),
					title: '',
					courtId: '',
					notes: '',
				});
				setPanelMode('break');
				setMobilePanel('inspector');
				break;
			case 'print-layout':
				openPrintLayoutPanel();
				break;
			case 'discard':
				handleDiscard();
				break;
			case 'reset':
				handleReset();
				break;
			default:
				break;
		}
	};

	// Portalled onto document.body. The modal is rendered inline from View.jsx,
	// inside <main id="app">, whose padding-top clears the fixed site header —
	// and the header and footer both sit in the same stacking context with a
	// higher z-index than .modal-backdrop, so they painted over the modal's top
	// and bottom. Leaving the tree removes the whole class of problem: no
	// ancestor can create a containing block for it and no sibling can be raised
	// above it by accident.
	return createPortal(
		<div
			className="modal-backdrop schedule-maker-backdrop"
			role="presentation"
			onClick={handleClose}
			onKeyDown={handleKeyDown}>
			{saving && <LoadingScreen context="scheduleSave" />}
			<div
				className="schedule-maker-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="schedule-maker-title"
				ref={modalRef}
				tabIndex={-1}
				onClick={(event) => event.stopPropagation()}>
				<div className="schedule-maker-header">
					<div>
						<p className="schedule-maker-kicker">Schedule Maker</p>
						<h2 id="schedule-maker-title">{tournamentName}</h2>
						<p className="schedule-maker-subtitle">
							{stats.scheduledFixtures} of {stats.totalFixtures} fixtures scheduled across {stats.days} day
							{stats.days === 1 ? '' : 's'}
							{divisionList.length > 1 && ` and ${divisionList.length} divisions`}
						</p>
					</div>
					<div className="schedule-maker-header-actions">
						<button type="button" className="schedule-maker-close" onClick={handleClose} aria-label="Close schedule maker">
							<Icon name="exit" />
						</button>
					</div>
				</div>

				<div className="schedule-maker-toolbar">
					<div className="schedule-maker-toolbar-actions">
						{/* Both labels render; a media query picks. Same reason as the
						    action set below — nothing here measures a width. */}
						<div className="schedule-view-toggle">
							<button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
								{/* <span className="schedule-label-long"><Icon name='grid'/></span>
								<span className="schedule-label-short"><Icon name='grid'/></span> */}
								{viewMode === 'grid' ? <Icon name='grid' fill='white'/> : <Icon name='grid' fill='var(--secondary-text-color)'/>}
							</button>
							<button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
								{/* <span className="schedule-label-long"><Icon name='list'/></span>
								<span className="schedule-label-short"><Icon name='list'/></span> */}
								{viewMode === 'list' ? <Icon name='list' fill='white'/> : <Icon name='list' fill='var(--secondary-text-color)'/>}
							</button>
						</div>

						{/* Rendered whatever the width; the stylesheet hides this group
						    below 768px, where the same actions appear in the overflow. */}
						<div className="schedule-maker-inline-actions">
							{secondaryActions.map((action) => (
								<button
									key={action.id}
									type="button"
									onClick={() => runSecondaryAction(action.id)}
									disabled={action.disabled}>
									{action.label}
								</button>
							))}
						</div>

						{/* Generate and Save stay visible at every width. */}
						{canEdit && (
							<>
								<button
									type="button"
									onClick={() => {
										setPanelMode('generate');
										setMobilePanel('inspector');
									}}>
									Generate
								</button>
								<button type="button" className="primary" onClick={handleSave} disabled={!dirty || saving}>
									<span className="schedule-label-long">Save Schedule</span>
									<span className="schedule-label-short">Save</span>
								</button>
							</>
						)}

						{/* The counterpart: hidden above 768px, so the toolbar stays one
						    short row on a phone without any of it becoming unreachable. */}
						<div className="schedule-maker-overflow" ref={overflowRef}>
							<button
								type="button"
								aria-haspopup="menu"
								aria-expanded={menuOpen}
								aria-label="More actions"
								onClick={() => setMenuOpen((open) => !open)}>
								More
							</button>
							{menuOpen && (
								<div className="schedule-maker-overflow-menu" role="menu">
									{secondaryActions.map((action) => (
										<button
											key={action.id}
											type="button"
											role="menuitem"
											disabled={action.disabled}
											onClick={() => {
												setMenuOpen(false);
												runSecondaryAction(action.id);
											}}>
											{action.label}
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Below 900px only; the stylesheet hides it above that. */}
				<div className="schedule-maker-panel-switcher" role="tablist" aria-label="Schedule maker panels">
					{mobilePanels.map((panel) => (
						<button
							key={panel.id}
							type="button"
							role="tab"
							aria-selected={activeMobilePanel === panel.id}
							className={activeMobilePanel === panel.id ? 'active' : ''}
							onClick={() => setMobilePanel(panel.id)}>
							{panel.label}
						</button>
					))}
				</div>

				<div className="schedule-maker-layout" data-mobile-panel={activeMobilePanel}>
					{canEdit && (
						<aside className="schedule-maker-sidebar">
							<div className="schedule-maker-sidebar-header">
								<h3>Unscheduled Fixtures</h3>
								<p>{filteredUnscheduledFixtures.length} remaining</p>
							</div>
							<div className="schedule-maker-filters">
								<input
									type="search"
									value={fixtureSearch}
									onChange={(event) => {
										const value = event.target.value;
										startTransition(() => setFixtureSearch(value));
									}}
									placeholder="Search teams or round"
									aria-label="Search unscheduled fixtures"
								/>
								{/* Absent for a single division: a filter with one choice is noise. */}
								{divisionList.length > 1 && (
									<select
										value={divisionFilter}
										onChange={(event) => setDivisionFilter(event.target.value)}
										aria-label="Filter fixtures by division">
										<option value="all">All divisions</option>
										{divisionList.map((entry) => (
											<option key={entry.id} value={String(entry.id)}>
												{entry.name}
											</option>
										))}
									</select>
								)}
								<select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)} aria-label="Filter fixtures by round">
									{roundOptions.map((round) => (
										<option key={round} value={round}>
											{round === 'all' ? 'All rounds' : round}
										</option>
									))}
								</select>
							</div>
							<div
								className={`schedule-maker-fixture-list${draggingEntryId ? ' unschedule-target' : ''}`}
								// While a placed entry is being dragged the whole list is a
								// drop target: dropping it here unschedules it, the reverse
								// of dragging a fixture onto the grid.
								onDragOver={(event) => draggingEntryId && event.preventDefault()}
								onDrop={handleUnscheduleDrop}>
								{draggingEntryId && (
									<div className="schedule-unschedule-hint">Drop here to remove from the schedule</div>
								)}
								{filteredUnscheduledFixtures.length > 0 ? (
									filteredUnscheduledFixtures.map((fixture) => (
										<button
											key={fixture.id}
											type="button"
											draggable
											aria-pressed={pendingFixtureId === fixture.id}
											className={`schedule-fixture-pill${pendingFixtureId === fixture.id ? ' pending' : ''}`}
											style={getFixtureDivisionStyle(fixture, divisionList)}
											onDragStart={(event) => {
												// effectAllowed has to be set explicitly here, or Chrome can
												// drop the payload set below somewhere between dragstart and
												// drop without raising an error — the cursor still shows a
												// valid drop target, but readDragPayload sees nothing.
												event.dataTransfer.effectAllowed = 'move';
												event.dataTransfer.setData('text/plain', `${FIXTURE_DRAG}${fixture.id}`);
											}}
											onClick={() => handleSelectFixtureForPlacement(fixture.id)}>
											<strong>{fixture.team1}</strong>
											<span>vs</span>
											<strong>{fixture.team2}</strong>
											<small>
												{fixture.divisionName ? `${fixture.divisionName} - ` : ''}
												{fixture.round} - Match {fixture.matchNo}
											</small>
										</button>
									))
								) : (
									<div className="schedule-empty-panel">
										<p>All fixtures are scheduled.</p>
									</div>
								)}
							</div>
						</aside>
					)}

					<section className="schedule-maker-board">
						{/* The day only ever affected the board. It used to sit in the
						    toolbar, where the fixtures list and the inspector paid for a
						    control neither of them uses. */}
						<div className="schedule-maker-day-tabs" role="tablist" aria-label="Schedule days" ref={dayTabsRef}>
							{schedule.days.map((day) => {
								const enabled = day.enabled !== false;

								return (
									<button
										key={day.id}
										type="button"
										role="tab"
										data-day={day.date}
										className={`${activeDay === day.date ? 'active' : ''} ${enabled ? '' : 'schedule-day-disabled'}`.trim()}
										aria-selected={activeDay === day.date}
										onClick={() => setActiveDay(day.date)}>
										{day.label}
										<span>{formatDateLabel(day.date)}</span>
										{!enabled && <span className="schedule-day-disabled-badge">Not scheduling</span>}
										{canEdit && (
											<button
												type="button"
												className="schedule-day-toggle"
												title={enabled ? 'Exclude this day from scheduling' : 'Include this day in scheduling'}
												aria-label={enabled ? `Exclude ${day.label} from scheduling` : `Include ${day.label} in scheduling`}
												onMouseDown={(event) => event.stopPropagation()}
												onClick={(event) => {
													event.stopPropagation();
													handleToggleDayEnabled(day.id);
												}}>
												{enabled ? 'On' : 'Off'}
											</button>
										)}
									</button>
								);
							})}
						</div>

						{/* Below 900px the fixtures list is not on screen while the board
						    is, so the pending fixture has to say so here — and be
						    cancellable here. */}
						{pendingFixture && (
							<div className="schedule-pending-banner" role="status">
								<span>
									Tap a free slot for <strong>{pendingFixture.team1}</strong> v{' '}
									<strong>{pendingFixture.team2}</strong>
								</span>
								<button type="button" onClick={() => setPendingFixtureId(null)}>
									Cancel
								</button>
							</div>
						)}

						{viewMode === 'grid' ? (
							<ScheduleGridView
								schedule={schedule}
								activeDay={activeDay}
								fixturesById={fixturesById}
								canEdit={canEdit}
								draggingEntryId={draggingEntryId}
								onSelectEntry={openEntryEditor}
								onOpenSlot={handleOpenSlotPicker}
								onOpenCourtConfig={handleOpenCourtConfig}
								onDropOnSlot={handleDropOnSlot}
								onDragEntry={setDraggingEntryId}
								onResizeEntry={handleResizeEntry}
								divisions={divisionList}
								highlightEntryIds={highlightEntryIds}
							/>
						) : (
							<ScheduleListView
								schedule={schedule}
								activeDay={activeDay}
								fixturesById={fixturesById}
								divisions={divisionList}
								onSelectEntry={openEntryEditor}
							/>
						)}
					</section>

					<aside className="schedule-maker-inspector">
						{panelMode === 'entry' && selectedEntry && entryForm ? (
							<EntryEditorPanel
								entry={entryForm}
								fixturesById={fixturesById}
								schedule={schedule}
								onChange={setEntryForm}
								onSave={handleUpdateEntry}
								onDelete={() => handleDeleteEntry(selectedEntry.id)}
								onBack={handleBackToOverview}
							/>
						) : panelMode === 'generate' ? (
							<GeneratorPanel
								draft={generatorDraft}
								onChange={setGeneratorDraft}
								onGenerate={handleGenerateSchedule}
								onBack={handleBackToOverview}
							/>
						) : panelMode === 'break' && breakDraft ? (
							<BreakPanel draft={breakDraft} schedule={schedule} onChange={setBreakDraft} onSave={handleCreateBreak} onBack={handleBackToOverview} />
						) : panelMode === 'slot' && slotDraft ? (
							<SlotAssignmentPanel
								draft={slotDraft}
								schedule={schedule}
								fixtures={filteredUnscheduledFixtures}
								divisions={divisionList}
								onAssign={(fixture) => handleAssignFixtureToSlot(fixture, slotDraft)}
								onBack={handleBackToOverview}
							/>
						) : panelMode === 'court' && courtConfig ? (
							<CourtConfigPanel
								court={courtConfig}
								divisions={divisionList}
								onSave={(nextDivisions) => handleSetCourtDivisions(courtConfig.id, nextDivisions)}
								onBack={handleBackToOverview}
							/>
						) : panelMode === 'print-layout' ? (
							<PrintLayoutPanel
								schedule={schedule}
								fixturesById={fixturesById}
								onChange={handlePrintLayoutChange}
								onPrint={handlePrint}
								onBack={handleBackToOverview}
							/>
						) : panelMode === 'settings' && settingsDraft ? (
							<SettingsPanel draft={settingsDraft} onChange={setSettingsDraft} onSave={handleSaveSettings} onBack={handleBackToOverview} />
						) : (
							<ScheduleOverviewPanel
								stats={stats}
								schedule={schedule}
								courtDraft={courtDraft}
								onCourtDraftChange={setCourtDraft}
								onAddCourt={handleAddCourt}
								onRemoveCourt={handleRemoveCourt}
								onEditSettings={handleOpenSettings}
								canEdit={canEdit}
							/>
						)}
					</aside>
				</div>
			</div>
		</div>,
		document.body
	);
}

// Where one entry sits on the grid, and whether it can be drawn there at all.
//
// The arithmetic is getEntryDayPlacement's: minutes from the start of the day
// against the fixed axis, not rows. The block is drawn at the entry's own start
// and its own length, so a 25-minute match on a 60-minute grid is a quarter-row
// block rather than a full row marked approximate.
//
// Two things stop an entry being drawn, and each is a reason the organiser needs
// to see rather than have quietly resolved:
//   'court' — it names a court the schedule no longer has, which happens the
//             moment the court count is reduced below it. Drawing it in the
//             first column would move it silently.
//   'hours' — it falls outside the day's configured hours. Widening the day to
//             reach it is what made the axis move under its own contents.
// Either way it is listed beneath the grid.
function locateEntry(entry, axis, courts) {
	const placement = getEntryDayPlacement(entry, axis);
	const courtIndex = entry.courtId === null ? null : courts.findIndex((court) => court.id === entry.courtId);
	const reason = !placement.inDay ? 'hours' : courtIndex === -1 ? 'court' : null;

	return {
		entry,
		...placement,
		courtIndex,
		placeable: reason === null,
		reason,
	};
}

// The board's axis in pixels. One grid row is GRID_ROW_HEIGHT tall and the rows
// sit flush against one another, so a minute is a fixed number of pixels and an
// entry can be drawn at its own start for its own length. The row track is set
// from this constant below, so it is the one place the number lives; the 1px is
// the padding schedule-maker.css gives .schedule-grid-cells, which the pointer
// arithmetic has to step over because it measures from the element's own edge.
//
// Row lines used to be a 1px gap between the tracks. They are a border on the
// cells now: a gap makes the pixel position of a minute depend on how many row
// boundaries precede it, so every entry drifts further from the time column the
// later in the day it starts.
const GRID_ROW_HEIGHT = 84;
const GRID_EDGE_PADDING = 1;

// A block shorter than this cannot hold its own subtitle and officials line, so
// they are dropped rather than clipped mid-word. Two lines of text plus padding.
const COMPACT_ENTRY_HEIGHT = 62;

// How far the pointer must travel before a press becomes a drag rather than the
// tap that opens the slot picker or the click that opens the inspector.
const DRAG_THRESHOLD_PX = 4;

// Auto-scrolling the board while a drag is in progress.
//
// Without it the board has a hard ceiling: a 09:00-17:00 day on a 30-minute grid
// is sixteen rows at GRID_ROW_HEIGHT, taller than the panel it is read in, so
// anything past the bottom of the window cannot be dragged to at all — not to
// create, not to resize, and not to move an entry to.
//
// EDGE_PX is how deep the band at each edge is, and MAX_PX_PER_FRAME the speed
// at the very edge of it; between the two the speed ramps, so a pointer resting
// just inside the band creeps and one held against the edge travels. IDLE_MS
// stops the loop when the events feeding it dry up, which is the only reliable
// end for an HTML5 drag: a drop outside the board fires nothing here.
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_MAX_PX_PER_FRAME = 20;
const AUTO_SCROLL_IDLE_MS = 250;

// Pixels to scroll this frame on one axis, given where the pointer is against
// that axis's two edges. Negative is towards the start. Pure, and the same
// function for both axes and both kinds of drag.
function edgeScrollVelocity(position, min, max) {
	const fromStart = position - min;
	const fromEnd = max - position;

	if (fromStart < AUTO_SCROLL_EDGE_PX) {
		const depth = Math.min(1, (AUTO_SCROLL_EDGE_PX - fromStart) / AUTO_SCROLL_EDGE_PX);
		return -Math.ceil(depth * AUTO_SCROLL_MAX_PX_PER_FRAME);
	}

	if (fromEnd < AUTO_SCROLL_EDGE_PX) {
		const depth = Math.min(1, (AUTO_SCROLL_EDGE_PX - fromEnd) / AUTO_SCROLL_EDGE_PX);
		return Math.ceil(depth * AUTO_SCROLL_MAX_PX_PER_FRAME);
	}

	return 0;
}

// Where a running gesture puts its two ends given the minute the pointer is now
// over. Pure, so the rule is readable on its own and the listener above stays
// about pointers.
//
// A create is anchored at the row it began on and grows in whichever direction
// the pointer went; a resize holds the edge that was not grabbed. Both keep at
// least one snap increment, because a zero-length entry is not a thing the
// organiser can have meant and the validator would refuse it anyway.
function advanceGesture(gesture, pointerMinutes, { axisMinutes, snapMinutes }) {
	if (gesture.kind === 'resize') {
		if (gesture.edge === 'start') {
			const startOffset = Math.max(0, Math.min(gesture.endOffset - snapMinutes, pointerMinutes));
			return { ...gesture, startOffset };
		}

		const endOffset = Math.min(axisMinutes, Math.max(gesture.startOffset + snapMinutes, pointerMinutes));
		return { ...gesture, endOffset };
	}

	let startOffset = Math.min(gesture.anchor, pointerMinutes);
	let endOffset = Math.max(gesture.anchor, pointerMinutes);

	if (endOffset - startOffset < snapMinutes) {
		if (pointerMinutes < gesture.anchor) {
			startOffset = endOffset - snapMinutes;
		} else {
			endOffset = startOffset + snapMinutes;
		}
	}

	if (startOffset < 0) {
		startOffset = 0;
		endOffset = Math.max(endOffset, snapMinutes);
	}

	if (endOffset > axisMinutes) {
		endOffset = axisMinutes;
		startOffset = Math.min(startOffset, axisMinutes - snapMinutes);
	}

	return { ...gesture, startOffset, endOffset };
}

const UNPLACEABLE_REASONS = {
	court: 'On a court the schedule no longer has',
	hours: "Outside the day's hours",
};

function ScheduleGridView({
	schedule,
	activeDay,
	fixturesById,
	canEdit,
	draggingEntryId,
	onSelectEntry,
	onOpenSlot,
	onOpenCourtConfig,
	onDropOnSlot,
	onDragEntry,
	onResizeEntry,
	divisions,
	highlightEntryIds = [],
}) {
	// The axis is a function of the settings alone. Nothing an entry does can
	// change how many rows there are, where they start, or how long each one is.
	// What has changed is that an entry is no longer drawn ON the rows: they rule
	// the board so that a time can be read off it, and the entry is drawn at its
	// own time over the top of them.
	const dayBounds = getDayBounds(schedule);
	const timeSlots = buildGridRowTimes(schedule, dayBounds);
	const axis = { start: dayBounds.start, slotMinutes: getSlotMinutes(schedule), rowCount: timeSlots.length };
	const axisMinutes = axis.rowCount * axis.slotMinutes;
	const dayEntries = getDayEntries(schedule, activeDay);
	// A disabled day has no meaningful slots to drop a fixture on — same
	// treatment as the generator's own skip, see docs/schedule.md.
	const isActiveDayEnabled = schedule.days.find((day) => day.date === activeDay)?.enabled !== false;
	const located = dayEntries.map((entry) => locateEntry(entry, axis, schedule.courts));
	const placedEntries = located.filter((item) => item.placeable);
	const unplaceableEntries = located.filter((item) => !item.placeable);
	const occupiedSlots = new Set();
	// The same set minus the entry being dragged. A drop must respect occupancy,
	// but an entry does not block itself — otherwise a placed entry could only
	// ever be moved somewhere it does not already overlap.
	const dropBlockedSlots = new Set();

	// A cell is occupied when an entry overlaps the minutes that cell covers,
	// which is a different question from where the entry is drawn now that the
	// two have come apart. A 25-minute match starting at 09:10 fills no whole row
	// on an hourly grid and still leaves nowhere to drop anything in the 09:00
	// one.
	//
	// The cells stay the drop target for a moved entry and the tap target for the
	// slot picker, and they stay whole rows, because a whole row is what a tap can
	// mean. Saying "09:10 to 09:35 exactly" is what the drag below is for.
	placedEntries.forEach(({ entry, startOffset, endOffset }) => {
		if (entry.courtId === null) {
			return;
		}

		timeSlots.forEach((slot, rowIndex) => {
			const rowStart = rowIndex * axis.slotMinutes;
			if (startOffset >= rowStart + axis.slotMinutes || endOffset <= rowStart) return;

			occupiedSlots.add(getSlotKey(activeDay, entry.courtId, slot));
			if (entry.id !== draggingEntryId) {
				dropBlockedSlots.add(getSlotKey(activeDay, entry.courtId, slot));
			}
		});
	});

	// --- the drag gestures ---------------------------------------------------
	//
	// Dragging out a range on an empty column creates an entry of exactly that
	// length; dragging a placed entry's edge changes that one time. Neither is
	// new data or a new rule: a create ends in the same slot picker a tap opens,
	// and a resize ends in the same validate-then-upsert as every other edit.
	//
	// Mouse and pen only. A touch drag on this board is a scroll — the grid is
	// taller than the screen it is read on — and taking it would cost a phone the
	// only way it has of moving around the day. Tap-to-place and the entry
	// editor's own time fields already reach everything the drags reach.
	const dayStartMinutes = timeToMinutes(axis.start);
	const cellsRef = useRef(null);
	const gestureRef = useRef(null);
	const suppressClickRef = useRef(false);
	const commitRef = useRef(null);
	const axisRef = useRef(null);
	const scrollerRef = useRef(null);
	const autoScrollRef = useRef(null);
	const applyPointerRef = useRef(null);
	// Set once by the auto-scroll effect below and called from four places: the
	// pointer listener, the board's dragover, and the two ends of a drag. Refs
	// rather than functions off the render, because the pointer listener is
	// subscribed once per gesture and the frame loop outlives every render.
	const trackAutoScrollRef = useRef(null);
	const stopAutoScrollRef = useRef(null);
	const [gesture, setGesture] = useState(null);
	const gestureActive = gesture !== null;

	// Read by the window listeners, which subscribe once per gesture and so
	// cannot close over anything that changes between renders. Written on every
	// render rather than against a dependency list — getting that list wrong here
	// is a gesture that silently measures against the previous render's axis.
	useEffect(() => {
		axisRef.current = { slotMinutes: axis.slotMinutes, axisMinutes, snapMinutes: SNAP_MINUTES };
	});

	// Where the pointer is, in minutes on the axis, snapped and clamped. Reads the
	// refs rather than taking the axis as an argument, because both callers — the
	// window listener and the auto-scroll frame — outlive the render they were
	// created in.
	const readPointerMinutes = (clientY) => {
		const node = cellsRef.current;
		const current = axisRef.current;
		if (!node || !current) return 0;

		const rect = node.getBoundingClientRect();
		const rows = (clientY - rect.top - GRID_EDGE_PADDING) / GRID_ROW_HEIGHT;
		const minutes = snapToIncrement(rows * current.slotMinutes, current.snapMinutes);

		return Math.min(Math.max(minutes, 0), current.axisMinutes);
	};

	// Advance the running gesture to wherever the pointer now is. Called on every
	// pointermove, and again on every auto-scroll frame — the pointer has not
	// moved then, but the board has moved under it, so the same clientY is a
	// different minute and re-reading it is the whole point.
	useEffect(() => {
		applyPointerRef.current = (clientY, moved) => {
			const running = gestureRef.current;
			const current = axisRef.current;
			if (!running || !current) return;

			const next = advanceGesture(running, readPointerMinutes(clientY), current);
			next.moved = running.moved || moved;

			gestureRef.current = next;
			setGesture(next);
		};
	});

	// One frame of auto-scroll, rescheduling itself until the drag feeding it
	// stops. Everything it needs is on a ref, so the loop survives the renders
	// each frame causes.
	useEffect(() => {
		const stop = () => {
			const running = autoScrollRef.current;
			if (!running) return;

			cancelAnimationFrame(running.frame);
			autoScrollRef.current = null;
		};

		const step = () => {
			const running = autoScrollRef.current;
			const node = scrollerRef.current;

			if (!running || !node || performance.now() > running.until) {
				stop();
				return;
			}

			const rect = node.getBoundingClientRect();
			const down = edgeScrollVelocity(running.clientY, rect.top, rect.bottom);
			// Sideways only for a drag that can change court — a create or a resize
			// stays in the column it began in, and scrolling it out of view would
			// leave the organiser dragging something they cannot see.
			const across = running.horizontal ? edgeScrollVelocity(running.clientX, rect.left, rect.right) : 0;

			if (down) node.scrollTop += down;
			if (across) node.scrollLeft += across;
			if (down && running.trackGesture) applyPointerRef.current?.(running.clientY, true);

			running.frame = requestAnimationFrame(step);
		};

		autoScrollRef.current = null;
		trackAutoScrollRef.current = ({ clientX, clientY, horizontal, trackGesture }) => {
			const running = autoScrollRef.current;
			// A pointer held still at the edge fires no further pointermove, so a
			// gesture drag would stop scrolling the moment the organiser stopped
			// moving — the opposite of what holding at the edge means. It ends on
			// pointerup instead, which always comes. An HTML5 drag has no such end
			// to rely on (a drop outside the board tells this component nothing) but
			// does fire dragover continuously even while stationary, so the idle
			// timeout is both safe and necessary there.
			const until = trackGesture ? Infinity : performance.now() + AUTO_SCROLL_IDLE_MS;

			if (running) {
				Object.assign(running, { clientX, clientY, horizontal, trackGesture, until });
				return;
			}

			autoScrollRef.current = { clientX, clientY, horizontal, trackGesture, until, frame: 0 };
			autoScrollRef.current.frame = requestAnimationFrame(step);
		};
		stopAutoScrollRef.current = stop;

		return stop;
	}, []);

	useEffect(() => {
		commitRef.current = (finished) => {
			if (!finished.moved) return;

			const startTime = minutesToTime(dayStartMinutes + finished.startOffset);
			const endTime = minutesToTime(dayStartMinutes + finished.endOffset);

			if (finished.kind === 'create') {
				onOpenSlot(activeDay, finished.courtId, startTime, endTime);
				return;
			}

			onResizeEntry(finished.entryId, startTime, endTime);
		};
	});

	useEffect(() => {
		if (!gestureActive) return undefined;

		const onPointerMove = (event) => {
			const running = gestureRef.current;
			if (!running) return;

			applyPointerRef.current?.(event.clientY, Math.abs(event.clientY - running.originY) > DRAG_THRESHOLD_PX);
			trackAutoScrollRef.current?.({
				clientX: event.clientX,
				clientY: event.clientY,
				horizontal: false,
				trackGesture: true,
			});
		};

		const onPointerEnd = () => {
			stopAutoScrollRef.current?.();

			const finished = gestureRef.current;
			gestureRef.current = null;
			setGesture(null);
			if (!finished) return;

			commitRef.current?.(finished);

			// The click that follows this pointerup would otherwise open the slot
			// picker or the inspector on top of whatever the drag just did. Cleared
			// on the next task, which is after that click has been dispatched.
			if (finished.moved) {
				suppressClickRef.current = true;
				window.setTimeout(() => {
					suppressClickRef.current = false;
				}, 0);
			}
		};

		// Abandon without committing. Escape is the organiser saying so;
		// pointercancel is the browser saying so, which on touch means it has
		// decided the contact belongs to a scroll or a system gesture — writing an
		// edit off the back of that would be writing one nobody asked for.
		const abandon = () => {
			stopAutoScrollRef.current?.();
			gestureRef.current = null;
			setGesture(null);
		};

		const onKeyDown = (event) => {
			if (event.key !== 'Escape') return;
			abandon();
		};

		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerEnd);
		window.addEventListener('pointercancel', abandon);
		window.addEventListener('keydown', onKeyDown, true);

		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerEnd);
			window.removeEventListener('pointercancel', abandon);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	}, [gestureActive]);

	const beginGesture = (event, next) => {
		if (!canEdit || !isActiveDayEnabled) return;
		if (event.button !== 0) return;

		// A touch drag on an empty cell is a scroll, and taking it would cost a
		// phone the only way it has of moving around the day — so drag-create stays
		// mouse and pen. A resize handle is a 10px strip that scrolls nothing worth
		// keeping, and the stylesheet gives it touch-action: none so the browser
		// hands the gesture over instead of panning; without that pair the finger
		// would scroll the board and the handle would never see the move.
		if (event.pointerType === 'touch' && next.kind !== 'resize') return;

		// Stops the press becoming a text selection. Deliberately not
		// stopPropagation as well: React dispatches from the root, so stopping here
		// would also hide the press from the document-level listener that closes
		// the toolbar's overflow menu. The entry's own HTML5 drag-to-move is kept
		// out of the way by the guard in its onDragStart instead.
		event.preventDefault();

		const started = { ...next, moved: false, originY: event.clientY };
		gestureRef.current = started;
		setGesture(started);
	};

	// Anchored to the top of the row pressed rather than to the pointer, so a
	// press near the bottom of a row still drags a range out from the time that
	// row is labelled with.
	const beginCreate = (event, courtId, rowIndex) => {
		const anchor = rowIndex * axis.slotMinutes;

		beginGesture(event, {
			kind: 'create',
			courtId,
			anchor,
			startOffset: anchor,
			endOffset: Math.min(anchor + SNAP_MINUTES, axisMinutes),
		});
	};

	const beginResize = (event, item, edge) => {
		beginGesture(event, {
			kind: 'resize',
			entryId: item.entry.id,
			edge,
			startOffset: item.startOffset,
			endOffset: item.endOffset,
		});
	};

	// An entry moved with HTML5 drag-and-drop, or a fixture dragged in from the
	// sidebar, produces dragover and nothing else — no pointer events reach here
	// at all — so the auto-scroll it needs has to be fed from its own stream.
	//
	// Deliberately no preventDefault: that is what marks a drop target, and the
	// board as a whole is not one. The cells decide that for themselves.
	//
	// Sideways as well as down, because this is the one drag that can change
	// court, and a tournament with more courts than fit scrolls horizontally.
	const handleBoardDragOver = (event) => {
		if (!canEdit || !isActiveDayEnabled) return;

		trackAutoScrollRef.current?.({
			clientX: event.clientX,
			clientY: event.clientY,
			horizontal: true,
			trackGesture: false,
		});
	};

	// True when a click is the organiser's own and not the tail of a drag.
	const takeClick = () => !suppressClickRef.current;

	const topFor = (startOffset) => (startOffset / axis.slotMinutes) * GRID_ROW_HEIGHT;
	const heightFor = (startOffset, endOffset) => ((endOffset - startOffset) / axis.slotMinutes) * GRID_ROW_HEIGHT;
	const resizingEntryId = gesture?.kind === 'resize' ? gesture.entryId : null;

	if (schedule.courts.length === 0) {
		return (
			<div className="schedule-board-empty">
				<h3>Add courts or fields to begin</h3>
				<p>The schedule days have been created from your tournament dates. Add at least one court or generate a schedule.</p>
			</div>
		);
	}

	// A court column narrower than this cannot hold a two-line entry card, so
	// below it the grid scrolls sideways rather than shrinking. Both grids take
	// the same template, which is what keeps the headings over their columns.
	const gridColumns = `72px repeat(${schedule.courts.length}, minmax(160px, 1fr))`;

	return (
		<div className={`schedule-grid-shell${gestureActive ? ' is-dragging' : ''}`}>
			{/* The header lives inside the scrolling body deliberately. Sticky
			    positions against the nearest scrollport, so a header outside it
			    could not stay aligned with the columns underneath it. */}
			<div
				className="schedule-grid-body"
				ref={scrollerRef}
				onDragOver={handleBoardDragOver}
				onDrop={() => stopAutoScrollRef.current?.()}
				onDragEnd={() => stopAutoScrollRef.current?.()}
				onDragLeave={() => stopAutoScrollRef.current?.()}>
				<div className="schedule-grid-header" style={{ gridTemplateColumns: gridColumns }}>
					<div className="schedule-grid-header-time">Time</div>
					{schedule.courts.map((court) => {
						const label = courtDivisionLabel(court, divisions);

						// A button when editable so the header opens the division
						// picker, keeping the same class so the grid template is
						// untouched; a plain div for a viewer.
						return canEdit ? (
							<button
								key={court.id}
								type="button"
								className="schedule-grid-header-court"
								onClick={() => onOpenCourtConfig(court.id)}
								title="Set which divisions play on this court">
								<span>{court.name}</span>
								{label && <small className="schedule-grid-header-court-divisions">{label}</small>}
							</button>
						) : (
							<div key={court.id} className="schedule-grid-header-court">
								<span>{court.name}</span>
								{label && <small className="schedule-grid-header-court-divisions">{label}</small>}
							</div>
						);
					})}
				</div>

				<div
					ref={cellsRef}
					className="schedule-grid-cells"
					style={{
						gridTemplateColumns: gridColumns,
						// A fixed height, not minmax(84px, auto). Every row is the same
						// span, so every row is the same height; a row that grew to its
						// content drew rows of unequal length at unequal heights and made
						// the time column impossible to count down. It is also the pixel
						// the entry positions below are measured in, so it cannot be a
						// number only the browser knows.
						gridTemplateRows: `repeat(${timeSlots.length}, ${GRID_ROW_HEIGHT}px)`,
					}}>
					{timeSlots.map((time, rowIndex) => (
						<React.Fragment key={time}>
							<div className="schedule-grid-time" style={{ gridColumn: 1, gridRow: rowIndex + 1 }}>{time}</div>
							{schedule.courts.map((court, columnIndex) => {
								const slotKey = getSlotKey(activeDay, court.id, time);
								const isOccupied = occupiedSlots.has(slotKey);
								const acceptsDrop = canEdit && isActiveDayEnabled && !dropBlockedSlots.has(slotKey);

								return (
									<div
										key={slotKey}
										className={`schedule-grid-cell ${isOccupied ? 'occupied' : 'open'}`}
										onClick={() =>
											takeClick() && !isOccupied && canEdit && isActiveDayEnabled && onOpenSlot(activeDay, court.id, time)
										}
										onPointerDown={(event) => !isOccupied && beginCreate(event, court.id, rowIndex)}
										onDragOver={(event) => acceptsDrop && event.preventDefault()}
										onDrop={(event) => acceptsDrop && onDropOnSlot(event, activeDay, court.id, time)}
										style={{ gridColumn: columnIndex + 2, gridRow: rowIndex + 1 }}
									/>
								);
							})}
						</React.Fragment>
					))}

					{placedEntries.map((item) => {
						const { entry, courtIndex } = item;
						// Mid-resize the block follows the pointer while the stored entry is
						// still the old one — the write happens once, on pointerup, through
						// the validator. Until then this is a preview and nothing more.
						const preview = resizingEntryId === entry.id ? gesture : item;
						const height = heightFor(preview.startOffset, preview.endOffset);

						return (
							// Draggable and clickable at once: dragging moves the entry, clicking
							// opens the inspector. The payload is the entry id rather than the
							// fixture id, which is how the cell tells a move from a placement.
							<button
								key={entry.id}
								type="button"
								data-entry-id={entry.id}
								className={`schedule-grid-entry ${entry.type}${height < COMPACT_ENTRY_HEIGHT ? ' compact' : ''}${
									resizingEntryId === entry.id ? ' resizing' : ''
								}${highlightEntryIds.includes(entry.id) ? ' highlighted' : ''}`}
								draggable={canEdit}
								onDragStart={(event) => {
									// A resize begins with a press on the entry's own edge, and the
									// entry is draggable, so the browser will offer to drag it away
									// as soon as the pointer moves. Refusing here is what keeps the
									// two gestures apart.
									if (gestureRef.current) {
										event.preventDefault();
										return;
									}

									// See the matching comment on the fixture pill's onDragStart:
									// effectAllowed has to be set explicitly or the payload below can
									// silently fail to survive to drop in Chrome.
									event.dataTransfer.effectAllowed = 'move';
									event.dataTransfer.setData('text/plain', `${ENTRY_DRAG}${entry.id}`);
									onDragEntry(entry.id);
								}}
								onDragEnd={() => onDragEntry(null)}
								style={{
									// BOTH column lines, always. An absolutely positioned grid child
									// is not a grid item, and `auto` as its end line means the grid
									// container's padding edge rather than "span one track" — so a
									// bare `${courtIndex + 2}` placed the block on the right court
									// and then let it run to the right-hand edge of the board, across
									// every court after it. Rows never showed the fault because they
									// have always named both lines.
									gridColumn:
										entry.courtId === null
											? `2 / span ${schedule.courts.length}`
											: `${courtIndex + 2} / span 1`,
									// Every row at once, so the block's containing box is the whole
									// column and top/height below can be its real time rather than a
									// count of rows.
									gridRow: '1 / -1',
									top: `${topFor(preview.startOffset)}px`,
									height: `${height}px`,
									...getEntryDivisionStyle(entry, fixturesById, divisions),
								}}
								onClick={() => takeClick() && onSelectEntry(entry)}>
								{/* Read off the offsets rather than the stored times, so that the
								    times shown mid-resize are the ones the drag is about to
								    write. Off a gesture the two are the same value. */}
								<div className="schedule-grid-entry-time">
									{minutesToTime(dayStartMinutes + preview.startOffset)} -{' '}
									{minutesToTime(dayStartMinutes + preview.endOffset)}
								</div>
								<div className="schedule-grid-entry-title">{getEntryLabel(entry, fixturesById)}</div>
								<div className="schedule-grid-entry-subtitle">{getEntrySecondary(entry, fixturesById)}</div>
								{getEntryOfficials(entry) && <div className='schedule-grid-entry-officials'>{getEntryOfficials(entry)}</div>}
								{canEdit && isActiveDayEnabled && (
									<>
										{/* Not focusable and not labelled: dragging an edge is a
										    mouse affordance, and the keyboard route to the same
										    change is the entry editor's own time fields, which
										    every entry already opens into. */}
										<span
											aria-hidden="true"
											className="schedule-grid-entry-handle top"
											onPointerDown={(event) => beginResize(event, item, 'start')}
										/>
										<span
											aria-hidden="true"
											className="schedule-grid-entry-handle bottom"
											onPointerDown={(event) => beginResize(event, item, 'end')}
										/>
									</>
								)}
							</button>
						);
					})}

					{/* The range being dragged out on an empty column, before it is
					    anything. It is drawn with the same arithmetic as a real block, so
					    what is released is what was shown. */}
					{gesture?.kind === 'create' && gesture.moved && (
						<div
							className="schedule-grid-draft"
							style={{
								// Both lines, for the reason on the entry block above.
								gridColumn: `${schedule.courts.findIndex((court) => court.id === gesture.courtId) + 2} / span 1`,
								gridRow: '1 / -1',
								top: `${topFor(gesture.startOffset)}px`,
								height: `${heightFor(gesture.startOffset, gesture.endOffset)}px`,
							}}>
							<span>
								{minutesToTime(dayStartMinutes + gesture.startOffset)} -{' '}
								{minutesToTime(dayStartMinutes + gesture.endOffset)}
							</span>
						</div>
					)}
				</div>
			</div>

			{unplaceableEntries.length > 0 && (
				<div className="schedule-grid-unplaceable">
					<h4>Not shown on the grid</h4>
					<p>
						{unplaceableEntries.length === 1 ? 'This entry has' : 'These entries have'} nowhere on the grid to be
						drawn. Open {unplaceableEntries.length === 1 ? 'it' : 'each one'} to move or remove{' '}
						{unplaceableEntries.length === 1 ? 'it' : 'them'}, or widen the day&apos;s hours.
					</p>
					<div className="schedule-grid-unplaceable-list">
						{unplaceableEntries.map(({ entry, reason }) => (
							<button
								key={entry.id}
								type="button"
								className="schedule-fixture-pill"
								style={getEntryDivisionStyle(entry, fixturesById, divisions)}
								onClick={() => onSelectEntry(entry)}>
								<strong>{getEntryLabel(entry, fixturesById)}</strong>
								<small>
									{entry.startTime} - {entry.endTime} - {getCourtName(schedule, entry.courtId)}
								</small>
								<small>{UNPLACEABLE_REASONS[reason]}</small>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function ScheduleListView({ schedule, activeDay, fixturesById, divisions = [], onSelectEntry }) {
	const dayEntries = getDayEntries(schedule, activeDay);

	if (dayEntries.length === 0) {
		return (
			<div className="schedule-board-empty">
				<h3>No schedule entries yet</h3>
				<p>This day is empty. Schedule fixtures manually, add a break, or generate the schedule automatically.</p>
			</div>
		);
	}

	return (
		<div className="schedule-list-day">
			{dayEntries.map((entry) => (
				<button
					key={entry.id}
					type="button"
					className={`schedule-list-entry ${entry.type}`}
					style={getEntryDivisionStyle(entry, fixturesById, divisions)}
					onClick={() => onSelectEntry(entry)}>
					<div className="schedule-list-time">
						{entry.startTime} - {entry.endTime}
					</div>
					<div className="schedule-list-content">
						<div className="schedule-list-title">{getEntryLabel(entry, fixturesById)}</div>
						<div className="schedule-list-meta">
							<span>{getCourtName(schedule, entry.courtId)}</span>
							<span>{getEntrySecondary(entry, fixturesById)}</span>
						</div>
						{entry.officials && <div className="schedule-list-extra">{getEntryOfficials(entry)}</div>}
						{entry.notes && <div className="schedule-list-extra">{entry.notes}</div>}
					</div>
				</button>
			))}
		</div>
	);
}

// A way back to the overview from any inspector sub-panel, without saving or
// deleting anything. Every draft panel is otherwise a one-way door.
function PanelBackButton({ onBack }) {
	if (!onBack) return null;

	return (
		<button type="button" className="schedule-panel-back" onClick={onBack}>
			← Back to overview
		</button>
	);
}

function ScheduleOverviewPanel({ stats, schedule, courtDraft, onCourtDraftChange, onAddCourt, onRemoveCourt, onEditSettings, canEdit }) {
	return (
		<div className="schedule-panel">
			<h3>Schedule Overview</h3>
			<div className="schedule-stat-grid">
				<div>
					<strong>{stats.scheduledFixtures}</strong>
					<span>Scheduled Fixtures</span>
				</div>
				<div>
					<strong>{stats.unscheduledFixtures}</strong>
					<span>Unscheduled</span>
				</div>
				<div>
					<strong>{stats.courts}</strong>
					<span>Courts / Fields</span>
				</div>
				<div>
					<strong>{schedule.days.length}</strong>
					<span>Tournament Days</span>
				</div>
			</div>

			<div className="schedule-panel-section">
				<div className="schedule-panel-section-head">
					<h4>Day Settings</h4>
					{canEdit && (
						<button type="button" className="schedule-panel-section-action" onClick={onEditSettings}>
							Edit
						</button>
					)}
				</div>
				<p>
					{schedule.settings.dayStartTime} - {schedule.settings.dayEndTime} - {schedule.settings.slotMinutes} minute slots
				</p>
			</div>

			<div className="schedule-panel-section">
				<h4>Courts & Fields</h4>
				<div className="schedule-court-list">
					{schedule.courts.length > 0 ? (
						schedule.courts.map((court) => {
							const placedOnCourt = schedule.entries.filter((entry) => entry.courtId === court.id).length;

							return (
								<div key={court.id} className="schedule-court-row">
									<span>{court.name}</span>
									{canEdit && (
										<button
											type="button"
											className="schedule-court-remove"
											onClick={() => onRemoveCourt(court.id)}
											aria-label={`Remove ${court.name}`}
											title={placedOnCourt > 0 ? `${placedOnCourt} scheduled here` : 'Remove'}>
											Remove
										</button>
									)}
								</div>
							);
						})
					) : (
						<p>No courts added yet.</p>
					)}
				</div>
				{canEdit && (
					<div className="schedule-inline-form">
						<input
							type="text"
							value={courtDraft}
							onChange={(event) => onCourtDraftChange(event.target.value)}
							placeholder="Add a court or field"
						/>
						<button type="button" onClick={onAddCourt}>
							Add
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function SlotAssignmentPanel({ draft, schedule, fixtures, divisions = [], onAssign, onBack }) {
	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>Assign Fixture</h3>
			<p>
				{formatDateLabel(draft.day)} - {draft.startTime} - {draft.endTime}
			</p>
			<p>{getCourtName(schedule, draft.courtId)}</p>
			<div className="schedule-maker-fixture-list compact">
				{fixtures.length > 0 ? (
					fixtures.map((fixture) => (
						<button
							key={fixture.id}
							type="button"
							className="schedule-fixture-pill"
							style={getFixtureDivisionStyle(fixture, divisions)}
							onClick={() => onAssign(fixture)}>
							<strong>{fixture.team1}</strong>
							<span>vs</span>
							<strong>{fixture.team2}</strong>
							<small>
								{fixture.divisionName ? `${fixture.divisionName} - ` : ''}
								{fixture.round} - Match {fixture.matchNo}
							</small>
						</button>
					))
				) : (
					<div className="schedule-empty-panel">
						<p>No matching fixtures available for this slot.</p>
					</div>
				)}
			</div>
		</div>
	);
}

// The division picker for one court. Multi-select over every division in the
// tournament; the restriction is written straight to schedule.courts as it is
// toggled. An empty selection means the court takes any division, which is stated
// in the panel because "no divisions allowed" is the natural misreading.
function CourtConfigPanel({ court, divisions, onSave, onBack }) {
	const selected = Array.isArray(court.divisions) ? court.divisions : [];

	const toggle = (divisionId) => {
		const next = selected.includes(divisionId)
			? selected.filter((id) => id !== divisionId)
			: [...selected, divisionId];
		onSave(next);
	};

	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>{court.name} Divisions</h3>
			<p>
				Choose which divisions can be scheduled on this court. Selecting nothing means the court takes{' '}
				<strong>any</strong> division.
			</p>
			{divisions.length > 0 ? (
				<div className="schedule-court-division-list">
					{divisions.map((division) => (
						<label key={division.id} className="schedule-court-division-option">
							<input
								type="checkbox"
								checked={selected.includes(division.id)}
								onChange={() => toggle(division.id)}
							/>
							<span>{division.name}</span>
						</label>
					))}
				</div>
			) : (
				<p>This tournament has no divisions to restrict to.</p>
			)}
		</div>
	);
}

// Editing the day settings by hand — the grid's start, end and slot length —
// rather than only through automatic generation. Writes to schedule.settings.
function SettingsPanel({ draft, onChange, onSave, onBack }) {
	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>Day Settings</h3>
			<p>
				These rule the grid every day is drawn on. They do not change any entry: a match is drawn at its own start
				time for its own length, whether or not that lands on a line. Generating a schedule no longer changes them
				either.
			</p>
			<div className="schedule-form-grid">
				<label>
					<span>Day Start</span>
					<input type="time" value={draft.dayStartTime} onChange={(event) => onChange({ ...draft, dayStartTime: event.target.value })} />
				</label>
				<label>
					<span>Day End</span>
					<input type="time" value={draft.dayEndTime} onChange={(event) => onChange({ ...draft, dayEndTime: event.target.value })} />
				</label>
				<label>
					<span>Slot Length (min)</span>
					<input
						type="number"
						min="5"
						step="5"
						value={draft.slotMinutes}
						onChange={(event) => onChange({ ...draft, slotMinutes: event.target.value })}
					/>
				</label>
			</div>
			<button type="button" className="primary full-width" onClick={onSave}>
				Save Settings
			</button>
		</div>
	);
}

// Where the printed pages break, edited while the schedule is still a draft.
// The editor itself is the same component the live print route uses — see
// SchedulePrintLayoutEditor — so what an organiser arranges here is already the
// tournament's saved layout once the schedule is committed, with no second
// step and no second definition of what a break means.
//
// No save button: this stages into the modal's own schedule.print, and the
// modal's existing save flow commits it along with everything else. Print
// still pops out to a standalone document, because the modal is an overlay
// over the app rather than a clean sheet of paper.
function PrintLayoutPanel({ schedule, fixturesById, onChange, onPrint, onBack }) {
	const [type, setType] = useState('grid');

	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>Edit Print Layout</h3>

			{/* This panel has no Save of its own, and an organiser who has just
			    moved a page break has no way to know that without being told —
			    an editor with no save button reads as one that has lost the
			    change, not one that is staging it. */}
			<p className="schedule-print-staged-note">
				Page breaks are staged with the rest of your changes. Use <strong>Save Schedule</strong> to keep them.
			</p>

			{/* is-on-light: this toggle sits on the inspector panel, not on the
			    print route's --main-color toolbar, so it takes the app's normal
			    polarity — selected is blue. See schedule-print.css. */}
			<div className="schedule-print-types is-on-light" role="group" aria-label="Schedule layout">
				{['grid', 'list'].map((option) => (
					<button
						key={option}
						type="button"
						className="schedule-print-choice"
						aria-pressed={type === option}
						onClick={() => setType(option)}>
						{option === 'grid' ? 'Grid' : 'List'}
					</button>
				))}
			</div>

			<SchedulePrintLayoutEditor
				type={type}
				schedule={schedule}
				fixturesById={fixturesById}
				layout={schedule.print?.[type] ?? null}
				onChange={(nextLayout) => onChange(type, nextLayout)}
			/>

			<button type="button" className="schedule-print-action is-primary" onClick={() => onPrint(type)}>
				Print this layout
			</button>
		</div>
	);
}

function BreakPanel({ draft, schedule, onChange, onSave, onBack }) {
	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>Add Break</h3>
			<div className="schedule-form-grid">
				<label>
					<span>Title</span>
					<input type="text" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
				</label>
				<label>
					<span>Day</span>
					<select value={draft.day} onChange={(event) => onChange({ ...draft, day: event.target.value })}>
						{schedule.days.map((day) => (
							<option key={day.id} value={day.date} disabled={day.enabled === false}>
								{day.label} - {formatDateLabel(day.date)}
								{day.enabled === false ? ' (not scheduling)' : ''}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>Starts</span>
					<input
						type="time"
						value={draft.startTime}
						onChange={(event) => onChange({ ...draft, startTime: event.target.value })}
					/>
				</label>
				<label>
					<span>Ends</span>
					<input type="time" value={draft.endTime} onChange={(event) => onChange({ ...draft, endTime: event.target.value })} />
				</label>
				<label>
					<span>Court Scope</span>
					<select value={draft.courtId} onChange={(event) => onChange({ ...draft, courtId: event.target.value })}>
						<option value="">All courts</option>
						{schedule.courts.map((court) => (
							<option key={court.id} value={court.id}>
								{court.name}
							</option>
						))}
					</select>
				</label>
				<label className="full">
					<span>Notes</span>
					<textarea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} rows="3" />
				</label>
			</div>
			<button type="button" className="primary full-width" onClick={onSave}>
				Add Break
			</button>
		</div>
	);
}

function GeneratorPanel({ draft, onChange, onGenerate, onBack }) {
	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>Generate Schedule</h3>
			<p>
				Fixtures are placed round by round, so a division's knockout matches never start before its pool play
				finishes. Within a round they keep their generated order, with group affinity and team rest preferences
				applied. Divisions still run alongside each other.
			</p>
			<div className="schedule-form-grid">
				<label>
					<span>Number of Courts</span>
					<input
						type="number"
						min="1"
						value={draft.courtCount}
						onChange={(event) => onChange({ ...draft, courtCount: event.target.value })}
					/>
				</label>
				<label>
					<span>Daily Start Time</span>
					<input
						type="time"
						value={draft.dailyStartTime}
						onChange={(event) => onChange({ ...draft, dailyStartTime: event.target.value })}
					/>
				</label>
				<label>
					<span>Daily End Time</span>
					<input type="time" value={draft.dailyEndTime} onChange={(event) => onChange({ ...draft, dailyEndTime: event.target.value })} />
				</label>
				<label>
					<span>Fixture Duration (min)</span>
					<input
						type="number"
						min="10"
						step="5"
						value={draft.fixtureDurationMinutes}
						onChange={(event) => onChange({ ...draft, fixtureDurationMinutes: event.target.value })}
					/>
				</label>
				<label>
					<span>Team Rest (min)</span>
					<input
						type="number"
						min="0"
						step="5"
						value={draft.restMinutes}
						onChange={(event) => onChange({ ...draft, restMinutes: event.target.value })}
					/>
					<small>The gap every team gets between two of its own matches on a day.</small>
				</label>
			</div>
			<label className="schedule-generator-toggle">
				<input
					type="checkbox"
					checked={draft.assignOfficials}
					onChange={(event) => onChange({ ...draft, assignOfficials: event.target.checked })}
				/>
				<span>
					Assign officials automatically — one team per match, never a team while it is playing and never from
					another division. Leave off to keep any officials you have already entered.
				</span>
			</label>
			<button type="button" className="primary full-width" onClick={onGenerate}>
				Generate Schedule
			</button>
		</div>
	);
}

function EntryEditorPanel({ entry, fixturesById, schedule, onChange, onSave, onDelete, onBack }) {
	const fixture = entry.type === 'fixture' ? fixturesById[entry.fixtureId] : null;

	return (
		<div className="schedule-panel">
			<PanelBackButton onBack={onBack} />
			<h3>{entry.type === 'break' ? 'Edit Break' : 'Edit Scheduled Fixture'}</h3>
			{fixture && (
				<div className="schedule-panel-section">
					<strong>
						{fixture.team1} vs {fixture.team2}
					</strong>
					<p>
						{fixture.divisionName ? `${fixture.divisionName} - ` : ''}
						{fixture.round} - Match {fixture.matchNo}
					</p>
				</div>
			)}
			<div className="schedule-form-grid">
				{entry.type === 'break' && (
					<label className="full">
						<span>Title</span>
						<input type="text" value={entry.title} onChange={(event) => onChange({ ...entry, title: event.target.value })} />
					</label>
				)}
				<label>
					<span>Day</span>
					<select value={entry.day} onChange={(event) => onChange({ ...entry, day: event.target.value })}>
						{schedule.days.map((day) => (
							<option key={day.id} value={day.date} disabled={day.enabled === false}>
								{day.label} - {formatDateLabel(day.date)}
								{day.enabled === false ? ' (not scheduling)' : ''}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>Start Time</span>
					<input type="time" value={entry.startTime} onChange={(event) => onChange({ ...entry, startTime: event.target.value })} />
				</label>
				<label>
					<span>End Time</span>
					<input type="time" value={entry.endTime} onChange={(event) => onChange({ ...entry, endTime: event.target.value })} />
				</label>
				<label>
					<span>{entry.type === 'break' ? 'Court Scope' : 'Court / Field'}</span>
					<select
						value={entry.courtId || ''}
						onChange={(event) => onChange({ ...entry, courtId: event.target.value || null })}>
						{entry.type === 'break' && <option value="">All courts</option>}
						{schedule.courts.map((court) => (
							<option key={court.id} value={court.id}>
								{court.name}
							</option>
						))}
					</select>
				</label>
				{entry.type === 'fixture' && (
					<label className="full">
						<span>Officials</span>
						<input
							type="text"
							value={entry.officials}
							onChange={(event) => onChange({ ...entry, officials: event.target.value })}
							placeholder="Assign referee or officiating crew"
						/>
					</label>
				)}
				<label className="full">
					<span>Notes</span>
					<textarea value={entry.notes} onChange={(event) => onChange({ ...entry, notes: event.target.value })} rows="3" />
				</label>
			</div>
			<div className="schedule-panel-actions">
				<button type="button" onClick={onDelete} className="danger">
					Delete Entry
				</button>
				<button type="button" className="primary" onClick={onSave}>
					Save Entry
				</button>
			</div>
		</div>
	);
}
