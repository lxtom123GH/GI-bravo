import { describe, it, expect } from 'vitest';
import {
    lotGramsSum,
    weightedCostPerKg,
    fefoLotOrder,
    drawDownLots,
    implicitLot,
    getBeanLots,
    syncBeanFromLots
} from '../../js/lots.js';

const DAY = 86_400_000;
const now = 1_000 * DAY;
const ago = (d) => now - d * DAY;
const ahead = (d) => now + d * DAY;

describe('lotGramsSum', () => {
    it('sums grams, tolerating junk/empty', () => {
        expect(lotGramsSum([{ grams: 500 }, { grams: 250 }])).toBe(750);
        expect(lotGramsSum([{ grams: '300' }, { grams: undefined }])).toBe(300);
        expect(lotGramsSum([])).toBe(0);
        expect(lotGramsSum(null)).toBe(0);
    });
});

describe('weightedCostPerKg', () => {
    it('weights by grams and ignores priceless / empty lots', () => {
        // 1000 g @ 20 + 1000 g @ 30 -> 25
        expect(weightedCostPerKg([{ grams: 1000, price: 20 }, { grams: 1000, price: 30 }])).toBe(25);
        // a priceless lot doesn't drag the average down
        expect(weightedCostPerKg([{ grams: 1000, price: 20 }, { grams: 1000 }])).toBe(20);
        expect(weightedCostPerKg([{ grams: 0, price: 99 }])).toBe(0);
        expect(weightedCostPerKg([])).toBe(0);
    });
    it('weights unequal grams correctly', () => {
        // 3000 g @ 10 + 1000 g @ 30 = (30 + 30) / 4 = 15
        expect(weightedCostPerKg([{ grams: 3000, price: 10 }, { grams: 1000, price: 30 }])).toBe(15);
    });
});

describe('fefoLotOrder', () => {
    it('uses explicit best-before first, soonest to expire leading', () => {
        const lots = [
            { id: 'a', grams: 100, expiry: ahead(30) },
            { id: 'b', grams: 100, expiry: ahead(5) },  // soonest -> first
            { id: 'c', grams: 100, expiry: ahead(10) }
        ];
        expect(fefoLotOrder(lots).map(l => l.id)).toEqual(['b', 'c', 'a']);
    });
    it('falls back to purchase date (oldest first) when no best-before', () => {
        const lots = [
            { id: 'new', grams: 100, date: ago(2) },
            { id: 'old', grams: 100, date: ago(40) }   // oldest -> first
        ];
        expect(fefoLotOrder(lots).map(l => l.id)).toEqual(['old', 'new']);
    });
    it('an explicit near best-before beats a freshly-bought dated-only lot', () => {
        const lots = [
            { id: 'fresh', grams: 100, date: ago(1) },        // implied best-before ~1yr out
            { id: 'expiring', grams: 100, date: ago(1), expiry: ahead(7) }
        ];
        expect(fefoLotOrder(lots)[0].id).toBe('expiring');
    });
    it('does not mutate the input', () => {
        const lots = [{ id: 'a', date: ago(1) }, { id: 'b', date: ago(2) }];
        const copy = JSON.parse(JSON.stringify(lots));
        fefoLotOrder(lots);
        expect(lots).toEqual(copy);
    });
});

describe('drawDownLots', () => {
    it('takes from the FEFO-first (oldest) lot first', () => {
        const lots = [
            { id: 'new', grams: 500, date: ago(2) },
            { id: 'old', grams: 500, date: ago(40) }
        ];
        const after = drawDownLots(lots, 300);
        expect(after.find(l => l.id === 'old').grams).toBe(200);
        expect(after.find(l => l.id === 'new').grams).toBe(500);
    });
    it('drains across lots and drops emptied ones', () => {
        const lots = [
            { id: 'old', grams: 500, date: ago(40) },
            { id: 'new', grams: 500, date: ago(2) }
        ];
        const after = drawDownLots(lots, 700);
        expect(after.map(l => l.id)).toEqual(['new']);
        expect(after[0].grams).toBe(300);
    });
    it('does not mutate the input lots', () => {
        const lots = [{ id: 'old', grams: 500, date: ago(40) }];
        drawDownLots(lots, 200);
        expect(lots[0].grams).toBe(500);
    });
});

describe('implicitLot / getBeanLots', () => {
    it('builds one lot from a flat bean', () => {
        const bean = { quantity: 800, purchasedAt: ago(5), costPerKg: 22 };
        expect(implicitLot(bean)).toMatchObject({ grams: 800, date: ago(5), price: 22 });
    });
    it('getBeanLots returns real lots when present, else the implicit lot', () => {
        const flat = { quantity: 800, purchasedAt: ago(5) };
        expect(getBeanLots(flat)).toHaveLength(1);
        expect(getBeanLots(flat)[0].grams).toBe(800);
        const withLots = { lots: [{ grams: 1 }, { grams: 2 }] };
        expect(getBeanLots(withLots)).toHaveLength(2);
    });
});

describe('syncBeanFromLots', () => {
    it('derives quantity, weighted cost and earliest date', () => {
        const bean = {
            quantity: 0, costPerKg: 0, purchasedAt: ago(5),
            lots: [
                { grams: 1000, price: 20, date: ago(40) },
                { grams: 1000, price: 30, date: ago(5) }
            ]
        };
        syncBeanFromLots(bean);
        expect(bean.quantity).toBe(2000);
        expect(bean.costPerKg).toBe(25);
        expect(bean.purchasedAt).toBe(ago(40)); // earliest lot
    });
    it('leaves an existing cost alone when no lot carries a price', () => {
        const bean = { quantity: 0, costPerKg: 18, lots: [{ grams: 500 }] };
        syncBeanFromLots(bean);
        expect(bean.quantity).toBe(500);
        expect(bean.costPerKg).toBe(18);
    });
    it('is a no-op for a bean without lots', () => {
        const bean = { quantity: 500, costPerKg: 10 };
        syncBeanFromLots(bean);
        expect(bean).toEqual({ quantity: 500, costPerKg: 10 });
    });
});
