import { useEffect, useState } from 'react';
import { scheduleClock } from './scheduleNow';

// How often the clock is re-read. Slots are minutes long, so half a minute keeps
// "now" honest without re-rendering for nothing. Independent of the page's 20 s
// data poll.
const CLOCK_TICK_MS = 30000;

// The device's wall clock as { date, time } (see scheduleNow.js), re-read every
// half minute. The one place the Overview and Fixtures & Schedule read a Date,
// so the helpers they pass it to stay pure.
export function useScheduleClock() {
	const [now, setNow] = useState(() => scheduleClock(new Date()));

	useEffect(() => {
		const timer = setInterval(() => setNow(scheduleClock(new Date())), CLOCK_TICK_MS);
		return () => clearInterval(timer);
	}, []);

	return now;
}
