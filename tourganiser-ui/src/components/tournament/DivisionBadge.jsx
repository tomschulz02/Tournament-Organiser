import { divisionColorStyle } from '../../utils/divisionColors';

// A small division label. Fixtures are shown flattened across the whole
// tournament in step 6, so every fixture row needs to say which division it
// belongs to.

export default function DivisionBadge({ id, name, className = '' }) {
	if (!name) return null;

	// Colour is never the only distinguisher: the badge carries the name and goes
	// on carrying it. Without an id there is nothing stable to hash, so the badge
	// falls back to the single colour it had before, which the stylesheet
	// declares as the default.
	const style = divisionColorStyle(id);

	return (
		<span className={`tv-division-badge ${className}`.trim()} style={style}>
			{name}
		</span>
	);
}
