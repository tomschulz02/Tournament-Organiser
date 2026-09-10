import { divisionColorStyle } from '../../utils/divisionColors';

// A small division label. Fixtures are shown flattened across the whole
// tournament in step 6, so every fixture row needs to say which division it
// belongs to.

export default function DivisionBadge({ id, name, divisions = [], className = '' }) {
	if (!name) return null;

	// Colour is never the only distinguisher: the badge carries the name and goes
	// on carrying it. Without an id there is nothing stable to hash, so the badge
	// falls back to the single colour it had before, which the stylesheet
	// declares as the default.
	//
	// `divisions` — the badge's own tournament's full division list — is passed
	// through by every caller that has it, so siblings never collide; see
	// divisionColors.js.
	const style = divisionColorStyle(id, divisions);

	return (
		<span className={`tv-division-badge ${className}`.trim()} style={style}>
			{name}
		</span>
	);
}
