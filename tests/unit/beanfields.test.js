import { describe, it, expect } from 'vitest';
import { decide, BEAN_FIELDS } from '../../js/beanfields.js';

describe('BEAN_FIELDS metadata', () => {
    it('every field has a unique key and a label', () => {
        const keys = BEAN_FIELDS.map(f => f.key);
        expect(new Set(keys).size).toBe(keys.length);
        BEAN_FIELDS.forEach(f => {
            expect(f.key).toBeTruthy();
            expect(f.label).toBeTruthy();
        });
    });
    it('covers the optional add-bean fields', () => {
        const keys = BEAN_FIELDS.map(f => f.key);
        expect(keys).toEqual(expect.arrayContaining(['country', 'region', 'farm', 'process', 'cost', 'supplier', 'densitysize']));
    });
});

describe('decide (reused keep/hide toggle)', () => {
    it('keep removes a field key, hide adds it, without mutating input', () => {
        const input = new Set(['cost']);
        expect(decide(input, 'cost', true).has('cost')).toBe(false);
        expect(decide(new Set(), 'farm', false).has('farm')).toBe(true);
        expect(input.has('cost')).toBe(true); // unchanged
    });
});
