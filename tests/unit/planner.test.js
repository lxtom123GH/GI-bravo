import { describe, it, expect } from 'vitest';
import { planRoasts, roasterCapacity } from '../../js/planner.js';

describe('roasterCapacity', () => {
    it('knows the Behmor drum range', () => {
        expect(roasterCapacity('behmor')).toEqual({ min: 225, max: 454 });
    });
    it('falls back for unknown models', () => {
        expect(roasterCapacity('mystery').max).toBeGreaterThan(0);
    });
});

describe('planRoasts — the 2.5 kg Behmor case', () => {
    const plan = planRoasts(2500, { min: 225, max: 454, target: 450 });

    it('offers a clean even split near the target (≈417 g × 6, no leftover)', () => {
        const best = plan.even[0];
        expect(best.roasts).toBe(6);
        expect(best.size).toBe(417);          // round(2500/6)
        expect(best.leftover).toBeLessThanOrEqual(2);
    });

    it('shows the runt left by sticking with 450 g', () => {
        expect(plan.atTarget).toMatchObject({ roasts: 5, size: 450, leftover: 250 });
    });

    it('only suggests sizes within the drum range', () => {
        plan.even.forEach(o => {
            expect(o.size).toBeGreaterThanOrEqual(225);
            expect(o.size).toBeLessThanOrEqual(454);
        });
    });
});

describe('planRoasts — edge cases', () => {
    it('handles a bag smaller than one max batch', () => {
        const p = planRoasts(400, { min: 225, max: 454, target: 400 });
        expect(p.even[0]).toMatchObject({ roasts: 1, size: 400 });
    });
    it('returns empty plan for no amount', () => {
        expect(planRoasts(0, {}).even).toEqual([]);
    });
});
