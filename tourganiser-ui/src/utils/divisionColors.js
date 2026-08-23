// Shared source of truth for "which colour is this division". Any component that
// needs to show a division's identity — the badge, the selector pills, a fixture
// row's accent, a division card's accent — calls getDivisionAccent(id) rather than
// hashing its own copy, so the same division is always the same colour everywhere.
//
// The eight tokens are declared once, in App.css (--accent-1 .. --accent-8), tuned
// per light/dark theme the same way the app's other shared tokens are. This module
// only picks which one a given id gets.

const ACCENT_COUNT = 8;

// Keyed on the division's id rather than its position, so a division keeps its
// colour when another is added or removed elsewhere in the tournament. Position
// would reshuffle every division below the one that changed.
function hashId(id) {
	let hash = 0;
	const value = String(id ?? '');

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) | 0;
	}

	return Math.abs(hash);
}

// Returns the CSS custom property (e.g. "--accent-3") a division's accents should
// use. Callers set it as `--tv-division-color: var(${accent})` on whatever element
// they want tinted, and the stylesheet takes it from there.
export function getDivisionAccent(id) {
	if (!id) return null;

	return `--accent-${(hashId(id) % ACCENT_COUNT) + 1}`;
}

// Convenience for components that want the ready-made inline style object rather
// than the raw token — DivisionBadge, DivisionSelector's pills, DivisionCard and
// FixtureRow all do this.
export function divisionColorStyle(id) {
	const accent = getDivisionAccent(id);

	return accent ? { '--tv-division-color': `var(${accent})` } : undefined;
}
