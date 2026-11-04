import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import Tooltip from './Tooltip';
import { useMessage } from '../MessageContext';
import { useConfirm } from './ConfirmContext';
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
	DEFAULT_GENERATOR_SETTINGS,
	findNextFreeStart,
	formatDateLabel,
	getCourtName,
	getDayBounds,
	getDayEntries,
	getEntryDayPlacement,
	getEntryDivisionStyle,
	getEntryLabel,
	getEntryOfficials,
	getEntrySecondary,
	getFixtureDefaultLength,
	getPlacementProblem,
	getSlotMinutes,
	getTeams,
	getUnscheduledFixtures,
	isTimeRangeValid,
	minutesToTime,
	pruneStalePrintLayout,
	removeScheduleEntry,
	serialiseScheduleForSave,
	SNAP_MINUTES,
	snapToIncrement,
	snapToNeighbour,
	sortScheduleEntries,
	timeToMinutes,
	upsertScheduleEntry,
	validateScheduleEntry,
	withMatchLengths,
} from '../utils/scheduleUtils';
import { divisionColorStyle } from '../utils/divisionColors';
import { orderedStages, roundHolding } from './tournament/fixtureUtils';
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

// The division names a court is restricted to, comma-joined, or '' when the court
// takes any division. An id with no matching division reads as "Unknown" rather
// than vanishing, so a stale restriction is visible rather than silent.
function courtDivisionLabel(court, divisions = []) {
	const ids = Array.isArray(court.divisions) ? court.divisions : [];
	if (ids.length === 0) return '';

	return ids.map((id) => divisions.find((division) => division.id === id)?.name || 'Unknown').join(', ');
}

// Two things can be dropped on the board and they mean different things: a fixture
// from the sidebar creates an entry, an entry already on the grid moves one. The
// payload is prefixed so the drop handler can tell them apart — a bare id could
// be either.
const FIXTURE_DRAG = 'fixture:';
const ENTRY_DRAG = 'entry:';
const BREAK_DRAG = 'break:';

function readDragPayload(event) {
	const payload = event.dataTransfer.getData('text/plain') || '';

	if (payload.startsWith(ENTRY_DRAG)) {
		return { kind: 'entry', id: payload.slice(ENTRY_DRAG.length) };
	}

	if (payload.startsWith(FIXTURE_DRAG)) {
		return { kind: 'fixture', id: payload.slice(FIXTURE_DRAG.length) };
	}

	if (payload.startsWith(BREAK_DRAG)) return { kind: 'break', id: '' };

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

// A tap says where and nothing else, so its draft has no end: the fixture chosen for it
// brings its own length. A drag says how long as well and passes an end of its own,
// which is then kept.
function createSlotDraft(day, courtId, startTime, endTime = '') {
	return { day, courtId, startTime, endTime };
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
	// Which of the two panels is showing below 900px, where they no longer fit side by
	// side. Above 900px this is inert: the stylesheet ignores it and both show.
	const [mobilePanel, setMobilePanel] = useState('board');
	// What is open on the board: { kind: 'entry', entryId } to edit a match or break, or
	// { kind: 'picker', draft } to choose a fixture for an empty time.
	const [popover, setPopover] = useState(null);
	const popoverCommitRef = useRef(null);
	const popoverOpenerRef = useRef(null);
	const popoverJustDismissedRef = useRef(false);
	// The fixture chosen from the unscheduled list, waiting for a slot to be
	// tapped. Dragging covers this on desktop and cannot work below 900px, where
	// the list and the board are never on screen together.
	const [pendingFixtureId, setPendingFixtureId] = useState(null);
	// The same for a new break, which has no id to wait with.
	const [pendingBreak, setPendingBreak] = useState(false);
	// Open state of the toolbar's overflow menu. Only its open/closed state is
	// React's — whether the menu exists as a control at all is a media query,
	// because a width measured in JavaScript cannot be trusted here.
	const [menuOpen, setMenuOpen] = useState(false);
	const [fixtureSearch, setFixtureSearch] = useState('');
	const [roundFilter, setRoundFilter] = useState('all');
	const [divisionFilter, setDivisionFilter] = useState('all');
	// Which placed entry is mid-drag, so the cells it currently occupies stay
	// droppable. Without it a nudge from 09:00 to 09:30 is refused by the entry's
	// own occupancy.
	const [draggingEntryId, setDraggingEntryId] = useState(null);
	// The same for a fixture dragged in from the list. The drag's own payload can't be
	// read until the drop, and the live preview needs to know what is being dragged.
	const [draggingFixtureId, setDraggingFixtureId] = useState(null);
	const [draggingBreak, setDraggingBreak] = useState(false);
	const [courtDraft, setCourtDraft] = useState('');
	// Which sheet is open over the board: 'setup', 'auto', 'print' or neither. One at a
	// time. sheetCourtId is the court to bring into view, when a court's heading opened it.
	const [sheet, setSheet] = useState(null);
	const [sheetCourtId, setSheetCourtId] = useState(null);
	const sheetOpenerRef = useRef(null);
	// The schedule entries the last failed save named as the ones breaking a rule,
	// highlighted on the grid and scrolled into view. Cleared on the next save or
	// after a short delay.
	const [highlightEntryIds, setHighlightEntryIds] = useState([]);
	// Opens on the rules the schedule was last generated with, or the defaults for one
	// never generated. A rest or knockout break of null means "not chosen", which the
	// generator reads as one match length. Match lengths, hours and courts aren't here:
	// Set up owns them, and Auto-schedule reads them from the schedule.
	const [generatorDraft, setGeneratorDraft] = useState(() => {
		const saved = initialSchedule.settings.generator || DEFAULT_GENERATOR_SETTINGS;
		const rules = { ...saved };

		delete rules.fixtureDurationMinutes;
		delete rules.roundDurations;

		return rules;
	});
	// What the last generation had to bend or leave out, shown above the board until
	// the next generation or until dismissed. Not saved.
	const [generationReport, setGenerationReport] = useState(null);
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
	const roundOptions = useMemo(() => {
		return ['all', ...orderedStages(fixtures)];
	}, [fixtures]);
	// The rounds a match length can be set for: the round each fixture belongs to,
	// so a placement match or the 3rd place playoff shares its round's length.
	const generatorRounds = useMemo(
		() => [...new Set(fixtures.map((fixture) => roundHolding(fixture.round)).filter(Boolean))],
		[fixtures]
	);
	const unscheduledFixtures = useMemo(() => getUnscheduledFixtures(schedule, fixtures), [schedule, fixtures]);
	const filteredUnscheduledFixtures = useMemo(() => {
		const search = deferredSearch.trim().toLowerCase();

		return unscheduledFixtures.filter((fixture) => {
			const matchesDivision = divisionFilter === 'all' || String(fixture.division_id) === divisionFilter;
			const matchesRound = roundFilter === 'all' || (fixture.stage ?? fixture.round) === roundFilter;
			const matchesSearch = !search || fixture.searchText.includes(search);
			return matchesDivision && matchesRound && matchesSearch;
		});
	}, [deferredSearch, divisionFilter, roundFilter, unscheduledFixtures]);
	const stats = useMemo(() => calculateScheduledStats(schedule, fixtures), [schedule, fixtures]);

	if (!isOpen) return null;

	const divisionList = divisions || [];

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
			const confirmed = await confirm('You have unsaved schedule changes. They will be lost.', {
				title: 'Close without saving?',
				confirmLabel: 'Discard changes',
				cancelLabel: 'Keep editing',
				danger: true,
			});
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
			if (popover) {
				closePopover();
				return;
			}
			if (sheet) {
				closeSheet();
				return;
			}
			handleClose();
			return;
		}

		if (event.key !== 'Tab' || !modalRef.current) return;

		// An open popover holds focus while it is open. offsetParent is null for anything
		// display:none, which keeps hidden panels out of the cycle.
		const scope = modalRef.current.querySelector('.schedule-popover') ?? modalRef.current;
		const items = [...scope.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
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
		const confirmed = await confirm('The schedule goes back to how it was last saved.', {
			title: 'Discard all unsaved changes?',
			confirmLabel: 'Discard changes',
			cancelLabel: 'Keep editing',
			danger: true,
		});
		if (!confirmed) return;

		dispatch({ type: 'reset', payload: initialScheduleRef.current || initialSchedule });
		setSheet(null);
		setPopover(null);
		setGenerationReport(null);
		setDirty(false);
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
		const confirmed = await confirm('Nothing is saved until you save, so Discard will bring it back.', {
			title: `Remove ${parts.join(' and ')} from the whole schedule?`,
			confirmLabel: 'Reset schedule',
			cancelLabel: 'Keep',
			danger: true,
		});
		if (!confirmed) return;

		dispatch({ type: 'replace', payload: { ...schedule, entries: [] } });
		setSheet(null);
		setPopover(null);
		setGenerationReport(null);
		setPendingFixtureId(null);
		setPendingBreak(false);
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
		showMessage(`${nextName} added. Save the schedule to keep it.`, 'success');
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
				`Its ${placedFixtures} scheduled ${placedFixtures === 1 ? 'fixture' : 'fixtures'} will be returned to the unscheduled list.`,
				{ title: `Remove ${court.name}?`, confirmLabel: 'Remove court', cancelLabel: 'Keep' }
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
		showMessage(`${court.name} removed. Save the schedule to keep this.`, 'success');
	};

	// A draft with no end came from a tap, so it means "about here": it takes the given
	// length, touches a neighbour within reach, and moves along to the next free time if
	// that one is busy. A draft with an end was shown to the organiser exactly as it is,
	// and stands or falls as it is.
	const resolveDraftTimes = (length, draft) => {
		if (draft.endTime) return draft;

		const { start: dayStart } = getDayBounds(schedule);
		const slotMinutes = getSlotMinutes(schedule);
		const latestEnd = timeToMinutes(dayStart) + buildGridRowTimes(schedule, getDayBounds(schedule)).length * slotMinutes;
		const placing = { day: draft.day, courtId: draft.courtId, length };
		const near = snapToNeighbour(schedule.entries, { ...placing, start: timeToMinutes(draft.startTime) });
		const start = findNextFreeStart(schedule.entries, { ...placing, from: near, latestEnd });

		if (start === null) return null;

		return { ...draft, startTime: minutesToTime(start), endTime: minutesToTime(start + length) };
	};

	const handleAssignFixtureToSlot = (fixture, requestedDraft) => {
		if (!fixture || !requestedDraft) return;

		if (schedule.courts.length === 0) {
			showMessage('Add at least one court or field before scheduling fixtures.', 'error');
			return;
		}

		const draft = resolveDraftTimes(getFixtureDefaultLength(fixture, schedule.settings), requestedDraft);
		if (!draft) {
			showMessage(`No free time left on ${getCourtName(schedule, requestedDraft.courtId)} after ${requestedDraft.startTime}.`, 'error');
			return;
		}

		const candidate = createFixtureEntry({
			day: draft.day,
			courtId: draft.courtId,
			startTime: draft.startTime,
			endTime: draft.endTime,
			fixtureId: fixture.id,
		});

		const validationError = validateScheduleEntry(schedule, candidate, null, fixturesById);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		const warning = getPlacementProblem(schedule, candidate, fixturesById);

		dispatch({ type: 'upsertEntry', payload: candidate });
		setPopover(null);
		// Placed, so it is no longer pending. A rejected placement returns above
		// this line and leaves it pending, so another slot can be tried.
		setPendingFixtureId(null);
		// Back to the board so the organiser sees where it landed.
		setMobilePanel('board');
		markDirty();
		setDraggingFixtureId(null);
		showMessage(
			`${fixture.team1} vs ${fixture.team2} scheduled at ${draft.startTime}.${warning ? ` ${warning.message}.` : ''}`,
			warning ? 'warning' : 'success',
		);
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
			// A break spanning every court stays that way, wherever it is dropped.
			courtId: entry.courtId === null ? null : courtId,
			startTime,
			endTime: addMinutesToTime(startTime, durationMinutes),
		};

		const validationError = validateScheduleEntry(schedule, candidate, entry.id, fixturesById);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		const warning = getPlacementProblem(schedule, candidate, fixturesById, entry.id);

		dispatch({ type: 'upsertEntry', payload: candidate });
		setMobilePanel('board');
		markDirty();
		showMessage(
			`Moved to ${candidate.startTime} on ${getCourtName(schedule, candidate.courtId)}.${warning ? ` ${warning.message}.` : ''}`,
			warning ? 'warning' : 'success',
		);
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

		const validationError = validateScheduleEntry(schedule, candidate, entry.id, fixturesById);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		markDirty();
		showMessage(`Now ${startTime} - ${endTime}.`, 'success');
	};

	// The board has worked out the time from the pointer, and shown it, before this runs.
	const handleDropOnBoard = (event, day, courtId, startTime, endTime) => {
		event.preventDefault();
		const payload = readDragPayload(event);

		setDraggingFixtureId(null);
		setDraggingBreak(false);

		if (payload.kind === 'entry') {
			handleMoveEntry(payload.id, day, courtId, startTime);
			return;
		}

		if (payload.kind === 'break') {
			handleAddBreak(createSlotDraft(day, null, startTime, endTime));
			return;
		}

		const fixture = fixturesById[payload.id];
		if (!fixture) return;

		handleAssignFixtureToSlot(fixture, createSlotDraft(day, courtId, startTime, endTime));
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
		setPendingBreak(false);
		setMobilePanel('board');
		// The list view has no times to tap.
		setViewMode('grid');
	};

	const handleSelectBreakForPlacement = () => {
		setPendingBreak((pending) => !pending);
		setPendingFixtureId(null);
		setMobilePanel('board');
		setViewMode('grid');
	};

	// A new break covers every court until it is told otherwise. It opens straight away
	// for naming, because "Break" is only a placeholder.
	const handleAddBreak = (requestedDraft) => {
		const draft = resolveDraftTimes(NEW_BREAK_MINUTES, { ...requestedDraft, courtId: null });
		if (!draft) {
			showMessage(`No time left when every court is free after ${requestedDraft.startTime}.`, 'error');
			return;
		}

		const candidate = createBreakEntry({ day: draft.day, startTime: draft.startTime, endTime: draft.endTime, title: 'Break' });
		const validationError = validateScheduleEntry(schedule, candidate, null, fixturesById);
		if (validationError) {
			showMessage(validationError, 'error');
			return;
		}

		dispatch({ type: 'upsertEntry', payload: candidate });
		setPendingBreak(false);
		markDirty();
		openEntryPopover(candidate);
	};

	// A tap and a drag on the board arrive at the same picker and the same assignment
	// path. See createSlotDraft for the difference between them.
	const handleOpenSlotPicker = (day, courtId, startTime, endTime = '') => {
		const draft = createSlotDraft(day, courtId, startTime, endTime);

		// The press that dismissed a popover was to close it, not to start something new.
		// A range dragged out is a deliberate new thing either way.
		if (popoverJustDismissedRef.current && !endTime) return;

		if (pendingBreak) {
			handleAddBreak(draft);
			return;
		}

		// A fixture is waiting for somewhere to go, so this tap is the answer to that
		// rather than a request to open the picker. Same function the picker calls: a
		// second entry point, not a second implementation.
		if (pendingFixtureId) {
			const fixture = fixturesById[pendingFixtureId];
			if (fixture) {
				handleAssignFixtureToSlot(fixture, draft);
				return;
			}
			setPendingFixtureId(null);
		}

		popoverOpenerRef.current = null;
		setPopover({ kind: 'picker', draft });
	};

	// Editing happens on the match itself, like a calendar event.
	const openEntryPopover = (entry) => {
		popoverOpenerRef.current = document.activeElement;
		setPopover({ kind: 'entry', entryId: entry.id });
	};

	const closePopover = () => {
		setPopover(null);
		popoverCommitRef.current = null;

		const opener = popoverOpenerRef.current;
		popoverOpenerRef.current = null;
		if (opener?.isConnected) opener.focus();
	};

	// A press outside commits what was typed, then closes. Refused, it stays open with
	// its reason, so nothing typed is lost without saying so.
	const dismissPopover = () => {
		if (popoverCommitRef.current?.() === false) return;

		setPopover(null);
		popoverCommitRef.current = null;
		popoverOpenerRef.current = null;
		popoverJustDismissedRef.current = true;
		window.addEventListener(
			'pointerup',
			() => {
				window.setTimeout(() => {
					popoverJustDismissedRef.current = false;
				}, 0);
			},
			{ once: true },
		);
	};

	// Where the picker points: the court's column, at the time it is for.
	const getPickerAnchor = (draft) => {
		const column = modalRef.current?.querySelector(`[data-court-id="${CSS.escape(draft.courtId)}"]`);
		if (!column) return null;

		const rect = column.getBoundingClientRect();
		const offset = timeToMinutes(draft.startTime) - timeToMinutes(getDayBounds(schedule).start);

		return { left: rect.left, right: rect.right, top: rect.top + offset * PX_PER_MINUTE };
	};

	// What every edit on the popover goes through. It returns the reason if there is
	// one, and only an 'error' leaves the entry as it was.
	const handleApplyEntryEdit = (entry, candidate) => {
		const message = validateScheduleEntry(schedule, candidate, entry.id, fixturesById);
		if (message) return { severity: 'error', message: message.replace(/\.$/, '') };

		dispatch({ type: 'upsertEntry', payload: candidate });
		markDirty();
		if (candidate.day !== activeDay) setActiveDay(candidate.day);

		return getPlacementProblem(schedule, candidate, fixturesById, entry.id);
	};

	// A sheet goes over the right of the board rather than taking the panel over, so that
	// the board can still be read while a setting is changed. Focus goes in on opening, and
	// back to whatever opened it on closing.
	const openSheet = (next, courtId = null) => {
		sheetOpenerRef.current = document.activeElement;
		setSheetCourtId(courtId);
		setSheet(next);
		setPopover(null);
		setMenuOpen(false);
	};

	const closeSheet = () => {
		setSheet(null);
		setSheetCourtId(null);
		sheetOpenerRef.current?.focus?.();
	};

	// A court's heading is a shortcut to that court in Set up.
	const handleOpenCourtConfig = (courtId) => openSheet('setup', courtId);

	// Toggled per division rather than saved as a batch: this writes straight to
	// schedule.courts and the change is visible on the header. Dirty until the
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

	// The sheet only sends hours that make sense. Each one writes straight to the draft
	// schedule like every other change here, so Discard still brings the old ones back.
	const handleSetHours = (dayStartTime, dayEndTime) => {
		dispatch({ type: 'updateSettings', payload: { dayStartTime, dayEndTime } });
		markDirty();
	};

	// Redraws the lines and moves nothing: an entry is drawn from its own times.
	const handleSetGridLines = (slotMinutes) => {
		dispatch({ type: 'updateSettings', payload: { slotMinutes } });
		markDirty();
	};

	// A default for new matches. Nothing already on the board changes.
	const handleSetMatchLengths = (lengths) => {
		dispatch({ type: 'updateSettings', payload: withMatchLengths(schedule.settings, lengths) });
		markDirty();
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
		if (popover?.entryId === payload.id) setPopover(null);
		markDirty();

		const label = entry.type === 'break' ? 'Break' : 'Match';
		showMessage(`${label} removed from the schedule.`, 'success');
	};

	const handleDeleteEntry = async (entry) => {
		const label = entry.type === 'break' ? 'break' : 'match';

		// Closed first, so the confirmation isn't competing with it for the same screen.
		closePopover();

		const confirmed = await confirm('Nothing is saved until you save, so Discard will bring it back.', {
			title: `Remove this ${label} from the schedule?`,
			confirmLabel: `Remove ${label}`,
			cancelLabel: 'Keep',
		});
		if (!confirmed) return;

		dispatch({ type: 'removeEntry', payload: entry.id });
		setMobilePanel('board');
		markDirty();
		showMessage(`${label === 'break' ? 'Break' : 'Match'} removed from the schedule.`, 'success');
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
			courtCount: schedule.courts.length,
			dailyStartTime: schedule.settings.dayStartTime,
			dailyEndTime: schedule.settings.dayEndTime,
			fixtureDurationMinutes: getFixtureDefaultLength(null, schedule.settings),
			// Passed raw, not through Number(): an emptied field is Number('') === 0,
			// and a silent "no rest at all" is not what clearing a box means. The
			// generator falls back to the fixture duration for anything it cannot
			// read, which is the rest this generator has always given.
			restMinutes: generatorDraft.restMinutes,
			restEnabled: generatorDraft.restEnabled,
			maxPerDayEnabled: generatorDraft.maxPerDayEnabled,
			maxMatchesPerDay: generatorDraft.maxMatchesPerDay,
			maxWaitEnabled: generatorDraft.maxWaitEnabled,
			maxWaitMinutes: generatorDraft.maxWaitMinutes,
			knockoutGapEnabled: generatorDraft.knockoutGapEnabled,
			knockoutGapMinutes: generatorDraft.knockoutGapMinutes,
			fitAll: generatorDraft.fitAll,
			allowOverrun: generatorDraft.allowOverrun,
			spreadDays: generatorDraft.spreadDays,
			courtAffinity: generatorDraft.courtAffinity,
			groupDivisions: generatorDraft.groupDivisions,
			assignOfficials: generatorDraft.assignOfficials,
			roundDurations: schedule.settings.generator?.roundDurations ?? {},
		});

		if (!result.report) {
			showMessage(result.warnings.join(' '), 'warning', 9000);
			return;
		}

		replaceSchedule(result.schedule);
		setGenerationReport({ ...result.report, warnings: result.warnings });
		setSheet(null);
		setPopover(null);
		setMobilePanel('board');
		setViewMode('grid');

		const { placed, total, ruleBreaks } = result.report;
		if (placed < total) {
			showMessage(`${total - placed} of ${total} fixtures could not be scheduled. See the report above the board.`, 'warning', 9000);
		} else if (ruleBreaks.length > 0) {
			showMessage('Every fixture was scheduled, but some rules had to bend. See the report above the board.', 'warning', 9000);
		} else {
			showMessage('Schedule filled. You can change any match afterwards.', 'success');
		}
	};

	const handleShowReportEntries = (entryIds) => {
		highlightOffendingEntries({ entryIds });
		setMobilePanel('board');
	};

	// The fixtures panel only exists for an editor, so a read-only viewer can never be
	// left looking at a panel that is not rendered.
	const mobilePanels = [...(canEdit ? [{ id: 'fixtures', label: 'Fixtures' }] : []), { id: 'board', label: 'Board' }];
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

		openSheet('print');
	};

	const handlePrintLayoutChange = (type, nextLayout) => {
		dispatch({ type: 'setPrintLayouts', payload: { ...schedule.print, [type]: nextLayout } });
		markDirty();
	};

	const placedCount = schedule.entries.length;
	const pendingFixture = pendingFixtureId ? fixturesById[pendingFixtureId] : null;

	// One definition, rendered twice: inline in the toolbar above 768px and inside the
	// More menu below it, where there is no room. A media query decides which is visible,
	// so nothing here measures a width. Discard and Reset are always in the menu: they
	// are rare and undo a lot, so they don't sit beside the routine actions.
	//
	// Descriptors carry no handlers. Building an array of closures during render that
	// reach through to a ref — handleDiscard reads initialScheduleRef — is what
	// react-hooks flags as accessing refs during render. The id is data; the work happens
	// in runAction at event time.
	const inlineActions = [...(canEdit ? [{ id: 'setup', label: 'Set up' }] : []), { id: 'print', label: 'Print' }];
	const destructiveActions = canEdit
		? [
				{ id: 'discard', label: 'Discard Changes', disabled: !dirty },
				{ id: 'reset', label: 'Reset Schedule', disabled: placedCount === 0 },
		  ]
		: [];

	const runAction = (id) => {
		switch (id) {
			case 'setup':
				openSheet('setup');
				break;
			case 'print':
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
							{stats.scheduledFixtures} of {stats.totalFixtures} fixtures scheduled
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
						<div className="schedule-view-toggle">
							<button type="button" className={viewMode === 'grid' ? 'active' : ''} aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
								Board
							</button>
							<button type="button" className={viewMode === 'list' ? 'active' : ''} aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>
								List
							</button>
						</div>

						{/* Rendered whatever the width; the stylesheet hides this group below
						    768px, where the same actions appear in the More menu. */}
						<div className="schedule-maker-inline-actions">
							{inlineActions.map((action) => (
								<button key={action.id} type="button" onClick={() => runAction(action.id)}>
									{action.label}
								</button>
							))}
						</div>

						{/* Auto-schedule and Save stay visible at every width. Both labels
						    render; a media query picks. */}
						{canEdit && (
							<>
								<button type="button" onClick={() => openSheet('auto')}>
									<span className="schedule-label-long">Auto-schedule</span>
									<span className="schedule-label-short">Auto</span>
								</button>
								<button type="button" className="primary" onClick={handleSave} disabled={!dirty || saving}>
									<span className="schedule-label-long">Save Schedule</span>
									<span className="schedule-label-short">Save</span>
								</button>
							</>
						)}

						<div className={`schedule-maker-overflow${canEdit ? '' : ' is-narrow-only'}`} ref={overflowRef}>
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
									{inlineActions.map((action) => (
										<button
											key={action.id}
											type="button"
											role="menuitem"
											className="is-narrow-only"
											onClick={() => {
												setMenuOpen(false);
												runAction(action.id);
											}}>
											{action.label}
										</button>
									))}
									{destructiveActions.map((action) => (
										<button
											key={action.id}
											type="button"
											role="menuitem"
											className="is-destructive"
											disabled={action.disabled}
											onClick={() => {
												setMenuOpen(false);
												runAction(action.id);
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
								<button
									type="button"
									draggable
									aria-pressed={pendingBreak}
									className={`schedule-fixture-pill schedule-break-pill${pendingBreak ? ' pending' : ''}`}
									onDragStart={(event) => {
										event.dataTransfer.effectAllowed = 'move';
										event.dataTransfer.setData('text/plain', BREAK_DRAG);
										setDraggingBreak(true);
									}}
									onDragEnd={() => setDraggingBreak(false)}
									onClick={handleSelectBreakForPlacement}>
									<strong>Break</strong>
									<small>{NEW_BREAK_MINUTES} minutes across all courts</small>
								</button>
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
												setDraggingFixtureId(fixture.id);
											}}
											onDragEnd={() => setDraggingFixtureId(null)}
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
						{/* The day only ever affected the board. */}
						<div className="schedule-board-bar">
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
											{!enabled && <span className="schedule-day-disabled-badge">Off</span>}
										</button>
									);
								})}
							</div>
							{canEdit && viewMode === 'grid' && (
								<GridLinesControl value={getSlotMinutes(schedule)} onChange={handleSetGridLines} />
							)}
						</div>

						{/* Below 900px the fixtures list is not on screen while the board
						    is, so the pending fixture has to say so here — and be
						    cancellable here. */}
						{generationReport && (
							<GenerationReport
								report={generationReport}
								multiDay={schedule.days.length > 1}
								onShowEntries={handleShowReportEntries}
								onDismiss={() => setGenerationReport(null)}
							/>
						)}

						{pendingBreak && (
							<div className="schedule-pending-banner" role="status">
								<span>Tap the board to place a break</span>
								<button type="button" onClick={() => setPendingBreak(false)}>
									Cancel
								</button>
							</div>
						)}

						{pendingFixture && (
							<div className="schedule-pending-banner" role="status">
								<span>
									Tap the board to place <strong>{pendingFixture.team1}</strong> v{' '}
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
								draggingFixtureId={draggingFixtureId}
								draggingBreak={draggingBreak}
								onSelectEntry={openEntryPopover}
								onOpenSlot={handleOpenSlotPicker}
								onOpenCourtConfig={handleOpenCourtConfig}
								onOpenSetUp={() => openSheet('setup')}
								onDropOnBoard={handleDropOnBoard}
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
								onSelectEntry={openEntryPopover}
							/>
						)}
					</section>

					{sheet === 'setup' && (
						<SetUpSheet
							key={sheetCourtId ?? 'all'}
							schedule={schedule}
							rounds={generatorRounds}
							divisions={divisionList}
							focusCourtId={sheetCourtId}
							courtDraft={courtDraft}
							onCourtDraftChange={setCourtDraft}
							onAddCourt={handleAddCourt}
							onRemoveCourt={handleRemoveCourt}
							onSetCourtDivisions={handleSetCourtDivisions}
							onToggleDay={handleToggleDayEnabled}
							onSetHours={handleSetHours}
							onSetMatchLengths={handleSetMatchLengths}
							onClose={closeSheet}
						/>
					)}
					{sheet === 'auto' && (
						<AutoScheduleSheet
							schedule={schedule}
							draft={generatorDraft}
							onChange={setGeneratorDraft}
							onGenerate={handleGenerateSchedule}
							onOpenSetUp={() => setSheet('setup')}
							onClose={closeSheet}
						/>
					)}
					{sheet === 'print' && (
						<PrintSheet
							schedule={schedule}
							fixturesById={fixturesById}
							canEdit={canEdit}
							onChange={handlePrintLayoutChange}
							onPrint={handlePrint}
							onClose={closeSheet}
						/>
					)}
				</div>

				{popover?.kind === 'entry' && schedule.entries.some((entry) => entry.id === popover.entryId) && (
					<EntryPopover
						key={popover.entryId}
						entry={schedule.entries.find((entry) => entry.id === popover.entryId)}
						schedule={schedule}
						fixturesById={fixturesById}
						canEdit={canEdit}
						commitRef={popoverCommitRef}
						getAnchor={() => modalRef.current?.querySelector(`[data-entry-id="${popover.entryId}"]`)?.getBoundingClientRect() ?? null}
						onApply={handleApplyEntryEdit}
						onRemove={handleDeleteEntry}
						onClose={closePopover}
						onDismiss={dismissPopover}
					/>
				)}
				{popover?.kind === 'picker' && (
					<FixturePickerPopover
						draft={popover.draft}
						schedule={schedule}
						fixtures={filteredUnscheduledFixtures}
						divisions={divisionList}
						getAnchor={() => getPickerAnchor(popover.draft)}
						onAssign={(fixture) => handleAssignFixtureToSlot(fixture, popover.draft)}
						onClose={closePopover}
						onDismiss={dismissPopover}
					/>
				)}
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

// The board's scale. A minute is the same number of pixels whatever the grid lines are
// set to, so changing them redraws the lines and moves nothing. The 1px is the padding
// schedule-maker.css gives .schedule-grid-cells, which the pointer arithmetic has to step
// over because it measures from the element's own edge.
const PX_PER_MINUTE = 1.6;

// How long a new break starts out. Change one by dragging its edge.
const NEW_BREAK_MINUTES = 30;
const GRID_EDGE_PADDING = 1;

// The closest two time labels may sit before some are skipped, on a fine grid.
const TIME_LABEL_MIN_GAP_PX = 18;

// What a block has room to say. Below COMPACT it drops its subtitle and officials, and
// below TINY its times as well, rather than clip them mid-word.
const COMPACT_ENTRY_HEIGHT = 70;
const TINY_ENTRY_HEIGHT = 36;

// How far the pointer must travel before a press becomes a drag rather than the
// tap that opens the fixture picker or the click that opens a match.
const DRAG_THRESHOLD_PX = 4;

// Auto-scrolling the board while a drag is in progress.
//
// Without it the board has a hard ceiling: a 09:00-17:00 day at PX_PER_MINUTE is
// taller than the panel it is read in, so anything past the bottom of the window cannot be dragged to at all — not to
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
// A create is anchored at the time it began on and grows in whichever direction
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
	draggingFixtureId,
	draggingBreak,
	onSelectEntry,
	onOpenSlot,
	onOpenCourtConfig,
	onOpenSetUp,
	onDropOnBoard,
	onDragEntry,
	onResizeEntry,
	divisions,
	highlightEntryIds = [],
}) {
	// The axis is a function of the settings alone. Nothing an entry does can change
	// where the day starts or how long it is. The grid lines rule the board so that a
	// time can be read off it, and everything else is positioned in minutes over the
	// top of them: an entry at its own time, and a press, drop or tap at the pointer's.
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
	const readPointerOffset = (clientY) => {
		const node = cellsRef.current;
		if (!node) return 0;

		return (clientY - node.getBoundingClientRect().top - GRID_EDGE_PADDING) / PX_PER_MINUTE;
	};

	const readPointerMinutes = (clientY) => {
		const current = axisRef.current;
		if (!current) return 0;

		const minutes = snapToIncrement(readPointerOffset(clientY), current.snapMinutes);

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

			// The click that follows this pointerup would otherwise open the fixture
			// picker or the match's popover on top of whatever the drag just did. Cleared
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

	// Anchored at the pointer, so a range can begin anywhere there is room for one.
	const beginCreate = (event, courtId) => {
		const anchor = readPointerMinutes(event.clientY);

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

	// --- dropping onto the board ---------------------------------------------
	//
	// What is being dragged, from state rather than the drag's payload, which can't be
	// read until the drop. A move keeps its length; a new placement takes its round's.
	const draggedEntry = draggingEntryId ? schedule.entries.find((entry) => entry.id === draggingEntryId) ?? null : null;
	const draggedFixture = !draggedEntry && draggingFixtureId ? fixturesById[draggingFixtureId] ?? null : null;
	const isDraggingOntoBoard = canEdit && isActiveDayEnabled && Boolean(draggedEntry || draggedFixture || draggingBreak);

	const [dropPreview, setDropPreview] = useState(null);
	const dropChipRef = useRef(null);
	const dropGrabRef = useRef(0);
	const dropPointRef = useRef({ x: 0, y: 0 });

	// Where this pointer position would put the dragged item, and what is wrong with
	// that if anything. The same answer drives the preview, the chip and the drop, so
	// what is released is what was shown.
	const locateDrop = (event) => {
		const columns = cellsRef.current ? [...cellsRef.current.querySelectorAll('[data-court-id]')] : [];
		const column = columns.find((node) => {
			const rect = node.getBoundingClientRect();
			return event.clientX >= rect.left && event.clientX < rect.right;
		});
		if (!column) return null;

		// A break spanning every court, or a new one, isn't dropped on any one of them.
		const courtId = draggingBreak || draggedEntry?.courtId === null ? null : column.dataset.courtId;
		let length = NEW_BREAK_MINUTES;
		if (draggedEntry) length = timeToMinutes(draggedEntry.endTime) - timeToMinutes(draggedEntry.startTime);
		else if (draggedFixture) length = getFixtureDefaultLength(draggedFixture, schedule.settings);
		const latestStart = Math.max(0, axisMinutes - length);
		const clampOffset = (offset) => Math.min(Math.max(offset, 0), latestStart);
		// A moved match stays where it was picked up. A new one hangs from the pointer.
		const grab = draggedEntry ? dropGrabRef.current : 0;
		const pointerOffset = clampOffset(snapToIncrement(readPointerOffset(event.clientY) - grab, SNAP_MINUTES));
		const start = snapToNeighbour(schedule.entries, {
			day: activeDay,
			courtId,
			start: dayStartMinutes + pointerOffset,
			length,
			ignoreEntryId: draggedEntry?.id ?? null,
		});
		const startOffset = clampOffset(start - dayStartMinutes);
		const startTime = minutesToTime(dayStartMinutes + startOffset);
		const endTime = minutesToTime(dayStartMinutes + startOffset + length);
		let candidate = { type: 'break', title: 'Break', day: activeDay, courtId, startTime, endTime };
		if (draggedEntry) candidate = { ...draggedEntry, day: activeDay, courtId, startTime, endTime };
		else if (draggedFixture) candidate = { type: 'fixture', fixtureId: draggedFixture.id, day: activeDay, courtId, startTime, endTime };

		return {
			columnCourtId: column.dataset.courtId,
			courtId,
			startOffset,
			endOffset: startOffset + length,
			startTime,
			endTime,
			problem: getPlacementProblem(schedule, candidate, fixturesById, draggedEntry?.id ?? null),
		};
	};

	// Set on the element rather than through state, because this follows the pointer on
	// every event and the board is expensive to redraw. Kept in the window, clear of the
	// pointer.
	const placeDropChip = () => {
		const chip = dropChipRef.current;
		if (!chip) return;

		const { x, y } = dropPointRef.current;
		chip.style.left = `${Math.min(x + 16, window.innerWidth - chip.offsetWidth - 8)}px`;
		chip.style.top = `${Math.min(y + 16, window.innerHeight - chip.offsetHeight - 8)}px`;
	};

	// Again whenever it changes, which is also the frame it first exists and has a size.
	useLayoutEffect(placeDropChip, [dropPreview]);

	const handleCellsDragOver = (event) => {
		if (!isDraggingOntoBoard) return;

		const next = locateDrop(event);
		if (!next) {
			setDropPreview(null);
			return;
		}

		// What marks this as a place that can be dropped on. A refused drop is allowed
		// through too, so that releasing it says why rather than nothing.
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		dropPointRef.current = { x: event.clientX, y: event.clientY };
		placeDropChip();

		// Dragover fires continuously, and the board is expensive to redraw, so only a
		// change of time or court causes one.
		setDropPreview((current) =>
			current &&
			current.startOffset === next.startOffset &&
			current.columnCourtId === next.columnCourtId
				? current
				: next,
		);
	};

	const handleCellsDrop = (event) => {
		if (!isDraggingOntoBoard) return;

		const target = locateDrop(event);
		setDropPreview(null);
		if (!target) return;

		onDropOnBoard(event, activeDay, target.columnCourtId, target.startTime, target.endTime);
	};

	const handleCellsDragLeave = (event) => {
		if (!event.currentTarget.contains(event.relatedTarget)) setDropPreview(null);
	};

	// A drag that ends anywhere else leaves no drop to clear this.
	if (!isDraggingOntoBoard && dropPreview) setDropPreview(null);

	// The other matches of the teams being dragged, so that clashes and rest can be seen
	// while the decision is being made. The dragged entry's own block is excluded.
	const linkedFixture = draggedEntry ? fixturesById[draggedEntry.fixtureId] : draggedFixture;
	const linkedKeys = isDraggingOntoBoard && linkedFixture ? getTeams(linkedFixture).map((team) => team.key) : [];
	const linkedEntryIds = new Set(
		dayEntries
			.filter((entry) => {
				const other = entry.type === 'fixture' && entry.id !== draggedEntry?.id ? fixturesById[entry.fixtureId] : null;
				return other && getTeams(other).some((team) => linkedKeys.includes(team.key));
			})
			.map((entry) => entry.id),
	);

	// True when a click is the organiser's own and not the tail of a drag.
	const takeClick = () => !suppressClickRef.current;

	const topFor = (startOffset) => startOffset * PX_PER_MINUTE;
	const heightFor = (startOffset, endOffset) => (endOffset - startOffset) * PX_PER_MINUTE;
	const resizingEntryId = gesture?.kind === 'resize' ? gesture.entryId : null;
	const labelEvery = Math.max(1, Math.ceil(TIME_LABEL_MIN_GAP_PX / (axis.slotMinutes * PX_PER_MINUTE)));

	if (schedule.courts.length === 0) {
		return (
			<div className="schedule-board-empty">
				<h3>Add courts or fields to begin</h3>
				<p>The schedule days have been created from your tournament dates. Add at least one court in Set up, then place fixtures here or use Auto-schedule.</p>
				{canEdit && (
					<button type="button" className="schedule-board-empty-action" onClick={onOpenSetUp}>
						Open Set up
					</button>
				)}
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
								title="Set which divisions play on this court in Set up">
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

				{/* The whole board is the drop target, not the columns under it: a drop near a
				    match lands on the match's block, which sits on top of the column. */}
				<div
					ref={cellsRef}
					className="schedule-grid-cells"
					onDragOver={handleCellsDragOver}
					onDrop={handleCellsDrop}
					onDragLeave={handleCellsDragLeave}
					style={{
						gridTemplateColumns: gridColumns,
						// One row, the height of the day. It is also the pixel the entry positions
						// below are measured in, so it can't be a number only the browser knows.
						gridTemplateRows: `${axisMinutes * PX_PER_MINUTE}px`,
						'--schedule-grid-line-gap': `${axis.slotMinutes * PX_PER_MINUTE}px`,
					}}>
					<div className="schedule-grid-time" style={{ gridColumn: 1, gridRow: 1 }}>
						{timeSlots.map((time, rowIndex) =>
							rowIndex % labelEvery === 0 ? (
								<span key={time} className="schedule-grid-time-label" style={{ top: `${rowIndex * axis.slotMinutes * PX_PER_MINUTE}px` }}>
									{time}
								</span>
							) : null,
						)}
					</div>
					{schedule.courts.map((court, columnIndex) => (
						<div
							key={court.id}
							data-court-id={court.id}
							className={`schedule-grid-column${canEdit && isActiveDayEnabled ? ' is-open' : ''}`}
							style={{ gridColumn: columnIndex + 2, gridRow: 1 }}
							onClick={(event) => {
								if (!takeClick() || !canEdit || !isActiveDayEnabled) return;

								onOpenSlot(activeDay, court.id, minutesToTime(dayStartMinutes + readPointerMinutes(event.clientY)));
							}}
							onPointerDown={(event) => beginCreate(event, court.id)}
						/>
					))}

					{placedEntries.map((item) => {
						const { entry, courtIndex } = item;
						// Mid-resize the block follows the pointer while the stored entry is
						// still the old one — the write happens once, on pointerup, through
						// the validator. Until then this is a preview and nothing more.
						const preview = resizingEntryId === entry.id ? gesture : item;
						const height = heightFor(preview.startOffset, preview.endOffset);
						const sizeClass = height < TINY_ENTRY_HEIGHT ? ' compact tiny' : height < COMPACT_ENTRY_HEIGHT ? ' compact' : '';

						return (
							// Draggable and clickable at once: dragging moves the entry, clicking
							// opens its popover. The payload is the entry id rather than the
							// fixture id, which is how the cell tells a move from a placement.
							<button
								key={entry.id}
								type="button"
								data-entry-id={entry.id}
								className={`schedule-grid-entry ${entry.type}${sizeClass}${
									resizingEntryId === entry.id ? ' resizing' : ''
								}${highlightEntryIds.includes(entry.id) ? ' highlighted' : ''}${
									linkedEntryIds.has(entry.id) ? ' linked' : ''
								}${draggingEntryId === entry.id ? ' is-being-dragged' : ''}`}
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
									// Where on the block it was picked up, so it doesn't jump to the pointer.
									dropGrabRef.current = (event.clientY - event.currentTarget.getBoundingClientRect().top) / PX_PER_MINUTE;
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

					{/* Where the thing being dragged would land, at its true time and length. */}
					{dropPreview && (
						<div
							className={`schedule-grid-draft${
								dropPreview.problem?.severity === 'error' ? ' is-refused' : dropPreview.problem ? ' is-warned' : ''
							}`}
							style={{
								gridColumn:
									dropPreview.courtId === null
										? `2 / span ${schedule.courts.length}`
										: `${schedule.courts.findIndex((court) => court.id === dropPreview.courtId) + 2} / span 1`,
								gridRow: '1 / -1',
								top: `${topFor(dropPreview.startOffset)}px`,
								height: `${heightFor(dropPreview.startOffset, dropPreview.endOffset)}px`,
							}}
						/>
					)}
				</div>
			</div>

			{/* Beside the pointer, because that is where the organiser is looking. On the
			    document body so that nothing in the modal can clip it. */}
			{dropPreview &&
				createPortal(
					<div
						ref={dropChipRef}
						className={`schedule-drop-chip${
							dropPreview.problem?.severity === 'error' ? ' is-refused' : dropPreview.problem ? ' is-warned' : ''
						}`}>
						<strong>
							{dropPreview.startTime} - {dropPreview.endTime}
						</strong>
						{dropPreview.problem && <span>{dropPreview.problem.message}</span>}
					</div>,
					document.body,
				)}

			{unplaceableEntries.length > 0 && (
				<div className="schedule-grid-unplaceable">
					<h4>Not shown on the grid</h4>
					<p>
						{unplaceableEntries.length === 1 ? 'This match has' : 'These matches have'} nowhere on the grid to be
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
				<h3>Nothing scheduled on this day yet</h3>
				<p>Place fixtures on the board, add a break, or use Auto-schedule.</p>
			</div>
		);
	}

	return (
		<div className="schedule-list-day">
			{dayEntries.map((entry) => (
				<button
					key={entry.id}
					type="button"
					data-entry-id={entry.id}
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

// The shell of anything that opens on the board: beside what it is about, kept on screen,
// and following it if the board scrolls. A bottom sheet on a phone, which the stylesheet
// decides. A press outside it is the caller's to answer, since an edit may be refused.
function BoardPopover({ title, getAnchor, onClose, onDismiss, autoFocusRef, children }) {
	const popoverRef = useRef(null);
	const closeRef = useRef(null);

	useLayoutEffect(() => {
		const place = () => {
			const popoverNode = popoverRef.current;
			const anchor = getAnchor();
			if (!popoverNode || !anchor) return;

			const margin = 8;
			const { offsetWidth: width, offsetHeight: height } = popoverNode;
			let left = anchor.right + margin;

			if (left + width > window.innerWidth - margin) left = anchor.left - width - margin;
			if (left < margin) left = Math.max(margin, window.innerWidth - width - margin);

			popoverNode.style.left = `${left}px`;
			popoverNode.style.top = `${Math.max(margin, Math.min(anchor.top, window.innerHeight - height - margin))}px`;
		};

		place();
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);

		return () => {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	});

	// Subscribed once. onDismiss reads the latest form through the commit ref.
	const dismissRef = useRef(onDismiss);
	useEffect(() => {
		dismissRef.current = onDismiss;
	});

	useEffect(() => {
		(autoFocusRef?.current ?? closeRef.current)?.focus();

		const onPointerDown = (event) => {
			if (popoverRef.current?.contains(event.target)) return;
			// A confirmation or message floating over the modal is not "outside".
			if (!event.target.closest?.('.schedule-maker-modal')) return;

			dismissRef.current();
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
		// Focus moves in once, on opening.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<section ref={popoverRef} className="schedule-popover" role="dialog" aria-label={title}>
			<div className="schedule-popover-head">
				<h3>{title}</h3>
				<button type="button" ref={closeRef} className="schedule-sheet-close" onClick={onClose} aria-label={`Close ${title}`}>
					<Icon name="exit" />
				</button>
			</div>
			<div className="schedule-panel schedule-popover-body">{children}</div>
		</section>
	);
}

function entryToForm(entry) {
	return {
		day: entry.day,
		courtId: entry.courtId ?? '',
		startTime: entry.startTime,
		length: String(timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime)),
		title: entry.title || '',
		officials: entry.officials || '',
		notes: entry.notes || '',
	};
}

// Edits a match or break where it sits. Each field applies as it is left, and a select as
// it is changed. A refusal gives its reason here and leaves the entry alone, with what was
// typed still in the field to correct.
function EntryPopover({ entry, schedule, fixturesById, canEdit, commitRef, getAnchor, onApply, onRemove, onClose, onDismiss }) {
	const isBreak = entry.type === 'break';
	const fixture = isBreak ? null : fixturesById[entry.fixtureId];
	const [form, setForm] = useState(() => entryToForm(entry));
	const [problem, setProblem] = useState(null);
	// Times can change underneath this, through a resize or a move on the board.
	const [syncedEntry, setSyncedEntry] = useState(entry);
	const firstFieldRef = useRef(null);

	if (entry !== syncedEntry) {
		setSyncedEntry(entry);
		setForm(entryToForm(entry));
	}

	const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

	// True unless the edit was refused. A form with nothing changed has nothing to apply.
	const commit = (next = form) => {
		if (!canEdit) return true;

		const current = entryToForm(entry);
		if (Object.keys(next).every((key) => String(next[key]) === String(current[key]))) {
			setProblem(null);
			return true;
		}

		const length = Number(next.length);
		if (!(length >= MIN_MATCH_MINUTES)) {
			setProblem({ severity: 'error', message: `Enter a length of at least ${MIN_MATCH_MINUTES} minutes` });
			return false;
		}
		if (!next.startTime) {
			setProblem({ severity: 'error', message: 'Enter a start time' });
			return false;
		}
		if (timeToMinutes(next.startTime) + length >= 24 * 60) {
			setProblem({ severity: 'error', message: 'That runs past midnight' });
			return false;
		}

		const result = onApply(entry, {
			...entry,
			day: next.day,
			courtId: next.courtId === '' ? null : next.courtId,
			startTime: next.startTime,
			endTime: minutesToTime(timeToMinutes(next.startTime) + length),
			title: next.title,
			officials: next.officials,
			notes: next.notes,
		});

		setProblem(result);

		return result?.severity !== 'error';
	};

	useEffect(() => {
		commitRef.current = commit;
	});

	// A select has no half-finished state, so it applies straight away.
	const changeNow = (key, value) => {
		const next = { ...form, [key]: value };

		setForm(next);
		commit(next);
	};

	const fieldProps = (key) => ({
		value: form[key],
		onChange: (event) => set(key, event.target.value),
		onBlur: () => commit(),
		onKeyDown: (event) => {
			if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
				event.preventDefault();
				commit();
			}
		},
	});

	const title = isBreak ? form.title || 'Break' : fixture ? `${fixture.team1} vs ${fixture.team2}` : 'Match';

	if (!canEdit) {
		return (
			<BoardPopover title={title} getAnchor={getAnchor} onClose={onClose} onDismiss={onDismiss}>
				<p>
					{entry.startTime} - {entry.endTime}, {getCourtName(schedule, entry.courtId)}
				</p>
				{fixture && <p>{getEntrySecondary(entry, fixturesById)}</p>}
				{getEntryOfficials(entry) && <p>{getEntryOfficials(entry)}</p>}
				{entry.notes && <p>{entry.notes}</p>}
			</BoardPopover>
		);
	}

	return (
		<BoardPopover title={title} getAnchor={getAnchor} onClose={onClose} onDismiss={onDismiss} autoFocusRef={isBreak ? firstFieldRef : undefined}>
			{fixture && <small className="schedule-generator-note">{getEntrySecondary(entry, fixturesById)}</small>}
			<div className="schedule-form-grid">
				{isBreak && (
					<label className="full">
						<span>Title</span>
						<input type="text" ref={firstFieldRef} {...fieldProps('title')} />
					</label>
				)}
				<label>
					<span>Start</span>
					<input type="time" {...fieldProps('startTime')} />
				</label>
				<label>
					<span>Length (min)</span>
					<input type="number" min={MIN_MATCH_MINUTES} step="5" {...fieldProps('length')} />
				</label>
				<label>
					<span>{isBreak ? 'Courts' : 'Court'}</span>
					<select value={form.courtId} onChange={(event) => changeNow('courtId', event.target.value)}>
						{isBreak && <option value="">All courts</option>}
						{schedule.courts.map((court) => (
							<option key={court.id} value={court.id}>
								{court.name}
							</option>
						))}
					</select>
				</label>
				{schedule.days.length > 1 && (
					<label>
						<span>Day</span>
						<select value={form.day} onChange={(event) => changeNow('day', event.target.value)}>
							{schedule.days.map((day) => (
								<option key={day.id} value={day.date} disabled={day.enabled === false}>
									{day.label}
									{day.enabled === false ? ' (off)' : ''}
								</option>
							))}
						</select>
					</label>
				)}
				{!isBreak && (
					<label className="full">
						<span>Officials</span>
						<input type="text" placeholder="Assign referee or officiating crew" {...fieldProps('officials')} />
					</label>
				)}
				<label className="full">
					<span>Notes</span>
					<textarea rows="2" {...fieldProps('notes')} />
				</label>
			</div>
			{problem && (
				<small className={problem.severity === 'error' ? 'schedule-setup-error' : 'schedule-setup-warning'} role="alert">
					{problem.message}.
				</small>
			)}
			<button type="button" className="schedule-popover-remove" onClick={() => onRemove(entry)}>
				Remove from schedule
			</button>
		</BoardPopover>
	);
}

// Choosing what goes in an empty time. The fixture brings its own length, unless a range
// was dragged out on the board, which keeps its drawn one.
function FixturePickerPopover({ draft, schedule, fixtures, divisions, getAnchor, onAssign, onClose, onDismiss }) {
	return (
		<BoardPopover title="Place a fixture" getAnchor={getAnchor} onClose={onClose} onDismiss={onDismiss}>
			<small className="schedule-generator-note">
				{getCourtName(schedule, draft.courtId)}, {draft.endTime ? `${draft.startTime} - ${draft.endTime}` : draft.startTime}
			</small>
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
						<p>No unscheduled fixtures match your filters.</p>
					</div>
				)}
			</div>
		</BoardPopover>
	);
}

// What Auto-schedule is going to work from, in a line.
function describeSetUp(schedule) {
	const { dayStartTime, dayEndTime } = schedule.settings;
	const courts = schedule.courts.length;

	return `${courts} court${courts === 1 ? '' : 's'}, ${dayStartTime} - ${dayEndTime}, ${getFixtureDefaultLength(null, schedule.settings)}-minute matches`;
}

// Over the right of the board, and the whole of it below 900px or when wide. Inside the modal's own
// focus trap. Its close button takes focus on opening, so that Tab moves through what is
// in the sheet and Escape closes it first.
function ScheduleSheet({ title, wide = false, onClose, children }) {
	const closeRef = useRef(null);

	useEffect(() => {
		closeRef.current?.focus();
	}, []);

	return (
		<section className={`schedule-sheet${wide ? ' is-wide' : ''}`} aria-label={title}>
			<div className="schedule-sheet-head">
				<h3>{title}</h3>
				<button type="button" ref={closeRef} className="schedule-sheet-close" onClick={onClose} aria-label={`Close ${title}`}>
					<Icon name="exit" />
				</button>
			</div>
			<div className="schedule-panel schedule-sheet-body">{children}</div>
		</section>
	);
}

const GRID_LINE_CHOICES = [15, 30, 60];
const MIN_MATCH_MINUTES = 5;

// A saved spacing outside the choices, such as a grid set to a 50-minute match length,
// stays selectable until it is changed.
function GridLinesControl({ value, onChange }) {
	const choices = GRID_LINE_CHOICES.includes(value) ? GRID_LINE_CHOICES : [...GRID_LINE_CHOICES, value].sort((a, b) => a - b);

	return (
		<label className="schedule-grid-lines">
			<span>Grid lines every</span>
			<select value={value} onChange={(event) => onChange(Number(event.target.value))}>
				{choices.map((minutes) => (
					<option key={minutes} value={minutes}>
						{minutes} min
					</option>
				))}
			</select>
		</label>
	);
}

// What the organiser has to work with. Both ways of filling the board read it, so it
// lives here once. Fields keep what is being typed and only send what makes sense, so
// half-typed hours never reach the board.
function SetUpSheet({
	schedule,
	rounds,
	divisions,
	focusCourtId,
	courtDraft,
	onCourtDraftChange,
	onAddCourt,
	onRemoveCourt,
	onSetCourtDivisions,
	onToggleDay,
	onSetHours,
	onSetMatchLengths,
	onClose,
}) {
	const [hours, setHours] = useState({ start: schedule.settings.dayStartTime, end: schedule.settings.dayEndTime });
	const [matchLength, setMatchLength] = useState(String(getFixtureDefaultLength(null, schedule.settings)));
	const roundDurations = schedule.settings.generator?.roundDurations ?? {};
	const bodyRef = useRef(null);

	const hoursValid = isTimeRangeValid(hours.start, hours.end);
	const matchLengthValid = Number(matchLength) >= MIN_MATCH_MINUTES;

	const changeHours = (next) => {
		setHours(next);
		if (isTimeRangeValid(next.start, next.end)) onSetHours(next.start, next.end);
	};

	const changeMatchLength = (value) => {
		setMatchLength(value);
		if (Number(value) >= MIN_MATCH_MINUTES) onSetMatchLengths({ fixtureDurationMinutes: Number(value) });
	};

	// Blank gives the round back to the main match length.
	const changeRoundLength = (round, value) => {
		const next = { ...roundDurations };

		if (Number(value) >= MIN_MATCH_MINUTES) next[round] = Number(value);
		else delete next[round];

		onSetMatchLengths({ roundDurations: next });
	};

	const toggleDivision = (court, divisionId) => {
		const selected = Array.isArray(court.divisions) ? court.divisions : [];

		onSetCourtDivisions(court.id, selected.includes(divisionId) ? selected.filter((id) => id !== divisionId) : [...selected, divisionId]);
	};

	useEffect(() => {
		if (focusCourtId) bodyRef.current?.querySelector(`[data-setup-court="${focusCourtId}"]`)?.scrollIntoView({ block: 'center' });
	}, [focusCourtId]);

	return (
		<ScheduleSheet title="Set up" onClose={onClose}>
			<div ref={bodyRef} className="schedule-setup">
				<div className="schedule-form-grid">
					<label>
						<span>Day starts</span>
						<input type="time" value={hours.start} onChange={(event) => changeHours({ ...hours, start: event.target.value })} />
					</label>
					<label>
						<span>Day ends</span>
						<input type="time" value={hours.end} onChange={(event) => changeHours({ ...hours, end: event.target.value })} />
					</label>
				</div>
				{hoursValid ? (
					<small className="schedule-generator-note">These hours apply to every day.</small>
				) : (
					<small className="schedule-setup-error" role="alert">
						The day must end after it starts. The board keeps its last valid hours until then.
					</small>
				)}

				<div className="schedule-panel-section">
					<h4>Match length</h4>
					<label className="schedule-generator-option">
						<span className="schedule-generator-round-name">Default</span>
						<input
							type="number"
							className="schedule-generator-value"
							min={MIN_MATCH_MINUTES}
							step="5"
							aria-label="Default match length in minutes"
							value={matchLength}
							onChange={(event) => changeMatchLength(event.target.value)}
						/>
						<span className="schedule-generator-unit">min</span>
					</label>
					{!matchLengthValid && (
						<small className="schedule-setup-error" role="alert">
							Enter at least {MIN_MATCH_MINUTES} minutes.
						</small>
					)}
					{rounds.length > 1 && (
						<details className="schedule-generator-rounds" open={Object.keys(roundDurations).length > 0}>
							<summary>By round</summary>
							{rounds.map((round) => (
								<label key={round} className="schedule-generator-option">
									<span className="schedule-generator-round-name">{round}</span>
									<input
										type="number"
										className="schedule-generator-value"
										min={MIN_MATCH_MINUTES}
										step="5"
										aria-label={`${round} match length in minutes`}
										placeholder={matchLength}
										defaultValue={roundDurations[round] ?? ''}
										onChange={(event) => changeRoundLength(round, event.target.value)}
									/>
									<span className="schedule-generator-unit">min</span>
								</label>
							))}
							<small className="schedule-generator-note">Blank uses the default.</small>
						</details>
					)}
					<small className="schedule-generator-note">
						New matches take this length, whether placed by hand or by Auto-schedule. Drag a match&apos;s edge to change just that match.
					</small>
				</div>

				<div className="schedule-panel-section">
					<h4>Courts &amp; Fields</h4>
					<div className="schedule-court-list">
						{schedule.courts.length === 0 && <p>No courts added yet.</p>}
						{schedule.courts.map((court) => {
							const selected = Array.isArray(court.divisions) ? court.divisions : [];
							const placedOnCourt = schedule.entries.filter((entry) => entry.courtId === court.id).length;

							return (
								<div key={court.id} className="schedule-setup-court" data-setup-court={court.id}>
									<div className="schedule-court-row">
										<span>{court.name}</span>
										<button
											type="button"
											className="schedule-court-remove"
											onClick={() => onRemoveCourt(court.id)}
											aria-label={`Remove ${court.name}`}
											title={placedOnCourt > 0 ? `${placedOnCourt} scheduled here` : 'Remove'}>
											Remove
										</button>
									</div>
									{divisions.length > 1 && (
										<details open={court.id === focusCourtId}>
											<summary>{courtDivisionLabel(court, divisions) || 'Any division'}</summary>
											<div className="schedule-court-division-list">
												{divisions.map((division) => (
													<label key={division.id} className="schedule-court-division-option">
														<input
															type="checkbox"
															checked={selected.includes(division.id)}
															onChange={() => toggleDivision(court, division.id)}
														/>
														<span>{division.name}</span>
													</label>
												))}
											</div>
											<small className="schedule-generator-note">Selecting nothing means the court takes any division.</small>
										</details>
									)}
								</div>
							);
						})}
					</div>
					<div className="schedule-inline-form">
						<input
							type="text"
							value={courtDraft}
							onChange={(event) => onCourtDraftChange(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== 'Enter') return;
								event.preventDefault();
								onAddCourt();
							}}
							placeholder="Add a court or field"
							aria-label="Add a court or field"
						/>
						<button type="button" onClick={onAddCourt}>
							Add
						</button>
					</div>
				</div>

				<div className="schedule-panel-section">
					<h4>Days</h4>
					{schedule.days.map((day) => (
						<label key={day.id} className="schedule-generator-toggle">
							<input type="checkbox" checked={day.enabled !== false} onChange={() => onToggleDay(day.id)} />
							<span>
								{day.label}, {formatDateLabel(day.date)}
							</span>
						</label>
					))}
					<small className="schedule-generator-note">A day that is off stays in the tournament, but nothing can be scheduled on it.</small>
				</div>
			</div>
		</ScheduleSheet>
	);
}

// Where the printed pages break, edited while the schedule is still a draft. Full size,
// because the editor is a table of courts across time. It is the same component the live
// print route uses — see SchedulePrintLayoutEditor — so what an organiser arranges here
// is already the tournament's saved layout once the schedule is committed.
//
// No save button: this stages into the modal's own schedule.print, and the modal's existing
// save flow commits it along with everything else. Print still pops out to a standalone
// document, because the modal is an overlay over the app rather than a clean sheet of paper.
function PrintSheet({ schedule, fixturesById, canEdit, onChange, onPrint, onClose }) {
	const [type, setType] = useState('grid');

	return (
		<ScheduleSheet title="Print" wide onClose={onClose}>
			{/* is-on-light: this toggle sits on the sheet, not on the print route's
			    --main-color toolbar, so it takes the app's normal polarity: selected is blue. */}
			<div className="schedule-print-sheet-bar">
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
				<button type="button" className="schedule-print-action is-primary" onClick={() => onPrint(type)}>
					Print this layout
				</button>
			</div>

			{canEdit && (
				<>
					{/* This sheet has no Save of its own, and an organiser who has just moved
					    a page break has no way to know that without being told. */}
					<p className="schedule-print-staged-note">
						Page breaks are staged with the rest of your changes. Use <strong>Save Schedule</strong> to keep them.
					</p>

					<SchedulePrintLayoutEditor
						type={type}
						schedule={schedule}
						fixturesById={fixturesById}
						layout={schedule.print?.[type] ?? null}
						onChange={(nextLayout) => onChange(type, nextLayout)}
					/>
				</>
			)}
		</ScheduleSheet>
	);
}

// One generator rule or preference: a checkbox, an optional value beside it, and
// a hover tooltip for anything the label cannot say in a few words. The longer
// explanation lives in the help entry for this modal.
function GeneratorOption({ label, checked, onToggle, hint, children }) {
	return (
		<div className="schedule-generator-option">
			<label className="schedule-generator-toggle">
				<input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} />
				<span>{label}</span>
			</label>
			{children}
			{hint && <Tooltip message={hint} />}
		</div>
	);
}

// Only rules for filling the board. What it has to work with comes from Set up.
function AutoScheduleSheet({ schedule, draft, onChange, onGenerate, onOpenSetUp, onClose }) {
	const set = (key) => (value) => onChange({ ...draft, [key]: value });
	const matchLength = getFixtureDefaultLength(null, schedule.settings);
	const hasCourts = schedule.courts.length > 0;

	return (
		<ScheduleSheet title="Auto-schedule" onClose={onClose}>
			<p>Fills the board using your set up. Breaks are kept. Fixtures already on the board are replaced.</p>
			<div className="schedule-panel-section">
				<div className="schedule-panel-section-head">
					<p>{describeSetUp(schedule)}</p>
					<button type="button" className="schedule-panel-section-action" onClick={onOpenSetUp}>
						Edit
					</button>
				</div>
				{!hasCourts && (
					<small className="schedule-setup-error" role="alert">
						Add at least one court in Set up first.
					</small>
				)}
			</div>

			<div className="schedule-panel-section">
				<GeneratorOption
					label="Minimum rest"
					checked={draft.restEnabled}
					onToggle={set('restEnabled')}
					hint="The gap a team gets between two of its own matches on the same day. Off allows back-to-back matches.">
					<input
						type="number"
						className="schedule-generator-value"
						min="0"
						step="5"
						aria-label="Minimum rest in minutes"
						disabled={!draft.restEnabled}
						value={draft.restMinutes ?? matchLength}
						onChange={(event) => set('restMinutes')(event.target.value)}
					/>
					<span className="schedule-generator-unit">min</span>
				</GeneratorOption>
				<GeneratorOption
					label="Break before knockout rounds"
					checked={draft.knockoutGapEnabled}
					onToggle={set('knockoutGapEnabled')}
					hint="Time between the end of one round and the start of each knockout round. Knockout teams aren't known in advance, so minimum rest can't cover this.">
					<input
						type="number"
						className="schedule-generator-value"
						min="0"
						step="5"
						aria-label="Break before knockout rounds in minutes"
						disabled={!draft.knockoutGapEnabled}
						value={draft.knockoutGapMinutes ?? matchLength}
						onChange={(event) => set('knockoutGapMinutes')(event.target.value)}
					/>
					<span className="schedule-generator-unit">min</span>
				</GeneratorOption>
				<GeneratorOption
					label="Bend rules to fit every fixture"
					checked={draft.fitAll}
					onToggle={set('fitAll')}
					hint="Shortens rest or a knockout break, or exceeds the daily limit, only where a fixture has nowhere else to go, as few times as possible. Every bend is listed afterwards."
				/>
				<GeneratorOption
					label="Assign officials automatically"
					checked={draft.assignOfficials}
					onToggle={set('assignOfficials')}
					hint="One team per match from the same division, never while it is playing. Off keeps any officials already entered."
				/>
			</div>

			<details className="schedule-panel-section schedule-generator-rounds">
				<summary>More rules (6)</summary>
				<GeneratorOption
					label="Max matches per team per day"
					checked={draft.maxPerDayEnabled}
					onToggle={set('maxPerDayEnabled')}
					hint="The most matches one team plays on a single day.">
					<input
						type="number"
						className="schedule-generator-value"
						min="1"
						step="1"
						aria-label="Maximum matches per team per day"
						disabled={!draft.maxPerDayEnabled}
						value={draft.maxMatchesPerDay}
						onChange={(event) => set('maxMatchesPerDay')(event.target.value)}
					/>
				</GeneratorOption>
				<GeneratorOption
					label="Longest wait between matches"
					checked={draft.maxWaitEnabled}
					onToggle={set('maxWaitEnabled')}
					hint="The most time a team should wait between two of its matches on the same day. Teams near the limit play first; any wait over it is reported.">
					<input
						type="number"
						className="schedule-generator-value"
						min="0"
						step="5"
						aria-label="Longest wait in minutes"
						disabled={!draft.maxWaitEnabled}
						value={draft.maxWaitMinutes}
						onChange={(event) => set('maxWaitMinutes')(event.target.value)}
					/>
					<span className="schedule-generator-unit">min</span>
				</GeneratorOption>
				<GeneratorOption
					label="Run past the day's end time"
					checked={draft.allowOverrun}
					onToggle={set('allowOverrun')}
					hint="Last resort: adds time after the end of the final day, only as much as needed."
				/>
				<GeneratorOption label="Keep each pool on one court" checked={draft.courtAffinity} onToggle={set('courtAffinity')} />
				<GeneratorOption label="Keep each court on one division" checked={draft.groupDivisions} onToggle={set('groupDivisions')} />
				<GeneratorOption
					label="Spread matches evenly across days"
					checked={draft.spreadDays}
					onToggle={set('spreadDays')}
					hint="Off finishes as early as possible, filling the first day first."
				/>
			</details>

			<button type="button" className="primary full-width" onClick={onGenerate} disabled={!hasCourts}>
				Auto-schedule
			</button>
		</ScheduleSheet>
	);
}

// What the last generation placed, what it had to bend and what it left out.
// Each bent rule can highlight its matches on the board.
function GenerationReport({ report, multiDay, onShowEntries, onDismiss }) {
	const bendMessages = new Set(report.ruleBreaks.map((group) => group.message));
	const otherWarnings = report.warnings.filter((warning) => !bendMessages.has(warning));
	const clean = report.placed === report.total && report.ruleBreaks.length === 0 && otherWarnings.length === 0;

	return (
		<div className={`schedule-generation-report${clean ? ' is-clean' : ''}`} role="status">
			<div className="schedule-panel-section-head">
				<h4>Generation Report</h4>
				<button type="button" className="schedule-panel-section-action" onClick={onDismiss}>
					Dismiss
				</button>
			</div>
			<p>
				{report.placed} of {report.total} fixtures scheduled
				{report.finish
					? `, finishing ${multiDay ? `${formatDateLabel(report.finish.slice(0, 10))}, ` : ''}${report.finish.slice(11)}`
					: ''}.
				{clean ? ' No rules had to bend.' : ''}
			</p>
			{report.ruleBreaks.length > 0 && (
				<ul>
					{report.ruleBreaks.map((group) => (
						<li key={group.rule}>
							<span>
								{group.message}
								{group.teams.length > 0 && <small> {group.teams.join(', ')}</small>}
							</span>
							<button type="button" className="schedule-panel-section-action" onClick={() => onShowEntries(group.entryIds)}>
								Show
							</button>
						</li>
					))}
				</ul>
			)}
			{otherWarnings.length > 0 && (
				<ul>
					{otherWarnings.map((warning) => (
						<li key={warning}>
							<span>{warning}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
