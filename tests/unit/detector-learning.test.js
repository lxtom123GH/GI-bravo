import { describe, it, expect } from 'vitest';
import {
    nudgeAdjust, applyAdjust, describeAdjust,
    DEFAULT_ADJUST, ADJUST_STEP, MIN_THRESHOLD_DELTA, MAX_THRESHOLD_DELTA,
    MIN_THRESHOLD, MAX_THRESHOLD,
    PITCH_STEP, MAX_PITCH_DELTA, MIN_PITCH, MAX_PITCH,
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
        expect(a).toEqual({ thresholdDelta: 0.2, pitchDelta: 0, samples: 2 });
    });

    it('"still 1st crack" raises the 2C pitch strictness without touching the threshold', () => {
        const a = nudgeAdjust(DEFAULT_ADJUST, 'still1c');
        expect(a.pitchDelta).toBeCloseTo(PITCH_STEP);
        expect(a.thresholdDelta).toBeCloseTo(0);
        expect(a.samples).toBe(1);
    });

    it('a missed SECOND crack walks the pitch strictness back down (and floors at 0)', () => {
        let a = nudgeAdjust(DEFAULT_ADJUST, 'still1c');
        a = nudgeAdjust(a, 'missedSecond');
        expect(a.pitchDelta).toBeCloseTo(0);
        expect(a.thresholdDelta).toBeCloseTo(-ADJUST_STEP); // more sensitive too
        // Never goes negative — the learner only ever ADDS 2C strictness.
        expect(nudgeAdjust(DEFAULT_ADJUST, 'missedSecond').pitchDelta).toBe(0);
    });

    it('clamps the pitch delta under repeated "still 1st crack" taps', () => {
        let a = DEFAULT_ADJUST;
        for (let i = 0; i < 50; i++) a = nudgeAdjust(a, 'still1c');
        expect(a.pitchDelta).toBeLessThanOrEqual(MAX_PITCH_DELTA + 1e-9);
    });

    it('upgrades a legacy v1 adjust (no pitchDelta) transparently', () => {
        const a = nudgeAdjust({ thresholdDelta: 0.4, samples: 3 }, 'still1c');
        expect(a.pitchDelta).toBeCloseTo(PITCH_STEP);
        expect(a.thresholdDelta).toBeCloseTo(0.4);
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
        expect(applyAdjust({ secondCrackPitch: 0.5 }, DEFAULT_ADJUST).secondCrackPitch).toBeCloseTo(0.5);
    });

    it('adds the learned pitch delta onto the 2C pitch gate, clamped to the slider range', () => {
        const eff = applyAdjust({ secondCrackPitch: 0.5 }, { pitchDelta: 0.1, samples: 2 });
        expect(eff.secondCrackPitch).toBeCloseTo(0.6);
        expect(applyAdjust({ secondCrackPitch: 0.8 }, { pitchDelta: 0.25, samples: 1 }).secondCrackPitch)
            .toBeCloseTo(MAX_PITCH);
        expect(applyAdjust({ secondCrackPitch: 0.3 }, { pitchDelta: 0, samples: 1 }).secondCrackPitch)
            .toBeGreaterThanOrEqual(MIN_PITCH - 1e-9);
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
    it('describes a learned 2C pitch strictness', () => {
        const s = describeAdjust({ pitchDelta: 0.1, samples: 2 }, { secondCrackPitch: 0.5 });
        expect(s).toMatch(/stricter 2C pitch/);
        expect(s).toMatch(/60%/);
        expect(s).toMatch(/2 corrections/);
    });
    it('reports untuned when samples exist but both deltas are zero', () => {
        expect(describeAdjust({ thresholdDelta: 0, pitchDelta: 0, samples: 3 })).toBe('not yet tuned');
    });
});
