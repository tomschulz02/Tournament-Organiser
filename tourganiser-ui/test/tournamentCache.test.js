import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchTournamentData, clearTournamentCache } from '../src/requests';

// The client half of the tournament view cache. The server's viewer-aware ETag
// is what actually makes it safe — a stale entry from another session simply
// never matches — but these assert the client does its part: it revalidates
// rather than serving blind, and it does not hoard payloads across sessions.

const ORGANISER_BODY = { success: true, data: { creator: true, tournament: { name: 'Summer Open' } } };
const ANONYMOUS_BODY = { success: true, data: { creator: false, tournament: { name: 'Summer Open' } } };

function jsonResponse(body, { etag = '"v1"', status = 200 } = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name) => (name.toLowerCase() === 'etag' ? etag : null) },
		json: async () => body,
	};
}

function notModified(etag = '"v1"') {
	return {
		ok: false,
		status: 304,
		headers: { get: (name) => (name.toLowerCase() === 'etag' ? etag : null) },
		json: async () => {
			throw new Error('304 has no body');
		},
	};
}

function headerFor(callIndex) {
	return globalThis.fetch.mock.calls[callIndex][1].headers?.['If-None-Match'];
}

beforeEach(() => {
	clearTournamentCache();
	globalThis.fetch = vi.fn();
});

afterEach(() => {
	clearTournamentCache();
	delete globalThis.fetch;
});

describe('fetchTournamentData', () => {
	it('sends no validator on the first request and returns the payload', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));

		expect(await fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);
		expect(headerFor(0)).toBeUndefined();
	});

	it('sends the stored validator on the next request', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(notModified('"v1"'));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(1)).toBe('"v1"');
	});

	it('returns the cached body on a 304, which carries none of its own', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(notModified());

		expect(await fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);
	});

	// The cache never short-circuits the request. A mutation is visible on the
	// next load because the server answers 200, not because the client guessed.
	it('always asks, and takes fresh data when the server sends it', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		const updated = { success: true, data: { creator: true, tournament: { name: 'Renamed' } } };
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(updated, { etag: '"v2"' }));

		expect(await fetchTournamentData('tour-1', 1)).toEqual(updated);
		expect(globalThis.fetch).toHaveBeenCalledTimes(2);
	});

	it('revalidates against the newest validator, not the first one', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v2"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(notModified('"v2"'));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(2)).toBe('"v2"');
	});

	it('keeps tournaments apart', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"a"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY, { etag: '"b"' }));
		await fetchTournamentData('tour-2', 1);

		expect(headerFor(1)).toBeUndefined();
	});

	// The trap, from the client side. Even though the server would refuse to
	// revalidate the organiser's entry for a signed-out reader, the client must
	// not present it in the first place.
	it('does not offer one session\'s validator under another', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"organiser"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY, { etag: '"anon"' }));
		const payload = await fetchTournamentData('tour-1', 2);

		expect(headerFor(1)).toBeUndefined();
		expect(payload.data.creator).toBe(false);
	});

	it('discards the previous session\'s entries rather than keeping them', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"organiser"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY, { etag: '"anon"' }));
		await fetchTournamentData('tour-1', 2);

		// Back to the first session: the organiser entry must be gone, not revived.
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"organiser"' }));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(2)).toBeUndefined();
	});

	it('forgets everything when the cache is cleared, as it is on logout', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		clearTournamentCache();

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(1)).toBeUndefined();
	});

	// Nothing to revalidate with next time, so there is no point holding it.
	it('does not store a response that carried no validator', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: null }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: null }));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(1)).toBeUndefined();
	});

	it('drops a stored entry when the server later stops sending a validator', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: null }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: null }));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(2)).toBeUndefined();
	});

	// A 304 the client did not ask for leaves it with no body to show. Asking
	// again is the only recovery.
	it('refetches unconditionally if a 304 arrives with nothing cached', async () => {
		globalThis.fetch.mockResolvedValueOnce(notModified());
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY));

		expect(await fetchTournamentData('tour-1', 1)).toEqual(ANONYMOUS_BODY);
		expect(globalThis.fetch).toHaveBeenCalledTimes(2);
		expect(headerFor(1)).toBeUndefined();
	});

	it('propagates a failure instead of serving a stale body', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(
			jsonResponse({ success: false, message: 'Tournament not found', data: null }, { status: 404 })
		);

		await expect(fetchTournamentData('tour-1', 1)).rejects.toMatchObject({
			message: 'Tournament not found',
			status: 404,
		});
	});

	it('defaults the session key when none is given', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY));

		await expect(fetchTournamentData('tour-1')).resolves.toEqual(ANONYMOUS_BODY);
	});
});
