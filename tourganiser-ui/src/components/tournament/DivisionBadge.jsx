// A small division label. Fixtures are shown flattened across the whole
// tournament in step 6, so every fixture row needs to say which division it
// belongs to.
export default function DivisionBadge({ name, className = '' }) {
	if (!name) return null;

	return <span className={`tv-division-badge ${className}`.trim()}>{name}</span>;
}
