import { useSearchParams } from 'react-router-dom';

// Separate from TournamentShell.jsx because a file that exports both components
// and non-components breaks Fast Refresh, which the lint config enforces.

// The four sections of the tournament view. Overview is the default; the others
// are reachable only through ?tab=, so a section is linkable and the browser's
// back button steps between them.
export const TOURNAMENT_TABS = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'fixtures', label: 'Fixtures & Schedule' },
	{ id: 'standings', label: 'Standings' },
	{ id: 'teams', label: 'Teams' },
];

// The organiser's fifth section, listed only for them. Reachable by ?tab= like
// the others; the page shows Overview instead to anyone else who follows a link.
export const SETTINGS_TAB = { id: 'settings', label: 'Settings' };

const DEFAULT_TAB = TOURNAMENT_TABS[0].id;

// The shell renders the navigation and the page renders the panel, so both need
// the active tab. Reading it from the query string in each keeps them in step
// without a shared parent holding it in state.
//
// There is deliberately no ?division= any more. Standings and Teams pick a
// division locally, so it is component state, not page state.
export function useTournamentTab() {
	const [searchParams, setSearchParams] = useSearchParams();

	const requested = searchParams.get('tab');
	const activeTab = [...TOURNAMENT_TABS, SETTINGS_TAB].some((tab) => tab.id === requested) ? requested : DEFAULT_TAB;

	// Replaces the whole query, which is what drops a stale ?division= left over
	// from a bookmarked link to the old view.
	const selectTab = (tabId) => setSearchParams({ tab: tabId });

	return { activeTab, selectTab };
}
