// Two renderings of one calendar day, in UTC.
//
// getISODate used to add a day before formatting and getLongDate did not, so the
// same tournament rendered as two different dates depending on which helper the
// caller reached for. Nothing compensated for the shift anywhere, so it was
// simply off by one; removing it is the fix.
//
// getLongDate is derived from getISODate rather than formatting the Date
// directly. That is what stops the two drifting apart again: formatting the raw
// Date uses the server's local timezone, which on a non-UTC host would land on a
// different day from the UTC-based ISO form. test/setup.js pins TZ=UTC, so the
// tests would not catch that on their own.

export function getISODate(date) {
    return new Date(date).toISOString().split("T")[0];
}

export function getLongDate(date) {
    return new Date(`${getISODate(date)}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    });
}
