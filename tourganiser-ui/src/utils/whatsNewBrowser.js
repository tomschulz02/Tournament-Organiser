// The What's new popup's rules (whatsNewSeen.js) applied to this browser and this
// page load. A separate module from WhatsNewModal.jsx so the component file
// exports only a component (Fast Refresh), and from whatsNewSeen.js so that one
// stays pure and testable without a browser.
import { WHATS_NEW } from '../whatsNew';
import { recordWhatsNewClosed, recordWhatsNewDismissed, shouldShowWhatsNew } from './whatsNewSeen';

// The browser's storage, or null where reaching it throws (private modes,
// blocked site data). whatsNewSeen.js copes with null.
function browserStorage() {
	const reach = (name) => {
		try {
			return window[name];
		} catch {
			return null;
		}
	};
	return { local: reach('localStorage'), session: reach('sessionStorage') };
}

// Closed once in this page load. App unmounts on /login and remounts after it,
// and where storage is blocked nothing else remembers the close, so this keeps
// the popup from coming back on every remount. A reload starts again.
let closedThisLoad = false;

// Whether the popup opens by itself. See docs/decisions.md, "What's New Is Keyed
// To A Release".
export function shouldAutoShowWhatsNew() {
	if (closedThisLoad || WHATS_NEW.slides.length === 0) return false;
	return shouldShowWhatsNew(WHATS_NEW.release, browserStorage());
}

// A close with "Don't show this again" ticked hides it until the release
// changes; without, for the rest of this browser session.
export function rememberWhatsNewClosed(dontShowAgain) {
	const { local, session } = browserStorage();
	if (dontShowAgain) recordWhatsNewDismissed(WHATS_NEW.release, local);
	else recordWhatsNewClosed(WHATS_NEW.release, session);
	closedThisLoad = true;
}
