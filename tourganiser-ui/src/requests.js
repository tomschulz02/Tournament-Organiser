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

// The one request helper. Every exported function below is a call to it.
//
// It always throws on failure — callers handle errors in a catch and never by
// inspecting the returned value.
async function request(path, { method = 'GET', body } = {}, retries = MAX_RETRIES) {
	let response;
	try {
		response = await fetch(API_URL + path, {
			method,
			credentials: 'include', // needed for the session cookie
			...(body === undefined
				? {}
				: {
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					}),
		});
	} catch {
		// fetch rejects only when the request never completed. An HTTP error
		// resolves normally, so nothing here can retry a 4xx or a 5xx. The old
		// condition matched 'reset' or 'network' in the message, which never
		// matches Chrome's 'Failed to fetch', so it never retried at all.
		if (retries > 0) {
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			return request(path, { method, body }, retries - 1);
		}

		throw new ApiError('Unable to reach the server. Please try again.', { isConnectionError: true });
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

export const fetchTournamentData = (tournamentId) => request(`tournaments/${tournamentId}`);

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
