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

// Rest/peak window for how the beans will be brewed. Espresso likes a longer
// rest (degas settles the crema); filter is drinkable sooner. Unknown → balanced
// default. Match by keyword so it's robust to the exact brew-method label.
const REST_WINDOWS = {
    espresso: { restDays: 6, peakEndDays: 21 },  // espresso, moka, aeropress
    filter:   { restDays: 2, peakEndDays: 14 },  // v60, filter, french press, cold brew
    default:  { restDays: 4, peakEndDays: 21 },
};

export function restWindowFor(method) {
    const m = String(method || '').toLowerCase();
    if (/espresso|moka|aeropress/.test(m)) return REST_WINDOWS.espresso;
    if (/v60|filter|pour|chemex|drip|french|cold/.test(m)) return REST_WINDOWS.filter;
    return REST_WINDOWS.default;
}

// Roasted rest/peak status, with a "ready in N days" / "N days left at peak"
// countdown. Defaults: resting < 4 days, peak 4–21 days, then fading. Pass a
// window from restWindowFor(method) to tailor it to how the coffee's brewed.
export function roastRest(roastDateMs, now = Date.now(), { restDays = 4, peakEndDays = 21 } = {}) {
    if (!roastDateMs) return null;
    const days = daysBetween(roastDateMs, now);
    if (days < restDays) {
        const left = Math.max(0, restDays - days);
        const text = left === 0 ? 'resting · ready tomorrow'
            : `resting · ready in ${left} day${left === 1 ? '' : 's'}`;
        return { phase: 'resting', days: Math.max(0, days), ready: false, daysLeft: left, text };
    }
    if (days <= peakEndDays) {
        const left = peakEndDays - days;
        const text = left <= 0 ? 'at peak · best now' : `at peak · ${left} day${left === 1 ? '' : 's'} left`;
        return { phase: 'peak', days, ready: true, daysLeft: Math.max(0, left), text };
    }
    return { phase: 'past', days, ready: false, daysLeft: 0, text: `${ageText(days)} old · past peak` };
}

// Pick the in-stock bean to use first (oldest green) for a gentle FIFO nudge.
// beans: [{ id, quantity, purchasedAt }]. Returns the id, or null.
export function fifoBeanId(beans) {
    const inStock = (beans || []).filter(b => (Number(b.quantity) || 0) > 0 && b.purchasedAt);
    if (!inStock.length) return null;
    return inStock.reduce((oldest, b) => (b.purchasedAt < oldest.purchasedAt ? b : oldest)).id;
}
