import { describe, it, expect } from 'vitest';
import {
    nudgeAdjust, applyAdjust, describeAdjust,
    DEFAULT_ADJUST, ADJUST_STEP, MIN_THRESHOLD_DELTA, MAX_THRESHOLD_DELTA,
    MIN_THRESHOLD, MAX_THRESHOLD,
} from '../../js/detector-learning.js';

describe('nudgeAdjust', () => {
    it('false positive raises the threshold delta (less sensitive) and counts a sample', () => {
        const a = nudgeAdjust(DEFAULT_ADJUST, 'falsePositive');
        expect(a.thresholdDelta).toBeCloseTo(ADJUST_STEP);
        expect(a.samples).toBe(1);
    });

    it('missed lowers the threshold delta (more sensitive)', () => {
        const a = nudgeAdjust(DEFAULT_ADJUST, 'missed');
        expect(a.thresholdDelta).toBeCloseTo(-ADJUST_STEP);
        expect(a.samples).toBe(1);
    });

    it('confirmed counts a sample but does not move the threshold', () => {
        const a = nudgeAdjust({ thresholdDelta: 0.2, samples: 2 }, 'confirmed');
        expect(a.thresholdDelta).toBeCloseTo(0.2);
        expect(a.samples).toBe(3);
    });

    it('ignores unknown signals entirely (no sample, no move)', () => {
        const a = nudgeAdjust({ thresholdDelta: 0.2, samples: 2 }, 'banana');
        expect(a).toEqual({ thresholdDelta: 0.2, samples: 2 });
    });

    it('clamps the delta within bounds under repeated corrections', () => {
        let a = DEFAULT_ADJUST;
        for (let i = 0; i < 50; i++) a = nudgeAdjust(a, 'falsePositive');
        expect(a.thresholdDelta).toBeLessThanOrEqual(MAX_THRESHOLD_DELTA + 1e-9);
        a = DEFAULT_ADJUST;
        for (let i = 0; i < 50; i++) a = nudgeAdjust(a, 'missed');
        expect(a.thresholdDelta).toBeGreaterThanOrEqual(MIN_THRESHOLD_DELTA - 1e-9);
    });

    it('treats null/undefined adjust as the default', () => {
        expect(nudgeAdjust(null, 'falsePositive').thresholdDelta).toBeCloseTo(ADJUST_STEP);
    });
});

describe('applyAdjust', () => {
    it('adds the delta onto the base threshold', () => {
        const eff = applyAdjust({ thresholdMultiplier: 1.5, cracksRequired: 3 }, { thresholdDelta: 0.2, samples: 1 });
        expect(eff.thresholdMultiplier).toBeCloseTo(1.7);
        expect(eff.cracksRequired).toBe(3); // other settings pass through untouched
    });

    it('clamps the effective threshold to the slider range', () => {
        expect(applyAdjust({ thresholdMultiplier: 3 }, { thresholdDelta: 1.5, samples: 1 }).thresholdMultiplier)
            .toBeCloseTo(MAX_THRESHOLD);
        expect(applyAdjust({ thresholdMultiplier: 1.1 }, { thresholdDelta: -0.4, samples: 1 }).thresholdMultiplier)
            .toBeGreaterThanOrEqual(MIN_THRESHOLD - 1e-9);
    });

    it('is a no-op (base unchanged) for the default adjust', () => {
        expect(applyAdjust({ thresholdMultiplier: 1.5 }, DEFAULT_ADJUST).thresholdMultiplier).toBeCloseTo(1.5);
    });
});

describe('describeAdjust', () => {
    it('reports untuned for the default', () => {
        expect(describeAdjust(DEFAULT_ADJUST)).toBe('not yet tuned');
    });
    it('describes direction, effective value and sample count', () => {
        const s = describeAdjust({ thresholdDelta: 0.4, samples: 2 }, { thresholdMultiplier: 1.5 });
        expect(s).toMatch(/less sensitive/);
        expect(s).toMatch(/1\.9×/);
        expect(s).toMatch(/2 corrections/);
    });
});
