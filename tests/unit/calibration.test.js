import { describe, it, expect } from 'vitest';
import { createNoiseFloor } from '../../js/calibration.js';

// Fill a floor with `n` samples of the given rms values cycling, 250 ms apart.
function fill(floor, values, { start = 0, stepMs = 250 } = {}) {
    values.forEach((rms, i) => floor.add(start + i * stepMs, rms));
}

describe('createNoiseFloor (rolling auto-calibration window)', () => {
    it('returns null until there are enough samples to trust', () => {
        const floor = createNoiseFloor({ minSamples: 5 });
        fill(floor, [0.04, 0.04, 0.04, 0.04]);
        expect(floor.baseline()).toBeNull();
        floor.add(1000, 0.04);
        expect(floor.baseline()).not.toBeNull();
    });

    it('takes the 90th percentile like the manual calibration', () => {
        const floor = createNoiseFloor({ minSamples: 10 });
        // 100 samples 0.001 … 0.100 → 90th percentile lands on index 90 = 0.091.
        fill(floor, Array.from({ length: 100 }, (_, i) => (i + 1) / 1000));
        expect(floor.baseline()).toBeCloseTo(0.091, 6);
    });

    it('evicts samples older than the window — loud prep clatter is forgotten', () => {
        const floor = createNoiseFloor({ windowMs: 45000, minSamples: 5 });
        // Loud grinder burst early on…
        fill(floor, Array(20).fill(0.5), { start: 0 });
        // …then a quiet minute right before the roast.
        fill(floor, Array(40).fill(0.04), { start: 60000 });
        // Only the recent quiet samples remain, so the floor is quiet too.
        expect(floor.size()).toBe(40);
        expect(floor.baseline()).toBeCloseTo(0.04, 6);
    });

    it('keeps loud RECENT noise in the floor (roaster warming up)', () => {
        const floor = createNoiseFloor({ windowMs: 45000, minSamples: 5 });
        fill(floor, Array(40).fill(0.04), { start: 0 });
        // Roaster fan spins up within the window.
        fill(floor, Array(40).fill(0.12), { start: 10000 });
        expect(floor.baseline()).toBeCloseTo(0.12, 6);
    });

    it('seed replaces the window with a manual calibration result', () => {
        const floor = createNoiseFloor({ minSamples: 5 });
        fill(floor, Array(30).fill(0.5));
        floor.seed(100000, Array(30).fill(0.03));
        expect(floor.size()).toBe(30);
        expect(floor.baseline()).toBeCloseTo(0.03, 6);
        // Rolling continues from the seed: the seeded samples expire normally.
        fill(floor, Array(30).fill(0.06), { start: 100000 + 46000 });
        expect(floor.baseline()).toBeCloseTo(0.06, 6);
    });

    it('reset empties the window', () => {
        const floor = createNoiseFloor({ minSamples: 1 });
        fill(floor, [0.1, 0.2]);
        floor.reset();
        expect(floor.size()).toBe(0);
        expect(floor.baseline()).toBeNull();
    });
});
