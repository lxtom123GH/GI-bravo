// Freshness helpers — two clocks: GREEN beans (keep ~a year) and ROASTED beans
// (rest a few days, peak ~1–3 weeks, then fade). Pure functions, no DOM, so they're
// unit-tested. Used by the pantry (green age + FIFO) and history (rest/peak badge).

const DAY = 86_400_000;

export function daysBetween(fromMs, toMs) {
    return Math.floor((toMs - fromMs) / DAY);
}

// Human age like "today" / "5 days" / "3 weeks" / "4 months".
function ageText(days) {
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days`;
    if (days < 60) return `${Math.round(days / 7)} weeks`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    const y = (days / 365);
    return y < 2 ? '1 year+' : `${Math.floor(y)} years`;
}

// Green-bean age. Green keeps a long time; flag lots older than ~12 months.
export function greenAge(purchasedAt, now = Date.now(), { staleDays = 365 } = {}) {
    if (!purchasedAt) return null;
    const days = daysBetween(purchasedAt, now);
    return { days, text: ageText(days), stale: days >= staleDays };
}

// Roasted rest/peak status — a deliberately SOFT, approximate hint. Research note
// (2026-06-29): published per-brew-method rest tables conflict source-to-source and
// experts reject one-size-fits-all, so we don't assert precise day counts or a
// brew-method window — we nudge gently and let the user's own tasting log (see
// personalPeak in tasting.js) provide the real "tasted best at day X". Phases are a
// generic guide: settling for the first few days, a broad ~1–3 week window, then fading.
export function roastRest(roastDateMs, now = Date.now(), { restDays = 4, peakEndDays = 21 } = {}) {
    if (!roastDateMs) return null;
    const days = daysBetween(roastDateMs, now);
    if (days < restDays) {
        return { phase: 'resting', days: Math.max(0, days), text: 'resting — most coffees open up after a few days' };
    }
    if (days <= peakEndDays) {
        return { phase: 'peak', days, text: `day ${days} — likely in its window (rest varies by bean & roast)` };
    }
    return { phase: 'past', days, text: `${ageText(days)} old — likely past its best` };
}

// Roasted grams still on hand for a roast. Roasted stock is deliberately simple (research:
// usually ≤2 batches, a short arc) — we track only how much is left, not lots. An untouched
// roast (no remaining recorded) is assumed full; a recorded remaining is clamped to its yield.
export function roastedRemaining(roast) {
    if (!roast) return 0;
    const full = Number(roast.roastedWeightG) || 0;
    const rem = roast.roastedRemainingG;
    if (rem === undefined || rem === null) return full;
    return Math.max(0, Math.min(full, Number(rem) || 0));
}

// The roasted stock on hand: roasts with roasted yield still remaining, oldest first
// (drink the oldest). Pure over a history array.
export function roastedStock(history) {
    return (history || [])
        .filter(r => roastedRemaining(r) > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Pick the in-stock bean to use first (oldest green) for a gentle FIFO nudge.
// beans: [{ id, quantity, purchasedAt }]. Returns the id, or null.
export function fifoBeanId(beans) {
    const inStock = (beans || []).filter(b => (Number(b.quantity) || 0) > 0 && b.purchasedAt);
    if (!inStock.length) return null;
    return inStock.reduce((oldest, b) => (b.purchasedAt < oldest.purchasedAt ? b : oldest)).id;
}
