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
	getEntryDivisionStyle,
	getEntryLabel,
	getEntryOfficials,
	getEntryRowPlacement,
	getEntrySecondary,
	getSlotMinutes,
	getUnscheduledFixtures,
	isTimeRangeValid,
	removeScheduleEntry,
	serialiseScheduleForSave,
	sortScheduleEntries,
	timeToMinutes,
	upsertScheduleEntry,
	validateScheduleEntry,
} from '../utils/scheduleUtils';
import { divisionColorStyle } from '../utils/divisionColors';

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

function getFixtureDivisionStyle(fixture) {
	if (!fixture || fixture.divisionName == null) return undefined;

	return divisionColorStyle(fixture.division_id);
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
				entries: sortScheduleEntries(nextSchedule.entries),
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

	const handleOpenSlotPicker = (day, courtId, startTime) => {
		const draft = createSlotDraft(day, courtId, startTime, schedule.settings.slotMinutes);

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

	// Day settings can be edited on their own, not only as a side effect of
	// automatic generation. The panel writes to schedule.settings, which is the
	// grid's axis, so changing the slot length or hours after entries exist can
	// leave some off a boundary — that is visible on the grid and is allowed.
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

	// Opens the chosen layout as a standalone document in a new tab — the same
	// mechanism the non-organiser "View/Print Schedule" button on ScheduleTab
	// uses. Save as PDF from there is what replaced the immediate download.
	//
	// Dynamically imported for the same reason ScheduleTab's own call does it:
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
				type,
			});
		} catch {
			showMessage('Could not open the print view.', 'error');
		}
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
		{ id: 'print-grid', label: 'Print Grid' },
		{ id: 'print-list', label: 'Print List' },
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
			case 'print-grid':
				handlePrint('grid');
				break;
			case 'print-list':
				handlePrint('list');
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
											style={getFixtureDivisionStyle(fixture)}
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
								divisions={divisionList}
								highlightEntryIds={highlightEntryIds}
							/>
						) : (
							<ScheduleListView
								schedule={schedule}
								activeDay={activeDay}
								fixturesById={fixturesById}
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
// The row arithmetic is getEntryRowPlacement's, in minutes against the fixed
// axis. It used to look the entry's times up in the row list, which only worked
// because the row list had been built from those same times.
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
	const placement = getEntryRowPlacement(entry, axis);
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
	divisions,
	highlightEntryIds = [],
}) {
	// The axis is a function of the settings alone. Nothing an entry does can
	// change how many rows there are, where they start, or how long each one is.
	const dayBounds = getDayBounds(schedule);
	const timeSlots = buildGridRowTimes(schedule, dayBounds);
	const axis = { start: dayBounds.start, slotMinutes: getSlotMinutes(schedule), rowCount: timeSlots.length };
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

	// Walked from the same rowStart and rowSpan the entry is drawn with, so a cell
	// that looks occupied is occupied. A snapped entry covers the whole of every
	// row it overlaps, which is what its block covers too.
	placedEntries.forEach(({ entry, rowStart, rowSpan }) => {
		if (entry.courtId === null) {
			return;
		}

		for (let offset = 0; offset < rowSpan; offset += 1) {
			const slot = timeSlots[rowStart - 1 + offset];
			if (slot) {
				occupiedSlots.add(getSlotKey(activeDay, entry.courtId, slot));
				if (entry.id !== draggingEntryId) {
					dropBlockedSlots.add(getSlotKey(activeDay, entry.courtId, slot));
				}
			}
		}
	});

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
		<div className="schedule-grid-shell">
			{/* The header lives inside the scrolling body deliberately. Sticky
			    positions against the nearest scrollport, so a header outside it
			    could not stay aligned with the columns underneath it. */}
			<div className="schedule-grid-body">
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
					className="schedule-grid-cells"
					style={{
						gridTemplateColumns: gridColumns,
						// Every row is the same span, so every row is the same height.
						// minmax(84px, auto) let a row grow to its content, which drew
						// rows of unequal length at unequal heights and made the time
						// column impossible to count down.
						gridTemplateRows: `repeat(${timeSlots.length}, minmax(84px, auto))`,
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
										onClick={() => !isOccupied && canEdit && isActiveDayEnabled && onOpenSlot(activeDay, court.id, time)}
										onDragOver={(event) => acceptsDrop && event.preventDefault()}
										onDrop={(event) => acceptsDrop && onDropOnSlot(event, activeDay, court.id, time)}
										style={{ gridColumn: columnIndex + 2, gridRow: rowIndex + 1 }}
									/>
								);
							})}
						</React.Fragment>
					))}

					{placedEntries.map(({ entry, rowStart, rowSpan, courtIndex, snapped }) => (
						// Draggable and clickable at once: dragging moves the entry, clicking
						// opens the inspector. The payload is the entry id rather than the
						// fixture id, which is how the cell tells a move from a placement.
						<button
							key={entry.id}
							type="button"
							data-entry-id={entry.id}
							className={`schedule-grid-entry ${entry.type}${snapped ? ' snapped' : ''}${highlightEntryIds.includes(entry.id) ? ' highlighted' : ''}`}
							// An entry that does not sit on a slot boundary covers the rows
							// that contain it. Its own times are on the block and unchanged;
							// this says the block is wider than the entry rather than
							// leaving the organiser to notice.
							title={snapped ? `${entry.startTime} - ${entry.endTime}, shown across the slots it covers` : undefined}
							draggable={canEdit}
							onDragStart={(event) => {
								// See the matching comment on the fixture pill's onDragStart:
								// effectAllowed has to be set explicitly or the payload below can
								// silently fail to survive to drop in Chrome.
								event.dataTransfer.effectAllowed = 'move';
								event.dataTransfer.setData('text/plain', `${ENTRY_DRAG}${entry.id}`);
								onDragEntry(entry.id);
							}}
							onDragEnd={() => onDragEntry(null)}
							style={{
								gridColumn: entry.courtId === null ? `2 / span ${schedule.courts.length}` : `${courtIndex + 2}`,
								gridRow: `${rowStart} / span ${rowSpan}`,
								...getEntryDivisionStyle(entry, fixturesById),
							}}
							onClick={() => onSelectEntry(entry)}>
							<div className="schedule-grid-entry-time">
								{entry.startTime} - {entry.endTime}
							</div>
							<div className="schedule-grid-entry-title">{getEntryLabel(entry, fixturesById)}</div>
							<div className="schedule-grid-entry-subtitle">{getEntrySecondary(entry, fixturesById)}</div>
							{getEntryOfficials(entry) && <div className='schedule-grid-entry-officials'>{getEntryOfficials(entry)}</div>}
						</button>
					))}
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
								style={getEntryDivisionStyle(entry, fixturesById)}
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

function ScheduleListView({ schedule, activeDay, fixturesById, onSelectEntry }) {
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
					style={getEntryDivisionStyle(entry, fixturesById)}
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

function SlotAssignmentPanel({ draft, schedule, fixtures, onAssign, onBack }) {
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
							style={getFixtureDivisionStyle(fixture)}
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
			<p>These set the grid every day is drawn on. Existing entries are not moved; any that no longer sit on a slot are shown across the slots they cover.</p>
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
