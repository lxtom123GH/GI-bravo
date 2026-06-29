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

const DAY_MS = 86_400_000;
const EMOJI_RANK = { sad: 1, neutral: 2, happy: 3 };

// A comparable rating for a tasting entry: prefer a numeric cupping total, else
// the casual emoji (sad/neutral/happy → 1/2/3). null if neither is present.
export function tastingRating(entry) {
    if (!entry) return null;
    const total = entry.scores && entry.scores.total;
    if (total != null && !isNaN(Number(total))) return { value: Number(total), kind: 'score' };
    if (entry.emoji && EMOJI_RANK[entry.emoji] != null) return { value: EMOJI_RANK[entry.emoji], kind: 'emoji' };
    return null;
}

// The user's OWN "tasted best at day X" — grounded rest guidance from their dated
// tasting log, not a generic table. Returns the day-since-roast of the highest-
// rated tasting. Needs >= minEntries rated entries AND some spread (all-equal =
// no signal → null, so the caller falls back to the soft generic hint).
export function personalPeak(roastDateMs, log, { minEntries = 2 } = {}) {
    if (!roastDateMs || !Array.isArray(log)) return null;
    const rated = [];
    for (const e of log) {
        const r = tastingRating(e);
        if (!r || !e.date) continue;
        const dayN = Math.floor((new Date(day(e.date)).getTime() - roastDateMs) / DAY_MS);
        if (!isNaN(dayN)) rated.push({ value: r.value, kind: r.kind, day: Math.max(0, dayN) });
    }
    if (rated.length < minEntries) return null;
    const values = rated.map(e => e.value);
    if (Math.max(...values) === Math.min(...values)) return null; // flat ratings → no meaningful peak
    rated.sort((a, b) => b.value - a.value || a.day - b.day); // best rating, ties → earlier day
    const top = rated[0];
    return { day: top.day, value: top.value, kind: top.kind, samples: rated.length };
}
