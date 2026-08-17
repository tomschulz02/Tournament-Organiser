// A small division label. Fixtures are shown flattened across the whole
// tournament in step 6, so every fixture row needs to say which division it
// belongs to.

// The application's four accent tokens, in the order a hash walks them. Built
// from the existing palette rather than from new colours, so a badge never
// clashes with the page it sits on; more divisions than entries simply wrap, and
// two divisions sharing a colour is a much smaller problem than a fifth colour
// that belongs to nothing else on screen.
const DIVISION_ACCENTS = ['--main-color', '--secondary-color', '--tertiary-color', '--quarternary-color'];

// Keyed on the division's id rather than its position, so a division keeps its
// colour when another is added or removed. Position would reshuffle every
// division below the one that changed.
function accentFor(id) {
	let hash = 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = (hash * 31 + id.charCodeAt(index)) | 0;
	}

	return DIVISION_ACCENTS[Math.abs(hash) % DIVISION_ACCENTS.length];
}

export default function DivisionBadge({ id, name, className = '' }) {
	if (!name) return null;

	// Colour is never the only distinguisher: the badge carries the name and goes
	// on carrying it. Without an id there is nothing stable to hash, so the badge
	// falls back to the single colour it had before, which the stylesheet
	// declares as the default.
	const style = id ? { '--tv-division-color': `var(${accentFor(id)})` } : undefined;

	return (
		<span className={`tv-division-badge ${className}`.trim()} style={style}>
			{name}
		</span>
	);
}
