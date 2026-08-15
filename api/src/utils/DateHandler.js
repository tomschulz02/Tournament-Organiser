// Two renderings of one calendar day.
//
// A tournament's start_date and end_date are `date` columns, and src/config/db.js
// registers a pg type parser that hands them through as the stored
// 'YYYY-MM-DD' string. So there is no instant here to convert and no timezone to
// choose — only a shape to assert.
//
// Both helpers used to route through a Date, which is what let the same
// tournament render as two different days: getISODate formatted in UTC while
// scheduleValidator's toIsoDate read the local components of the same value.
// The guard below rejects anything that is not a calendar day rather than
// quietly making one up, because a date arriving in some other form means
// something upstream has changed and should be seen.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function getISODate(date) {
    const match = String(date).match(ISO_DATE);

    if (!match) {
        throw new RangeError(`Not a calendar date: ${date}`);
    }

    return match[0];
}

export function getLongDate(date) {
    return new Date(`${getISODate(date)}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    });
}
