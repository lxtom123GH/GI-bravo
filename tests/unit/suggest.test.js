import { describe, it, expect } from 'vitest';
import {
    buildSuggestions, parseBeanName, orderByContext, uniqueValue,
    SEED_COUNTRIES, SEED_PROCESSES, SEED_SUPPLIERS,
} from '../../js/suggest.js';

const PANTRY = [
    { supplier: 'Bean Bay', country: 'Brazil', region: 'Cerrado', process: 'Pulped Natural' },
    { supplier: 'Bean Bay', country: 'Ethiopia', region: 'Yirgacheffe', process: 'Washed' },
    { supplier: 'Bean Bay', country: 'Ethiopia', region: 'Guji', process: 'Natural' },
    { supplier: 'Cofi-Com', country: 'Colombia', region: 'Huila', process: 'Washed' },
];

describe('buildSuggestions', () => {
    it('ranks suppliers by frequency, then fills with the AU seed', () => {
        const s = buildSuggestions(PANTRY);
        // The user's own suppliers lead (Bean Bay used 3×, then Cofi-Com)...
        expect(s.suppliers.slice(0, 2)).toEqual(['Bean Bay', 'Cofi-Com']);
        // ...then the seed fills the rest so the datalist isn't empty for new fields.
        expect(s.suppliers).toContain('BeanBay (CoffeeSnobs)');
    });
    it('puts used countries before seed values and dedupes', () => {
        const s = buildSuggestions(PANTRY);
        // Ethiopia used 2×, Brazil + Colombia 1× → those three lead, then seed fills the rest.
        expect(s.countries.slice(0, 3)).toEqual(['Ethiopia', 'Brazil', 'Colombia']);
        // No duplicate Ethiopia from the seed.
        expect(s.countries.filter(c => c === 'Ethiopia')).toHaveLength(1);
        // Seed-only countries still present.
        expect(s.countries).toContain('Kenya');
    });
    it('merges processes with the seed list', () => {
        const s = buildSuggestions(PANTRY);
        expect(s.processes).toContain('Pulped Natural');
        expect(s.processes).toContain('Monsooned'); // seed-only
    });
    it('builds bySupplier cascading countries', () => {
        const s = buildSuggestions(PANTRY);
        expect(s.bySupplier['Bean Bay'].countries).toEqual(['Ethiopia', 'Brazil']); // Ethiopia 2×
        expect(s.bySupplier['Cofi-Com'].countries).toEqual(['Colombia']);
    });
    it('builds byCountry cascading processes/regions', () => {
        const s = buildSuggestions(PANTRY);
        expect(s.byCountry['Ethiopia'].processes.sort()).toEqual(['Natural', 'Washed']);
        expect(s.byCountry['Ethiopia'].regions.sort()).toEqual(['Guji', 'Yirgacheffe']);
        expect(s.byCountry['Brazil'].processes).toEqual(['Pulped Natural']);
    });
    it('is null-safe on empty / junk input, falling back to the seeds', () => {
        expect(buildSuggestions().suppliers).toEqual(SEED_SUPPLIERS);
        expect(buildSuggestions([null, {}, { supplier: '  ' }]).suppliers).toEqual(SEED_SUPPLIERS);
        expect(buildSuggestions([]).countries).toEqual(SEED_COUNTRIES);
    });
});

describe('orderByContext', () => {
    it('floats preferred values to the front, keeps the rest', () => {
        const base = ['Ethiopia', 'Brazil', 'Colombia', 'Kenya'];
        expect(orderByContext(base, ['Colombia', 'Kenya'])).toEqual(['Colombia', 'Kenya', 'Ethiopia', 'Brazil']);
    });
    it('returns a copy of base when no preference', () => {
        const base = ['A', 'B'];
        const out = orderByContext(base, []);
        expect(out).toEqual(base);
        expect(out).not.toBe(base);
    });
    it('includes preferred values missing from base', () => {
        expect(orderByContext(['A'], ['Z'])).toEqual(['Z', 'A']);
    });
});

describe('uniqueValue', () => {
    it('returns the sole value or empty', () => {
        expect(uniqueValue(['Washed'])).toBe('Washed');
        expect(uniqueValue(['Washed', 'Natural'])).toBe('');
        expect(uniqueValue([])).toBe('');
        expect(uniqueValue(undefined)).toBe('');
    });
});

describe('parseBeanName', () => {
    it('splits country + region + process from a structured name', () => {
        expect(parseBeanName('Ethiopia Yirgacheffe Washed')).toEqual({
            country: 'Ethiopia', region: 'Yirgacheffe', process: 'Washed',
        });
    });
    it('handles a two-word process (Pulped Natural)', () => {
        expect(parseBeanName('Brazil Cerrado Pulped Natural')).toEqual({
            country: 'Brazil', region: 'Cerrado', process: 'Pulped Natural',
        });
    });
    it('handles a two-word country (Costa Rica)', () => {
        expect(parseBeanName('Costa Rica Tarrazu Honey')).toEqual({
            country: 'Costa Rica', region: 'Tarrazu', process: 'Honey',
        });
    });
    it('handles a three-word country (Papua New Guinea)', () => {
        const r = parseBeanName('Papua New Guinea Sigri');
        expect(r.country).toBe('Papua New Guinea');
        expect(r.region).toBe('Sigri');
        expect(r.process).toBe('');
    });
    it('normalises a "Wet Hulled" spelling to the seed "Wet-Hulled"', () => {
        expect(parseBeanName('Sumatra Mandheling Wet Hulled').process).toBe('Wet-Hulled');
    });
    it('leaves unknown country empty and keeps the words as region', () => {
        const r = parseBeanName('Atlantis Special Reserve');
        expect(r.country).toBe('');
        expect(r.region).toBe('Atlantis Special Reserve');
    });
    it('is empty-safe', () => {
        expect(parseBeanName('')).toEqual({ country: '', region: '', process: '' });
        expect(parseBeanName('   ')).toEqual({ country: '', region: '', process: '' });
    });
    it('finds a process that precedes the region words', () => {
        // process extracted wherever it sits; remaining tokens after country become region
        const r = parseBeanName('Kenya Natural Nyeri');
        expect(r.country).toBe('Kenya');
        expect(r.process).toBe('Natural');
        expect(r.region).toBe('Nyeri');
    });
});

describe('seed vocab', () => {
    it('covers the major origins and processes', () => {
        expect(SEED_COUNTRIES).toContain('Ethiopia');
        expect(SEED_COUNTRIES).toContain('Papua New Guinea');
        expect(SEED_PROCESSES).toContain('Anaerobic');
    });
});
