// A small promise-based wrapper around a single IndexedDB database holding
// custom scoresheet templates. The first thing in this application to use
// IndexedDB — see docs/handover-scoresheets.md for why templates live here
// rather than on the server: a custom template never leaves the browser.
//
// Every call is wrapped so it resolves to null/[] rather than throwing.
// IndexedDB can be unavailable (private browsing, storage quota, disabled),
// and this feature is not essential enough to break the page over that.

const DB_NAME = 'tourganiser-scoresheets';
const DB_VERSION = 1;
const STORE_NAME = 'templates';

let dbPromise = null;

function openDatabase() {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB is not available'));
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

	// A failed open must not be cached — the next call gets a fresh attempt
	// rather than replaying the same rejection forever.
	dbPromise.catch(() => {
		dbPromise = null;
	});

	return dbPromise;
}

async function withStore(mode, run) {
	try {
		const db = await openDatabase();

		return await new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, mode);
			const store = transaction.objectStore(STORE_NAME);
			const request = run(store);

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} catch {
		return undefined;
	}
}

// record: { id, name, pdfBytes (ArrayBuffer), pageCount,
// pageSize: [{ width, height }, ...], fields: [{ field, page, xRatio, yRatio, fontSize }] }
export async function saveTemplate(record) {
	const result = await withStore('readwrite', (store) => store.put(record));
	return result === undefined ? null : record;
}

export async function getTemplate(id) {
	const result = await withStore('readonly', (store) => store.get(id));
	return result || null;
}

export async function listTemplates() {
	const result = await withStore('readonly', (store) => store.getAll());
	return Array.isArray(result) ? result : [];
}

export async function deleteTemplate(id) {
	await withStore('readwrite', (store) => store.delete(id));
}
