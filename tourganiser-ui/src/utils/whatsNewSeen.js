// Whether the What's new popup should interrupt this visitor, and remembering
// that they closed it. See docs/decisions.md, "What's New Is Keyed To A Release".
//
// Two records, both holding the release they were made for:
// - dismissed (localStorage): "Don't show this again" — hidden until the release
//   changes.
// - closed (sessionStorage): closed without the box ticked — hidden for the rest
//   of this browser session.
//
// Storage is passed in so the rules can be tested with fakes. Storage can throw
// (private modes, blocked site data); a read that throws counts as nothing
// stored, and a write that throws is ignored. Nothing here throws.

export const DISMISSED_KEY = 'tourganiser:whats-new-dismissed';
export const CLOSED_KEY = 'tourganiser:whats-new-closed';

function read(storage, key) {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function write(storage, key, value) {
	try {
		storage?.setItem(key, value);
	} catch {
		// Remembering is a convenience; failing to remember must not break the page.
	}
}

export function shouldShowWhatsNew(release, { local, session } = {}) {
	if (!release) return false;
	if (read(local, DISMISSED_KEY) === release) return false;
	if (read(session, CLOSED_KEY) === release) return false;
	return true;
}

export function recordWhatsNewClosed(release, session) {
	write(session, CLOSED_KEY, release);
}

export function recordWhatsNewDismissed(release, local) {
	write(local, DISMISSED_KEY, release);
}
