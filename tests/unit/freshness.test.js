import { describe, it, expect } from 'vitest';
import { daysBetween, greenAge, roastRest, fifoBeanId, roastedRemaining, roastedStock, summariseRoastedUsage } from '../../js/freshness.js';

const DAY = 86_400_000;
const ago = (d, now) => now - d * DAY;

describe('daysBetween', () => {
    it('counts whole days', () => {
        const now = 1_000 * DAY;
        expect(daysBetween(ago(5, now), now)).toBe(5);
        expect(daysBetween(now, now)).toBe(0);
    });
});

describe('greenAge', () => {
    const now = 1_000 * DAY;
    it('returns null without a date', () => expect(greenAge(null, now)).toBeNull());
    it('labels recent vs old and flags stale > 1 year', () => {
        expect(greenAge(ago(3, now), now)).toMatchObject({ days: 3, stale: false });
        expect(greenAge(ago(400, now), now).stale).toBe(true);
        expect(greenAge(ago(400, now), now).text).toMatch(/year/);
    });
});

describe('roastRest', () => {
    const now = 1_000 * DAY;
    it('resting in the first days', () => {
        expect(roastRest(ago(1, now), now).phase).toBe('resting');
    });
    it('peak window mid-range', () => {
        expect(roastRest(ago(8, now), now).phase).toBe('peak');
    });
    it('past peak after the window', () => {
        expect(roastRest(ago(40, now), now).phase).toBe('past');
    });
    it('respects custom windows', () => {
        expect(roastRest(ago(2, now), now, { restDays: 5 }).phase).toBe('resting');
    });
    it('gives a soft, approximate hint — no asserted per-method day-count', () => {
        expect(roastRest(ago(1, now), now).text).toMatch(/few days/);
        expect(roastRest(ago(8, now), now).text).toMatch(/varies/);
        // no precise countdown fields any more
        expect(roastRest(ago(1, now), now).daysLeft).toBeUndefined();
    });
});

describe('roastedRemaining', () => {
    it('assumes full when nothing recorded, else clamps to yield', () => {
        expect(roastedRemaining({ roastedWeightG: 400 })).toBe(400);
        expect(roastedRemaining({ roastedWeightG: 400, roastedRemainingG: 150 })).toBe(150);
        expect(roastedRemaining({ roastedWeightG: 400, roastedRemainingG: 0 })).toBe(0);
        expect(roastedRemaining({ roastedWeightG: 400, roastedRemainingG: 999 })).toBe(400); // over-clamp
        expect(roastedRemaining({})).toBe(0);
        expect(roastedRemaining(null)).toBe(0);
    });
});

describe('roastedStock', () => {
    it('lists roasts with stock left, oldest first, dropping empty/yieldless', () => {
        const history = [
            { id: 'a', date: '2026-06-01', roastedWeightG: 400 },                       // full
            { id: 'b', date: '2026-05-01', roastedWeightG: 400, roastedRemainingG: 100 },// older, partial
            { id: 'c', date: '2026-04-01', roastedWeightG: 400, roastedRemainingG: 0 },  // finished -> out
            { id: 'd', date: '2026-03-01' }                                              // no yield -> out
        ];
        expect(roastedStock(history).map(r => r.id)).toEqual(['b', 'a']);
    });
    it('tolerates empty input', () => {
        expect(roastedStock([])).toEqual([]);
        expect(roastedStock(null)).toEqual([]);
    });
});

describe('summariseRoastedUsage', () => {
    it('totals grams per destination + overall', () => {
        const log = [
            { grams: 18, where: 'brewed' },
            { grams: 36, where: 'brewed' },
            { grams: 250, where: 'gift' },
            { grams: 12, where: 'cupping' }
        ];
        expect(summariseRoastedUsage(log)).toEqual({ brewed: 54, gift: 250, cupping: 12, other: 0, total: 316 });
    });
    it('folds unknown/blank destinations into other and ignores non-positive grams', () => {
        const log = [{ grams: 20, where: 'mystery' }, { grams: 0, where: 'brewed' }, { grams: -5, where: 'gift' }];
        expect(summariseRoastedUsage(log)).toEqual({ brewed: 0, gift: 0, cupping: 0, other: 20, total: 20 });
    });
    it('tolerates empty/missing input', () => {
        expect(summariseRoastedUsage([]).total).toBe(0);
        expect(summariseRoastedUsage(null).total).toBe(0);
    });
});

describe('fifoBeanId', () => {
    const now = 1_000 * DAY;
    it('picks the oldest in-stock bean', () => {
        const beans = [
            { id: 'a', quantity: 500, purchasedAt: ago(10, now) },
            { id: 'b', quantity: 500, purchasedAt: ago(30, now) }, // oldest
            { id: 'c', quantity: 0, purchasedAt: ago(99, now) }    // out of stock — ignored
        ];
        expect(fifoBeanId(beans)).toBe('b');
    });
    it('ignores out-of-stock and undated beans', () => {
        expect(fifoBeanId([{ id: 'x', quantity: 0, purchasedAt: 1 }])).toBeNull();
        expect(fifoBeanId([{ id: 'y', quantity: 500 }])).toBeNull();
        expect(fifoBeanId([])).toBeNull();
    });
});
