// js/crack-intel.js — detection intelligence from the first real test roast (2026-07-06).
//
// Pure helpers — no DOM, no storage, no Date.now — wired into the live detector by
// js/audio.js. Four research-grounded ideas live here (design notes + peer-reviewed
// sources in FUTURE_FEATURES.md "Detection intelligence"):
//
// 1. 1C is a PERIOD, not an event: first crack is a tapering ~1–2 min cluster of
//    intermittent pops. After 1C is declared the detector should keep treating late
//    pops as "still 1C" unless the evidence really says otherwise, and watch a WIDE
//    window (~2–7 min) for 2C instead of a fixed 20 s timer.
// 2. Per-bean 1C→2C gap, learned from the user's own logs. Research: soft low-grown
//    beans run 1C→2C in ~2 min; dense high-grown beans stretch to ~7 min — but heat
//    application matters MORE than origin, so we deliberately do NOT ship an
//    origin→duration lookup table. The bean's own roast history is the prior.
// 3. Door-"burp" awareness: opening the roaster door removes acoustic shielding —
//    the sustained noise floor STEPS UP and cracks read louder. Defend by gating on
//    crack RATE + band energy (not raw loudness), re-baselining the floor mid-roast
//    when it steps, and briefly demanding extra confidence after a step.
// 4. Two-device beep guard: another device running this app can alarm into our mic.
//    Its alarm tones are KNOWN oscillator tones (narrowband + harmonics); real cracks
//    are broadband. A spike whose energy concentrates in those narrow bands is an
//    alarm, not a crack.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// --- 2C watch window (per-bean, learned from the user's own logs) ---------------

// Research default: expect 2C ~2–7 min after 1C-start (JASA acoustics + roaster
// practice; see FUTURE_FEATURES.md). Used until this bean has its own history.
export const DEFAULT_GAP_WINDOW = Object.freeze({
    earliestMs: 2 * 60000,
    latestMs: 7 * 60000,
    learnedFrom: 0,
    medianMs: null,
});

// Gaps outside this range are treated as recording noise, not evidence.
export const SANE_GAP_MIN_MS = 30000;
export const SANE_GAP_MAX_MS = 15 * 60000;

// Build the expected 1C→2C window for a bean from the user's own roast history.
// Needs >= 2 usable gaps to trust a learned window (one roast could be a fluke);
// otherwise returns the research default. The learned window is the median of the
// most recent gaps, widened (×0.6 … ×1.6) because heat application shifts the gap
// roast to roast, and clamped inside sane bounds.
export function gapWindowFromHistory(history, beanId, { maxSamples = 8 } = {}) {
    if (!beanId || !Array.isArray(history)) return { ...DEFAULT_GAP_WINDOW };
    const gaps = history
        .filter(r => r && r.beanId === beanId && r.timeline &&
            r.timeline.firstCrackTime && r.timeline.secondCrackTime)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(r => r.timeline.secondCrackTime - r.timeline.firstCrackTime)
        .filter(g => g >= SANE_GAP_MIN_MS && g <= SANE_GAP_MAX_MS)
        .slice(-maxSamples);
    if (gaps.length < 2) return { ...DEFAULT_GAP_WINDOW };

    const sorted = [...gaps].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const earliestMs = clamp(Math.round(median * 0.6), 45000, Math.round(median));
    // Cap the far edge at 10 min — or just past the median when the user's own
    // gaps genuinely run longer than that (their data beats our cap).
    const latestCap = Math.max(10 * 60000, Math.round(median) + 60000);
    const latestMs = clamp(Math.round(median * 1.6), Math.round(median), latestCap);
    return {
        earliestMs,
        latestMs: Math.max(latestMs, earliestMs + 60000), // never a degenerate window
        learnedFrom: gaps.length,
        medianMs: Math.round(median),
    };
}

// Human-readable summary for the roast log ("Watching for 2nd crack …").
export function describeGapWindow(w = DEFAULT_GAP_WINDOW) {
    const m = (ms) => {
        const min = Math.round((ms / 60000) * 10) / 10;
        return `${min} min`;
    };
    const range = `~${m(w.earliestMs)}–${m(w.latestMs)} after 1st crack`;
    return w.learnedFrom >= 2
        ? `${range} (learned from ${w.learnedFrom} roasts of this bean)`
        : `${range} (typical range — the app learns this bean's timing from your roasts)`;
}

// --- 2C call decision ("still 1st crack" continuity + rate/band gating) ---------

// Absolute floor — 2C physically can't follow 1C-start this fast.
export const HARD_MIN_2C_GAP_MS = 20000;
// Before the expected window opens, demand this much MORE high-band share —
// late 1C pops must not read as 2C just because they're loud (door open etc.).
export const EARLY_2C_PITCH_PENALTY = 0.15;
// The pitch gate never exceeds this (an unreachable gate would hard-block 2C).
export const MAX_PITCH_GATE = 0.85;
// 2C pops arrive ~5× faster than 1C (JASA): require a real cluster in the last
// few seconds, so a couple of loud straggler pops can't trigger the call.
export const RATE_WINDOW_MS = 10000;

// Decide whether the evidence supports calling second crack NOW. All timing in ms
// on the caller's clock. Returns { call, reason, pitchGate } for logging/tests.
export function shouldCall2C({
    now,
    firstCrackAt,
    stillFirstCrackUntil = 0,
    burpGuardUntil = 0,
    window: win = DEFAULT_GAP_WINDOW,
    ratios = [],
    snapTimes = [],
    basePitch = 0.5,
    cracksRequired = 3,
} = {}) {
    if (!firstCrackAt) return { call: false, reason: 'no-1c' };
    if (now < stillFirstCrackUntil) return { call: false, reason: 'still-1c-hold' };
    if (now < burpGuardUntil) return { call: false, reason: 'burp-guard' };

    const elapsed = now - firstCrackAt;
    if (elapsed < HARD_MIN_2C_GAP_MS) return { call: false, reason: 'too-soon' };
    if (ratios.length < cracksRequired) return { call: false, reason: 'few-snaps' };

    // Rate gate: cracks must actually be clustering right now (2C is fast), not a
    // slow trickle of 1C tail pops that happen to be loud.
    const recentSnaps = snapTimes.filter(t => now - t <= RATE_WINDOW_MS).length;
    if (recentSnaps < cracksRequired) return { call: false, reason: 'low-rate' };

    // Band-energy gate: stricter before the expected per-bean window opens, normal
    // inside it, and never blocked outright after it closes (2C can run late).
    const early = elapsed < win.earliestMs;
    const pitchGate = Math.min(MAX_PITCH_GATE, basePitch + (early ? EARLY_2C_PITCH_PENALTY : 0));
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    if (avgRatio < pitchGate) return { call: false, reason: early ? 'pitch-early' : 'pitch', pitchGate };

    return { call: true, reason: early ? 'early-strong-evidence' : 'in-window', pitchGate };
}

// --- Door-"burp" guard (mid-roast noise-floor step detection) --------------------

// How long to demand extra confidence after a detected floor step (spec: ~1–2 s).
export const BURP_GUARD_MS = 1500;
// Spike threshold multiplier while the guard is active.
export const BURP_GUARD_FACTOR = 1.5;

// Track the SUSTAINED (between-pop) noise floor during a roast and detect a step
// change — e.g. the roaster door opening, which removes acoustic shielding and
// raises everything at once. Feed it only quiet frames (below the spike threshold):
// crack pops must never inflate the floor.
//
//   const g = createBurpGuard();
//   const { stepped, baseline } = g.step(t, rms);  // per quiet frame
//
// On `stepped`, the caller should re-baseline its noise floor to `baseline` and
// briefly raise the confidence bar (BURP_GUARD_MS / BURP_GUARD_FACTOR).
export function createBurpGuard({
    slowAlpha = 0.02,     // long-memory floor EMA
    fastAlpha = 0.25,     // short-memory "what it sounds like right now" EMA
    stepFactor = 1.8,     // fast must exceed slow × this …
    minStepRms = 0.02,    // … and by at least this absolute amount (quiet-room safety)
    minFrames = 40,       // let the slow EMA settle before trusting a step (~0.7 s at 60 fps)
    sustainMs = 600,      // the rise must hold this long — single transients don't count
} = {}) {
    let slow = null;
    let fast = null;
    let frames = 0;
    let overSince = null;

    return {
        step(t, rms) {
            frames += 1;
            fast = fast == null ? rms : fast * (1 - fastAlpha) + rms * fastAlpha;
            if (slow == null) { slow = rms; return { stepped: false }; }

            const settled = frames >= minFrames;
            const over = settled && fast > Math.max(slow * stepFactor, slow + minStepRms);
            if (over) {
                // Hold the slow floor still while the level is elevated — if we let it
                // catch up, the step would blur away instead of being detected.
                if (overSince == null) overSince = t;
                if (t - overSince >= sustainMs) {
                    slow = fast; // re-baseline to the new, louder room
                    overSince = null;
                    return { stepped: true, baseline: slow };
                }
            } else {
                overSince = null;
                slow = slow * (1 - slowAlpha) + rms * slowAlpha;
            }
            return { stepped: false };
        },
        baseline() { return slow; },
    };
}

// --- Two-device beep guard (known-alarm-tone spectral notch) ---------------------

// A snap is "alarm-like" when the AVERAGE energy in the narrow bands around the
// app's own alarm-tone frequencies is at least 3× the average across the rest of
// the analysed band (share = target/(target+rest) ≥ 0.75). Real cracks are
// broadband — even one biased toward ~800 Hz spreads energy across the whole
// 0.5–8 kHz range, while an oscillator tone concentrates it in a few bins.
export const ALARM_LIKE_SHARE = 0.75;

// Oscillator harmonics worth checking per waveform (square = odd harmonics,
// sawtooth = all; sine has none). Kept short — a couple of harmonics is enough to
// recognise the tone, and long lists would start covering the whole spectrum.
function harmonicsFor(note) {
    if (!note || typeof note.f !== 'number') return [];
    if (note.type === 'square') return [1, 3, 5, 7].map(n => note.f * n);
    if (note.type === 'sawtooth') return [1, 2, 3, 4].map(n => note.f * n);
    return [note.f]; // sine & default: fundamental only
}

// Flatten an alarm-tone table ({ key: [{ f, type, d }, …] }) into the sorted list of
// frequencies to notch, restricted to the analysed band (the high-pass removes
// anything below it anyway).
export function alarmToneTargets(tones, { minHz = 500, maxHz = 8000 } = {}) {
    const out = new Set();
    for (const seq of Object.values(tones || {})) {
        for (const note of seq || []) {
            for (const hz of harmonicsFor(note)) {
                if (hz >= minHz && hz <= maxHz) out.add(hz);
            }
        }
    }
    return [...out].sort((a, b) => a - b);
}

// Narrowband concentration score (0..1) for `freqData` (byte FFT magnitudes, bin i
// covers i×binHz) against the target tone frequencies: the average magnitude of
// bins within ±halfWidthHz of any target vs the average of the remaining bins in
// the minHz..maxHz band, expressed as targetAvg / (targetAvg + restAvg). ~0.5 for
// broadband sound (both averages similar); →1 for a pure tone at the targets.
// Averages (not sums) so the score doesn't depend on how many bins each side has.
export function alarmNarrowbandShare(freqData, binHz, targetHzList, {
    halfWidthHz = 60, minHz = 500, maxHz = 8000,
} = {}) {
    if (!freqData || !freqData.length || !binHz || !targetHzList || !targetHzList.length) return 0;
    let targetSum = 0, targetN = 0;
    let restSum = 0, restN = 0;
    for (let i = 0; i < freqData.length; i++) {
        const hz = i * binHz;
        if (hz < minHz || hz > maxHz) continue;
        const v = freqData[i];
        let isTarget = false;
        for (const f of targetHzList) {
            if (Math.abs(hz - f) <= halfWidthHz) { isTarget = true; break; }
        }
        if (isTarget) { targetSum += v; targetN += 1; }
        else { restSum += v; restN += 1; }
    }
    if (!targetN || !restN) return 0;
    const targetAvg = targetSum / targetN;
    const restAvg = restSum / restN;
    const denom = targetAvg + restAvg;
    return denom > 0 ? targetAvg / denom : 0;
}

export function isAlarmLike(share) { return share >= ALARM_LIKE_SHARE; }
