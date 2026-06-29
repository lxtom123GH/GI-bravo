// Green-bean LOTS — sub-records under a pantry bean. A bean is the SKU; each lot is a
// dated (and optionally priced / best-before) purchase of that bean. The bean's
// grams-on-hand stays the SUM of its lot grams and its cost/kg the grams-weighted
// average, so every existing consumer (roast decrement, value, history, blends) keeps
// reading bean.quantity / bean.costPerKg unchanged — lots are purely additive depth.
//
// Freshness across lots is a FEFO ("first expiry, first out") order: lots are used in
// order of soonest best-before. A lot with only a purchase date gets an implied
// best-before of date + ~1 year (green keeps roughly that long), so dated-only lots fall
// back to plain FIFO while an explicit best-before still takes priority.
//
// One lot: { id, grams, date (ms), price? (cost/kg), expiry? (best-before, ms) }.
// All pure — no DOM, no storage — so it's unit-tested.

const DAY = 86_400_000;
const GREEN_SHELF_DAYS = 365;

export function lotGramsSum(lots) {
    return (lots || []).reduce((sum, l) => sum + (Number(l.grams) || 0), 0);
}

// Grams-weighted average cost per kg across lots that carry a price. Lots without a
// price (or with zero grams) are simply excluded — they don't drag the average to zero.
// Returns 0 when no priced lots exist.
export function weightedCostPerKg(lots) {
    let grams = 0, cost = 0;
    for (const l of lots || []) {
        const g = Number(l.grams) || 0;
        const p = Number(l.price) || 0;
        if (g > 0 && p > 0) {
            grams += g;
            cost += (g / 1000) * p;
        }
    }
    return grams > 0 ? cost / (grams / 1000) : 0;
}

// The key a lot is ordered by for FEFO: its best-before if set, else its purchase date
// plus the implied green shelf life. Undated/unexpiring lots sort last.
function fefoKey(lot) {
    if (lot.expiry) return lot.expiry;
    if (lot.date) return lot.date + GREEN_SHELF_DAYS * DAY;
    return Infinity;
}

// FEFO "use first" order: soonest (implied or explicit) best-before first; ties keep
// input order. Returns a new array — does not mutate the input.
export function fefoLotOrder(lots) {
    return (lots || [])
        .map((l, i) => ({ l, i }))
        .sort((a, b) => (fefoKey(a.l) - fefoKey(b.l)) || (a.i - b.i))
        .map(x => x.l);
}

// Draw `grams` of green out of the lots, taking from the FEFO-first lots first (use the
// oldest / soonest-to-expire stock first). Pure: returns a NEW lot array with emptied
// lots dropped; the originals are untouched.
export function drawDownLots(lots, grams) {
    let remaining = Math.max(0, Number(grams) || 0);
    return fefoLotOrder(lots)
        .map(lot => {
            const have = Number(lot.grams) || 0;
            const take = Math.min(have, remaining);
            remaining -= take;
            return { ...lot, grams: have - take };
        })
        .filter(l => l.grams > 0);
}

// Represent a flat (pre-lots) bean as a single implicit lot, so an existing bean migrates
// cleanly the first time the user adds a real lot to it.
export function implicitLot(bean) {
    return {
        id: 'l-implicit',
        grams: Number(bean && bean.quantity) || 0,
        date: (bean && bean.purchasedAt) || null,
        price: Number(bean && bean.costPerKg) || 0
    };
}

// The lots to display/operate on: the bean's real lots if it has any, else one implicit
// lot built from its flat fields.
export function getBeanLots(bean) {
    return (bean && Array.isArray(bean.lots) && bean.lots.length)
        ? bean.lots
        : [implicitLot(bean)];
}

// Re-derive the bean's flat fields from its lots so back-compat consumers stay correct:
//   quantity   = sum of lot grams
//   costPerKg  = grams-weighted average (only updated when some lot carries a price)
//   purchasedAt = earliest lot date (keeps the green-age / FIFO badge meaningful)
// Mutates and returns the bean. No-op for a bean without a lots array.
export function syncBeanFromLots(bean) {
    if (!bean || !Array.isArray(bean.lots)) return bean;
    bean.quantity = lotGramsSum(bean.lots);
    const wc = weightedCostPerKg(bean.lots);
    if (wc > 0) bean.costPerKg = Math.round(wc * 100) / 100;
    const dates = bean.lots.map(l => l.date).filter(Boolean);
    if (dates.length) bean.purchasedAt = Math.min(...dates);
    return bean;
}
