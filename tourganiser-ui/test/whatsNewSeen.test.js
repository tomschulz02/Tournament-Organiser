import { describe, expect, it } from 'vitest';
import {
	CLOSED_KEY,
	DISMISSED_KEY,
	recordWhatsNewClosed,
	recordWhatsNewDismissed,
	shouldShowWhatsNew,
} from '../src/utils/whatsNewSeen';

function fakeStorage(initial = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key) => (values.has(key) ? values.get(key) : null),
		setItem: (key, value) => values.set(key, String(value)),
		values,
	};
}

const throwing = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('blocked');
	},
};

describe('shouldShowWhatsNew', () => {
	it('shows on a first visit', () => {
		expect(shouldShowWhatsNew('1.1', { local: fakeStorage(), session: fakeStorage() })).toBe(true);
	});

	it('hides once dismissed for this release', () => {
		const local = fakeStorage({ [DISMISSED_KEY]: '1.1' });
		expect(shouldShowWhatsNew('1.1', { local, session: fakeStorage() })).toBe(false);
	});

	it('shows again when the dismissal was for an older release', () => {
		const local = fakeStorage({ [DISMISSED_KEY]: '1.0' });
		expect(shouldShowWhatsNew('1.1', { local, session: fakeStorage() })).toBe(true);
	});

	it('hides once closed in this session', () => {
		const session = fakeStorage({ [CLOSED_KEY]: '1.1' });
		expect(shouldShowWhatsNew('1.1', { local: fakeStorage(), session })).toBe(false);
	});

	it('shows again when the session close was for an older release', () => {
		const session = fakeStorage({ [CLOSED_KEY]: '1.0' });
		expect(shouldShowWhatsNew('1.1', { local: fakeStorage(), session })).toBe(true);
	});

	it('shows when storage throws on read', () => {
		expect(shouldShowWhatsNew('1.1', { local: throwing, session: throwing })).toBe(true);
	});

	it('shows when no storage is available at all', () => {
		expect(shouldShowWhatsNew('1.1')).toBe(true);
	});

	it('never shows without a release', () => {
		expect(shouldShowWhatsNew('', { local: fakeStorage(), session: fakeStorage() })).toBe(false);
	});
});

describe('recording a close or a dismissal', () => {
	it('records a close against the release in session storage', () => {
		const session = fakeStorage();
		recordWhatsNewClosed('1.1', session);
		expect(session.values.get(CLOSED_KEY)).toBe('1.1');
		expect(shouldShowWhatsNew('1.1', { local: fakeStorage(), session })).toBe(false);
	});

	it('records a dismissal against the release in local storage', () => {
		const local = fakeStorage();
		recordWhatsNewDismissed('1.1', local);
		expect(local.values.get(DISMISSED_KEY)).toBe('1.1');
		expect(shouldShowWhatsNew('1.1', { local, session: fakeStorage() })).toBe(false);
	});

	it('does not throw when storage throws on write', () => {
		expect(() => recordWhatsNewClosed('1.1', throwing)).not.toThrow();
		expect(() => recordWhatsNewDismissed('1.1', throwing)).not.toThrow();
	});

	it('does not throw without storage', () => {
		expect(() => recordWhatsNewClosed('1.1', undefined)).not.toThrow();
		expect(() => recordWhatsNewDismissed('1.1', null)).not.toThrow();
	});
});
