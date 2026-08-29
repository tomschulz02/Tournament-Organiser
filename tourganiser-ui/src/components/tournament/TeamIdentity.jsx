// A team's name with its initials. There are no team logos — the teams table is
// (id, name, user_id) and nothing else — so the initials stand in for one.

// Array.from rather than slice, so a name starting with an emoji or any other
// astral character yields that character instead of half a surrogate pair.
//
// Deliberately not exported: a file that exports both a component and a plain
// function breaks Fast Refresh, which the lint config enforces. Anything needing
// initials should render TeamIdentity, with size="small" where space is tight.
function toInitials(name) {
	const words = String(name ?? '')
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	if (words.length === 0) return '?';

	if (words.length === 1) {
		return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
	}

	const first = Array.from(words[0])[0];
	const last = Array.from(words[words.length - 1])[0];

	return `${first}${last}`.toUpperCase();
}

export default function TeamIdentity({ name, note = null, size = 'medium', className = '' }) {
	// Placeholder participants reach here as 'TBD' or 'Rank 3' — a knockout
	// fixture exists before its teams are known. They render like any other name.
	const label = name || 'TBD';

	return (
		<span className={`tv-team tv-team--${size} ${className}`.trim()}>
			<span className="tv-team-initials" aria-hidden="true">
				{toInitials(label)}
			</span>
			<span className="tv-team-text">
				<span className="tv-team-name">{label}</span>
				{note && <span className="tv-team-note">{note}</span>}
			</span>
		</span>
	);
}
