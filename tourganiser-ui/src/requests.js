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

export const startTournament = (tournamentId) => request(`tournaments/start/${tournamentId}`, { method: 'POST' });

export const endTournament = (tournamentId) => request(`tournaments/end/${tournamentId}`, { method: 'PUT' });

export const deleteTournament = (id) => request(`tournaments/delete/${id}`, { method: 'DELETE' });

// A schedule spans the tournament, not a division. Returns 501 until implemented.
export const updateTournamentSchedule = (tournamentId, schedule) =>
	request(`tournaments/${tournamentId}/schedule`, { method: 'PUT', body: { schedule } });

// Fixtures

export const updateScore = (fixtureId, scores, status, hashId, rounds) =>
	request(`fixtures/result/${fixtureId}`, { method: 'POST', body: { scores, status, hashId, rounds } });

// Divisions

export const updateTeams = (divisionId, teams) =>
	request(`divisions/updateTeams/${divisionId}`, { method: 'POST', body: { teams } });

export const updateRounds = (divisionId, rounds, qualifiedTeams, standings, fixtures, currentRound) =>
	request(`divisions/updateRounds/${divisionId}`, {
		method: 'POST',
		body: { rounds, qualifiedTeams, standings, fixtures, currentRound },
	});

// Team management. All three return 501 until implemented; the ApiError message
// is display-ready, so a catch can pass it straight to showMessage.
export const addDivisionTeam = (divisionId, name) =>
	request(`divisions/${divisionId}/teams`, { method: 'POST', body: { name } });

export const updateDivisionTeam = (divisionId, teamId, name) =>
	request(`divisions/${divisionId}/teams/${teamId}`, { method: 'PUT', body: { name } });

export const removeDivisionTeam = (divisionId, teamId) =>
	request(`divisions/${divisionId}/teams/${teamId}`, { method: 'DELETE' });

// Round progression is a two step flow. This fetches the default ranking and the
// teams that would qualify, computed by the backend. It mutates nothing.
export const fetchRoundProgression = (divisionId) => request(`divisions/${divisionId}/progression`);

// Commits the confirmed ranking and advances the division to the next round.
// teamIds is the ordered list of qualifiers, which the organiser may have changed.
export const confirmRoundProgression = (divisionId, teamIds) =>
	request(`divisions/${divisionId}/progression`, { method: 'POST', body: { teams: teamIds } });
