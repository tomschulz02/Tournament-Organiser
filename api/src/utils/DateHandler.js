export function getISODate(date) {
	var start = new Date(date);
	start.setUTCDate(start.getUTCDate() + 1);
	start = start.toISOString().split('T')[0];

	return start;
}

export function getLongDate(date) {
    const isoDate = getISODate(date);
    const longDate = date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return longDate;
}