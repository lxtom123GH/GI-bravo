import { describe, it, expect } from 'vitest';
import {
    createShadowBank, stepShadowBank, summariseShadowBank, SHADOW_VARIANTS,
} from '../../js/shadow.js';

// Build a 20ms-step frame timeline. `snaps` are loud frames (rms 0.5) at the given ms with a
// chosen high-band ratio; every other frame is quiet ambient (rms 0.02, ratio 0.1).
function timeline(durationMs, snaps) {
    const snapAt = new Map(snaps.map(s => [Math.round(s.t / 20) * 20, s.ratio]));
    const frames = [];
    for (let t = 0; t <= durationMs; t += 20) {
        if (snapAt.has(t)) frames.push({ t, rms: 0.5, bandRatio: snapAt.get(t) });
        else frames.push({ t, rms: 0.02, bandRatio: 0.1 });
    }
    return frames;
}

function run(bank, frames) {
    const events = [];
    for (const f of frames) for (const ev of stepShadowBank(bank, f)) events.push(ev);
    return events;
}

const firstCrackOf = (events, id) => events.find(e => e.variantId === id && e.kind === 'firstCrack');
const secondCrackOf = (events, id) => events.find(e => e.variantId === id && e.kind === 'secondCrack');

describe('createShadowBank', () => {
    it('builds a variant per config with independent state', () => {
        const bank = createShadowBank();
        expect(bank.variants).toHaveLength(SHADOW_VARIANTS.length);
        expect(bank.variants.map(v => v.id)).toContain('balanced');
        // State objects are not shared between variants.
        expect(bank.variants[0].state).not.toBe(bank.variants[1].state);
        bank.variants[0].state.transients = 5;
        expect(bank.variants[1].state.transients).toBe(0);
    });
});

describe('quiet roast', () => {
    it('fires nothing and counts no transients', () => {
        const bank = createShadowBank();
        const events = run(bank, timeline(30000, []));
        expect(events).toEqual([]);
        expect(summariseShadowBank(bank).every(v => v.transients === 0)).toBe(true);
    });
});

describe('first crack', () => {
    it('sensitive fires before balanced; strict needs more snaps', () => {
        // Three low-pitch snaps 200ms apart (each > the 100ms cooldown).
        const bank = createShadowBank();
        const events = run(bank, timeline(3000, [
            { t: 1000, ratio: 0.2 }, { t: 1200, ratio: 0.2 }, { t: 1400, ratio: 0.2 },
        ]));

        // sensitive needs 2 snaps → fires on the 2nd (≈1200); balanced needs 3 → fires on the 3rd (≈1400).
        const fcSensitive = firstCrackOf(events, 'sensitive');
        const fcBalanced = firstCrackOf(events, 'balanced');
        expect(fcSensitive).toBeTruthy();
        expect(fcBalanced).toBeTruthy();
        expect(fcSensitive.t).toBeLessThan(fcBalanced.t);

        // strict needs 4 snaps → with only 3, it never calls first crack.
        expect(firstCrackOf(events, 'strict')).toBeFalsy();
    });

    it('respects the snap cooldown (snaps inside cooldown count once)', () => {
        const bank = createShadowBank();
        // 1000, 1050, 1100 — all within the 100ms cooldown of the first, so only one counts.
        run(bank, timeline(2000, [
            { t: 1000, ratio: 0.2 }, { t: 1050, ratio: 0.2 }, { t: 1100, ratio: 0.2 },
        ]));
        const balanced = summariseShadowBank(bank).find(v => v.id === 'balanced');
        expect(balanced.transients).toBe(1);
        expect(balanced.firstCrackT).toBeNull();
    });

    it('does not accumulate a crack from snaps spread beyond the cluster window', () => {
        const bank = createShadowBank();
        // Snaps 6s apart — each one expires the previous cluster, so the count never reaches 3.
        run(bank, timeline(20000, [
            { t: 1000, ratio: 0.2 }, { t: 7000, ratio: 0.2 }, { t: 13000, ratio: 0.2 },
        ]));
        const balanced = summariseShadowBank(bank).find(v => v.id === 'balanced');
        expect(balanced.firstCrackT).toBeNull();
    });
});

describe('second crack', () => {
    it('fires only after the min gap, on a high-pitch burst', () => {
        const bank = createShadowBank();
        const events = run(bank, timeline(24000, [
            // First crack: low-pitch burst early.
            { t: 1000, ratio: 0.2 }, { t: 1200, ratio: 0.2 }, { t: 1400, ratio: 0.2 },
            // Second crack: high-pitch burst after the 20s minimum gap.
            { t: 22000, ratio: 0.7 }, { t: 22200, ratio: 0.7 }, { t: 22400, ratio: 0.7 },
        ]));
        const sc = secondCrackOf(events, 'balanced');
        expect(sc).toBeTruthy();
        expect(sc.t).toBeGreaterThan(21400); // firstCrackT(≈1400) + 20000

        // The strict-pitch variant (needs ratio ≥ 0.62) also fires on a 0.7 burst.
        expect(secondCrackOf(events, 'pitch-strict')).toBeTruthy();
    });

    it('does not fire second crack on a low-pitch later burst', () => {
        const bank = createShadowBank();
        const events = run(bank, timeline(24000, [
            { t: 1000, ratio: 0.2 }, { t: 1200, ratio: 0.2 }, { t: 1400, ratio: 0.2 },
            { t: 22000, ratio: 0.2 }, { t: 22200, ratio: 0.2 }, { t: 22400, ratio: 0.2 },
        ]));
        expect(secondCrackOf(events, 'balanced')).toBeFalsy();
    });
});

describe('determinism', () => {
    it('replays identically on a fresh bank', () => {
        const frames = timeline(24000, [
            { t: 1000, ratio: 0.2 }, { t: 1200, ratio: 0.2 }, { t: 1400, ratio: 0.2 },
            { t: 22000, ratio: 0.7 }, { t: 22200, ratio: 0.7 }, { t: 22400, ratio: 0.7 },
        ]);
        const a = run(createShadowBank(), frames);
        const b = run(createShadowBank(), frames);
        expect(a).toEqual(b);
    });
});

describe('stepShadowBank guards', () => {
    it('returns [] on a missing/empty bank', () => {
        expect(stepShadowBank(null, { t: 0, rms: 0.1 })).toEqual([]);
        expect(stepShadowBank({}, { t: 0, rms: 0.1 })).toEqual([]);
    });
});
