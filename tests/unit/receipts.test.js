import { describe, it, expect } from 'vitest';
import { purchaseTotal } from '../../js/receipts.js';

describe('purchaseTotal', () => {
    it('sums kg × cost/kg across items', () => {
        // 2500 g @ $40/kg = $100; 500 g @ $60/kg = $30 → $130
        expect(purchaseTotal([
            { grams: 2500, costPerKg: 40 },
            { grams: 500, costPerKg: 60 }
        ])).toBeCloseTo(130, 6);
    });
    it('ignores rows without a price', () => {
        expect(purchaseTotal([{ grams: 1000 }, { grams: 1000, costPerKg: 25 }])).toBeCloseTo(25, 6);
    });
    it('handles empty / missing input', () => {
        expect(purchaseTotal([])).toBe(0);
        expect(purchaseTotal(undefined)).toBe(0);
    });
});
