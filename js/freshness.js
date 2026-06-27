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

// Roasted rest/peak status. Defaults: resting < 4 days, peak 4–21 days, then fading.
// (Best is often ~4–14 days; espresso likes a longer rest, filter a shorter one.)
export function roastRest(roastDateMs, now = Date.now(), { restDays = 4, peakEndDays = 21 } = {}) {
    if (!roastDateMs) return null;
    const days = daysBetween(roastDateMs, now);
    if (days < 0) return { phase: 'resting', days: 0, text: 'just roasted' };
    if (days < restDays) return { phase: 'resting', days, text: `resting · day ${days + 1} of ~${restDays}` };
    if (days <= peakEndDays) return { phase: 'peak', days, text: `ready · day ${days} (peak)` };
    return { phase: 'past', days, text: `${ageText(days)} old · past peak` };
}

// Pick the in-stock bean to use first (oldest green) for a gentle FIFO nudge.
// beans: [{ id, quantity, purchasedAt }]. Returns the id, or null.
export function fifoBeanId(beans) {
    const inStock = (beans || []).filter(b => (Number(b.quantity) || 0) > 0 && b.purchasedAt);
    if (!inStock.length) return null;
    return inStock.reduce((oldest, b) => (b.purchasedAt < oldest.purchasedAt ? b : oldest)).id;
}
