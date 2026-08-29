import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons';
import TeamIdentity from './tournament/TeamIdentity';
import { useConfirm } from './ConfirmDialog';
import '../App.css';

// A set counts for whichever team scored more in it; a tie (including an
// untouched 0-0 row) counts for neither. This is exactly the rule
// applyFixtureToStandings uses in api/src/utils/standings.js, kept in sync on
// purpose — the number shown here should never disagree with what standings
// will calculate once the match is saved.
// Kept in sync with MAX_SET_SCORE in api/src/services/fixtures.service.js —
// generous enough for any real sport's single-set score, forgiving enough
// that no legitimate score is ever rejected.
const MAX_SET_SCORE = 999;

function tallySets(sets) {
	return sets.reduce(
		(tally, set) => {
			if (set.team1 > set.team2) tally.team1 += 1;
			else if (set.team2 > set.team1) tally.team2 += 1;
			return tally;
		},
		{ team1: 0, team2: 0 }
	);
}

const ScoreUpdateModal = ({ fixture, onClose, onSave, onEndMatch, onCancelMatch, onSaveChanges }) => {
	const [sets, setSets] = useState([{ team1: 0, team2: 0 }]);
	const confirm = useConfirm();

	// A match that was already COMPLETED when this modal opened is being
	// reopened for a correction, not scored live — Cancel/Save/End (which all
	// assume the match is still in progress) don't fit. Save changes/Discard
	// changes replace them, and saving keeps the match COMPLETED rather than
	// reverting it to LIVE the way a plain Save Score would.
	const wasCompleted = fixture.status === 'COMPLETED';

	// Which submit action is in flight: null | 'save' | 'end' | 'cancel'.
	// onSave/onEndMatch/onCancelMatch/onSaveChanges always resolve (pages/View.jsx
	// catches failures and reports them via showMessage), so this only needs
	// waiting on, not a catch.
	const [submitting, setSubmitting] = useState(null);
	const busy = submitting !== null;

	// Hydrate from the recorded result, but only when there is one. An unplayed
	// fixture arrives with result: [], which is truthy — testing it directly
	// replaced the default empty set with nothing, so the modal opened with no
	// score inputs at all for exactly the case it exists to serve.
	useEffect(() => {
		if (fixture.result?.length) {
			const result = fixture.result.map((set) => ({
				team1: set[0] || 0,
				team2: set[1] || 0,
			}));
			setSets(result);
		}
	}, [fixture.result]);

	const handleAddSet = () => {
		setSets([...sets, { team1: 0, team2: 0 }]);
	};

	// A plain array-splice on the draft, exactly like Add Set — nothing is
	// saved until Save Score or End Match, so a set entered by mistake can be
	// taken back out just as freely as it was added.
	const handleRemoveSet = (index) => {
		setSets(sets.filter((_, i) => i !== index));
	};

	const handleScoreChange = (setIndex, team, value) => {
		const newSets = [...sets];
		newSets[setIndex][team] = Math.min(parseInt(value) || 0, MAX_SET_SCORE);
		setSets(newSets);
	};

	const handleStep = (setIndex, team, delta) => {
		const current = sets[setIndex][team];
		handleScoreChange(setIndex, team, Math.max(0, current + delta));
	};

	// Selects the input's current value on focus, so typing a new score
	// replaces it instead of appending to it — going from 19 to 20 is typing
	// "20", not deleting "19" first.
	const handleFocusSelect = (e) => e.target.select();

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (busy) return;
		setSubmitting('save');
		try {
			if (wasCompleted) {
				await onSaveChanges(sets);
			} else {
				await onSave(sets);
			}
		} finally {
			setSubmitting(null);
		}
	};

	// A completed match is only ever reopened to correct what's already there —
	// there is nothing in progress to hand back to, so discarding just closes
	// the modal and drops the edits, the same as the × button always has.
	const handleDiscardClick = () => {
		if (busy) return;
		onClose();
	};

	const handleEndMatchClick = async () => {
		if (busy) return;
		const confirmed = await confirm('End this match and record the current score as final?');
		if (!confirmed) return;

		setSubmitting('end');
		try {
			await onEndMatch(sets);
		} finally {
			setSubmitting(null);
		}
	};

	// Deliberately takes no arguments — it does not send the modal's current
	// `sets` state, and this component does not know or care that cancellation
	// is implemented as a single 0-0 set server-side. That translation belongs
	// in pages/View.jsx: this keeps the modal ignorant of the convention
	// entirely, so if it ever changes, only View.jsx needs to.
	const handleCancelMatchClick = async () => {
		if (busy) return;
		const confirmed = await confirm(
			'Cancel this match? It will be marked as cancelled and the current score will not be recorded.'
		);
		if (!confirmed) return;

		setSubmitting('cancel');
		try {
			await onCancelMatch();
		} finally {
			setSubmitting(null);
		}
	};

	const tally = tallySets(sets);

	// Portalled onto document.body, the same as ScheduleMakerModal and
	// CreateModal. Mounted inline from pages/View.jsx, inside <main id="app">,
	// this shares a stacking context with the fixed header and the footer. On a
	// tall desktop viewport the modal happened to land between the two and the
	// clipping went unnoticed; on a phone or a short window it lost its top and
	// its bottom. Leaving the tree means no ancestor can create a containing
	// block for it.
	return createPortal(
		<div className="modal-overlay">
			<div className="score-modal">
				<div className="score-modal-header">
					<h3>Match #{fixture.match_no}</h3>
					<button type="button" className="score-modal-close" onClick={onClose} aria-label="Close">
						&times;
					</button>
				</div>

				<div className="scoreboard-header">
					<TeamIdentity name={fixture.team1} size="medium" className="scoreboard-team scoreboard-team--left" />
					<div className="scoreboard-tally">
						<span className="scoreboard-tally-label">Sets</span>
						<span className="scoreboard-tally-score">
							{tally.team1}–{tally.team2}
						</span>
					</div>
					<TeamIdentity name={fixture.team2} size="medium" className="scoreboard-team scoreboard-team--right" />
				</div>

				<form onSubmit={handleSubmit}>
					<div className="scoreboard-table-wrap">
						<table className="scoreboard-table">
							<thead>
								<tr>
									<th scope="col" className="scoreboard-table-setcol">
										Set
									</th>
									<th scope="col" className="scoreboard-table-teamcol">
										{fixture.team1}
									</th>
									<th scope="col" className="scoreboard-table-teamcol">
										{fixture.team2}
									</th>
									<th scope="col" className="scoreboard-table-removecol" aria-hidden="true" />
								</tr>
							</thead>
							<tbody>
								{sets.map((set, index) => (
									<tr key={index}>
										<td className="scoreboard-table-setcol">Set {index + 1}</td>
										<td>
											<div className="score-inputs">
												<button
													type="button"
													tabIndex={-1}
													className="score-step-btn"
													aria-label={`Decrease ${fixture.team1}'s set ${index + 1} score`}
													onClick={() => handleStep(index, 'team1', -1)}>
													<Icon name="remove" size={16} fill="currentColor" />
												</button>
												<input
													type="number"
													min="0"
													max={MAX_SET_SCORE}
													value={set.team1}
													onChange={(e) => handleScoreChange(index, 'team1', e.target.value)}
													onFocus={handleFocusSelect}
												/>
												<button
													type="button"
													tabIndex={-1}
													className="score-step-btn"
													aria-label={`Increase ${fixture.team1}'s set ${index + 1} score`}
													onClick={() => handleStep(index, 'team1', 1)}>
													<Icon name="add" size={16} fill="currentColor" />
												</button>
											</div>
										</td>
										<td>
											<div className="score-inputs">
												<button
													type="button"
													tabIndex={-1}
													className="score-step-btn"
													aria-label={`Decrease ${fixture.team2}'s set ${index + 1} score`}
													onClick={() => handleStep(index, 'team2', -1)}>
													<Icon name="remove" size={16} fill="currentColor" />
												</button>
												<input
													type="number"
													min="0"
													max={MAX_SET_SCORE}
													value={set.team2}
													onChange={(e) => handleScoreChange(index, 'team2', e.target.value)}
													onFocus={handleFocusSelect}
												/>
												<button
													type="button"
													tabIndex={-1}
													className="score-step-btn"
													aria-label={`Increase ${fixture.team2}'s set ${index + 1} score`}
													onClick={() => handleStep(index, 'team2', 1)}>
													<Icon name="add" size={16} fill="currentColor" />
												</button>
											</div>
										</td>
										<td className="scoreboard-table-removecol">
											{sets.length > 1 && (
												<button
													type="button"
													className="scoreboard-remove-set-btn"
													aria-label={`Remove set ${index + 1}`}
													onClick={() => handleRemoveSet(index)}>
													<Icon name="delete" size={16} fill="currentColor" />
												</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="modal-buttons">
						<button type="button" className="add-set-btn" onClick={handleAddSet}>
							+ Add Set
						</button>
						<div className="action-buttons">
							{wasCompleted ? (
								<>
									<button type="button" className="cancel-match-btn" onClick={handleDiscardClick} disabled={busy}>
										<span>Discard changes</span>
									</button>
									<button type="submit" className="save-btn" disabled={busy}>
										{submitting === 'save' ? <span className="btn-spinner" aria-hidden="true" /> : null}
										<span>Save changes</span>
									</button>
								</>
							) : (
								<>
									<button type="button" className="cancel-match-btn" onClick={handleCancelMatchClick} disabled={busy}>
										{submitting === 'cancel' ? <span className="btn-spinner" aria-hidden="true" /> : null}
										<span>Cancel Match</span>
									</button>
									<button type="submit" className="save-btn" disabled={busy}>
										{submitting === 'save' ? <span className="btn-spinner" aria-hidden="true" /> : null}
										<span>Save Score</span>
									</button>
									<button type="button" className="end-match-btn" onClick={handleEndMatchClick} disabled={busy}>
										{submitting === 'end' ? <span className="btn-spinner" aria-hidden="true" /> : null}
										<span>End Match</span>
									</button>
								</>
							)}
						</div>
					</div>
				</form>
			</div>
		</div>,
		document.body
	);
};

export default ScoreUpdateModal;
