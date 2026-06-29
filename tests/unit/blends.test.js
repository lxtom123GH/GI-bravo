import { describe, it, expect } from 'vitest';
import { splitBlend, preBlendWarning, suggestBlends } from '../../js/blends.js';

describe('preBlendWarning', () => {
    const beans = [
        { id: 'a', density: 'High', size: 'Small' },
        { id: 'b', density: 'High', size: 'Small' },
        { id: 'c', density: 'Low', size: 'Large' },
        { id: 'd', name: 'no attrs' }
    ];
    it('warns when density/size differ', () => {
        expect(preBlendWarning(['a', 'c'], beans).level).toBe('warn');
    });
    it('ok when similar', () => {
        expect(preBlendWarning(['a', 'b'], beans).level).toBe('ok');
    });
    it('info (generic tip) when attributes are missing', () => {
        expect(preBlendWarning(['a', 'd'], beans).level).toBe('info');
    });
});

describe('splitBlend', () => {
    it('splits by percentage', () => {
        const parts = splitBlend([
            { beanName: 'Colombia', pct: 60 },
            { beanName: 'Brazil', pct: 40 }
        ], 450);
        expect(parts.map(p => p.grams)).toEqual([270, 180]);
    });

    it('always sums exactly to the total (rounding goes to the largest)', () => {
        const parts = splitBlend([
            { beanName: 'A', pct: 33 },
            { beanName: 'B', pct: 33 },
            { beanName: 'C', pct: 34 }
        ], 100);
        const sum = parts.reduce((s, p) => s + p.grams, 0);
        expect(sum).toBe(100);
    });

    it('handles a single 100% component', () => {
        expect(splitBlend([{ beanName: 'Solo', pct: 100 }], 500)[0].grams).toBe(500);
    });
});

describe('suggestBlends', () => {
    it('surfaces a classic when the pantry can make it (matches by name/country)', () => {
        const pantry = [
            { id: 'a', name: 'Finca X', country: 'Colombia', quantity: 500 },
            { id: 'b', name: 'Brazil Cerrado', quantity: 500 },
        ];
        const out = suggestBlends(pantry);
        const everyday = out.find(s => /Everyday/.test(s.name));
        expect(everyday).toBeTruthy();
        expect(everyday.makeable).toBe(true);
        // each component is filled by a distinct in-stock bean
        const ids = everyday.components.map(c => c.beanId);
        expect(new Set(ids).size).toBe(2);
    });

    it('excludes out-of-stock beans (blend no longer makeable)', () => {
        const pantry = [
            { id: 'a', name: 'Colombia', quantity: 0 },   // out of stock
            { id: 'b', name: 'Brazil', quantity: 500 },
        ];
        expect(suggestBlends(pantry).some(s => /Everyday/.test(s.name))).toBe(false);
    });

    it('returns nothing for an empty pantry', () => {
        expect(suggestBlends([])).toEqual([]);
    });
});
