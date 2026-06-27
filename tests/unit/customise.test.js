import { describe, it, expect } from 'vitest';
import { decide, SECTIONS } from '../../js/customise.js';

describe('decide (swipe / customise toggle)', () => {
    it('keep removes the key from the hidden set', () => {
        const out = decide(new Set(['temp', 'detection']), 'temp', true);
        expect(out.has('temp')).toBe(false);
        expect(out.has('detection')).toBe(true);
    });
    it('hide adds the key', () => {
        const out = decide(new Set(), 'reference', false);
        expect(out.has('reference')).toBe(true);
    });
    it('does not mutate the input set', () => {
        const input = new Set(['temp']);
        decide(input, 'temp', true);
        expect(input.has('temp')).toBe(true);
    });
});

describe('SECTIONS metadata', () => {
    it('every section has a unique key, a label, a description and a selector', () => {
        const keys = SECTIONS.map(s => s.key);
        expect(new Set(keys).size).toBe(keys.length);
        SECTIONS.forEach(s => {
            expect(s.label).toBeTruthy();
            expect(s.desc).toBeTruthy();
            expect(s.sel).toBeTruthy();
        });
    });
});
