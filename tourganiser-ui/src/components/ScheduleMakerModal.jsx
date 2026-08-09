import React, { startTransition, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import { useMessage } from '../MessageContext';
import { useConfirm } from './ConfirmDialog';
import { exportSchedulePdf } from '../utils/scheduleExport';
import { generateAutomaticSchedule } from '../utils/scheduleGenerator';
import {
	addMinutesToTime,
	buildFixtureIndex,
	buildTimeSlots,
	calculateScheduledStats,
	compareTimes,
	createBreakEntry,
	createFixtureEntry,
	formatDateLabel,
	getCourtName,
	getDayBounds,
	getDayEntries,
	getEntrySlotSpan,
	getScheduleForTournament,
	getUnscheduledFixtures,
	normaliseFixtures,
	removeScheduleEntry,
	serialiseScheduleForSave,
	sortScheduleEntries,
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
	const [breakDraft, setBreakDraft] = useState(null);
	const [courtDraft, setCourtDraft] = useState('');
	const [generatorDraft, setGeneratorDraft] = useState(() => ({
		courtCount: Math.max(1, initialSchedule.courts.length || 2),
		dailyStartTime: initialSchedule.settings.dayStartTime,
		dailyEndTime: initialSchedule.settings.dayEndTime,
		fixtureDurationMinutes: initialSchedule.settings.slotMinutes,
	}));
	const [entryForm, setEntryForm] = useState(null);
	const exportGridRef = useRef(null);
	const exportListRef = useRef(null);
	const initialScheduleRef = useRef(null);
	const [schedule, dispatch] = useReducer(scheduleReducer, initialSchedule);
	const deferredSearch = useDeferredValue(fixtureSearch);

	useEffect(() => {
		if (!isOpen) return;

		document.body.classList.add('noscroll');
		return () => document.body.classList.remove('noscroll');
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

	const handleDropFixture = (event, day, courtId, startTime) => {
		event.preventDefault();
		const fixtureId = event.dataTransfer.getData('text/plain');
		const fixture = fixturesById[fixtureId];
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

	const handleExport = async (type) => {
		try {
			await exportSchedulePdf({
				rootElement: type === 'grid' ? exportGridRef.current : exportListRef.current,
				filename: `${tournamentName}-${type}-schedule.pdf`.replace(/\s+/g, '-').toLowerCase(),
				orientation: type === 'grid' ? 'landscape' : 'portrait',
			});
		} catch {
			showMessage('Failed to export the schedule PDF.', 'error');
		}
	};

	return (
		<div className="modal-backdrop schedule-maker-backdrop" role="presentation" onClick={handleClose}>
			{saving && <LoadingScreen />}
			<div
				className="schedule-maker-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="schedule-maker-title"
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
						<button type="button" onClick={() => handleExport('grid')}>
							Export Grid PDF
						</button>
						<button type="button" onClick={() => handleExport('list')}>
							Export List PDF
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
											onDragStart={(event) => event.dataTransfer.setData('text/plain', fixture.id)}>
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
								onSelectEntry={openEntryEditor}
								onOpenSlot={handleOpenSlotPicker}
								onDropFixture={handleDropFixture}
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

				<div className="schedule-export-root" ref={exportGridRef}>
					<ScheduleExportPages type="grid" schedule={schedule} fixturesById={fixturesById} tournamentName={tournamentName} />
				</div>
				<div className="schedule-export-root" ref={exportListRef}>
					<ScheduleExportPages type="list" schedule={schedule} fixturesById={fixturesById} tournamentName={tournamentName} />
				</div>
			</div>
		</div>
	);
}

function ScheduleGridView({ schedule, activeDay, fixturesById, canEdit, onSelectEntry, onOpenSlot, onDropFixture }) {
	const dayBounds = getDayBounds(schedule, activeDay);
	const slotMinutes = schedule.settings.slotMinutes;
	const timeSlots = buildTimeSlots(dayBounds.start, dayBounds.end, slotMinutes);
	const dayEntries = getDayEntries(schedule, activeDay);
	const occupiedSlots = new Set();

	dayEntries.forEach((entry) => {
		if (entry.courtId === null) {
			return;
		}

		const startIndex = timeSlots.findIndex((slot) => slot === entry.startTime);
		const span = getEntrySlotSpan(entry, slotMinutes);

		for (let offset = 0; offset < span; offset += 1) {
			const slot = timeSlots[startIndex + offset];
			if (slot) {
				occupiedSlots.add(getSlotKey(activeDay, entry.courtId, slot));
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

								return (
									<div
										key={slotKey}
										className={`schedule-grid-cell ${isOccupied ? 'occupied' : 'open'}`}
										onClick={() => !isOccupied && canEdit && onOpenSlot(activeDay, court.id, time)}
										onDragOver={(event) => !isOccupied && event.preventDefault()}
										onDrop={(event) => !isOccupied && onDropFixture(event, activeDay, court.id, time)}
									/>
								);
							})}
						</React.Fragment>
					))}

					{dayEntries.map((entry) => {
						const rowStart = Math.max(1, timeSlots.findIndex((slot) => slot === entry.startTime) + 1);
						const rowSpan = getEntrySlotSpan(entry, slotMinutes);
						const courtIndex = entry.courtId === null ? 1 : Math.max(1, schedule.courts.findIndex((court) => court.id === entry.courtId) + 1);

						return (
							<button
								key={entry.id}
								type="button"
								className={`schedule-grid-entry ${entry.type}`}
								style={{
									gridColumn: entry.courtId === null ? `2 / span ${schedule.courts.length}` : `${courtIndex + 1}`,
									gridRow: `${rowStart} / span ${rowSpan}`,
								}}
								onClick={() => onSelectEntry(entry)}>
								<div className="schedule-grid-entry-time">
									{entry.startTime} - {entry.endTime}
								</div>
								<div className="schedule-grid-entry-title">{getEntryLabel(entry, fixturesById)}</div>
								<div className="schedule-grid-entry-subtitle">{getEntrySecondary(entry, fixturesById)}</div>
							</button>
						);
					})}
				</div>
			</div>
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
			<p>Fixtures will be placed in their current generated order, with group affinity and team rest preferences applied.</p>
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
	const slots = buildTimeSlots(dayBounds.start, dayBounds.end, schedule.settings.slotMinutes);
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
