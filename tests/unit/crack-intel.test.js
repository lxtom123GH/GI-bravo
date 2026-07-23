import { describe, it, expect } from 'vitest';
import {
    DEFAULT_GAP_WINDOW, SANE_GAP_MIN_MS, SANE_GAP_MAX_MS,
    gapWindowFromHistory, describeGapWindow,
    HARD_MIN_2C_GAP_MS, EARLY_2C_PITCH_PENALTY, MAX_PITCH_GATE, RATE_WINDOW_MS,
    shouldCall2C,
    createBurpGuard, BURP_GUARD_MS, BURP_GUARD_FACTOR,
    alarmToneTargets, alarmNarrowbandShare, isAlarmLike, ALARM_LIKE_SHARE,
} from '../../js/crack-intel.js';

// --- synthetic fixtures -----------------------------------------------------

// A roast-history record with a 1C→2C gap of `gapMs` for `beanId`.
function roastWithGap(beanId, gapMs, date = '2026-07-01') {
    const start = Date.parse(date);
    return {
        beanId,
        date,
        timeline: {
            startTime: start,
            firstCrackTime: start + 8 * 60000,
            secondCrackTime: start + 8 * 60000 + gapMs,
        },
    };
}

// A byte-FFT spectrum (like AnalyserNode.getByteFrequencyData output) built from
// { hz: magnitude } peaks over a flat floor. binHz mirrors the live analyser
// (48000 / 2048 ≈ 23.4 Hz per bin, 1024 bins).
const BIN_HZ = 48000 / 2048;
function syntheticSpectrum(peaks, { floor = 0, bins = 1024 } = {}) {
    const data = new Uint8Array(bins).fill(floor);
    for (const [hz, mag] of Object.entries(peaks)) {
        data[Math.round(Number(hz) / BIN_HZ)] = mag;
    }
    return data;
}

// --- per-bean 2C watch window -------------------------------------------------

describe('gapWindowFromHistory', () => {
    it('returns the research default (~2–7 min) with no history', () => {
        const w = gapWindowFromHistory([], 'bean-1');
        expect(w.earliestMs).toBe(DEFAULT_GAP_WINDOW.earliestMs);
        expect(w.latestMs).toBe(DEFAULT_GAP_WINDOW.latestMs);
        expect(w.learnedFrom).toBe(0);
    });

    it('returns the default for a missing beanId or non-array history', () => {
        expect(gapWindowFromHistory(null, 'bean-1').learnedFrom).toBe(0);
        expect(gapWindowFromHistory([roastWithGap('bean-1', 180000)], '').learnedFrom).toBe(0);
    });

    it('needs at least two usable gaps before trusting a learned window', () => {
        const w = gapWindowFromHistory([roastWithGap('bean-1', 180000)], 'bean-1');
        expect(w.learnedFrom).toBe(0);
        expect(w.earliestMs).toBe(DEFAULT_GAP_WINDOW.earliestMs);
    });

    it('learns a widened window around the median of this bean\'s own gaps', () => {
        const history = [
            roastWithGap('bean-1', 170000, '2026-07-01'),
            roastWithGap('bean-1', 180000, '2026-07-05'),
            roastWithGap('bean-1', 190000, '2026-07-10'),
        ];
        const w = gapWindowFromHistory(history, 'bean-1');
        expect(w.learnedFrom).toBe(3);
        expect(w.medianMs).toBe(180000);
        expect(w.earliestMs).toBe(Math.round(180000 * 0.6));
        expect(w.latestMs).toBe(Math.round(180000 * 1.6));
        expect(w.earliestMs).toBeLessThan(DEFAULT_GAP_WINDOW.earliestMs);
    });

    it('ignores other beans, roasts without both cracks, and insane gaps', () => {
        const history = [
            roastWithGap('bean-2', 180000),                       // different bean
            { beanId: 'bean-1', date: '2026-07-02', timeline: { firstCrackTime: 1 } }, // no 2C
            roastWithGap('bean-1', SANE_GAP_MIN_MS - 1000),       // absurdly short
            roastWithGap('bean-1', SANE_GAP_MAX_MS + 1000),       // absurdly long
        ];
        expect(gapWindowFromHistory(history, 'bean-1').learnedFrom).toBe(0);
    });

    it('clamps the learned window inside sane bounds', () => {
        // Very short real gaps (fast soft-bean roasts): earliest never below 45 s.
        const fast = [roastWithGap('b', 60000), roastWithGap('b', 62000)];
        expect(gapWindowFromHistory(fast, 'b').earliestMs).toBeGreaterThanOrEqual(45000);
        // Very long gaps: latest capped at 10 min — or just past the user's own
        // median when that is genuinely longer — and never degenerate.
        const slow = [roastWithGap('b', 700000), roastWithGap('b', 720000)];
        const w = gapWindowFromHistory(slow, 'b');
        expect(w.latestMs).toBeLessThanOrEqual(w.medianMs + 60000);
        expect(w.latestMs).toBeGreaterThan(w.earliestMs);
        const moderate = [roastWithGap('b', 300000), roastWithGap('b', 320000)];
        expect(gapWindowFromHistory(moderate, 'b').latestMs).toBeLessThanOrEqual(10 * 60000);
    });

    it('uses only the most recent maxSamples gaps (heat application drifts)', () => {
        const history = [];
        for (let i = 0; i < 10; i++) history.push(roastWithGap('b', 400000, `2026-06-${String(i + 1).padStart(2, '0')}`));
        for (let i = 0; i < 8; i++) history.push(roastWithGap('b', 120000, `2026-07-${String(i + 1).padStart(2, '0')}`));
        const w = gapWindowFromHistory(history, 'b', { maxSamples: 8 });
        expect(w.medianMs).toBe(120000); // the old 400 s era aged out
    });
});

describe('describeGapWindow', () => {
    it('describes the default as the typical range', () => {
        const s = describeGapWindow({ ...DEFAULT_GAP_WINDOW });
        expect(s).toMatch(/2 min–7 min/);
        expect(s).toMatch(/typical range/);
    });
    it('credits the bean\'s own history when learned', () => {
        const s = describeGapWindow({ earliestMs: 108000, latestMs: 288000, learnedFrom: 3, medianMs: 180000 });
        expect(s).toMatch(/learned from 3 roasts/);
    });
});

// --- 2C call decision -----------------------------------------------------------

describe('shouldCall2C', () => {
    const NOW = 1_000_000_000;
    // A healthy in-window 2C candidate: fast, high-pitched cluster 3 min after 1C.
    function candidate(overrides = {}) {
        return {
            now: NOW,
            firstCrackAt: NOW - 180000,
            window: { ...DEFAULT_GAP_WINDOW },
            ratios: [0.6, 0.65, 0.7],
            snapTimes: [NOW - 4000, NOW - 2500, NOW - 900],
            basePitch: 0.5,
            cracksRequired: 3,
            ...overrides,
        };
    }

    it('calls 2C for a fast, high-pitched cluster inside the watch window', () => {
        const v = shouldCall2C(candidate());
        expect(v.call).toBe(true);
        expect(v.reason).toBe('in-window');
    });

    it('never calls without a recorded 1C', () => {
        expect(shouldCall2C(candidate({ firstCrackAt: null })).call).toBe(false);
    });

    it('holds off during a manual "still 1st crack" window', () => {
        const v = shouldCall2C(candidate({ stillFirstCrackUntil: NOW + 30000 }));
        expect(v.call).toBe(false);
        expect(v.reason).toBe('still-1c-hold');
    });

    it('holds off during the door-burp guard window', () => {
        const v = shouldCall2C(candidate({ burpGuardUntil: NOW + 1000 }));
        expect(v.call).toBe(false);
        expect(v.reason).toBe('burp-guard');
    });

    it('enforces the hard minimum gap after 1C', () => {
        const v = shouldCall2C(candidate({ firstCrackAt: NOW - (HARD_MIN_2C_GAP_MS - 1000) }));
        expect(v.call).toBe(false);
        expect(v.reason).toBe('too-soon');
    });

    it('requires an actual fast cluster (rate gate), not loud stragglers', () => {
        // Same pitch evidence, but the snaps are spread far apart (a 1C tail pop
        // every 20 s — exactly the door-open false-trigger shape).
        const v = shouldCall2C(candidate({
            snapTimes: [NOW - 55000, NOW - 30000, NOW - (RATE_WINDOW_MS + 5000)],
        }));
        expect(v.call).toBe(false);
        expect(v.reason).toBe('low-rate');
    });

    it('demands clearly higher pitch BEFORE the expected window opens', () => {
        // 60 s after 1C — well before the 2-min default window. Ratios that would
        // pass in-window (0.55 avg > 0.5) fail the early penalty.
        const early = candidate({
            firstCrackAt: NOW - 60000,
            ratios: [0.55, 0.55, 0.55],
        });
        const v = shouldCall2C(early);
        expect(v.call).toBe(false);
        expect(v.reason).toBe('pitch-early');
        expect(v.pitchGate).toBeCloseTo(0.5 + EARLY_2C_PITCH_PENALTY);

        // Genuinely unmistakable 2C evidence still gets through early.
        const strong = shouldCall2C(candidate({ firstCrackAt: NOW - 60000, ratios: [0.75, 0.8, 0.7] }));
        expect(strong.call).toBe(true);
        expect(strong.reason).toBe('early-strong-evidence');
    });

    it('does not block 2C after the window closes (it is a watch window, not a cutoff)', () => {
        const v = shouldCall2C(candidate({ firstCrackAt: NOW - 9 * 60000 }));
        expect(v.call).toBe(true);
    });

    it('caps the pitch gate so 2C can never become uncallable', () => {
        const v = shouldCall2C(candidate({ firstCrackAt: NOW - 60000, basePitch: 0.8, ratios: [0.9, 0.9, 0.9] }));
        expect(v.pitchGate).toBeLessThanOrEqual(MAX_PITCH_GATE);
        expect(v.call).toBe(true);
    });

    it('still requires enough pitch evidence (few-snaps)', () => {
        const v = shouldCall2C(candidate({ ratios: [0.7] }));
        expect(v.call).toBe(false);
        expect(v.reason).toBe('few-snaps');
    });
});

// --- door-"burp" guard ------------------------------------------------------------

describe('createBurpGuard', () => {
    // Feed frames at ~60 fps (16 ms apart) with the given rms values.
    function run(guard, startT, rmsValues, stepMs = 16) {
        const results = [];
        let t = startT;
        for (const rms of rmsValues) {
            results.push({ t, ...guard.step(t, rms) });
            t += stepMs;
        }
        return results;
    }

    it('stays quiet on a steady floor', () => {
        const g = createBurpGuard();
        const res = run(g, 0, Array(300).fill(0.05));
        expect(res.some(r => r.stepped)).toBe(false);
        expect(g.baseline()).toBeCloseTo(0.05, 3);
    });

    it('detects a sustained step-up (door open) and re-baselines', () => {
        const g = createBurpGuard();
        const quiet = Array(200).fill(0.05);
        const loud = Array(120).fill(0.13); // 2.6× the old floor, held ~2 s
        const res = run(g, 0, [...quiet, ...loud]);
        const step = res.find(r => r.stepped);
        expect(step).toBeTruthy();
        expect(step.baseline).toBeGreaterThan(0.1);   // near the new floor
        expect(g.baseline()).toBeGreaterThan(0.1);    // tracker re-baselined
    });

    it('ignores a brief transient burst (shorter than the sustain requirement)', () => {
        const g = createBurpGuard();
        const quiet = Array(200).fill(0.05);
        const blip = Array(20).fill(0.15); // ~320 ms — under the 600 ms sustain
        const res = run(g, 0, [...quiet, ...blip, ...Array(100).fill(0.05)]);
        expect(res.some(r => r.stepped)).toBe(false);
    });

    it('ignores tiny wobbles in a very quiet room (absolute step floor)', () => {
        const g = createBurpGuard();
        const veryQuiet = Array(200).fill(0.005);
        const slightlyLouder = Array(200).fill(0.012); // 2.4× but only +0.007 absolute
        const res = run(g, 0, [...veryQuiet, ...slightlyLouder]);
        expect(res.some(r => r.stepped)).toBe(false);
    });

    it('does not fire during the settling frames', () => {
        const g = createBurpGuard();
        // Loud from the very first frame — nothing to compare against yet.
        const res = run(g, 0, Array(30).fill(0.2));
        expect(res.some(r => r.stepped)).toBe(false);
    });

    it('exports sane guard constants (~1–2 s of extra confidence)', () => {
        expect(BURP_GUARD_MS).toBeGreaterThanOrEqual(1000);
        expect(BURP_GUARD_MS).toBeLessThanOrEqual(2000);
        expect(BURP_GUARD_FACTOR).toBeGreaterThan(1);
    });
});

// --- two-device beep guard ---------------------------------------------------------

describe('alarmToneTargets', () => {
    // The live alarm tone table from js/audio.js.
    const TONES = {
        chime: [{ f: 880, type: 'sine', d: 0.18 }, { f: 1320, type: 'sine', d: 0.24 }],
        beep: [{ f: 1000, type: 'square', d: 0.25 }],
        bell: [{ f: 1568, type: 'sine', d: 0.55 }],
        buzzer: [{ f: 220, type: 'sawtooth', d: 0.18 }, { f: 220, type: 'sawtooth', d: 0.18 }],
    };

    it('includes sine fundamentals and square odd harmonics within the band', () => {
        const t = alarmToneTargets(TONES);
        expect(t).toContain(880);   // chime
        expect(t).toContain(1320);  // chime
        expect(t).toContain(1568);  // bell
        expect(t).toContain(1000);  // beep fundamental
        expect(t).toContain(3000);  // beep 3rd harmonic (square)
        expect(t).toContain(5000);  // beep 5th harmonic
    });

    it('drops frequencies outside the analysed band (high-pass / FFT range)', () => {
        const t = alarmToneTargets(TONES);
        expect(t).not.toContain(220); // buzzer fundamental sits below the 500 Hz high-pass
        expect(Math.min(...t)).toBeGreaterThanOrEqual(500);
        expect(Math.max(...t)).toBeLessThanOrEqual(8000);
    });

    it('is empty for an empty tone table', () => {
        expect(alarmToneTargets({})).toEqual([]);
    });
});

describe('alarmNarrowbandShare / isAlarmLike', () => {
    const TARGETS = alarmToneTargets({
        chime: [{ f: 880, type: 'sine' }, { f: 1320, type: 'sine' }],
        beep: [{ f: 1000, type: 'square' }],
        bell: [{ f: 1568, type: 'sine' }],
    });

    it('reads another device\'s chime as alarm-like (energy at the known tones)', () => {
        const spectrum = syntheticSpectrum({ 880: 220, 1320: 200 }, { floor: 4 });
        const share = alarmNarrowbandShare(spectrum, BIN_HZ, TARGETS);
        expect(share).toBeGreaterThan(ALARM_LIKE_SHARE);
        expect(isAlarmLike(share)).toBe(true);
    });

    it('reads a square-wave beep (fundamental + odd harmonics) as alarm-like', () => {
        const spectrum = syntheticSpectrum({ 1000: 230, 3000: 120, 5000: 70 }, { floor: 3 });
        expect(isAlarmLike(alarmNarrowbandShare(spectrum, BIN_HZ, TARGETS))).toBe(true);
    });

    it('reads a broadband crack as NOT alarm-like', () => {
        // A crack spreads energy across the whole band — flat-ish spectrum.
        const spectrum = new Uint8Array(1024).fill(90);
        const share = alarmNarrowbandShare(spectrum, BIN_HZ, TARGETS);
        expect(share).toBeCloseTo(0.5, 1); // target and rest average out the same
        expect(isAlarmLike(share)).toBe(false);
    });

    it('reads a low-band-biased 1C crack as NOT alarm-like either', () => {
        // 1C energy leans on ~800–3000 Hz but stays broadband — elevated across the
        // whole low region, not concentrated in a few tone bins.
        const spectrum = new Uint8Array(1024);
        for (let i = 0; i < spectrum.length; i++) {
            const hz = i * BIN_HZ;
            spectrum[i] = hz >= 500 && hz < 3000 ? 120 : 60;
        }
        const share = alarmNarrowbandShare(spectrum, BIN_HZ, TARGETS);
        expect(isAlarmLike(share)).toBe(false);
    });

    it('returns 0 for empty/invalid input', () => {
        expect(alarmNarrowbandShare(null, BIN_HZ, TARGETS)).toBe(0);
        expect(alarmNarrowbandShare(new Uint8Array(0), BIN_HZ, TARGETS)).toBe(0);
        expect(alarmNarrowbandShare(new Uint8Array(1024).fill(10), BIN_HZ, [])).toBe(0);
    });
});
