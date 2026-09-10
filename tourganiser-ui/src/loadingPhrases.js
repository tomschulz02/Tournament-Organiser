// Copy for LoadingScreen's fullPage variant, kept separate from the component
// the same way helpContent.js separates copy from HelpMenu. One array per
// context key; a context with more than one phrase rotates (see
// LoadingScreen.jsx), a context with a single phrase just holds still.
//
// Draft wording from docs/handover-contextual-loading.md, approved as final —
// short, a little playful, ends in "…". Add a new context here rather than
// reusing an unrelated one when a future call site needs its own phrases.
export const LOADING_PHRASES = {
	scoreUpdate: ['Settling all the bribes…', 'Counting the sets…', 'Confirming nobody double-scored…'],
	scheduleGenerate: ['Untangling the courts…', 'Negotiating with the clock…', 'Making sure nobody plays themselves…'],
	// Not in the original draft: the generator itself runs client-side and is
	// effectively instant (docs/architecture.md, "the generator stays in the
	// client"), so there's nothing async to show a wait for there. What's
	// actually slow is persisting the built schedule to the server — its own
	// context, same tone as scheduleGenerate.
	scheduleSave: ['Locking in the courts…', 'Writing it all down…'],
	tournamentCreate: ['Laying out the courts…', 'Setting up the bracket…', 'Making it official…'],
	roundProgress: ["Working out who's through…", 'Updating the bracket…'],
	divisionSave: ['Rebuilding the fixtures…', 'Reshuffling the pools…'],
	scoresheetGenerate: ['Filling in the paperwork…', 'Printing the details…'],
	pageLoad: ['Fetching the tournament…', 'Loading the latest…'],
};

// A context with no phrase-bank entry falls back to this rather than erroring
// or rendering no text — what keeps adopting the component low-risk: a call
// site that's missed, or a new one added later, still gets something sensible
// rather than silence.
const FALLBACK_PHRASES = ['Loading…', 'Just a moment…'];

export function getLoadingPhrases(context) {
	return LOADING_PHRASES[context] || FALLBACK_PHRASES;
}
