import { describe, it, expect } from 'vitest';
import { priceHistory, priceTrend } from '../../js/sourcebook.js';

const DAY = 86_400_000;
const now = 1_000 * DAY;
const ago = (d) => now - d * DAY;

describe('priceHistory', () => {
    it('reads dated priced lots, oldest first', () => {
        const bean = {
            lots: [
                { grams: 1000, price: 30, date: ago(5) },
                { grams: 1000, price: 20, date: ago(40) },
                { grams: 1000, date: ago(10) }          // no price -> excluded
            ]
        };
        expect(priceHistory(bean).map(p => p.price)).toEqual([20, 30]);
    });
    it('works for a flat bean via its implicit lot', () => {
        const flat = { quantity: 800, purchasedAt: ago(3), costPerKg: 22 };
        expect(priceHistory(flat)).toEqual([{ date: ago(3), price: 22, grams: 800 }]);
    });
    it('is empty when no priced/dated lots exist', () => {
        expect(priceHistory({ quantity: 500 })).toEqual([]);
    });
});

describe('priceTrend', () => {
    it('reports direction and % change between first and last', () => {
        const t = priceTrend([{ price: 20 }, { price: 25 }]);
        expect(t).toMatchObject({ first: 20, last: 25, direction: 'up' });
        expect(t.deltaPct).toBeCloseTo(25);
    });
    it('detects a drop', () => {
        expect(priceTrend([{ price: 30 }, { price: 24 }]).direction).toBe('down');
    });
    it('flat when unchanged', () => {
        expect(priceTrend([{ price: 20 }, { price: 20 }]).direction).toBe('flat');
    });
    it('null with fewer than two points', () => {
        expect(priceTrend([{ price: 20 }])).toBeNull();
        expect(priceTrend([])).toBeNull();
        expect(priceTrend(null)).toBeNull();
    });
});
