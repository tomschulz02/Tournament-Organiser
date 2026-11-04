import { describe, expect, it } from 'vitest';
import { formatStartCountdown, getDateTile } from '../src/utils/tournamentDates';

describe('getDateTile', () => {
	it('shows one date for a one-day event', () => {
		expect(getDateTile('2026-11-07', '2026-11-07')).toEqual({
			month: 'Nov',
			day: '07',
			year: '2026',
			isRange: false,
			spansMonths: false,
		});
	});

	it('treats a missing end date as one day', () => {
		expect(getDateTile('2026-11-07', '').isRange).toBe(false);
	});

	it('treats an unreadable end date as one day', () => {
		expect(getDateTile('2026-11-07', 'soon').isRange).toBe(false);
	});

	it('treats an end date before the start as one day', () => {
		expect(getDateTile('2026-11-07', '2026-11-01').day).toBe('07');
	});

	it('shows a day range within one month', () => {
		expect(getDateTile('2026-09-01', '2026-09-04')).toEqual({
			month: 'Sept',
			day: '01–04',
			year: '2026',
			isRange: true,
			spansMonths: false,
		});
	});

	it('names both months when a range crosses a month', () => {
		expect(getDateTile('2026-09-28', '2026-10-02')).toEqual({
			month: 'Sept–Oct',
			day: '28–02',
			year: '2026',
			isRange: true,
			spansMonths: true,
		});
	});

	it('names both years when a range crosses a year', () => {
		expect(getDateTile('2026-12-30', '2027-01-02')).toEqual({
			month: 'Dec–Jan',
			day: '30–02',
			year: '2026–27',
			isRange: true,
			spansMonths: true,
		});
	});

	it('spans months when the same month falls in different years', () => {
		expect(getDateTile('2026-11-30', '2027-11-02').month).toBe('Nov–Nov');
	});

	it('reads a full timestamp in the local timezone', () => {
		const local = new Date(2026, 10, 7, 12).toISOString();

		expect(getDateTile(local, null).day).toBe('07');
	});

	it('returns null without a readable start date', () => {
		expect(getDateTile('', '2026-11-07')).toBeNull();
		expect(getDateTile(null, null)).toBeNull();
		expect(getDateTile('not a date', null)).toBeNull();
	});
});

describe('formatStartCountdown', () => {
	const now = new Date(2026, 10, 4, 13, 30);

	it('counts calendar days, whatever the time of day', () => {
		expect(formatStartCountdown('2026-11-07', now)).toBe('starts in 3 days');
		expect(formatStartCountdown('2026-11-07', new Date(2026, 10, 4, 23, 59))).toBe('starts in 3 days');
	});

	it('names today and tomorrow', () => {
		expect(formatStartCountdown('2026-11-04', now)).toBe('starts today');
		expect(formatStartCountdown('2026-11-05', now)).toBe('starts tomorrow');
	});

	it('counts correctly across a month end', () => {
		expect(formatStartCountdown('2026-12-01', now)).toBe('starts in 27 days');
	});

	it('says nothing once the start date has passed', () => {
		expect(formatStartCountdown('2026-11-03', now)).toBe('');
	});

	it('says nothing without a readable date', () => {
		expect(formatStartCountdown('', now)).toBe('');
		expect(formatStartCountdown('not a date', now)).toBe('');
	});

	it('defaults to the current date', () => {
		expect(formatStartCountdown('2000-01-01')).toBe('');
	});
});
