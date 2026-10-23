import { useState } from 'react';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import CreateModal from './create/CreateModal';
import TeamIdentity from './tournament/TeamIdentity';
import { PRELIMINARY_STAGE } from './tournament/fixtureUtils';
import { useConfirm } from './ConfirmContext';
import { useHelpTopic } from '../HelpContext';
import { formatDateLabel } from '../utils/scheduleUtils';
import '../App.css';
// The shell and its buttons are styled here; imported rather than relied on
// being loaded by the create page.
import '../styles/create-tournament.css';

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

// The sets as last saved, in the modal's own shape. An unplayed fixture starts
// from one empty set, the same as the draft does.
function savedSets(result) {
	if (!result?.length) return [{ team1: 0, team2: 0 }];
	return result.map((set) => ({ team1: set[0] || 0, team2: set[1] || 0 }));
}

function sameSets(left, right) {
	return (
		left.length === right.length &&
		left.every((set, index) => set.team1 === right[index].team1 && set.team2 === right[index].team2)
	);
}

// `slot` is the fixture's schedule entry ({ day, startTime, courtName }), or
// undefined when it has not been scheduled.
const ScoreUpdateModal = ({ fixture, slot, onClose, onSave, onEndMatch, onCancelMatch, onSaveChanges }) => {
	useHelpTopic('score-update-modal');

	const [sets, setSets] = useState(() => savedSets(fixture.result));
	const confirm = useConfirm();

	// A match that was already COMPLETED when this modal opened is being
	// reopened for a correction, not scored live — Cancel/Save/End (which all
	// assume the match is still in progress) don't fit. Save changes/Discard
	// changes replace them, and saving keeps the match COMPLETED rather than
	// reverting it to LIVE the way a plain Save Score would.
	const wasCompleted = fixture.status === 'COMPLETED';

	// A knockout match decides who goes through, so it can't end with the sets
	// level — the server refuses it (KNOCKOUT_NEEDS_WINNER in api/src/errors.js),
	// and this only spares the organiser the round trip. `stage` is worked out by
	// flattenFixtures: every pool and round-robin fixture is the preliminary stage.
	const isKnockout = Boolean(fixture.stage) && fixture.stage !== PRELIMINARY_STAGE;

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
	//
	// Adjusted during render rather than in an effect: the draft starts from the
	// saved sets, and is replaced when a refetch hands over a new result (after
	// Save Score, which keeps the modal open).
	const [hydratedFrom, setHydratedFrom] = useState(fixture.result);
	if (fixture.result !== hydratedFrom) {
		setHydratedFrom(fixture.result);
		if (fixture.result?.length) setSets(savedSets(fixture.result));
	}

	// Compared against what is saved rather than tracked per edit, so a Save
	// Score that keeps the modal open clears it once the refetched result lands.
	const isDirty = !sameSets(sets, savedSets(fixture.result));

	// ×, Escape and a click on the backdrop all close (CreateModal routes all
	// three here). None should silently throw away a score typed courtside, so
	// unsaved edits are confirmed first.
	const handleClose = async () => {
		if (
			isDirty &&
			!(await confirm('The score changes you made will be lost.', {
				title: 'Close without saving?',
				confirmLabel: 'Discard changes',
				cancelLabel: 'Keep editing',
				danger: true,
			}))
		)
			return;
		onClose();
	};

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
	// the modal and drops the edits. No confirm: the button already says so.
	const handleDiscardClick = () => {
		if (busy) return;
		onClose();
	};

	const handleEndMatchClick = async () => {
		if (busy) return;
		const confirmed = await confirm('The current score will be recorded as the final result.', {
			title: 'End this match?',
			confirmLabel: 'End match',
			cancelLabel: 'Keep scoring',
		});
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
	// In a knockout round, cancelling is a double forfeit: neither team goes
	// through, and the next round's match the winner would have played becomes a
	// walkover. Said here because it is more than "cancelled" suggests.
	const handleCancelMatchClick = async () => {
		if (busy) return;
		// "Mark as cancelled" / "Go back" rather than Cancel / Cancel: the dialog's
		// own cancel button would otherwise share the action's name.
		const confirmed = await confirm(
			isKnockout
				? 'Neither team goes through, and the team due to meet the winner in the next round gets a walkover. The current score will not be recorded.'
				: 'It will be marked as cancelled and the current score will not be recorded.',
			{ title: 'Cancel this match?', confirmLabel: 'Mark as cancelled', cancelLabel: 'Go back', danger: true }
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
	// Ending — End Match, or Save changes on a finished match — needs a winner.
	const needsWinner = isKnockout && tally.team1 === tally.team2;

	// Match numbers repeat across divisions, so the title alone does not say
	// which match this is. The round already names the pool for pool play.
	const matchContext = [fixture.division_name, fixture.round].filter(Boolean).join(' · ');
	const slotContext = slot
		? [slot.courtName, formatDateLabel(slot.day), slot.startTime].filter(Boolean).join(' · ')
		: '';

	// One stepper per team per set: − input +. The input stays the real control;
	// the buttons are shortcuts for a thumb courtside, so they keep out of the
	// tab order.
	const renderStepper = (index, team, teamName, won) => (
		<div className={`score-stepper${won ? ' score-stepper--won' : ''}`}>
			<button
				type="button"
				tabIndex={-1}
				className="score-step-btn"
				aria-label={`Decrease ${teamName}'s set ${index + 1} score`}
				onClick={() => handleStep(index, team, -1)}>
				<Icon name="remove" size={20} fill="currentColor" />
			</button>
			<input
				type="number"
				inputMode="numeric"
				min="0"
				max={MAX_SET_SCORE}
				value={sets[index][team]}
				aria-label={`${teamName}, set ${index + 1}`}
				onChange={(e) => handleScoreChange(index, team, e.target.value)}
				onFocus={handleFocusSelect}
			/>
			<button
				type="button"
				tabIndex={-1}
				className="score-step-btn"
				aria-label={`Increase ${teamName}'s set ${index + 1} score`}
				onClick={() => handleStep(index, team, 1)}>
				<Icon name="add" size={20} fill="currentColor" />
			</button>
		</div>
	);

	// The footer sits outside the body's scroll, so the actions are always in
	// reach however many sets there are. Its submit button reaches the form
	// through the form attribute.
	const footer = (
		<>
			{needsWinner && (
				<p className="score-modal-note">
					{wasCompleted
						? "A knockout match needs a winner, so it can't end with the sets level."
						: "A knockout match needs a winner, so it can't end with the sets level. For a walkover, enter a winning score for the team that goes through. If neither team can play, use Cancel match."}
				</p>
			)}
			<div className="ct-modal-footer-left">
				{wasCompleted ? (
					<button type="button" className="ct-button ct-button-quiet" onClick={handleDiscardClick} disabled={busy}>
						Discard changes
					</button>
				) : (
					<button
						type="button"
						className="ct-button score-cancel-match"
						onClick={handleCancelMatchClick}
						disabled={busy}>
						{submitting === 'cancel' ? <LoadingScreen variant="inline" /> : null}
						<span>Cancel match</span>
					</button>
				)}
			</div>
			<div className="ct-modal-footer-right">
				{wasCompleted ? (
					<button
						type="submit"
						form="score-form"
						className="ct-button ct-button-primary"
						disabled={busy || needsWinner}>
						{submitting === 'save' ? <LoadingScreen variant="inline" /> : null}
						<span>Save changes</span>
					</button>
				) : (
					<>
						<button type="submit" form="score-form" className="ct-button ct-button-quiet" disabled={busy}>
							{submitting === 'save' ? <LoadingScreen variant="inline" /> : null}
							<span>Save score</span>
						</button>
						<button
							type="button"
							className="ct-button ct-button-primary"
							onClick={handleEndMatchClick}
							disabled={busy || needsWinner}>
							{submitting === 'end' ? <LoadingScreen variant="inline" /> : null}
							<span>End match</span>
						</button>
					</>
				)}
			</div>
		</>
	);

	// CreateModal portals onto document.body, so the fixed header and footer of
	// the page behind cannot clip it, and supplies the focus trap, the scroll
	// lock and Escape. At 768px and below it fills the screen.
	return (
		<CreateModal
			titleId="score-modal-title"
			title={`Match #${fixture.match_no}`}
			subtitle={
				matchContext || slotContext ? (
					<>
						{matchContext}
						{matchContext && slotContext && <br />}
						{slotContext}
					</>
				) : null
			}
			size="score"
			onClose={handleClose}
			footer={footer}>
			<div className="score-board">
				<TeamIdentity name={fixture.team1} size="medium" className="score-board-team" />
				<div className="score-board-tally">
					<span className="score-board-tally-label">Sets</span>
					<span className="score-board-tally-score">
						{tally.team1}–{tally.team2}
					</span>
				</div>
				<TeamIdentity name={fixture.team2} size="medium" className="score-board-team" />
			</div>

			<form id="score-form" onSubmit={handleSubmit}>
				<ol className="score-sets">
					{sets.map((set, index) => (
						<li key={index} className="score-set">
							<div className="score-set-head">
								<span className="score-set-label">Set {index + 1}</span>
								{sets.length > 1 && (
									<button
										type="button"
										className="score-set-remove"
										aria-label={`Remove set ${index + 1}`}
										onClick={() => handleRemoveSet(index)}>
										<Icon name="delete" size={18} fill="currentColor" />
									</button>
								)}
							</div>
							<div className="score-set-teams">
								{renderStepper(index, 'team1', fixture.team1, set.team1 > set.team2)}
								{renderStepper(index, 'team2', fixture.team2, set.team2 > set.team1)}
							</div>
						</li>
					))}
				</ol>
				<button type="button" className="ct-button ct-button-quiet score-add-set" onClick={handleAddSet}>
					<Icon name="add" size={18} fill="currentColor" />
					<span>Add set</span>
				</button>
			</form>
		</CreateModal>
	);
};

export default ScoreUpdateModal;
