import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchRoundProgression, confirmRoundProgression } from '../requests';
import '../App.css';

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
					<h2>Next Round Setup</h2>
					<p>Loading results...</p>
				</div>
			</div>
		);
	}

	if (!proposal) {
		return portal(
			<div className="modal-backdrop">
				<div className="next-round-modal">
					<h2>Next Round Setup</h2>
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
				<h2>Next Round Setup</h2>
				<p className="modal-subtitle">
					{proposal.roundName} is complete. These teams progress to {proposal.nextRoundName}.
				</p>

				<div className="modal-content">
					<div className="qualified-teams">
						<h3>Qualifying Teams</h3>
						<div className="teams-list">
							{selectedIds.map((teamId, index) => {
								const stats = statsFor(teamId);
								return (
									<div key={index} className="team-selection">
										<label htmlFor={`team-${index}`}>{index + 1}.</label>
										<select
											id={`team-${index}`}
											value={teamId || ''}
											onChange={(event) => handleSelect(index, event.target.value)}
											className="team-dropdown">
											{eligible.map((team) => (
												<option
													key={team.id}
													value={team.id}
													disabled={selectedIds.includes(team.id) && team.id !== teamId}>
													{team.name}
												</option>
											))}
										</select>
										{stats && (
											<div className="team-stats">
												<span>W: {stats.won}</span>
												<span>L: {stats.lost}</span>
												<span>Sets: {stats.setsWon}-{stats.setsLost}</span>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>

					<div className="fixture-preview">
						<h3>Full Ranking</h3>
						<div className="fixtures-list">
							{proposal.computedResults.map((team, index) => (
								<div key={team.id} className="preview-fixture">
									<span>{index + 1}.</span>
									<span>{nameFor(team.id)}</span>
									<span>{index < proposal.qualifyingTeams ? 'Qualifies' : ''}</span>
								</div>
							))}
						</div>
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
						disabled={saving || hasDuplicates || !complete}>
						{saving ? 'Starting...' : 'Start Next Round'}
					</button>
				</div>
			</div>
		</div>
	);
}

export default NextRoundModal;
