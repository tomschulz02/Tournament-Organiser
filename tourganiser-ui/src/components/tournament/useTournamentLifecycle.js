import { useState } from 'react';
import { useConfirm } from '../ConfirmContext';
import { useMessage } from '../../MessageContext';
import { endTournament, startTournament, updateTournamentScoresheetTemplate } from '../../requests';

// The tournament-wide actions — Start, End and the scoresheet template — shared
// by the Overview's lifecycle buttons and the Settings tab, so both ask the same
// question and say the same thing afterwards.
//
// Only the transition the tournament is actually in should be offered; the
// server refuses the others with a 409 regardless — this is presentation, not
// enforcement. Every success ends in onChanged, because the endpoint is the only
// source of truth and the page refetches rather than holding its own copy.
export function useTournamentLifecycle(tournamentId, onChanged) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [busy, setBusy] = useState(false);

	const run = async (action, successMessage) => {
		setBusy(true);
		try {
			await action();
			showMessage(successMessage, 'success');
			onChanged?.();
		} catch (apiError) {
			// Display-ready by contract, including the 409s.
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	// Starting looks like the least consequential of the three and is the most:
	// it closes team and division editing for good. The message says both halves
	// — an organiser who believes the schedule locks too will put off starting,
	// and the schedule is the tool they most need once things overrun.
	const start = async () => {
		const confirmed = await confirm(
			'Teams and divisions can no longer be added, removed or reordered. The schedule can still be edited, and results can be entered once it has started.',
			{ title: 'Start this tournament?', confirmLabel: 'Start tournament', cancelLabel: 'Not yet' },
		);
		if (!confirmed) return;

		await run(() => startTournament(tournamentId), 'Tournament started.');
	};

	const end = async () => {
		// Results stay editable after End on purpose — see renderScoreAction in
		// pages/View.jsx — so this must not promise that they are frozen.
		const confirmed = await confirm('It will be marked as finished. Results can still be corrected afterwards.', {
			title: 'End this tournament?',
			confirmLabel: 'End tournament',
			cancelLabel: 'Not yet',
		});
		if (!confirmed) return;

		await run(() => endTournament(tournamentId), 'Tournament finished.');
	};

	// A template key, or null to stop printing scoresheets.
	const setTemplate = (templateKey) =>
		run(() => updateTournamentScoresheetTemplate(tournamentId, templateKey), 'Scoresheet template updated.');

	return { busy, start, end, setTemplate };
}
