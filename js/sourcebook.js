// Source book — where a bean comes from and what it has cost over time. The price history
// is derived from the bean's lots (each green lot is a dated, optionally priced purchase —
// see js/lots.js), so a "price trend" and "re-order" come for free without a second store.
// Supplier details (name + re-order link) live on the bean itself. All pure here — no DOM.

import { getBeanLots } from './lots.js';

// Dated price points for a bean, oldest first — only the lots that carry a price and date.
// Works for a flat (pre-lots) bean too, via its implicit lot.
export function priceHistory(bean) {
    return getBeanLots(bean)
        .filter(l => (Number(l.price) || 0) > 0 && l.date)
        .map(l => ({ date: l.date, price: Number(l.price), grams: Number(l.grams) || 0 }))
        .sort((a, b) => a.date - b.date);
}

// Summarise a price history: first vs latest price and the % change between them.
// Returns null when there aren't at least two priced points to compare.
export function priceTrend(history) {
    const h = history || [];
    if (h.length < 2) return null;
    const first = h[0].price;
    const last = h[h.length - 1].price;
    const deltaPct = first > 0 ? ((last - first) / first) * 100 : 0;
    const direction = last > first ? 'up' : (last < first ? 'down' : 'flat');
    return { first, last, deltaPct, direction };
}
