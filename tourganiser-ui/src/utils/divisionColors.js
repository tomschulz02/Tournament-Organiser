// Shared source of truth for "which colour is this division". Any component that
// needs to show a division's identity — the badge, the selector pills, a fixture
// row's accent, a division card's accent — calls getDivisionAccent(id, divisions)
// rather than hashing its own copy, so the same division is always the same colour
// everywhere.
//
// The tokens are declared once, in App.css (--accent-1 .. --accent-12), tuned
// per light/dark theme the same way the app's other shared tokens are. This module
// only picks which one a given id gets.

const ACCENT_COUNT = 12;

// Fallback only, used when a caller has no sibling list to assign a position
// against (see positionInTournament below). Keyed on the division's id rather than
// its position, so a division keeps its colour when another is added or removed
// elsewhere in the tournament. Position would reshuffle every division below the
// one that changed.
function hashId(id) {
	let hash = 0;
	const value = String(id ?? '');

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) | 0;
	}

	return Math.abs(hash);
}

// Where a division's id sorts among its own tournament's division ids, or -1 if
// it isn't in the list at all. Sorted (rather than left in array/fetch order) so
// the assignment doesn't depend on how the caller happened to receive the list.
//
// This is what makes colours collision-free within one tournament: a hash of the
// id alone (the previous approach) has no idea which other divisions exist, so two
// divisions in the same tournament can land on the same accent by pure chance —
// increasingly likely as more divisions share a fixed-size palette. Assigning by
// position guarantees every division in a tournament gets a different accent, up
// to ACCENT_COUNT of them.
function positionInTournament(id, divisions) {
	const ids = divisions
		.map((division) => division?.id)
		.filter(Boolean)
		.sort();

	return ids.indexOf(id);
}

// The organiser's own choice, if this division has one and it names an accent
// the stylesheet actually declares. Checked against the palette here rather than
// trusted, for the same reason the server validates on write: a token with no
// rule behind it resolves to nothing, and the division would lose its colour
// everywhere at once with nothing on screen to explain it.
//
// Read from either shape a division arrives in — the full payload carries it as
// `color` alongside `state`, and the dashboard's summaries, which have no state
// at all, carry the same `color` field. See docs/division-state.md.
function chosenAccent(id, divisions) {
	const division = divisions.find((entry) => entry?.id === id);
	const chosen = division?.color ?? division?.state?.color ?? null;
	const match = typeof chosen === 'string' ? /^accent-(\d+)$/.exec(chosen.trim()) : null;
	const index = match ? Number(match[1]) : 0;

	return index >= 1 && index <= ACCENT_COUNT ? `--accent-${index}` : null;
}

// Returns the CSS custom property (e.g. "--accent-3") a division's accents should
// use.
//
// The organiser's choice wins when there is one, so a division keeps the colour
// they picked wherever it appears. Otherwise the automatic assignment below
// applies, which is what every division has until someone changes it.
//
// Pass `divisions` — the full division list of the division's own tournament —
// whenever it's available, so sibling divisions never collide; a division past the
// 12th (by sorted id) wraps and shares a colour with an earlier one rather than
// inventing a 13th, same as the original design. Without `divisions` (or if `id`
// isn't found in it), falls back to the old per-id hash, which is stable but not
// collision-free against divisions it knows nothing about — and cannot see a
// chosen colour either, since the choice lives on the division object.
export function getDivisionAccent(id, divisions = []) {
	if (!id) return null;

	return chosenAccent(id, divisions) ?? getAutomaticAccent(id, divisions);
}

// The palette an organiser picks from, as token names. Exported so the picker
// renders exactly the set getDivisionAccent will accept, rather than keeping a
// second list of what the twelve accents are.
export const DIVISION_ACCENTS = Array.from({ length: ACCENT_COUNT }, (_, index) => `accent-${index + 1}`);

// Which accent a division would get if nobody had chosen one. Split out of
// getDivisionAccent so the picker's "Default" option can be shown as the real
// colour it will produce rather than as an empty swatch.
export function getAutomaticAccent(id, divisions = []) {
	if (!id) return null;

	const position = positionInTournament(id, divisions);
	const index = position === -1 ? hashId(id) : position;

	return `--accent-${(index % ACCENT_COUNT) + 1}`;
}

// Convenience for components that want the ready-made inline style object rather
// than the raw token — DivisionBadge, DivisionSelector's pills, DivisionCard and
// FixtureRow all do this.
export function divisionColorStyle(id, divisions = []) {
	const accent = getDivisionAccent(id, divisions);

	return accent ? { '--tv-division-color': `var(${accent})` } : undefined;
}
