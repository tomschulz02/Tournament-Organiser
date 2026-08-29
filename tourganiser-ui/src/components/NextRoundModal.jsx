import { Fragment, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchRoundProgression, confirmRoundProgression } from '../requests';
import Icon from './Icons';
import TeamIdentity from './tournament/TeamIdentity';
import '../App.css';

// Prefixed for the same reason TeamsTab.jsx's TEAM_DRAG is: a bare index could
// have come from anywhere on the page.
const QUALIFIER_DRAG = 'qualifier:';

// The client mirror of bindFixturesToResults in progression.service.js: a
// knockout group holds either one index (a bye, the team named there advances
// unplayed) or two (a match between the teams at those positions). Read here
// against the organiser's current, possibly-reordered `selectedIds` rather than
// the server's confirmed list, so the preview updates before anything is saved.
// Ported rather than shared for the same reason divisionPreview.js is: there is
// no frontend/backend module boundary to import a server file across.
function nextRoundFixtures(groups, selectedIds) {
	if (!Array.isArray(groups)) return [];

	return groups
		.filter((group) => Array.isArray(group) && group.length > 0)
		.map((group) => {
			if (group.length < 2) {
				const index = group[0];
				return Number.isInteger(index) ? { type: 'bye', teamId: selectedIds[index] ?? null } : null;
			}

			const [one, two] = group;
			if (!Number.isInteger(one) || !Number.isInteger(two)) return null;

			return { type: 'match', team1Id: selectedIds[one] ?? null, team2Id: selectedIds[two] ?? null };
		})
		.filter(Boolean);
}

// Portalled onto document.body, the same as ScheduleMakerModal and CreateModal.
// Mounted inline from pages/View.jsx, inside <main id="app">, this shares a
// stacking context with the fixed header and the footer. On a tall desktop
// viewport the modal happened to land between the two and the clipping went
// unnoticed; on a phone or a short window it lost its top and its bottom.
// Leaving the tree means no ancestor can create a containing block for it.
//
// All three states below go through this, not just the loaded one — the loading
// and error states are the ones most likely to be seen on a slow phone.
const portal = (content) => createPortal(content, document.body);

// Round progression.
//
// The ranking is computed by the backend from the rules in docs/tournament-rules.md,
// so this component never calculates qualifiers itself. It displays the proposal,
// lets the organiser reorder or substitute, and posts the confirmed list back.
//
// Teams are identified by id throughout. Names are for display only — two teams in
// a division may share a name.
function NextRoundModal({ divisionId, onConfirmed, onCancel }) {
	const [proposal, setProposal] = useState(null);
	const [selectedIds, setSelectedIds] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

	// The slot whose substitute list is expanded, or null. Only one at a time —
	// opening a second closes whichever was already open. The same swap button
	// that opens a slot's list closes it again on a second click.
	const [pickerIndex, setPickerIndex] = useState(null);

	// The row being carried and the row it is over, exactly as TeamsTab.jsx
	// tracks a reorder in progress.
	const [draggingIndex, setDraggingIndex] = useState(null);
	const [overIndex, setOverIndex] = useState(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError(null);

			try {
				const response = await fetchRoundProgression(divisionId);
				if (cancelled) return;

				setProposal(response.data);
				setSelectedIds(response.data.qualifiers.map((team) => team.id));
			} catch (err) {
				// The server's message is display-ready.
				if (!cancelled) setError(err.message || 'Could not load the round results.');
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [divisionId]);

	const eligible = proposal?.eligibleTeams || [];
	const nameFor = (teamId) => eligible.find((team) => team.id === teamId)?.name || 'Unknown';
	const statsFor = (teamId) => eligible.find((team) => team.id === teamId);

	// True when the organiser has changed the backend's proposed order.
	const amended =
		proposal &&
		(selectedIds.length !== proposal.qualifiers.length ||
			selectedIds.some((id, index) => id !== proposal.qualifiers[index]?.id));

	const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;
	const complete = selectedIds.length > 0 && selectedIds.every(Boolean);

	const handleSelect = (index, teamId) => {
		setSelectedIds((current) => {
			const updated = [...current];
			updated[index] = teamId;
			return updated;
		});
	};

	const handleReset = () => {
		if (proposal) setSelectedIds(proposal.qualifiers.map((team) => team.id));
	};

	// Reordering is local, pure array state, exactly like TeamsTab.jsx's
	// moveTeam — the confirmed order is only sent once, on Confirm.
	const moveTeam = (from, to) => {
		if (from === to || to < 0 || to >= selectedIds.length) return;

		setSelectedIds((current) => {
			const updated = [...current];
			const [moved] = updated.splice(from, 1);
			updated.splice(to, 0, moved);
			return updated;
		});
	};

	const endDrag = () => {
		setDraggingIndex(null);
		setOverIndex(null);
	};

	const handleDragStart = (event, index) => {
		event.dataTransfer.setData('text/plain', `${QUALIFIER_DRAG}${index}`);
		event.dataTransfer.effectAllowed = 'move';
		setDraggingIndex(index);
	};

	const handleDragOver = (event, index) => {
		if (draggingIndex === null) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setOverIndex(index);
	};

	const handleDrop = (event, index) => {
		event.preventDefault();

		const payload = event.dataTransfer.getData('text/plain') || '';
		endDrag();

		if (!payload.startsWith(QUALIFIER_DRAG)) return;

		const from = Number(payload.slice(QUALIFIER_DRAG.length));
		if (Number.isInteger(from)) moveTeam(from, index);
	};

	const handleGripKeyDown = (event, index) => {
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (step === 0) return;

		event.preventDefault();
		moveTeam(index, index + step);
	};

	const handleConfirm = async () => {
		setSaving(true);
		setError(null);

		try {
			const response = await confirmRoundProgression(divisionId, selectedIds);

			onConfirmed?.(response.data);
		} catch (err) {
			// The backend revalidates independently, so a rejection here is real
			// rather than something the disabled state should have caught.
			setError(err.message || 'Could not start the next round.');
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return portal(
			<div className="modal-backdrop">
				<div className="next-round-modal">
					<div className="next-round-modal-header">
						<h2>Next Round Setup</h2>
						<button type="button" className="next-round-modal-close" onClick={onCancel} aria-label="Close">
							&times;
						</button>
					</div>
					<p>Loading results...</p>
				</div>
			</div>
		);
	}

	if (!proposal) {
		return portal(
			<div className="modal-backdrop">
				<div className="next-round-modal">
					<div className="next-round-modal-header">
						<h2>Next Round Setup</h2>
						<button type="button" className="next-round-modal-close" onClick={onCancel} aria-label="Close">
							&times;
						</button>
					</div>
					<p className="error-text">{error || 'No results available for this round.'}</p>
					<div className="modal-actions">
						<button className="cancel-btn" onClick={onCancel}>
							Close
						</button>
					</div>
				</div>
			</div>
		);
	}

	return portal(
		<div className="modal-backdrop">
			<div className="next-round-modal">
				<div className="next-round-modal-header">
					<h2>Next Round Setup</h2>
					<button type="button" className="next-round-modal-close" onClick={onCancel} aria-label="Close">
						&times;
					</button>
				</div>
				<p className="modal-subtitle">
					{proposal.roundName} is complete. These teams progress to {proposal.nextRoundName}.
				</p>

				<div className="modal-content">
					<div className="qualified-teams">
						<h3>Qualifying Teams</h3>
						{selectedIds.length > 1 && (
							<p className="tv-teams-seed-note">Drag a team by its handle to reorder it.</p>
						)}
						<div className="teams-list">
							{selectedIds.map((teamId, index) => {
								const stats = statsFor(teamId);
								// The row's current position, not the frozen calculated
								// rank — it answers "who's progressing and in what order
								// right now," feeding the fixture preview directly below.
								const isChanged = proposal.qualifiers[index]?.id !== teamId;
								const pickerOpen = pickerIndex === index;
								return (
									<Fragment key={index}>
										<div
											className={`tv-team-row${draggingIndex === index ? ' tv-team-row--dragging' : ''}${
												overIndex === index && draggingIndex !== index ? ' tv-team-row--over' : ''
											}${isChanged ? ' tv-team-row--changed' : ''}`}
											onDragOver={(event) => handleDragOver(event, index)}
											onDrop={(event) => handleDrop(event, index)}>
											<span className="tv-qualifier-rank" aria-hidden="true">
												{index + 1}
											</span>
											<button
												type="button"
												className="tv-team-grip"
												draggable
												disabled={saving}
												onDragStart={(event) => handleDragStart(event, index)}
												onDragEnd={endDrag}
												onKeyDown={(event) => handleGripKeyDown(event, index)}
												aria-label={`Move ${nameFor(teamId)} from qualifying position ${
													index + 1
												}. Drag, or use the up and down arrow keys.`}>
												<Icon name="grip" size={16} fill="currentColor" />
											</button>

											<TeamIdentity
												name={nameFor(teamId)}
												note={
													stats ? `W: ${stats.won} L: ${stats.lost} Sets: ${stats.setsWon}-${stats.setsLost}` : null
												}
												size="small"
											/>

											<button
												type="button"
												className={`tv-swap-btn${pickerOpen ? ' tv-swap-btn--open' : ''}`}
												disabled={saving}
												aria-expanded={pickerOpen}
												aria-label={`${pickerOpen ? 'Close' : 'Substitute'} ${nameFor(teamId)}`}
												onClick={() => setPickerIndex(pickerOpen ? null : index)}>
												<Icon name="swap" size={16} fill="currentColor" />
											</button>
										</div>

										{/* Opens directly into the list of eligible teams rather than
										    a native <select> that itself still needs opening — one
										    click shows the options, the same click on the button again
										    hides them. */}
										{pickerOpen && (
											<div
												className="tv-substitute-list"
												role="listbox"
												aria-label={`Choose a substitute for ${nameFor(teamId)}`}>
												{eligible.map((team) => {
													const isTaken = selectedIds.includes(team.id) && team.id !== teamId;
													const isActive = team.id === teamId;
													return (
														<button
															type="button"
															key={team.id}
															role="option"
															aria-selected={isActive}
															disabled={saving || isTaken}
															className={`tv-substitute-option${
																isActive ? ' tv-substitute-option--active' : ''
															}`}
															onClick={() => {
																handleSelect(index, team.id);
																setPickerIndex(null);
															}}>
															{team.name}
														</button>
													);
												})}
											</div>
										)}
									</Fragment>
								);
							})}
						</div>
					</div>

					<div className="fixture-preview">
						{proposal.nextRound ? (
							<>
								<h3>{proposal.nextRoundName} Matchups</h3>
								<div className="fixtures-list">
									{nextRoundFixtures(proposal.nextRound.groups, selectedIds).map((entry, index) => (
										<div key={index} className="preview-fixture preview-fixture--matchup">
											{entry.type === 'bye' ? (
												<>
													<TeamIdentity name={nameFor(entry.teamId)} size="small" />
													<span className="tv-status-pill tv-status-pill--ongoing">Bye</span>
												</>
											) : (
												<>
													<TeamIdentity name={nameFor(entry.team1Id)} size="small" />
													<span className="vs">vs</span>
													<TeamIdentity name={nameFor(entry.team2Id)} size="small" />
												</>
											)}
										</div>
									))}
								</div>
							</>
						) : (
							<div className="next-round-final-note">
								<p>There's no further round to preview — this is the last round in the division.</p>
							</div>
						)}
					</div>
				</div>

				{amended && (
					<p className="modal-note">
						You have changed the calculated ranking. The original will be kept on record.
					</p>
				)}
				{error && <p className="error-text">{error}</p>}

				<div className="modal-actions">
					<button className="cancel-btn" onClick={onCancel} disabled={saving}>
						Cancel
					</button>
					{amended && (
						<button className="cancel-btn" onClick={handleReset} disabled={saving}>
							Reset to calculated
						</button>
					)}
					<button
						className="confirm-btn"
						onClick={handleConfirm}
						disabled={saving || hasDuplicates || !complete || proposal.isFinalRound}>
						{saving ? 'Starting...' : 'Start Next Round'}
					</button>
				</div>
			</div>
		</div>
	);
}

export default NextRoundModal;
