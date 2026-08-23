import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchTournamentData, clearTournamentCache } from '../src/requests';

// The client half of the tournament view cache. The server's viewer-aware ETag
// is what actually makes it safe — a stale entry from another session simply
// never matches — but these assert the client does its part: it revalidates
// rather than serving blind, it survives a reload, it does not hoard payloads
// across sessions, and a storage API that is missing, full or corrupted costs a
// cache rather than the page.

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

// A tab's sessionStorage. `throwOn` covers the browsers this has to survive:
// storage disabled or private mode, where every call throws, and a full quota,
// where only the write does.
function createStorage({ throwOn = [] } = {}) {
	const values = new Map();
	const guard = (call) => {
		if (throwOn.includes(call)) throw new Error(`sessionStorage.${call} unavailable`);
	};

	return {
		values,
		get length() {
			guard('length');
			return values.size;
		},
		key: (index) => {
			guard('key');
			return [...values.keys()][index] ?? null;
		},
		getItem: (key) => {
			guard('getItem');
			return values.has(key) ? values.get(key) : null;
		},
		setItem: (key, value) => {
			guard('setItem');
			values.set(key, String(value));
		},
		removeItem: (key) => {
			guard('removeItem');
			values.delete(key);
		},
	};
}

function headerFor(callIndex) {
	return globalThis.fetch.mock.calls[callIndex][1].headers?.['If-None-Match'];
}

function storedEntries() {
	const [stored] = [...globalThis.window.sessionStorage.values.values()];
	return stored ? JSON.parse(stored).entries : [];
}

function useStorage(storage) {
	globalThis.window = { sessionStorage: storage };
	return storage;
}

beforeEach(() => {
	useStorage(createStorage());
	globalThis.fetch = vi.fn();
});

afterEach(() => {
	delete globalThis.window;
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

	// The whole point of the change. Module state is discarded on a reload;
	// sessionStorage is not, so the validator is still there to send.
	it('still holds its validator after a reload', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		vi.resetModules();
		const reloaded = await import('../src/requests');

		globalThis.fetch.mockResolvedValueOnce(notModified('"v1"'));

		expect(await reloaded.fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);
		expect(headerFor(1)).toBe('"v1"');
	});

	// sessionStorage is per tab, so a new tab starts empty. The organiser payload
	// does not outlive the tab it was fetched in, which is what localStorage
	// would not have given.
	it('starts empty in a new tab', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		useStorage(createStorage());

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(1)).toBeUndefined();
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
	it("does not offer one session's validator under another", async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"organiser"' }));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY, { etag: '"anon"' }));
		const payload = await fetchTournamentData('tour-1', 2);

		expect(headerFor(1)).toBeUndefined();
		expect(payload.data.creator).toBe(false);
	});

	it('forgets every session when the cache is cleared, as it is on logout', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ANONYMOUS_BODY));
		await fetchTournamentData('tour-1', 2);

		clearTournamentCache();
		expect(globalThis.window.sessionStorage.values.size).toBe(0);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(2)).toBeUndefined();
	});

	// A payload carries every division, fixture and standings row, and the tab
	// has a few megabytes.
	it('keeps only the most recent few tournaments', async () => {
		for (const id of ['tour-1', 'tour-2', 'tour-3', 'tour-4']) {
			globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: `"${id}"` }));
			await fetchTournamentData(id, 1);
		}

		expect(storedEntries().map((entry) => entry.id)).toEqual(['tour-4', 'tour-3', 'tour-2']);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(4)).toBeUndefined();
	});

	it('stores the validator and the payload, and nothing else', async () => {
		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY, { etag: '"v1"' }));
		await fetchTournamentData('tour-1', 1);

		expect(Object.keys(storedEntries()[0]).sort()).toEqual(['etag', 'id', 'payload']);
	});

	// Everything from here down is about the storage API failing, and the answer
	// is the same every time: no cache, and a page that still opens.
	it('discards a corrupted entry and serves the request anyway', async () => {
		globalThis.window.sessionStorage.setItem('tourganiser.tournament-cache.1', '{ not json');

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));

		expect(await fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);
		expect(headerFor(0)).toBeUndefined();
	});

	it('discards an entry written by an older version', async () => {
		globalThis.window.sessionStorage.setItem(
			'tourganiser.tournament-cache.1',
			JSON.stringify({ version: 0, entries: [{ id: 'tour-1', etag: '"old"', payload: ORGANISER_BODY }] }),
		);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(0)).toBeUndefined();
	});

	it('discards an entry of the wrong shape', async () => {
		globalThis.window.sessionStorage.setItem(
			'tourganiser.tournament-cache.1',
			JSON.stringify({ version: 1, entries: [{ id: 'tour-1' }] }),
		);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		await fetchTournamentData('tour-1', 1);

		expect(headerFor(0)).toBeUndefined();
	});

	it('works with storage disabled entirely', async () => {
		useStorage(createStorage({ throwOn: ['length', 'key', 'getItem', 'setItem', 'removeItem'] }));

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		expect(await fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));
		expect(await fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);

		expect(headerFor(1)).toBeUndefined();
		expect(() => clearTournamentCache()).not.toThrow();
	});

	it('serves the page when the write fails on a full quota', async () => {
		useStorage(createStorage({ throwOn: ['setItem'] }));

		globalThis.fetch.mockResolvedValueOnce(jsonResponse(ORGANISER_BODY));

		expect(await fetchTournamentData('tour-1', 1)).toEqual(ORGANISER_BODY);
		expect(globalThis.window.sessionStorage.values.size).toBe(0);
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
			jsonResponse({ success: false, message: 'Tournament not found', data: null }, { status: 404 }),
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
