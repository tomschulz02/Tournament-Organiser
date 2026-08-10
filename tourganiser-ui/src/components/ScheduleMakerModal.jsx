import React, { startTransition, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import { useMessage } from '../MessageContext';
import { useConfirm } from './ConfirmDialog';
import { printSchedule } from '../utils/scheduleExport';
import { generateAutomaticSchedule } from '../utils/scheduleGenerator';
import {
	addMinutesToTime,
	buildFixtureIndex,
	buildGridRowTimes,
	calculateScheduledStats,
	compareTimes,
	createBreakEntry,
	createFixtureEntry,
	formatDateLabel,
	getCourtName,
	getDayBounds,
	getDayEntries,
	getScheduleForTournament,
	getUnscheduledFixtures,
	normaliseFixtures,
	removeScheduleEntry,
	serialiseScheduleForSave,
	sortScheduleEntries,
	timeToMinutes,
	upsertScheduleEntry,
	validateScheduleEntry,
} from '../utils/scheduleUtils';
import { flattenFixtures } from './tournament/fixtureUtils';

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

// A schedule spans the tournament, not a division. Divisions share the same
// physical courts, so scheduling them independently could double-book one; one
// combined entry list makes that impossible to express, because every conflict
// check runs against all of it.
//
// divisionName is set only when there is more than one division — with one, the
// label is on every row and says nothing.
function buildTournamentSchedule(tournament, divisions = []) {
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

function getEntryLabel(entry, fixturesById) {
	if (entry.type === 'break') return entry.title;

	const fixture = fixturesById[entry.fixtureId];
	if (!fixture) return 'Fixture unavailable';

	return `${fixture.team1} vs ${fixture.team2}`;
}

function getEntrySecondary(entry, fixturesById) {
	if (entry.type === 'break') {
		return entry.courtId ? 'Court-specific break' : 'Venue-wide break';
	}

	const fixture = fixturesById[entry.fixtureId];
	if (!fixture) return 'Fixture not found';

	const context = `${fixture.round} - Match ${fixture.matchNo}`;
	return fixture.divisionName ? `${fixture.divisionName} - ${context}` : context;
}

function getSlotKey(day, courtId, startTime) {
	return `${day}_${courtId}_${startTime}`;
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
	const [selectedEntryId, setSelectedEntryId] = useState(null);
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
	const [generatorDraft, setGeneratorDraft] = useState(() => ({
		courtCount: Math.max(1, initialSchedule.courts.length || 2),
		dailyStartTime: initialSchedule.settings.dayStartTime,
		dailyEndTime: initialSchedule.settings.dayEndTime,
		fixtureDurationMinutes: initialSchedule.settings.slotMinutes,
	}));
	const [entryForm, setEntryForm] = useState(null);
	const initialScheduleRef = useRef(null);
	const modalRef = useRef(null);
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
				// onSave has already shown the message; this only stops the modal
				// closing on a failed save.
				return;
			}

			initialScheduleRef.current = schedule;
			setDirty(false);
			showMessage('Schedule saved successfully.', 'success');
		} catch {
			showMessage('Failed to save the schedule. Please try again later.', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleDiscard = async () => {
		const confirmed = await confirm('Discard all unsaved schedule changes?');
		if (!confirmed) return;

		dispatch({ type: 'reset', payload: initialScheduleRef.current || initialSchedule });
		setDirty(false);
		setSelectedEntryId(null);
		setPanelMode('overview');
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
					id: `court-${schedule.courts.length + 1}`,
					name: nextName,
				},
			],
		});
		setCourtDraft('');
		markDirty();
		showMessage(`${nextName} added to the tournament schedule.`, 'success');
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

	const handleOpenSlotPicker = (day, courtId, startTime) => {
		setSelectedEntryId(null);
		setSlotDraft(createSlotDraft(day, courtId, startTime, schedule.settings.slotMinutes));
		setPanelMode('slot');
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
		markDirty();
		showMessage('Break added to the schedule.', 'success');
	};

	const handleDeleteEntry = async (entryId) => {
		const confirmed = await confirm('Delete this schedule entry?');
		if (!confirmed) return;

		dispatch({ type: 'removeEntry', payload: entryId });
		setSelectedEntryId(null);
		setPanelMode('overview');
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
		});

		replaceSchedule(result.schedule);
		setPanelMode('overview');
		setViewMode('grid');

		if (result.warnings.length > 0) {
			showMessage(result.warnings[0], 'info', 6000);
		} else {
			showMessage('Automatic schedule generated. You can edit any slot afterwards.', 'success');
		}
	};

	// Opens the browser's print dialog on the chosen layout. Save as PDF from
	// there is what replaced the immediate download.
	const handlePrint = (type) => {
		try {
			printSchedule(type);
		} catch {
			showMessage('Could not open the print dialog.', 'error');
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
			{saving && <LoadingScreen />}
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
						<button type="button" onClick={() => handlePrint('grid')}>
							Print Grid
						</button>
						<button type="button" onClick={() => handlePrint('list')}>
							Print List
						</button>
						<button type="button" className="schedule-maker-close" onClick={handleClose} aria-label="Close schedule maker">
							<Icon name="exit" />
						</button>
					</div>
				</div>

				<div className="schedule-maker-toolbar">
					<div className="schedule-maker-day-tabs" role="tablist" aria-label="Schedule days">
						{schedule.days.map((day) => (
							<button
								key={day.id}
								type="button"
								role="tab"
								className={activeDay === day.date ? 'active' : ''}
								aria-selected={activeDay === day.date}
								onClick={() => setActiveDay(day.date)}>
								{day.label}
								<span>{formatDateLabel(day.date)}</span>
							</button>
						))}
					</div>

					<div className="schedule-maker-toolbar-actions">
						<div className="schedule-view-toggle">
							<button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
								Grid View
							</button>
							<button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
								List View
							</button>
						</div>

						{canEdit && (
							<>
								<button
									type="button"
									onClick={() => {
										setBreakDraft({
											day: activeDay,
											startTime: schedule.settings.dayStartTime,
											endTime: addMinutesToTime(schedule.settings.dayStartTime, schedule.settings.slotMinutes),
											title: '',
											courtId: '',
											notes: '',
										});
										setPanelMode('break');
									}}>
									Add Break
								</button>
								<button type="button" onClick={() => setPanelMode('generate')}>
									Generate Schedule
								</button>
								<button type="button" onClick={handleDiscard} disabled={!dirty}>
									Discard
								</button>
								<button type="button" className="primary" onClick={handleSave} disabled={!dirty || saving}>
									Save Schedule
								</button>
							</>
						)}
					</div>
				</div>

				<div className="schedule-maker-layout">
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
							<div className="schedule-maker-fixture-list">
								{filteredUnscheduledFixtures.length > 0 ? (
									filteredUnscheduledFixtures.map((fixture) => (
										<button
											key={fixture.id}
											type="button"
											draggable
											className="schedule-fixture-pill"
											onDragStart={(event) => event.dataTransfer.setData('text/plain', `${FIXTURE_DRAG}${fixture.id}`)}>
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
						{viewMode === 'grid' ? (
							<ScheduleGridView
								schedule={schedule}
								activeDay={activeDay}
								fixturesById={fixturesById}
								canEdit={canEdit}
								draggingEntryId={draggingEntryId}
								onSelectEntry={openEntryEditor}
								onOpenSlot={handleOpenSlotPicker}
								onDropOnSlot={handleDropOnSlot}
								onDragEntry={setDraggingEntryId}
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
							/>
						) : panelMode === 'generate' ? (
							<GeneratorPanel draft={generatorDraft} onChange={setGeneratorDraft} onGenerate={handleGenerateSchedule} />
						) : panelMode === 'break' && breakDraft ? (
							<BreakPanel draft={breakDraft} schedule={schedule} onChange={setBreakDraft} onSave={handleCreateBreak} />
						) : panelMode === 'slot' && slotDraft ? (
							<SlotAssignmentPanel
								draft={slotDraft}
								schedule={schedule}
								fixtures={filteredUnscheduledFixtures}
								onAssign={(fixture) => handleAssignFixtureToSlot(fixture, slotDraft)}
							/>
						) : (
							<ScheduleOverviewPanel
								stats={stats}
								schedule={schedule}
								courtDraft={courtDraft}
								onCourtDraftChange={setCourtDraft}
								onAddCourt={handleAddCourt}
								canEdit={canEdit}
							/>
						)}
					</aside>
				</div>

				{/* Off screen until printed. The print stylesheet shows exactly one of
				    these, chosen by the attribute printSchedule sets on the body. */}
				<div className="schedule-export-root" data-export-view="grid">
					<ScheduleExportPages type="grid" schedule={schedule} fixturesById={fixturesById} tournamentName={tournamentName} />
				</div>
				<div className="schedule-export-root" data-export-view="list">
					<ScheduleExportPages type="list" schedule={schedule} fixturesById={fixturesById} tournamentName={tournamentName} />
				</div>
			</div>
		</div>,
		document.body
	);
}

// Where one entry sits on the grid. rowStart and rowEnd are 1-based grid lines,
// so an entry occupies rows rowStart to rowEnd - 1.
//
// courtIndex is -1 when the entry names a court that is no longer in the schedule
// — which happens the moment the court count is reduced below it. That entry has
// no column to be drawn in, and drawing it in the first one moves it silently.
// It is listed beneath the grid instead.
function locateEntry(entry, rowTimes, courts) {
	const rowStart = rowTimes.indexOf(entry.startTime) + 1;
	const rowEnd = rowTimes.indexOf(entry.endTime) + 1;
	const courtIndex = entry.courtId === null ? null : courts.findIndex((court) => court.id === entry.courtId);

	return {
		entry,
		rowStart,
		rowSpan: Math.max(1, rowEnd - rowStart),
		courtIndex,
		placeable: rowStart > 0 && rowEnd > rowStart && courtIndex !== -1,
	};
}

function ScheduleGridView({
	schedule,
	activeDay,
	fixturesById,
	canEdit,
	draggingEntryId,
	onSelectEntry,
	onOpenSlot,
	onDropOnSlot,
	onDragEntry,
}) {
	const dayBounds = getDayBounds(schedule, activeDay);
	// One more time than there are rows: the last is the day's closing boundary.
	const rowTimes = buildGridRowTimes(schedule, activeDay, dayBounds);
	const timeSlots = rowTimes.slice(0, -1);
	const dayEntries = getDayEntries(schedule, activeDay);
	const located = dayEntries.map((entry) => locateEntry(entry, rowTimes, schedule.courts));
	const placedEntries = located.filter((item) => item.placeable);
	const unplaceableEntries = located.filter((item) => !item.placeable).map((item) => item.entry);
	const occupiedSlots = new Set();
	// The same set minus the entry being dragged. A drop must respect occupancy,
	// but an entry does not block itself — otherwise a placed entry could only
	// ever be moved somewhere it does not already overlap.
	const dropBlockedSlots = new Set();

	// Still row by row and still spanning multi-row entries; only the row list it
	// walks has changed, and every placed entry now has an exact range in it.
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

	return (
		<div className="schedule-grid-shell">
			<div className="schedule-grid-header" style={{ gridTemplateColumns: `96px repeat(${schedule.courts.length}, minmax(0, 1fr))` }}>
				<div className="schedule-grid-header-time">Time</div>
				{schedule.courts.map((court) => (
					<div key={court.id} className="schedule-grid-header-court">
						{court.name}
					</div>
				))}
			</div>

			<div className="schedule-grid-body">
				<div
					className="schedule-grid-cells"
					style={{
						gridTemplateColumns: `96px repeat(${schedule.courts.length}, minmax(0, 1fr))`,
						gridTemplateRows: `repeat(${timeSlots.length}, minmax(84px, auto))`,
					}}>
					{timeSlots.map((time) => (
						<React.Fragment key={time}>
							<div className="schedule-grid-time">{time}</div>
							{schedule.courts.map((court) => {
								const slotKey = getSlotKey(activeDay, court.id, time);
								const isOccupied = occupiedSlots.has(slotKey);
								const acceptsDrop = canEdit && !dropBlockedSlots.has(slotKey);

								return (
									<div
										key={slotKey}
										className={`schedule-grid-cell ${isOccupied ? 'occupied' : 'open'}`}
										onClick={() => !isOccupied && canEdit && onOpenSlot(activeDay, court.id, time)}
										onDragOver={(event) => acceptsDrop && event.preventDefault()}
										onDrop={(event) => acceptsDrop && onDropOnSlot(event, activeDay, court.id, time)}
									/>
								);
							})}
						</React.Fragment>
					))}

					{placedEntries.map(({ entry, rowStart, rowSpan, courtIndex }) => (
						// Draggable and clickable at once: dragging moves the entry, clicking
						// opens the inspector. The payload is the entry id rather than the
						// fixture id, which is how the cell tells a move from a placement.
						<button
							key={entry.id}
							type="button"
							className={`schedule-grid-entry ${entry.type}`}
							draggable={canEdit}
							onDragStart={(event) => {
								event.dataTransfer.setData('text/plain', `${ENTRY_DRAG}${entry.id}`);
								onDragEntry(entry.id);
							}}
							onDragEnd={() => onDragEntry(null)}
							style={{
								gridColumn: entry.courtId === null ? `2 / span ${schedule.courts.length}` : `${courtIndex + 2}`,
								gridRow: `${rowStart} / span ${rowSpan}`,
							}}
							onClick={() => onSelectEntry(entry)}>
							<div className="schedule-grid-entry-time">
								{entry.startTime} - {entry.endTime}
							</div>
							<div className="schedule-grid-entry-title">{getEntryLabel(entry, fixturesById)}</div>
							<div className="schedule-grid-entry-subtitle">{getEntrySecondary(entry, fixturesById)}</div>
						</button>
					))}
				</div>
			</div>

			{unplaceableEntries.length > 0 && (
				<div className="schedule-grid-unplaceable">
					<h4>Not shown on the grid</h4>
					<p>
						{unplaceableEntries.length === 1 ? 'This entry is' : 'These entries are'} on a court that is no longer in
						the schedule. Open {unplaceableEntries.length === 1 ? 'it' : 'each one'} to move or remove{' '}
						{unplaceableEntries.length === 1 ? 'it' : 'them'}.
					</p>
					<div className="schedule-grid-unplaceable-list">
						{unplaceableEntries.map((entry) => (
							<button key={entry.id} type="button" className="schedule-fixture-pill" onClick={() => onSelectEntry(entry)}>
								<strong>{getEntryLabel(entry, fixturesById)}</strong>
								<small>
									{entry.startTime} - {entry.endTime} - {getCourtName(schedule, entry.courtId)}
								</small>
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
				<button key={entry.id} type="button" className={`schedule-list-entry ${entry.type}`} onClick={() => onSelectEntry(entry)}>
					<div className="schedule-list-time">
						{entry.startTime} - {entry.endTime}
					</div>
					<div className="schedule-list-content">
						<div className="schedule-list-title">{getEntryLabel(entry, fixturesById)}</div>
						<div className="schedule-list-meta">
							<span>{getCourtName(schedule, entry.courtId)}</span>
							<span>{getEntrySecondary(entry, fixturesById)}</span>
						</div>
						{entry.officials && <div className="schedule-list-extra">Officials: {entry.officials}</div>}
						{entry.notes && <div className="schedule-list-extra">{entry.notes}</div>}
					</div>
				</button>
			))}
		</div>
	);
}

function ScheduleOverviewPanel({ stats, schedule, courtDraft, onCourtDraftChange, onAddCourt, canEdit }) {
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
				<h4>Day Settings</h4>
				<p>
					{schedule.settings.dayStartTime} - {schedule.settings.dayEndTime} - {schedule.settings.slotMinutes} minute slots
				</p>
			</div>

			<div className="schedule-panel-section">
				<h4>Courts & Fields</h4>
				<div className="schedule-court-list">
					{schedule.courts.length > 0 ? (
						schedule.courts.map((court) => <div key={court.id}>{court.name}</div>)
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

function SlotAssignmentPanel({ draft, schedule, fixtures, onAssign }) {
	return (
		<div className="schedule-panel">
			<h3>Assign Fixture</h3>
			<p>
				{formatDateLabel(draft.day)} - {draft.startTime} - {draft.endTime}
			</p>
			<p>{getCourtName(schedule, draft.courtId)}</p>
			<div className="schedule-maker-fixture-list compact">
				{fixtures.length > 0 ? (
					fixtures.map((fixture) => (
						<button key={fixture.id} type="button" className="schedule-fixture-pill" onClick={() => onAssign(fixture)}>
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

function BreakPanel({ draft, schedule, onChange, onSave }) {
	return (
		<div className="schedule-panel">
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
							<option key={day.id} value={day.date}>
								{day.label} - {formatDateLabel(day.date)}
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

function GeneratorPanel({ draft, onChange, onGenerate }) {
	return (
		<div className="schedule-panel">
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
			<button type="button" className="primary full-width" onClick={onGenerate}>
				Generate Schedule
			</button>
		</div>
	);
}

function EntryEditorPanel({ entry, fixturesById, schedule, onChange, onSave, onDelete }) {
	const fixture = entry.type === 'fixture' ? fixturesById[entry.fixtureId] : null;

	return (
		<div className="schedule-panel">
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
							<option key={day.id} value={day.date}>
								{day.label} - {formatDateLabel(day.date)}
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

function ScheduleExportPages({ type, schedule, fixturesById, tournamentName }) {
	return (
		<>
			{schedule.days.map((day) => (
				<div key={`${type}-${day.id}`} className="schedule-export-page" data-export-page="true">
					<div className="schedule-export-header">
						<div>
							<p>Tourganiser</p>
							<h2>{tournamentName}</h2>
							<h3>Tournament Schedule</h3>
						</div>
						<div className="schedule-export-date">{formatDateLabel(day.date)}</div>
					</div>
					{type === 'grid' ? (
						<ScheduleExportGridDay schedule={schedule} day={day.date} fixturesById={fixturesById} />
					) : (
						<ScheduleExportListDay schedule={schedule} day={day.date} fixturesById={fixturesById} />
					)}
				</div>
			))}
		</>
	);
}

function ScheduleExportGridDay({ schedule, day, fixturesById }) {
	const dayBounds = getDayBounds(schedule, day);
	// The same row boundaries the on-screen grid uses, so an entry that does not
	// land on a slot boundary appears on the printed page rather than being
	// dropped from it.
	const slots = buildGridRowTimes(schedule, day, dayBounds).slice(0, -1);
	const entries = getDayEntries(schedule, day);

	return (
		<div className="schedule-export-grid">
			<div
				className="schedule-export-grid-table"
				style={{ gridTemplateColumns: `88px repeat(${schedule.courts.length}, minmax(0, 1fr))` }}>
				<div className="schedule-export-grid-head">Time</div>
				{schedule.courts.map((court) => (
					<div key={court.id} className="schedule-export-grid-head">
						{court.name}
					</div>
				))}
				{slots.map((slot) => (
					<React.Fragment key={slot}>
						<div className="schedule-export-grid-time">{slot}</div>
						{schedule.courts.map((court) => {
							const entry = entries.find((item) => item.courtId === court.id && item.startTime === slot);
							const spanningBreak = entries.find(
								(item) => item.courtId === null && compareTimes(item.startTime, slot) <= 0 && compareTimes(item.endTime, slot) > 0
							);

							return (
								<div key={`${court.id}-${slot}`} className="schedule-export-grid-cell">
									{spanningBreak ? (
										<strong>{spanningBreak.title}</strong>
									) : entry ? (
										<>
											<strong>{getEntryLabel(entry, fixturesById)}</strong>
											<span>{getEntrySecondary(entry, fixturesById)}</span>
										</>
									) : null}
								</div>
							);
						})}
					</React.Fragment>
				))}
			</div>
		</div>
	);
}

function ScheduleExportListDay({ schedule, day, fixturesById }) {
	const entries = getDayEntries(schedule, day);

	return (
		<div className="schedule-export-list">
			{entries.map((entry) => (
				<div key={entry.id} className="schedule-export-list-row">
					<div>
						<strong>
							{entry.startTime} - {entry.endTime}
						</strong>
					</div>
					<div>{getCourtName(schedule, entry.courtId)}</div>
					<div>{getEntryLabel(entry, fixturesById)}</div>
					<div>{getEntrySecondary(entry, fixturesById)}</div>
				</div>
			))}
		</div>
	);
}
