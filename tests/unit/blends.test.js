import { describe, it, expect } from 'vitest';
import { splitBlend, preBlendWarning } from '../../js/blends.js';

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
