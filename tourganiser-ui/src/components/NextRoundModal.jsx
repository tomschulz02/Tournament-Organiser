import { useState, useEffect } from 'react';
import { fetchRoundProgression, confirmRoundProgression } from '../requests';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import CreateModal from './create/CreateModal';
import TeamIdentity from './tournament/TeamIdentity';
import { useHelpTopic } from '../HelpContext';
import '../App.css';
// The shell and its buttons are styled here; imported rather than relied on
// being loaded by the create page.
import '../styles/create-tournament.css';

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
//
// A group the round lists under `placement` is a match for places below the
// title, labelled with its fixture round's own text ("Places 5-8", "5th Place"),
// and a one-team placement group is a team waiting for its placement final
// rather than a bye into the next round of the bracket.
function nextRoundFixtures(groups, selectedIds, placement = []) {
	if (!Array.isArray(groups)) return [];

	const placementByGroup = new Map((placement ?? []).map((entry) => [entry.group, entry]));

	return groups
		.map((group, groupIndex) => {
			if (!Array.isArray(group) || group.length === 0) return null;

			const entry = placementByGroup.get(groupIndex);
			const label = entry?.name ? entry.name.split(' · ').pop() : null;

			if (group.length < 2) {
				const index = group[0];
				if (!Number.isInteger(index)) return null;

				return { type: entry ? 'waiting' : 'bye', teamId: selectedIds[index] ?? null };
			}

			const [one, two] = group;
			if (!Number.isInteger(one) || !Number.isInteger(two)) return null;

			return { type: 'match', team1Id: selectedIds[one] ?? null, team2Id: selectedIds[two] ?? null, label };
		})
		.filter(Boolean);
}

// A null place is one a cancelled knockout match left empty: both its teams are
// out, so whoever the place is drawn against gets a walkover. See
// validateConfirmedTeams in progression.service.js.
const VACANT_NAME = 'No team';

// A knockout match recorded level stops the proposal. The message is static, so
// the match it means comes in the error's data.
function proposalError(err) {
	const message = err.message || 'Could not load the round results.';
	const matchNo = err.data?.matchNo;

	return matchNo ? `${message} (Match #${matchNo}, ${err.data.round})` : message;
}

// Round progression.
//
// The ranking is computed by the backend from the rules in docs/tournament-rules.md,
// so this component never calculates qualifiers itself. It displays the proposal,
// lets the organiser reorder or substitute, and posts the confirmed list back.
//
// Teams are identified by id throughout. Names are for display only — two teams in
// a division may share a name.
function NextRoundModal({ divisionId, onConfirmed, onCancel }) {
	useHelpTopic('next-round-modal');

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
				if (!cancelled) setError(proposalError(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [divisionId]);

	// Another round-robin leg of the same division carries every team forward —
	// nobody is eliminated, so the "qualifiers" framing (heading, aria labels,
	// the matchup preview) is wrong here even though the underlying
	// reorder/confirm mechanism is identical. True for League's leg-to-leg case
	// and, in principle, for a hypothetical second Pool Play round. See
	// docs/decisions.md.
	const isRoundRobinNext = proposal?.nextRound?.type === 'roundRobin';

	const eligible = proposal?.eligibleTeams || [];
	const nameFor = (teamId) =>
		teamId === null ? VACANT_NAME : eligible.find((team) => team.id === teamId)?.name || 'Unknown';
	const statsFor = (teamId) => eligible.find((team) => team.id === teamId);

	// True when the organiser has changed the backend's proposed order.
	const amended =
		proposal &&
		(selectedIds.length !== proposal.qualifiers.length ||
			selectedIds.some((id, index) => id !== proposal.qualifiers[index]?.id));

	// Empty places are not duplicates of each other, and do not make the list
	// incomplete — but a list with nobody in it is.
	const chosenIds = selectedIds.filter((id) => id !== null);
	const hasDuplicates = new Set(chosenIds).size !== chosenIds.length;
	const complete = chosenIds.length > 0;

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

	// All three states share one frame, not just the loaded one — the loading
	// and error states are the ones most likely to be seen on a slow phone.
	// Closing is ignored while the confirmed list is being saved.
	const handleClose = () => {
		if (!saving) onCancel();
	};
	const frame = (children, footer) => (
		<CreateModal
			titleId="next-round-title"
			title="Next round setup"
			subtitle={
				proposal ? `${proposal.roundName} is complete. These teams progress to ${proposal.nextRoundName}.` : null
			}
			size="round"
			onClose={handleClose}
			footer={footer}>
			{children}
		</CreateModal>
	);

	if (loading) {
		return frame(<LoadingScreen context="roundProgress" />);
	}

	if (!proposal) {
		return frame(
			<p className="nr-error" role="alert">
				{error || 'No results available for this round.'}
			</p>,
			<div className="ct-modal-footer-right">
				<button type="button" className="ct-button ct-button-quiet" onClick={onCancel}>
					Close
				</button>
			</div>
		);
	}

	const footer = (
		<>
			{amended && (
				<p className="nr-footer-note">You have changed the calculated ranking. The original will be kept on record.</p>
			)}
			{error && (
				<p className="nr-footer-note nr-error" role="alert">
					{error}
				</p>
			)}
			<div className="ct-modal-footer-left">
				{amended && (
					<button type="button" className="ct-button ct-button-quiet" onClick={handleReset} disabled={saving}>
						Reset to calculated
					</button>
				)}
			</div>
			<div className="ct-modal-footer-right">
				<button type="button" className="ct-button ct-button-quiet" onClick={onCancel} disabled={saving}>
					Cancel
				</button>
				<button
					type="button"
					className="ct-button ct-button-primary"
					onClick={handleConfirm}
					disabled={saving || hasDuplicates || !complete || proposal.isFinalRound}>
					{saving && <LoadingScreen variant="inline" />}
					<span>{saving ? 'Starting...' : 'Start next round'}</span>
				</button>
			</div>
		</>
	);

	return frame(
		<div className="nr-layout">
			<section className="nr-section" aria-labelledby="nr-teams-heading">
				<h3 id="nr-teams-heading" className="nr-heading">
					{isRoundRobinNext ? 'Next leg order' : 'Qualifying teams'}
				</h3>
				{selectedIds.length > 1 && (
					<p className="nr-hint">
						Reorder with the arrows<span className="nr-hint-drag">, or drag a team by its handle</span>.
					</p>
				)}
				<ol className="nr-rows">
					{selectedIds.map((teamId, index) => {
						const stats = statsFor(teamId);
						// The row's current position, not the frozen calculated
						// rank — it answers "who's progressing and in what order
						// right now," feeding the fixture preview alongside.
						const isChanged = proposal.qualifiers[index]?.id !== teamId;
						const pickerOpen = pickerIndex === index;
						const name = nameFor(teamId);
						const place = isRoundRobinNext ? 'position' : 'qualifying position';
						return (
							<li key={index} className="nr-row-item">
								<div
									className={`tv-team-row nr-row${draggingIndex === index ? ' tv-team-row--dragging' : ''}${
										overIndex === index && draggingIndex !== index ? ' tv-team-row--over' : ''
									}${isChanged ? ' tv-team-row--changed' : ''}`}
									onDragOver={(event) => handleDragOver(event, index)}
									onDrop={(event) => handleDrop(event, index)}>
									<span className="tv-qualifier-rank" aria-hidden="true">
										{index + 1}
									</span>
									<button
										type="button"
										className="tv-team-grip nr-grip"
										draggable
										disabled={saving}
										onDragStart={(event) => handleDragStart(event, index)}
										onDragEnd={endDrag}
										onKeyDown={(event) => handleGripKeyDown(event, index)}
										aria-label={`Move ${name} from ${place} ${index + 1}. Drag, or use the up and down arrow keys.`}>
										<Icon name="grip" size={16} fill="currentColor" />
									</button>

									<TeamIdentity
										name={name}
										note={
											teamId === null
												? 'Its opponent gets a walkover'
												: stats
													? `W ${stats.won} · L ${stats.lost} · Sets ${stats.setsWon}-${stats.setsLost}`
													: null
										}
										size="small"
									/>

									{/* Buttons rather than drag alone: a phone has no HTML5 drag,
									    so these are the only way to reorder on touch. */}
									<div className="nr-row-actions">
										<button
											type="button"
											className="nr-icon-btn"
											disabled={saving || index === 0}
											aria-label={`Move ${name} up`}
											onClick={() => moveTeam(index, index - 1)}>
											<Icon name="leftChevron" size={20} fill="currentColor" className="nr-chevron-up" />
										</button>
										<button
											type="button"
											className="nr-icon-btn"
											disabled={saving || index === selectedIds.length - 1}
											aria-label={`Move ${name} down`}
											onClick={() => moveTeam(index, index + 1)}>
											<Icon name="leftChevron" size={20} fill="currentColor" className="nr-chevron-down" />
										</button>
										<button
											type="button"
											className={`nr-icon-btn${pickerOpen ? ' nr-icon-btn--open' : ''}`}
											disabled={saving}
											aria-expanded={pickerOpen}
											aria-label={`${pickerOpen ? 'Close' : 'Substitute'} ${name}`}
											onClick={() => setPickerIndex(pickerOpen ? null : index)}>
											<Icon name="swap" size={18} fill="currentColor" />
										</button>
									</div>
								</div>

								{/* Opens directly into the list of eligible teams rather than
								    a native <select> that itself still needs opening — one
								    click shows the options, the same click on the button again
								    hides them. */}
								{pickerOpen && (
									<div className="tv-substitute-list" role="listbox" aria-label={`Choose a substitute for ${name}`}>
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
													className={`tv-substitute-option${isActive ? ' tv-substitute-option--active' : ''}`}
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
							</li>
						);
					})}
				</ol>
			</section>

			<section className="nr-section" aria-labelledby="nr-preview-heading">
				{isRoundRobinNext ? (
					<>
						<h3 id="nr-preview-heading" className="nr-heading">
							{proposal.nextRoundName}
						</h3>
						<p className="nr-empty">
							Every team carries forward to this leg — nobody is eliminated, so there is no bracket to preview. The
							order sets the seeding for the leg.
						</p>
					</>
				) : proposal.nextRound ? (
					<>
						<h3 id="nr-preview-heading" className="nr-heading">
							{proposal.nextRoundName} matchups
						</h3>
						<ul className="nr-matchups">
							{nextRoundFixtures(proposal.nextRound.groups, selectedIds, proposal.nextRound.placement).map(
								(entry, index) => (
									<li key={index} className="nr-matchup">
										{entry.type === 'bye' || entry.type === 'waiting' ? (
											<>
												<TeamIdentity name={nameFor(entry.teamId)} size="small" />
												<span className="nr-tag">{entry.type === 'bye' ? 'Bye' : 'Awaiting placement match'}</span>
											</>
										) : (
											<>
												<div className="nr-matchup-teams">
													<TeamIdentity name={nameFor(entry.team1Id)} size="small" />
													<span className="nr-matchup-vs">vs</span>
													<TeamIdentity name={nameFor(entry.team2Id)} size="small" />
												</div>
												{(entry.label || entry.team1Id === null || entry.team2Id === null) && (
													<div className="nr-matchup-tags">
														{entry.label && <span className="nr-tag">{entry.label}</span>}
														{(entry.team1Id === null || entry.team2Id === null) && (
															<span className="nr-tag">Walkover</span>
														)}
													</div>
												)}
											</>
										)}
									</li>
								)
							)}
						</ul>
					</>
				) : (
					<>
						<h3 id="nr-preview-heading" className="nr-heading">
							Matchups
						</h3>
						<p className="nr-empty">There's no further round to preview — this is the last round in the division.</p>
					</>
				)}
			</section>
		</div>,
		footer
	);
}

export default NextRoundModal;
