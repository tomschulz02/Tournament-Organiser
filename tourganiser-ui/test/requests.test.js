import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as api from '../src/requests';

// The endpoint wrappers are one-liners, so these do not test logic — they pin
// the path and method of each, which is the bug this file can actually have.
// The retry behaviour and the error envelope are logic and are tested below.
// The tournament cache has its own file.

function jsonResponse(body, { status = 200 } = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: () => null },
		json: async () => body,
	};
}

function lastCall() {
	const [url, options] = globalThis.fetch.mock.calls.at(-1);
	return { url, options };
}

beforeEach(() => {
	globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null }));
});

afterEach(() => {
	vi.useRealTimers();
	delete globalThis.fetch;
});

describe('endpoint wrappers', () => {
	it.each([
		['loginUser', () => api.loginUser('a@b.c', 'pw'), 'users/login', 'POST'],
		['registerUser', () => api.registerUser('tom', 'a@b.c', 'pw', 'pw'), 'users/signup', 'POST'],
		['checkLoginStatus', () => api.checkLoginStatus(), 'users/check-login', 'GET'],
		['logoutUser', () => api.logoutUser(), 'users/logout', 'POST'],
		['getTournaments', () => api.getTournaments(), 'tournaments/', 'GET'],
		['createTournament', () => api.createTournament({}), 'tournaments/create', 'POST'],
		['saveTournament', () => api.saveTournament('t1'), 'tournaments/t1/save', 'POST'],
		['unsaveTournament', () => api.unsaveTournament('t1'), 'tournaments/t1/save', 'DELETE'],
		['startTournament', () => api.startTournament('t1'), 'tournaments/t1/start', 'POST'],
		['endTournament', () => api.endTournament('t1'), 'tournaments/t1/end', 'POST'],
		['deleteTournament', () => api.deleteTournament('t1'), 'tournaments/t1', 'DELETE'],
		['updateTournamentSchedule', () => api.updateTournamentSchedule('t1', {}), 'tournaments/t1/schedule', 'PUT'],
		['updateFixtureResult', () => api.updateFixtureResult('f1', [[21, 15]], true), 'fixtures/f1/result', 'PUT'],
		['updateTeams', () => api.updateTeams('d1', []), 'divisions/updateTeams/d1', 'POST'],
		['updateRounds', () => api.updateRounds('d1', [], [], [], [], 0), 'divisions/updateRounds/d1', 'POST'],
		['updateDivisionTeams', () => api.updateDivisionTeams('d1', { teams: [] }), 'divisions/d1', 'PUT'],
		['fetchRoundProgression', () => api.fetchRoundProgression('d1'), 'divisions/d1/progression', 'GET'],
		['confirmRoundProgression', () => api.confirmRoundProgression('d1', []), 'divisions/d1/progression', 'POST'],
	])('%s calls %s', async (_name, call, path, method) => {
		await call();

		const { url, options } = lastCall();
		expect(url.endsWith(path)).toBe(true);
		expect(options.method).toBe(method);
		// Every request carries the session cookie; the API is cookie-authenticated.
		expect(options.credentials).toBe('include');
	});

	it('sends the body as JSON with a content type', async () => {
		await api.loginUser('a@b.c', 'pw');

		const { options } = lastCall();
		expect(options.headers['Content-Type']).toBe('application/json');
		expect(JSON.parse(options.body)).toEqual({ email: 'a@b.c', password: 'pw' });
	});

	it('sends no body or content type on a GET', async () => {
		await api.getTournaments();

		const { options } = lastCall();
		expect(options.body).toBeUndefined();
		expect(options.headers).toBeUndefined();
	});
});

describe('failure handling', () => {
	it('throws the display-ready message from the envelope', async () => {
		globalThis.fetch.mockResolvedValue(
			jsonResponse({ success: false, message: 'Tournament not found', data: null }, { status: 404 })
		);

		await expect(api.getTournaments()).rejects.toMatchObject({
			name: 'ApiError',
			message: 'Tournament not found',
			status: 404,
		});
	});

	it('carries whatever the server put alongside the failure', async () => {
		globalThis.fetch.mockResolvedValue(
			jsonResponse({ success: false, message: 'One of the fields is too long', data: { field: 'location' } }, { status: 400 })
		);

		await expect(api.createTournament({})).rejects.toMatchObject({ data: { field: 'location' } });
	});

	it('falls back when the response is not the envelope at all', async () => {
		globalThis.fetch.mockResolvedValue({
			ok: false,
			status: 502,
			headers: { get: () => null },
			json: async () => {
				throw new Error('not json');
			},
		});

		await expect(api.getTournaments()).rejects.toMatchObject({ message: 'Request failed (502)', status: 502 });
	});

	// fetch rejects only when the request never completed, so an HTTP error is
	// never retried — only a genuine connection failure is.
	it('retries a connection failure and succeeds if it recovers', async () => {
		globalThis.fetch
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(jsonResponse({ success: true, data: 'ok' }));

		vi.useFakeTimers();
		const pending = api.getTournaments();
		await vi.advanceTimersByTimeAsync(500);

		await expect(pending).resolves.toEqual({ success: true, data: 'ok' });
		expect(globalThis.fetch).toHaveBeenCalledTimes(2);
	});

	it('gives up after the retry budget with a connection error', async () => {
		globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

		vi.useFakeTimers();
		const pending = api.getTournaments().catch((error) => error);
		await vi.advanceTimersByTimeAsync(500 * 6);
		const error = await pending;

		expect(error).toMatchObject({
			name: 'ApiError',
			message: 'Unable to reach the server. Please try again.',
			isConnectionError: true,
		});
		// The first attempt plus five retries.
		expect(globalThis.fetch).toHaveBeenCalledTimes(6);
	});

	it('does not retry an HTTP error', async () => {
		globalThis.fetch.mockResolvedValue(jsonResponse({ success: false, message: 'Nope' }, { status: 500 }));

		await expect(api.getTournaments()).rejects.toMatchObject({ status: 500 });
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});
});
