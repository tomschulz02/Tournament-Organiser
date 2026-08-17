const API_URL = import.meta.env.VITE_API_URL;

const MAX_RETRIES = 5;
const RETRY_DELAY = 500;

// Thrown by every function in this module. `status` is the machine-readable
// failure signal: the response envelope deliberately carries no error code, so
// the HTTP status is all a caller can branch on. `message` is display-ready and
// can be passed straight to showMessage. `data` carries whatever the server put
// alongside the failure, and is usually null.
export class ApiError extends Error {
	constructor(message, { status = null, isConnectionError = false, data = null } = {}) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.isConnectionError = isConnectionError;
		this.data = data;
	}
}

// The one request implementation. Every exported function below reaches it,
// almost all of them through `request`, which discards the metadata.
//
// It always throws on failure — callers handle errors in a catch and never by
// inspecting the returned value.
async function requestWithMeta(path, { method = 'GET', body, headers } = {}, retries = MAX_RETRIES) {
	let response;
	try {
		response = await fetch(API_URL + path, {
			method,
			credentials: 'include', // needed for the session cookie
			...(body === undefined && !headers
				? {}
				: {
						headers: {
							...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
							...headers,
						},
					}),
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	} catch {
		// fetch rejects only when the request never completed. An HTTP error
		// resolves normally, so nothing here can retry a 4xx or a 5xx. The old
		// condition matched 'reset' or 'network' in the message, which never
		// matches Chrome's 'Failed to fetch', so it never retried at all.
		if (retries > 0) {
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			return requestWithMeta(path, { method, body, headers }, retries - 1);
		}

		throw new ApiError('Unable to reach the server. Please try again.', { isConnectionError: true });
	}

	// 304 is not a failure and carries no body: it says the copy the caller
	// already holds is still current. response.ok is false for it, so it has to
	// be answered before the error branch below.
	if (response.status === 304) {
		return { notModified: true, payload: null, etag: response.headers.get('ETag') };
	}

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new ApiError(
			// Every endpoint answers with the { success, message, data } envelope,
			// and its message is display-ready. The fallback covers a response
			// that is not JSON at all, such as a proxy error page.
			payload?.message ?? `Request failed (${response.status})`,
			{ status: response.status, data: payload?.data ?? null },
		);
	}

	return { notModified: false, payload, etag: response.headers.get('ETag') };
}

async function request(path, options, retries) {
	const { payload } = await requestWithMeta(path, options, retries);
	return payload;
}

// Users

export const loginUser = (email, password) => request('users/login', { method: 'POST', body: { email, password } });

export const registerUser = (username, email, password, confirmPassword) =>
	request('users/signup', { method: 'POST', body: { username, email, password, confirmPassword } });

export const checkLoginStatus = () => request('users/check-login');

export const logoutUser = () => request('users/logout', { method: 'POST' });

// Tournaments

export const getTournaments = () => request('tournaments/');

// The tournament view is the one cached response.
//
// It is held in sessionStorage: scoped to the tab, gone when the tab closes, and
// still there across a reload — which is the one case a cache exists for and the
// one a module-level Map could not serve, being page state itself. localStorage
// was rejected because a stale organiser payload surviving a browser restart is
// worse than no cache at all; sessionStorage meets that objection rather than
// overriding it.
//
// The application holds the cache rather than leaving it to the browser's own,
// for a reason that settles it: the browser's HTTP cache cannot be cleared from
// JavaScript, and a payload carrying `creator` has to be purgeable on logout.
// Setting `If-None-Match` here also takes the browser's cache out of the
// picture — a request carrying a conditional header is not served from it — so
// the two never disagree about which copy is current.
//
// Safety does not rest on this store. The server's ETag covers the viewer as
// well as the data, so a stale entry from another session can never be answered
// with a 304 — it misses and a correct payload comes back. The viewer in the
// storage key and the clear on session change are the second line, not the
// first, because the cost of being wrong is showing organiser controls to the
// wrong person.
//
// Everything below follows utils/createDraft.js: getItem and JSON.parse inside
// one try, a version check before anything is trusted, guarded writes, and a
// malformed value discarded without a word. A cache miss is never an error.
const CACHE_KEY_PREFIX = 'tourganiser.tournament-cache.';

// Bump when the stored shape changes. An older entry is discarded rather than
// migrated — it costs one request to replace.
const CACHE_VERSION = 1;

// A tournament payload carries every division, fixture and standings row, and
// sessionStorage holds a few megabytes. Enough to move between a handful of
// tournaments; not everything a browsing session touches.
const MAX_CACHED_TOURNAMENTS = 3;

// The viewer is in the key, not merely in the value. Two viewers then cannot
// collide even in principle, rather than relying on the clear-on-change having
// run.
function cacheKeyFor(viewer) {
	return `${CACHE_KEY_PREFIX}${viewer}`;
}

// Every entry the tab holds for this viewer, most recently fetched first, or an
// empty list. Never throws: sessionStorage itself throws on access in a
// storage-disabled or private-mode browser, which is why even getItem is inside
// the try.
function readCache(viewer) {
	let stored;

	try {
		stored = window.sessionStorage.getItem(cacheKeyFor(viewer));
	} catch {
		return [];
	}

	if (!stored) return [];

	try {
		const parsed = JSON.parse(stored);

		if (!parsed || typeof parsed !== 'object' || parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) {
			clearTournamentCache();
			return [];
		}

		const entries = parsed.entries.filter(
			(entry) => entry && typeof entry.id === 'string' && typeof entry.etag === 'string' && entry.payload,
		);

		// One bad entry discards the lot rather than being repaired around. A
		// half-trusted cache holding `creator` is the thing this must not be.
		if (entries.length !== parsed.entries.length) {
			clearTournamentCache();
			return [];
		}

		return entries;
	} catch {
		// Unparseable, or corrupted in a way the checks above did not anticipate.
		clearTournamentCache();
		return [];
	}
}

function writeCache(viewer, entries) {
	const key = cacheKeyFor(viewer);

	try {
		window.sessionStorage.setItem(key, JSON.stringify({ version: CACHE_VERSION, entries }));
	} catch {
		// Quota exceeded, or storage unavailable. Discard rather than throw: the
		// page works either way, it simply has nothing to revalidate with next
		// time. A partial write is worse than none.
		try {
			window.sessionStorage.removeItem(key);
		} catch {
			// Storage that cannot be written cannot have held anything to remove.
		}
	}
}

// Every viewer's entries, not just the current one's. Called when the session
// changes, and what is being removed is precisely the payload belonging to the
// session that is ending.
export function clearTournamentCache() {
	try {
		const keys = [];

		for (let index = 0; index < window.sessionStorage.length; index += 1) {
			const key = window.sessionStorage.key(index);
			if (key?.startsWith(CACHE_KEY_PREFIX)) keys.push(key);
		}

		// Collected first: removing while iterating shifts the indices under it.
		for (const key of keys) window.sessionStorage.removeItem(key);
	} catch {
		// Nothing to do. Storage that cannot be enumerated cannot have been
		// written either — both go through the same unavailable API.
	}
}

export async function fetchTournamentData(tournamentId, sessionKey = 'anonymous') {
	const viewer = String(sessionKey);
	const id = String(tournamentId);

	const entries = readCache(viewer);
	const cached = entries.find((entry) => entry.id === id);

	const { notModified, payload, etag } = await requestWithMeta(`tournaments/${id}`, {
		headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined,
	});

	if (notModified) {
		if (cached) return cached.payload;

		// Nothing here to validate, so the 304 answered a header this function
		// did not send. There is no body to fall back on, so ask again
		// unconditionally rather than returning nothing to the page.
		return await request(`tournaments/${id}`);
	}

	const others = entries.filter((entry) => entry.id !== id);

	// An ETag-less response is still served; it simply cannot be revalidated
	// next time, so it is not worth storing.
	writeCache(
		viewer,
		etag && payload ? [{ id, etag, payload }, ...others].slice(0, MAX_CACHED_TOURNAMENTS) : others,
	);

	return payload;
}

export const createTournament = (tournamentData) =>
	request('tournaments/create', { method: 'POST', body: tournamentData });

// Follow and unfollow. The backend routes exist but answer 501, so these throw an
// ApiError whose message is display-ready — pass it straight to showMessage.
export const saveTournament = (tournamentId) => request(`tournaments/${tournamentId}/save`, { method: 'POST' });

export const unsaveTournament = (tournamentId) => request(`tournaments/${tournamentId}/save`, { method: 'DELETE' });

// Lifecycle. Not Started -> Ongoing -> Finished, one way. Each refuses a
// transition the tournament is not in with a 409 whose message is display-ready.
export const startTournament = (tournamentId) => request(`tournaments/${tournamentId}/start`, { method: 'POST' });

export const endTournament = (tournamentId) => request(`tournaments/${tournamentId}/end`, { method: 'POST' });

// Cascades to the tournament's divisions, fixtures and saved rows. There is no undo.
export const deleteTournament = (tournamentId) => request(`tournaments/${tournamentId}`, { method: 'DELETE' });

// A schedule spans the tournament, not a division. Sent whole: the server
// replaces the column rather than merging, and validates before it writes, so a
// rejection names the rule that was broken. See docs/schedule.md.
export const updateTournamentSchedule = (tournamentId, schedule) =>
	request(`tournaments/${tournamentId}/schedule`, { method: 'PUT', body: { schedule } });

// Fixtures

// Records a result. `sets` is [[teamOneScore, teamTwoScore], ...] and `finished`
// says whether the organiser is ending the match.
//
// There is deliberately no status parameter. The server derives it from the
// scores and the intent — an empty `sets` reopens the fixture, and a single 0-0
// on a finished match records it as cancelled. See docs/tournament-rules.md.
export const updateFixtureResult = (fixtureId, sets, finished) =>
	request(`fixtures/${fixtureId}/result`, { method: 'PUT', body: { sets, finished } });

// Divisions

export const updateTeams = (divisionId, teams) =>
	request(`divisions/updateTeams/${divisionId}`, { method: 'POST', body: { teams } });

export const updateRounds = (divisionId, rounds, qualifiedTeams, standings, fixtures, currentRound) =>
	request(`divisions/updateRounds/${divisionId}`, {
		method: 'POST',
		body: { rounds, qualifiedTeams, standings, fixtures, currentRound },
	});

// The division's full intended team list, sent as one request.
//
// `teams` is [{ id, name }], with id omitted for a team being added; a team left
// out of the list is being removed. The server compares the ids against the ones
// it already holds and decides for itself whether this is a rename or a rebuild,
// so there is nothing here to declare which it is.
export const updateDivisionTeams = (divisionId, { teams, num_groups, knockout_teams }) =>
	request(`divisions/${divisionId}`, { method: 'PUT', body: { teams, num_groups, knockout_teams } });

// The per-team add, rename and remove requests were removed on 2026-08-10.
// updateDivisionTeams above replaces all three: a team can only be added or
// removed alongside the structure the division is rebuilt around, so sending one
// change at a time was three ways to leave a division inconsistent.

// Round progression is a two step flow. This fetches the default ranking and the
// teams that would qualify, computed by the backend. It mutates nothing.
export const fetchRoundProgression = (divisionId) => request(`divisions/${divisionId}/progression`);

// Commits the confirmed ranking and advances the division to the next round.
// teamIds is the ordered list of qualifiers, which the organiser may have changed.
export const confirmRoundProgression = (divisionId, teamIds) =>
	request(`divisions/${divisionId}/progression`, { method: 'POST', body: { teams: teamIds } });
