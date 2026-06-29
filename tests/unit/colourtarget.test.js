import { describe, it, expect } from 'vitest';
import {
    rgbToLab, chroma, hueDeg, classifyChips,
    pickGreyRamp, chromaticReport, eig3sym, conditioningScore,
    recommendSlots, gradeTarget, SLOT_ROLES
} from '../../js/colourtarget.js';

describe('rgbToLab', () => {
    it('maps white/black/grey to expected L*', () => {
        expect(rgbToLab([255, 255, 255])[0]).toBeCloseTo(100, 0);
        expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 0);
        const mid = rgbToLab([119, 119, 119]);
        expect(mid[0]).toBeGreaterThan(40);
        expect(mid[0]).toBeLessThan(55);
        // neutrals have ~zero a*/b*
        expect(Math.abs(mid[1])).toBeLessThan(1);
        expect(Math.abs(mid[2])).toBeLessThan(1);
    });
});

describe('chroma / hueDeg', () => {
    it('greys have low chroma; primaries are saturated with distinct hues', () => {
        expect(chroma(rgbToLab([128, 128, 128]))).toBeLessThan(2);
        const red = rgbToLab([220, 40, 40]);
        const blue = rgbToLab([40, 60, 200]);
        expect(chroma(red)).toBeGreaterThan(40);
        expect(chroma(blue)).toBeGreaterThan(40);
        const hr = hueDeg(red), hb = hueDeg(blue);
        expect(hr).toBeGreaterThanOrEqual(0); expect(hr).toBeLessThan(60);   // red ~ warm
        expect(hb).toBeGreaterThan(250); expect(hb).toBeLessThan(320);       // blue ~ cool
    });
});

describe('classifyChips', () => {
    it('flags greys vs chromatics', () => {
        const out = classifyChips([
            { id: 'g', rgb: [120, 122, 119] },
            { id: 'o', rgb: [200, 110, 40] }
        ]);
        expect(out.find(c => c.id === 'g').isGrey).toBe(true);
        expect(out.find(c => c.id === 'o').isGrey).toBe(false);
    });
});

describe('pickGreyRamp', () => {
    const greys = classifyChips([
        { id: 'w', rgb: [245, 245, 245] },
        { id: 'l', rgb: [200, 200, 200] },
        { id: 'm', rgb: [128, 128, 128] },
        { id: 'd', rgb: [70, 70, 70] },
        { id: 'k', rgb: [20, 20, 20] },
        { id: 'x', rgb: [205, 205, 205] }   // near-duplicate of 'l'
    ]);
    it('spans light→dark and is sorted by L*', () => {
        const r = pickGreyRamp(greys, 5);
        const Ls = r.ramp.map(c => c.L);
        expect(Ls).toEqual([...Ls].sort((a, b) => a - b));
        expect(r.rangeL).toBeGreaterThan(70);
        expect(r.ok).toBe(true);
    });
    it('drops a near-duplicate in favour of even spacing', () => {
        const r = pickGreyRamp(greys, 5);
        const ids = r.ramp.map(c => c.id);
        expect(ids).toContain('w'); expect(ids).toContain('k'); // extremes kept
        expect(ids).not.toEqual(expect.arrayContaining(['l', 'x'])); // not both near-dupes
    });
    it('flags a too-shallow ramp as not ok', () => {
        const shallow = classifyChips([
            { id: 'a', rgb: [200, 200, 200] }, { id: 'b', rgb: [180, 180, 180] }
        ]);
        expect(pickGreyRamp(shallow).ok).toBe(false);
    });
});

describe('chromaticReport', () => {
    it('detects a coffee-region anchor and a cool anchor', () => {
        const chrom = classifyChips([
            { id: 'br', rgb: [150, 90, 50] },   // brown, warm hue ~ coffee band
            { id: 'bl', rgb: [40, 70, 190] }    // blue
        ]);
        const r = chromaticReport(chrom);
        expect(r.hasCoffeeAnchor).toBe(true);
        expect(r.hasCool).toBe(true);
        expect(r.ok).toBe(true);
    });
});

describe('eig3sym', () => {
    it('returns eigenvalues of a diagonal matrix (descending)', () => {
        expect(eig3sym(3, 0, 0, 1, 0, 2)).toEqual([3, 2, 1]);
    });
    it('matches a known symmetric case', () => {
        // [[2,1,0],[1,2,0],[0,0,5]] -> eigenvalues 5,3,1
        const ev = eig3sym(2, 1, 0, 2, 0, 5);
        expect(ev[0]).toBeCloseTo(5, 5);
        expect(ev[1]).toBeCloseTo(3, 5);
        expect(ev[2]).toBeCloseTo(1, 5);
    });
});

describe('conditioningScore', () => {
    it('flags an all-grey set as degenerate', () => {
        const greys = classifyChips([
            { id: 'a', rgb: [240, 240, 240] }, { id: 'b', rgb: [170, 170, 170] },
            { id: 'c', rgb: [90, 90, 90] }, { id: 'd', rgb: [20, 20, 20] }
        ]);
        const s = conditioningScore(greys);
        expect(s.ok).toBe(false);
        expect(s.ratio).toBeLessThan(0.02);
    });
    it('passes a colour-spread set', () => {
        const mixed = classifyChips([
            { id: 'w', rgb: [240, 240, 240] }, { id: 'k', rgb: [20, 20, 20] },
            { id: 'r', rgb: [200, 60, 50] }, { id: 'g', rgb: [60, 170, 80] },
            { id: 'b', rgb: [50, 70, 200] }
        ]);
        expect(conditioningScore(mixed).ok).toBe(true);
    });
    it('needs at least 4 chips', () => {
        expect(conditioningScore(classifyChips([{ id: 'a', rgb: [1, 2, 3] }])).ok).toBe(false);
    });
});

describe('recommendSlots / gradeTarget', () => {
    const chips = [
        { id: 'w', name: 'White', rgb: [245, 245, 245] },
        { id: 'lg', name: 'Lt grey', rgb: [195, 196, 195] },
        { id: 'mg', name: 'Mid grey', rgb: [128, 128, 129] },
        { id: 'dg', name: 'Dark grey', rgb: [72, 72, 73] },
        { id: 'k', name: 'Near black', rgb: [22, 22, 22] },
        { id: 'tan', name: 'Tan', rgb: [196, 150, 105] },
        { id: 'cof', name: 'Coffee brown', rgb: [120, 80, 50] },
        { id: 'dbr', name: 'Dark brown', rgb: [70, 45, 30] },
        { id: 'or', name: 'Orange', rgb: [210, 110, 40] },
        { id: 'bl', name: 'Blue', rgb: [50, 70, 190] }
    ];

    it('produces a 12-slot layout in template order', () => {
        const g = gradeTarget(chips);
        expect(g.slots).toHaveLength(12);
        expect(g.slots.map(s => s.role)).toEqual(SLOT_ROLES);
    });
    it('assigns white to the lightest and near-black to the darkest grey', () => {
        const g = gradeTarget(chips);
        const slot = (role) => g.slots.find(s => s.role === role).chipId;
        expect(slot('WHITE')).toBe('w');
        expect(slot('NEAR_BLACK')).toBe('k');
        expect(slot('BLUE')).toBe('bl');
    });
    it('rates a well-built set as overall-good', () => {
        const g = gradeTarget(chips);
        expect(g.quality.greyRamp).toBe(true);
        expect(g.quality.coffeeAnchor).toBe(true);
        expect(g.quality.conditioned).toBe(true);
        expect(g.quality.overall).toBe(true);
    });
    it('marks an all-grey set as not overall-good (no colour anchors)', () => {
        const g = gradeTarget(chips.filter(c => ['w', 'lg', 'mg', 'dg', 'k'].includes(c.id)));
        expect(g.quality.coffeeAnchor).toBe(false);
        expect(g.quality.conditioned).toBe(false);
        expect(g.quality.overall).toBe(false);
    });
    it('does not assign one chip to two slots', () => {
        const ids = gradeTarget(chips).slots.map(s => s.chipId).filter(Boolean);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
