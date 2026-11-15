import { useId, useState } from 'react';
import CreateModal from './create/CreateModal';
import { HelpStepper } from './HelpSteps';
import { WHATS_NEW } from '../whatsNew';
import { rememberWhatsNewClosed } from '../utils/whatsNewBrowser';
import '../styles/create-tournament.css';

// One slide per major change in the release, built on CreateModal and the help's
// stepper. App opens it by itself (utils/whatsNewBrowser.js decides when) and
// from the help's topic list. Every way of closing — ×, Escape, the backdrop,
// Done — records a dismissal for this release when "Don't show this again" is
// ticked, and a close for this session when it is not.
export default function WhatsNewModal({ onClose }) {
	const titleId = useId();
	const checkboxId = useId();
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const [index, setIndex] = useState(0);
	const { release, slides } = WHATS_NEW;
	const last = index === slides.length - 1;

	const close = () => {
		rememberWhatsNewClosed(dontShowAgain);
		onClose();
	};

	return (
		<CreateModal
			titleId={titleId}
			title={`What's new in ${release}`}
			onClose={close}
			size="whats-new"
			footer={
				<>
					<label className="whats-new-dismiss" htmlFor={checkboxId}>
						<input
							id={checkboxId}
							type="checkbox"
							checked={dontShowAgain}
							onChange={(event) => setDontShowAgain(event.target.checked)}
						/>
						Don&apos;t show this again
					</label>
					{last && (
						<div className="ct-modal-footer-right">
							<button type="button" className="ct-button ct-button-primary" onClick={close}>
								Done
							</button>
						</div>
					)}
				</>
			}>
			<HelpStepper steps={slides} label={`What's new in ${release}`} onIndexChange={setIndex} />
		</CreateModal>
	);
}
