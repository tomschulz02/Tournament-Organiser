import { useState } from 'react';
import DivisionSelector from './DivisionSelector';
import SectionState from './SectionState';
import TeamIdentity from './TeamIdentity';
import { useConfirm } from '../ConfirmDialog';
import { useMessage } from '../../MessageContext';
import { addDivisionTeam, removeDivisionTeam, updateDivisionTeam } from '../../requests';

// The teams in one division, in seed order.
//
// All three management endpoints answer 501 until they are implemented. That is
// the point of the A2 stubs: the UI wires to the real paths now and surfaces the
// real message, so the day they are implemented nothing here changes.
//
// No client-side rule about when a team may be edited. The server owns that, and
// inventing one here would be a second, competing definition of it.
export default function TeamsTab({ divisions = [], selectedDivisionId, onSelectDivision, creator = false, onChanged }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();

	// The division the add form belongs to, so switching division closes it
	// rather than leaving a form pointed at the division it is no longer under.
	const [addFor, setAddFor] = useState(null);
	const [addName, setAddName] = useState('');
	const [editingId, setEditingId] = useState(null);
	const [editName, setEditName] = useState('');
	const [busy, setBusy] = useState(false);

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
	const teams = division.teams ?? [];

	const adding = addFor === division.id;
	// Resolved during render, like the stage in StandingsTab: switching to a
	// division that does not hold the team being edited simply stops editing.
	const editing = teams.some((team) => team.id === editingId) ? editingId : null;

	// One shape for all three actions. An ApiError's message is display-ready by
	// contract, so the 501 goes straight to the toast unmodified.
	const run = async (action, successMessage) => {
		setBusy(true);
		try {
			await action();
			showMessage(successMessage, 'success');
			// The team list comes from the page's single request, so a change only
			// becomes visible once that request runs again.
			onChanged?.();
			return true;
		} catch (apiError) {
			showMessage(apiError.message, 'error');
			return false;
		} finally {
			setBusy(false);
		}
	};

	const handleAdd = async () => {
		const name = addName.trim();
		if (!name) {
			showMessage('Enter a team name.', 'error');
			return;
		}

		if (await run(() => addDivisionTeam(division.id, name), `${name} added to ${division.name}.`)) {
			setAddFor(null);
			setAddName('');
		}
	};

	const handleEdit = async (team) => {
		const name = editName.trim();
		if (!name) {
			showMessage('Enter a team name.', 'error');
			return;
		}

		if (await run(() => updateDivisionTeam(division.id, team.id, name), `${team.name} renamed to ${name}.`)) {
			setEditingId(null);
		}
	};

	const handleRemove = async (team) => {
		const confirmed = await confirm(`Remove ${team.name} from ${division.name}?`);
		if (!confirmed) return;

		await run(() => removeDivisionTeam(division.id, team.id), `${team.name} removed from ${division.name}.`);
	};

	const startAdding = () => {
		setAddFor(division.id);
		setAddName('');
	};

	const startEditing = (team) => {
		setEditingId(team.id);
		setEditName(team.name);
	};

	return (
		<div className="tv-teams">
			<div className="tv-standings-toolbar">
				<DivisionSelector divisions={divisions} selectedId={division.id} onSelect={onSelectDivision} />

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
						{teams.map((team, index) =>
							team.id === editing ? (
								<li key={team.id} className="tv-team-row tv-team-row--editing">
									<TeamNameForm
										label={`Rename ${team.name}`}
										value={editName}
										busy={busy}
										submitLabel="Save"
										onChange={setEditName}
										onSubmit={() => handleEdit(team)}
										onCancel={() => setEditingId(null)}
									/>
								</li>
							) : (
								<li key={team.id} className="tv-team-row">
									{/* The list is in seed order, so a row's position is its
									    seed. No player counts and no logos — the teams table
									    is (id, name, user_id) and nothing else. */}
									<TeamIdentity name={team.name} note={`Seed ${index + 1}`} />

									{creator && (
										<span className="tv-team-actions">
											<button
												type="button"
												className="tv-subtle-action"
												disabled={busy}
												onClick={() => startEditing(team)}>
												Edit
											</button>
											<button
												type="button"
												className="tv-subtle-action tv-subtle-action--danger"
												disabled={busy}
												onClick={() => handleRemove(team)}>
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
