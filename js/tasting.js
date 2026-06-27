// Tasting-over-time. A roast can have several dated tastings, because coffee changes as it
// rests and ages (e.g. day 3 vs day 14 vs day 28). History stores them in roast.tastingLog
// and keeps roast.tastingNotes = the latest entry, so all existing displays/exports keep
// working unchanged. Pure helpers (no DOM) so they're easy to test.

const day = (d) => (d || '').slice(0, 10);

// Add or replace the entry for its date, returning a new date-sorted array.
export function upsertTasting(log, entry) {
    const list = Array.isArray(log) ? log.slice() : [];
    const i = list.findIndex(e => day(e.date) === day(entry.date));
    if (i >= 0) list[i] = entry; else list.push(entry);
    list.sort((a, b) => new Date(day(a.date) || 0) - new Date(day(b.date) || 0));
    return list;
}

// Most recent entry (last by date), or null.
export function latestTasting(log) {
    if (!Array.isArray(log) || !log.length) return null;
    return log[log.length - 1];
}

// Strip the date → the legacy roast.tastingNotes shape.
export function toNotes(entry) {
    if (!entry) return undefined;
    const { date, ...notes } = entry;
    return notes;
}
