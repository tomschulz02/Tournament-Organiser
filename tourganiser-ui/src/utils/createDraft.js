// The creation page's local draft.
//
// Everything here is defensive to the point of paranoia, for one reason: this
// value is read while the page is mounting, and anything that throws there
// makes the creation page permanently unopenable for that browser. No draft is
// worth that. A stored value that is missing, unparseable, the wrong version or
// simply the wrong shape is discarded without a word and the form starts fresh.
//
// Only form state is stored. No tokens, no session, no identifiers.

const STORAGE_KEY = 'tourganiser.create-draft';

// Bump this whenever the stored shape changes. An older draft is discarded
// rather than migrated: the form is a few minutes' work, and a half-understood
// migration is a worse bug than starting again.
const DRAFT_VERSION = 1;

const DETAIL_FIELDS = ['name', 'location', 'start_date', 'end_date', 'description'];

function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value) {
	return typeof value === 'string' ? value : null;
}

function normaliseDetails(raw) {
	if (!isPlainObject(raw)) return null;

	const details = {};

	for (const field of DETAIL_FIELDS) {
		const value = readString(raw[field]);
		if (value === null) return null;
		details[field] = value;
	}

	return details;
}

function normaliseTeams(raw) {
	if (!Array.isArray(raw)) return null;

	const teams = [];

	for (const entry of raw) {
		if (!isPlainObject(entry)) return null;
		const name = readString(entry.name);
		if (name === null) return null;
		teams.push({ name });
	}

	return teams;
}

function normaliseDivision(raw) {
	if (!isPlainObject(raw)) return null;

	const id = readString(raw.id);
	const name = readString(raw.name);
	const type = readString(raw.type);
	const teams = normaliseTeams(raw.teams);

	if (id === null || name === null || type === null || teams === null) return null;

	// The counts are only meaningful for a format that uses them, and a division
	// restored with a nonsense count is caught by the same validation that
	// guards the modal. Coerced rather than rejected so a hand-edited number
	// does not throw the whole draft away.
	return {
		id,
		name,
		type,
		num_groups: Number.isFinite(Number(raw.num_groups)) ? Number(raw.num_groups) : 1,
		knockout_teams: Number.isFinite(Number(raw.knockout_teams)) ? Number(raw.knockout_teams) : 2,
		teams,
	};
}

function normaliseDivisions(raw) {
	if (!Array.isArray(raw)) return null;

	const divisions = [];

	for (const entry of raw) {
		const division = normaliseDivision(entry);
		if (division === null) return null;
		divisions.push(division);
	}

	return divisions;
}

export function hasDraftContent(details, divisions) {
	if (divisions.length > 0) return true;

	return DETAIL_FIELDS.some((field) => String(details[field] ?? '').trim().length > 0);
}

// Returns a usable draft or null. Never throws — localStorage itself can throw
// on access in a private-mode or storage-disabled browser, which is why even
// getItem is inside the try.
export function readDraft() {
	let stored;

	try {
		stored = window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}

	if (!stored) return null;

	try {
		const parsed = JSON.parse(stored);

		if (!isPlainObject(parsed) || parsed.version !== DRAFT_VERSION) {
			clearDraft();
			return null;
		}

		const details = normaliseDetails(parsed.details);
		const divisions = normaliseDivisions(parsed.divisions);

		if (details === null || divisions === null) {
			clearDraft();
			return null;
		}

		if (!hasDraftContent(details, divisions)) {
			clearDraft();
			return null;
		}

		return {
			details,
			divisions,
			savedAt: readString(parsed.savedAt),
		};
	} catch {
		// Unparseable, or corrupted in a way the checks above did not anticipate.
		clearDraft();
		return null;
	}
}

export function writeDraft(details, divisions) {
	try {
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: DRAFT_VERSION,
				savedAt: new Date().toISOString(),
				details,
				divisions,
			})
		);
		return true;
	} catch {
		// Storage full, or unavailable. The form still works; it simply is not
		// being remembered, and there is nothing useful to say about it.
		return false;
	}
}

export function clearDraft() {
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to do. A draft that cannot be removed cannot have been read
		// either, since both go through the same unavailable storage.
	}
}

// "2 hours ago", for the banner that offers the draft back. Deliberately
// approximate: the exact minute does not help anyone decide.
export function describeDraftAge(savedAt) {
	if (!savedAt) return '';

	const saved = new Date(savedAt);
	if (Number.isNaN(saved.getTime())) return '';

	const minutes = Math.floor((Date.now() - saved.getTime()) / 60000);

	if (minutes < 1) return 'a moment ago';
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}
