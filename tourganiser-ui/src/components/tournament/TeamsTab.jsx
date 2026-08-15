import { useRef, useState } from 'react';
import DivisionSelector from './DivisionSelector';
import SectionState from './SectionState';
import TeamIdentity from './TeamIdentity';
import { useConfirm } from '../ConfirmDialog';
import { useMessage } from '../../MessageContext';
import { updateDivisionTeams } from '../../requests';

// The teams in one division, in seed order.
//
// Edits accumulate locally and are sent as one request. They have to be: the
// server takes the division's whole intended team list and derives from it
// whether this is a rename or a rebuild, and a division cannot be left
// half-edited between two requests.
//
// No client-side rule about when a team may be edited. The server owns that, and
// inventing one here would be a second, competing definition of it. The one
// thing the client does own is the warning before a rebuild — the organiser
// should know the fixtures are about to be regenerated before they ask for it.
export default function TeamsTab({ divisions = [], selectedDivisionId, onSelectDivision, creator = false, onChanged }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();

	// The draft carries the division it belongs to, so switching division cannot
	// leave edits pointed at a division they are no longer under.
	const [draft, setDraft] = useState(null);
	const [editingKey, setEditingKey] = useState(null);
	const [editName, setEditName] = useState('');
	const [addFor, setAddFor] = useState(null);
	const [addName, setAddName] = useState('');
	const [confirming, setConfirming] = useState(null);
	const [busy, setBusy] = useState(false);

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

	const setTeams = (rows) => setDraft({ divisionId: division.id, teams: rows });

	const closeForms = () => {
		setEditingKey(null);
		setAddFor(null);
		setAddName('');
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
	};

	const startEditing = (row) => {
		setEditingKey(row.key);
		setEditName(row.name);
		setAddFor(null);
	};

	return (
		<div className="tv-teams">
			<div className="tv-standings-toolbar">
				<DivisionSelector divisions={divisions} selectedId={division.id} onSelect={handleSelectDivision} />

				{/* Prominent, and absent entirely for anyone who is not the creator —
				    a viewer sees no management affordance at all, not a disabled one. */}
				{creator && !adding && (
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
							Save Changes
						</button>
						<button type="button" className="tv-subtle-action" disabled={busy} onClick={handleDiscard}>
							Discard
						</button>
					</div>
				</div>
			)}

			{adding && (
				<TeamNameForm
					label={`Add a team to ${division.name}`}
					value={addName}
					busy={busy}
					submitLabel="Add"
					onChange={setAddName}
					onSubmit={handleAdd}
					onCancel={() => setAddFor(null)}
				/>
			)}

			{teams.length === 0 ? (
				<SectionState
					variant="empty"
					title="No teams have been added to this division yet"
					message="Teams appear here in the order they were seeded.">
					{creator && !adding && (
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

					<ul className="tv-team-rows">
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
								<li key={row.key} className="tv-team-row">
									{/* The list is in seed order, so a row's position is its
									    seed. No player counts and no logos — the teams table
									    is (id, name, division_id) and nothing else. */}
									<TeamIdentity name={row.name} note={`Seed ${index + 1}`} />

									{creator && (
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
						Rebuild Division
					</button>
					<button type="button" disabled={busy} onClick={onCancel}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

// Used for both adding and renaming. Enter submits, Escape cancels — a one-field
// form where the only alternative is reaching for the mouse.
function TeamNameForm({ label, value, busy, submitLabel, onChange, onSubmit, onCancel }) {
	return (
		<div className="tv-inline-form">
			<label className="tv-inline-form-field">
				<span>{label}</span>
				<input
					type="text"
					value={value}
					autoFocus
					disabled={busy}
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
