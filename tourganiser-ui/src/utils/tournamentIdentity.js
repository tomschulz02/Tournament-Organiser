// A tournament's visual identity: one accent colour plus a small generated
// geometric pattern, both derived deterministically from the tournament's id.
//
// Deterministic on purpose (see the vision doc): the same tournament must always
// produce the same identity, on every render, on every page, on every visit. That
// rules out Math.random() during render — this seeds a small PRNG from a hash of
// the id instead, so the whole thing is a pure function of tournamentId.
//
// No persistence needed. The id already exists on every tournament, so there is
// nothing to migrate — see docs/architecture.md's note on preferring derivation
// over new columns.

const ACCENT_COUNT = 8;
const MOTIFS = ['circles', 'arcs', 'diagonal', 'dots', 'grid'];

function hashSeed(value) {
	let hash = 0;
	const text = String(value ?? '');

	for (let index = 0; index < text.length; index += 1) {
		hash = (hash * 31 + text.charCodeAt(index)) | 0;
	}

	// Never 0 — a zero seed would make mulberry32 degenerate.
	return (hash >>> 0) || 1;
}

// mulberry32: a small, fast, deterministic PRNG. Good enough for picking motifs
// and shape placement; not used for anything security-sensitive.
function mulberry32(seed) {
	let state = seed;

	return function next() {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick(rand, list) {
	return list[Math.floor(rand() * list.length) % list.length];
}

function range(rand, min, max) {
	return min + rand() * (max - min);
}

// Element params are intentionally generic across motifs (cx/cy/size/rotation/
// opacity) so TournamentPattern can lay them out with one code path per motif
// rather than one shape type per field.
function buildElements(rand, motif) {
	const count = Math.round(range(rand, 3, 6));
	const elements = [];

	for (let index = 0; index < count; index += 1) {
		elements.push({
			cx: range(rand, 8, 92),
			cy: range(rand, 8, 92),
			size: range(rand, 14, 34),
			rotation: range(rand, 0, 360),
			// Visible without needing hover — always rendered at full strength, the
			// card's own text panel (see .tournament-card-content) is what keeps
			// this from ever competing with readability, not a low ceiling here.
			opacity: range(rand, 0.16, 0.34),
		});
	}

	// Grid and diagonal read better with a handful of full-span lines rather than
	// scattered points, so they get their own, sparser generation.
	if (motif === 'grid' || motif === 'diagonal') {
		const lineCount = Math.round(range(rand, 3, 5));
		return Array.from({ length: lineCount }, () => ({
			offset: range(rand, 0, 100),
			thickness: range(rand, 1, 2.5),
			opacity: range(rand, 0.14, 0.28),
		}));
	}

	return elements;
}

// The full identity: which accent token to use, and the pattern spec to render.
// Pure and cheap — safe to call on every render rather than memoising.
export function getTournamentIdentity(tournamentId) {
	const seed = hashSeed(tournamentId);
	const rand = mulberry32(seed);

	const accentIndex = Math.floor(rand() * ACCENT_COUNT);
	const motif = pick(rand, MOTIFS);
	const elements = buildElements(rand, motif);

	return {
		accent: `--accent-${accentIndex + 1}`,
		pattern: { motif, elements },
	};
}

// Convenience for the two call sites (Browse card, Overview header): the inline
// style that carries the accent as a CSS custom property.
export function tournamentAccentStyle(tournamentId) {
	const { accent } = getTournamentIdentity(tournamentId);

	return { '--tournament-accent': `var(${accent})` };
}
