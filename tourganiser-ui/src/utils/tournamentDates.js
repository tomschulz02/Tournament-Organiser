// What the Discover card shows of a tournament's dates: the tile's month, day and
// year, and how long until it starts. Pure, so the edge cases can be tested without
// rendering a card.
//
// Everything works on calendar dates rather than instants. A tournament on the 7th
// is on the 7th, and comparing timestamps would count the hours left in today.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

// A bare YYYY-MM-DD is read as written. Anything else is an instant, read in the
// viewer's own timezone. A date that can't be read is null.
function readCalendarDate(value) {
	if (!value) return null;

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;

	return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate() };
}

const toUtc = ({ year, month, day }) => Date.UTC(year, month, day);
const monthName = (date) => MONTH_FORMAT.format(toUtc(date));
const twoDigits = (number) => String(number).padStart(2, '0');

// null when there is no readable start date. An end date that is missing, unreadable,
// or not after the start means a one-day event.
export function getDateTile(startValue, endValue) {
	const start = readCalendarDate(startValue);
	if (!start) return null;

	const end = readCalendarDate(endValue);

	if (!end || toUtc(end) <= toUtc(start)) {
		return {
			month: monthName(start),
			day: twoDigits(start.day),
			year: String(start.year),
			isRange: false,
			spansMonths: false,
		};
	}

	const sameYear = start.year === end.year;
	const spansMonths = !sameYear || start.month !== end.month;

	return {
		month: spansMonths ? `${monthName(start)}–${monthName(end)}` : monthName(start),
		day: `${twoDigits(start.day)}–${twoDigits(end.day)}`,
		year: sameYear ? String(start.year) : `${start.year}–${String(end.year).slice(-2)}`,
		isRange: true,
		spansMonths,
	};
}

// '' once the start date has passed: a tournament that should have started and
// hasn't is the organiser's business, and "starts in -2 days" helps nobody.
export function formatStartCountdown(startValue, now = new Date()) {
	const start = readCalendarDate(startValue);
	if (!start) return '';

	const days = Math.round((toUtc(start) - toUtc(readCalendarDate(now))) / MS_PER_DAY);

	if (days < 0) return '';
	if (days === 0) return 'starts today';
	if (days === 1) return 'starts tomorrow';

	return `starts in ${days} days`;
}
