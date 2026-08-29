import { useRef, useState } from 'react';
import DivisionSelector from './DivisionSelector';
import Icon from '../Icons';
import SectionState from './SectionState';
import TeamIdentity from './TeamIdentity';
import { isNotStarted } from './tournamentStatus';
import { useConfirm } from '../ConfirmDialog';
import { useMessage } from '../../MessageContext';
import { useHelpTopic } from '../../HelpContext';
import { updateDivisionTeams } from '../../requests';
import { TEAM_NAME_MAX, parseBulkTeamNames } from '../create/divisionFormats';

// The teams in one division, in seed order.
//
// Edits accumulate locally and are sent as one request. They have to be: the
// server takes the division's whole intended team list and derives from it
// whether this is a rename or a rebuild, and a division cannot be left
// half-edited between two requests.
//
// The client invents no rule of its own. The server owns when a team may be
// edited, and a second definition here would be a competing one. What the client
// does own is the warning before a rebuild — the organiser should know the
// fixtures are about to be regenerated before they ask for it.
//
// It also declines to offer what the server will always refuse. Every control on
// this tab goes through the one PUT, which is gated on Not Started, so none of
// them is rendered once the tournament has started. That is presentation; the
// 409 is still the enforcement. See tournamentStatus.js.

// Prefixed for the same reason the schedule maker's payloads are: a bare index
// could have come from anywhere on the page.
const TEAM_DRAG = 'team:';

export default function TeamsTab({
	divisions = [],
	selectedDivisionId,
	onSelectDivision,
	creator = false,
	status,
	onChanged,
}) {
	useHelpTopic('tournament-teams');

	const confirm = useConfirm();
	const { showMessage } = useMessage();

	// The draft carries the division it belongs to, so switching division cannot
	// leave edits pointed at a division they are no longer under.
	const [draft, setDraft] = useState(null);
	const [editingKey, setEditingKey] = useState(null);
	const [editName, setEditName] = useState('');
	const [addFor, setAddFor] = useState(null);
	const [addName, setAddName] = useState('');
	const [bulkAdding, setBulkAdding] = useState(false);
	const [bulkText, setBulkText] = useState('');
	const [confirming, setConfirming] = useState(null);
	const [busy, setBusy] = useState(false);

	// Below 768px, Groups and Team List take turns rather than stacking — see
	// the icon toggle in the render. Above that width both are always visible
	// side by side and this state is simply unused.
	const [mobileTeamsView, setMobileTeamsView] = useState('groups');

	// The row being carried and the row it is over. Indices rather than keys,
	// because a move is expressed as a pair of positions.
	const [draggingIndex, setDraggingIndex] = useState(null);
	const [overIndex, setOverIndex] = useState(null);

	// A row that has never been saved has no id, so it needs a key of its own.
	const nextKey = useRef(0);

	if (divisions.length === 0) {
		return (
			<SectionState
				variant="empty"
				title="This tournament has no divisions"
				message="Teams are listed once a division has been added."
			/>
		);
	}

	const division = divisions.find((entry) => entry.id === selectedDivisionId) ?? divisions[0];
	const saved = division.teams ?? [];

	// Resolved during render, like the stage in StandingsTab: a draft belonging to
	// another division is simply not this division's list.
	const teams = draft?.divisionId === division.id ? draft.teams : saved.map(toRow);
	const dirty =
		teams.length !== saved.length ||
		teams.some((row, index) => row.id !== saved[index].id || row.name !== saved[index].name);

	// Every id in the draft came from the saved list and appears once, so a team
	// added or removed is the only way the count or the ids can move.
	const setChanged = teams.length !== saved.length || teams.some((row) => row.id === null);

	const adding = addFor === division.id;
	const editing = teams.some((row) => row.key === editingKey) ? editingKey : null;

	// One gate for the whole team list, not just the order. Adding, renaming,
	// removing and reordering all go through the same PUT, and the server refuses
	// every one of them with a 409 once the tournament has started — seeding is
	// the final tiebreak in the ranking chain, and a team set that moves under a
	// played fixture is not a smaller version of the same problem.
	//
	// Hidden rather than disabled, and hidden rather than offered-then-refused:
	// see tournamentStatus.js.
	const canEditTeams = creator && isNotStarted(status);

	const setTeams = (rows) => setDraft({ divisionId: division.id, teams: rows });

	const closeForms = () => {
		setEditingKey(null);
		setAddFor(null);
		setAddName('');
		setBulkAdding(false);
		setBulkText('');
	};

	const handleAdd = () => {
		const name = addName.trim();
		if (!name) {
			showMessage('Enter a team name.', 'error');
			return;
		}

		nextKey.current += 1;
		setTeams([...teams, { key: `new-${nextKey.current}`, id: null, name }]);
		setAddFor(null);
		setAddName('');
	};

	const handleAddBulk = () => {
		const names = parseBulkTeamNames(
			bulkText,
			teams.map((row) => row.name)
		);
		if (names.length === 0) return;

		const rows = names.map((name) => {
			nextKey.current += 1;
			return { key: `new-${nextKey.current}`, id: null, name };
		});
		setTeams([...teams, ...rows]);
		setBulkAdding(false);
		setBulkText('');
	};

	const handleEdit = (row) => {
		const name = editName.trim();
		if (!name) {
			showMessage('Enter a team name.', 'error');
			return;
		}

		setTeams(teams.map((entry) => (entry.key === row.key ? { ...entry, name } : entry)));
		setEditingKey(null);
	};

	const handleRemove = async (row) => {
		const confirmed = await confirm(`Remove ${row.name} from ${division.name}?`);
		if (!confirmed) return;

		setTeams(teams.filter((entry) => entry.key !== row.key));
	};

	const handleDiscard = () => {
		setDraft(null);
		closeForms();
	};

	// The seeding, and pure draft state. It rides on the tab's existing dirty
	// state and its Save, like every other edit here: reordering is fiddly, and
	// a request per drop would be a request per correction.
	const moveTeam = (from, to) => {
		if (from === to || to < 0 || to >= teams.length) return;

		const rows = [...teams];
		const [moved] = rows.splice(from, 1);
		rows.splice(to, 0, moved);

		setTeams(rows);
	};

	const endDrag = () => {
		setDraggingIndex(null);
		setOverIndex(null);
	};

	const handleDragStart = (event, index) => {
		event.dataTransfer.setData('text/plain', `${TEAM_DRAG}${index}`);
		event.dataTransfer.effectAllowed = 'move';
		setDraggingIndex(index);
	};

	const handleDragOver = (event, index) => {
		// Only a row from this list is a valid drop; without the guard the list
		// would accept text dragged from anywhere on the page.
		if (draggingIndex === null) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setOverIndex(index);
	};

	const handleDrop = (event, index) => {
		event.preventDefault();

		const payload = event.dataTransfer.getData('text/plain') || '';
		endDrag();

		if (!payload.startsWith(TEAM_DRAG)) return;

		const from = Number(payload.slice(TEAM_DRAG.length));
		if (Number.isInteger(from)) moveTeam(from, index);
	};

	// The handle is a real button, so the order is not a pointer-only fact.
	// React moves the keyed row rather than rebuilding it, so focus travels with
	// the team it was on.
	const handleGripKeyDown = (event, index) => {
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (step === 0) return;

		event.preventDefault();
		moveTeam(index, index + step);
	};

	// Only a changed set needs the structure confirmed. A rename changes nothing
	// about the shape of the division, so it saves without a dialog.
	const handleSave = () => {
		if (!setChanged) {
			save(getDivisionStructure(division));
			return;
		}

		setConfirming(getDivisionStructure(division));
	};

	const save = async (structure) => {
		setBusy(true);
		try {
			await updateDivisionTeams(division.id, {
				teams: teams.map((row) => (row.id === null ? { name: row.name } : { id: row.id, name: row.name })),
				num_groups: structure.numGroups,
				knockout_teams: structure.knockoutTeams,
			});

			showMessage(`${division.name} updated.`, 'success');
			setDraft(null);
			setConfirming(null);
			closeForms();
			// The team list comes from the page's single request, so a change only
			// becomes visible once that request runs again.
			onChanged?.();
		} catch (apiError) {
			// The edits stay on screen. A rejected save is something to correct,
			// not something to lose the work over.
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	// Switching division with unsaved changes warns rather than silently dropping
	// them, which is what closing the add form on switch was already doing for a
	// much smaller loss.
	const handleSelectDivision = async (divisionId) => {
		if (divisionId === division.id) return;

		if (dirty) {
			const confirmed = await confirm(`Discard the unsaved changes to ${division.name}?`);
			if (!confirmed) return;
		}

		setDraft(null);
		setConfirming(null);
		closeForms();
		onSelectDivision?.(divisionId);
	};

	const startAdding = () => {
		setAddFor(division.id);
		setAddName('');
		setEditingKey(null);
		setBulkAdding(false);
		setBulkText('');
	};

	// Switches the open add form between a single name field and a textarea,
	// rather than being a second way to open the form — there is only ever one
	// "Add Team" affordance on offer.
	const toggleBulkMode = () => {
		setBulkAdding((current) => !current);
		setAddName('');
		setBulkText('');
	};

	const cancelAdding = () => {
		setAddFor(null);
		setAddName('');
		setBulkAdding(false);
		setBulkText('');
	};

	const startEditing = (row) => {
		setEditingKey(row.key);
		setEditName(row.name);
		setAddFor(null);
		setBulkAdding(false);
		setBulkText('');
	};

	const teamList = (
		<>
			{adding && (
				<div className="tv-inline-form tv-inline-form--stacked">
					<label className="tv-switch">
						<input type="checkbox" checked={bulkAdding} disabled={busy} onChange={toggleBulkMode} />
						<span className="tv-switch-track" aria-hidden="true" />
						<span>Add multiple teams</span>
					</label>

					{bulkAdding ? (
						<label className="tv-inline-form-field">
							<span>Add multiple teams to {division.name}</span>
							<textarea
								className="tv-inline-form-textarea"
								value={bulkText}
								autoFocus
								disabled={busy}
								placeholder={'One team per line, e.g.\nAces\nEagles\nFalcons'}
								onChange={(event) => setBulkText(event.target.value)}
							/>
						</label>
					) : (
						<label className="tv-inline-form-field">
							<span>Add a team to {division.name}</span>
							<input
								type="text"
								value={addName}
								autoFocus
								disabled={busy}
								maxLength={TEAM_NAME_MAX}
								placeholder="Team name"
								onChange={(event) => setAddName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter') handleAdd();
									if (event.key === 'Escape') cancelAdding();
								}}
							/>
						</label>
					)}

					<div className="tv-inline-form-actions">
						<button
							type="button"
							className="tv-primary-action"
							disabled={busy}
							onClick={bulkAdding ? handleAddBulk : handleAdd}>
							{bulkAdding ? 'Add teams' : 'Add'}
						</button>
						<button type="button" className="tv-subtle-action" disabled={busy} onClick={cancelAdding}>
							Cancel
						</button>
					</div>
				</div>
			)}

			{teams.length === 0 ? (
				<SectionState
					variant="empty"
					title="No teams have been added to this division yet"
					message="Teams appear here in the order they were seeded.">
					{canEditTeams && !adding && (
						<button type="button" className="tv-primary-action" onClick={startAdding}>
							Add Team
						</button>
					)}
				</SectionState>
			) : (
				<>
					<p className="tv-fixtures-count">
						{teams.length} team{teams.length === 1 ? '' : 's'}
					</p>

					{/* Said rather than left to be discovered. Only the one branch
					    now: once the tournament has started the handles are not on
					    screen either, and there is nothing left to explain. */}
					{canEditTeams && teams.length > 1 && (
						<p className="tv-teams-seed-note">
							This order is the seeding. Drag a team by its handle to move it, then Save.
						</p>
					)}

					<ul
						className={`tv-team-rows${division.type !== 'Classic' ? ' tv-team-rows--columns' : ''}`}
						style={
							division.type !== 'Classic' ? { '--tv-team-rows-count': Math.ceil(teams.length / 2) } : undefined
						}>
						{teams.map((row, index) =>
							row.key === editing ? (
								<li key={row.key} className="tv-team-row tv-team-row--editing">
									<TeamNameForm
										label={`Rename ${row.name}`}
										value={editName}
										busy={busy}
										submitLabel="Apply"
										onChange={setEditName}
										onSubmit={() => handleEdit(row)}
										onCancel={() => setEditingKey(null)}
									/>
								</li>
							) : (
								<li
									key={row.key}
									className={`tv-team-row${draggingIndex === index ? ' tv-team-row--dragging' : ''}${
										overIndex === index && draggingIndex !== index ? ' tv-team-row--over' : ''
									}`}
									onDragOver={(event) => canEditTeams && handleDragOver(event, index)}
									onDrop={(event) => canEditTeams && handleDrop(event, index)}>
									{canEditTeams && (
										<button
											type="button"
											className="tv-team-grip"
											draggable
											disabled={busy}
											onDragStart={(event) => handleDragStart(event, index)}
											onDragEnd={endDrag}
											onKeyDown={(event) => handleGripKeyDown(event, index)}
											aria-label={`Move ${row.name} from seed ${
												index + 1
											}. Drag, or use the up and down arrow keys.`}>
											<Icon name="grip" size={16} fill="currentColor" />
										</button>
									)}

									{/* The list is in seed order, so a row's position is its
									    seed. No player counts and no logos — the teams table
									    is (id, name, division_id) and nothing else. */}
									<TeamIdentity name={row.name} note={`Seed ${index + 1}`} />

									{canEditTeams && (
										<span className="tv-team-actions">
											<button
												type="button"
												className="tv-subtle-action"
												disabled={busy}
												onClick={() => startEditing(row)}>
												Edit
											</button>
											<button
												type="button"
												className="tv-subtle-action tv-subtle-action--danger"
												disabled={busy}
												onClick={() => handleRemove(row)}>
												Remove
											</button>
										</span>
									)}
								</li>
							),
						)}
					</ul>
				</>
			)}
		</>
	);

	return (
		<div className="tv-teams">
			<div className="tv-standings-toolbar">
				<DivisionSelector divisions={divisions} selectedId={division.id} onSelect={handleSelectDivision} />

				{/* Prominent, and absent entirely for anyone who is not the creator —
				    a viewer sees no management affordance at all, not a disabled one. */}
				{canEditTeams && !adding && (
					<button type="button" className="tv-primary-action" onClick={startAdding}>
						Add Team
					</button>
				)}
			</div>

			{/* Named here because DivisionSelector renders nothing for a single
			    division, exactly as in Standings. */}
			<h2 className="tv-band-heading">{division.name}</h2>

			{creator && dirty && (
				<div className="tv-teams-pending">
					<p className="tv-teams-pending-note">
						{setChanged
							? 'Unsaved changes. Saving will regenerate this division’s fixtures.'
							: 'Unsaved changes.'}
					</p>

					<div className="tv-inline-form-actions">
						<button type="button" className="tv-primary-action" disabled={busy} onClick={handleSave}>
							{busy && <span className="btn-spinner" aria-hidden="true" />}
							<span>{busy ? 'Saving…' : 'Save Changes'}</span>
						</button>
						<button type="button" className="tv-subtle-action" disabled={busy} onClick={handleDiscard}>
							Discard
						</button>
					</div>
				</div>
			)}

			{division.type === 'Classic' ? (
				<>
					{/* Hidden at 768px and up by the stylesheet, where Groups and
					    List sit side by side and there is nothing to switch
					    between. Icons only, mirroring the schedule maker's
					    grid/list view toggle. */}
					<div className="tv-teams-view-toggle" role="tablist" aria-label="Teams view">
						<button
							type="button"
							role="tab"
							aria-selected={mobileTeamsView === 'groups'}
							aria-label="Groups"
							className={mobileTeamsView === 'groups' ? 'active' : ''}
							onClick={() => setMobileTeamsView('groups')}>
							<Icon name="grid" fill={mobileTeamsView === 'groups' ? '#fff' : 'var(--secondary-text-color)'} />
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mobileTeamsView === 'list'}
							aria-label="Team List"
							className={mobileTeamsView === 'list' ? 'active' : ''}
							onClick={() => setMobileTeamsView('list')}>
							<Icon name="list" fill={mobileTeamsView === 'list' ? '#fff' : 'var(--secondary-text-color)'} />
						</button>
					</div>

					<div className="tv-teams-columns">
						<div
							className={`tv-teams-columns-groups${
								mobileTeamsView === 'groups' ? ' tv-teams-columns-groups--active' : ''
							}`}>
							<GeneratedGroups division={division} />
						</div>
						<div
							className={`tv-teams-columns-list${
								mobileTeamsView === 'list' ? ' tv-teams-columns-list--active' : ''
							}`}>
							{teamList}
						</div>
					</div>
				</>
			) : (
				teamList
			)}

			{confirming && (
				<StructureConfirmation
					divisionName={division.name}
					teamCount={teams.length}
					knockout={division.type === 'Classic'}
					structure={confirming}
					busy={busy}
					onChange={setConfirming}
					onCancel={() => setConfirming(null)}
					onConfirm={() => save(confirming)}
				/>
			)}
		</div>
	);
}

// Mirrors getGroupLabel in tournamentViewFormatter.js. There is no shared
// frontend/backend module to import it from, so it's duplicated here — the
// same reason divisionPreview.js ports server logic instead of importing it.
function groupLabel(index) {
	return `Group ${String.fromCharCode(65 + index)}`;
}

// Read-only: shows what's already saved, not the tab's draft state. A
// division with no pools yet (no teams) gets the same empty state pattern
// used elsewhere on this tab.
function GeneratedGroups({ division }) {
	const groups = division.state?.rounds?.[0]?.groups ?? [];

	if (groups.length === 0) {
		return <SectionState variant="empty" title="No pools yet" message="Pools appear once teams have been added." />;
	}

	const teamNames = new Map((division.teams ?? []).map((team) => [team.id, team.name]));

	return (
		<div className="tv-teams-groups">
			{groups.map((group, index) => (
				<article key={index} className="tv-teams-group-card">
					<div className="tv-teams-group-card-head">{groupLabel(index)}</div>

					{group.map((teamId, seedIndex) => (
						<div key={teamId} className="tv-teams-group-card-row">
							<span className="tv-teams-group-card-seed">{seedIndex + 1}</span>
							<span>{teamNames.get(teamId) ?? 'Unknown team'}</span>
						</div>
					))}
				</article>
			))}
		</div>
	);
}

// A saved team keys on its id; one that has never been saved has none, so the
// draft carries a key of its own rather than leaning on the array index.
function toRow(team) {
	return { key: team.id, id: team.id, name: team.name };
}

// The structure the division was built with, read back out of its state so the
// confirmation can open on the organiser's own numbers rather than a default.
//
// Neither count is stored as a field. The pool round's group count is the number
// of groups; each knockout group holds the placings that meet in it, so the
// flattened first knockout round is the set of qualifiers — except in a Finals
// round, where generation always puts the third-place playoff in front of the
// final and its two placings qualified for nothing.
function getDivisionStructure(division) {
	const rounds = Array.isArray(division.state?.rounds) ? division.state.rounds : [];
	const pool = rounds[0];
	const numGroups = Array.isArray(pool?.groups) ? pool.groups.length : 1;

	const knockout = rounds.find((round) => round.type === 'knockout');
	if (!knockout || !Array.isArray(knockout.groups)) {
		return { numGroups, knockoutTeams: 0 };
	}

	const placings = knockout.groups.flat().length;

	return { numGroups, knockoutTeams: knockout.name === 'Finals' ? placings - 2 : placings };
}

// What the server will refuse, checked here first so the organiser is told
// before the request rather than after it. Neither number is corrected for them:
// they chose these, and they get to choose again.
function structureError({ numGroups, knockoutTeams }, teamCount) {
	if (!Number.isInteger(numGroups) || numGroups < 1) return 'Enter at least one group.';
	if (numGroups > teamCount) return `There are only ${teamCount} teams to spread across the groups.`;
	if (!Number.isInteger(knockoutTeams) || knockoutTeams < 0) return 'Enter how many teams reach the knockout.';
	if (knockoutTeams > teamCount) return `Only ${teamCount} teams can reach the knockout.`;

	return '';
}

// Shown only when the team set has changed. A rename needs no confirmation:
// nothing about the division's shape depends on a name.
function StructureConfirmation({ divisionName, teamCount, knockout, structure, busy, onChange, onCancel, onConfirm }) {
	const error = structureError(structure, teamCount);

	return (
		<div className="confirm-backdrop">
			<div className="confirm-modal tv-structure-modal">
				<h3 className="tv-structure-title">Confirm {divisionName}</h3>

				<p>
					{divisionName} will be rebuilt around {teamCount} team{teamCount === 1 ? '' : 's'}. Its fixtures are
					regenerated from scratch and any schedule entries holding them are removed. Results are not affected,
					because this is only allowed before the tournament starts.
				</p>

				{knockout && (
					<div className="tv-structure-fields">
						<div className="form-group">
							<label htmlFor="tv-structure-groups">Number of Groups</label>
							<input
								id="tv-structure-groups"
								type="number"
								min="1"
								max={teamCount}
								className="form-input"
								value={structure.numGroups}
								disabled={busy}
								onChange={(event) =>
									onChange({ ...structure, numGroups: parseInt(event.target.value, 10) || 0 })
								}
							/>
						</div>

						<div className="form-group">
							<label htmlFor="tv-structure-knockout">Teams to Knockout</label>
							<input
								id="tv-structure-knockout"
								type="number"
								min="0"
								max={teamCount}
								className="form-input"
								value={structure.knockoutTeams}
								disabled={busy}
								onChange={(event) =>
									onChange({ ...structure, knockoutTeams: parseInt(event.target.value, 10) || 0 })
								}
							/>
						</div>
					</div>
				)}

				{error && <span className="form-error">{error}</span>}

				<div className="confirm-buttons">
					<button type="button" disabled={busy || Boolean(error)} onClick={onConfirm}>
						{busy && <span className="btn-spinner" aria-hidden="true" />}
						<span>{busy ? 'Rebuilding…' : 'Rebuild Division'}</span>
					</button>
					<button type="button" disabled={busy} onClick={onCancel}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

// Used for renaming a team in place. Enter submits, Escape cancels — a
// one-field form where the only alternative is reaching for the mouse.
function TeamNameForm({ label, value, busy, submitLabel, onChange, onSubmit, onCancel, maxLength = TEAM_NAME_MAX }) {
	return (
		<div className="tv-inline-form">
			<label className="tv-inline-form-field">
				<span>{label}</span>
				<input
					type="text"
					value={value}
					autoFocus
					disabled={busy}
					maxLength={maxLength}
					placeholder="Team name"
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') onSubmit();
						if (event.key === 'Escape') onCancel();
					}}
				/>
			</label>

			<div className="tv-inline-form-actions">
				<button type="button" className="tv-primary-action" disabled={busy} onClick={onSubmit}>
					{submitLabel}
				</button>
				<button type="button" className="tv-subtle-action" disabled={busy} onClick={onCancel}>
					Cancel
				</button>
			</div>
		</div>
	);
}
