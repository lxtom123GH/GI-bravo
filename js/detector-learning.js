// Per-roaster adaptive crack-detection tuning (v1 + the 2C-pitch extension).
//
// Pure helpers — no DOM, no storage — so they're unit-testable; persistence
// lives in storage.js and the wiring in audio.js. This is deliberately the
// simplest form of human-in-the-loop active learning: each explicit correction
// the user makes nudges a per-machine offset.
//   - false positive (an AUTO crack the user clears)            -> less sensitive
//   - missed (the user marks a crack the detector didn't catch) -> more sensitive
//   - missedSecond (a MISSED 2nd crack specifically)            -> more sensitive
//     AND relaxes any learned 2C-pitch strictness
//   - still1c ("those pops are still 1st crack")                -> 2C must sound
//     more clearly higher-pitched before it's called (pitch gate up)
// v1 tuned only the spike threshold; the "still 1st crack" work (2026-07)
// added the second lever: a learned offset on the 2C pitch gate. Cluster size
// stays on the manual slider. (v2 would add MFCC features and a small
// on-device classifier — see FUTURE_FEATURES.md.)

export const ADJUST_STEP = 0.2;          // how far one correction moves the threshold
export const MIN_THRESHOLD_DELTA = -0.4; // most-sensitive shift the learner will apply
export const MAX_THRESHOLD_DELTA = 1.5;  // least-sensitive shift
// The effective threshold is also clamped to the manual slider's own range.
export const MIN_THRESHOLD = 1.1;
export const MAX_THRESHOLD = 3.0;

// 2C pitch-gate learning ("still 1st crack" marker). Only ever raises the gate
// (a missed 2C walks it back down); clamped so 2C can never become uncallable.
export const PITCH_STEP = 0.05;      // one "still 1C" tap moves the 2C pitch gate this much
export const MAX_PITCH_DELTA = 0.25; // most strictness the learner will add
// The effective pitch gate is clamped to the manual slider's own range.
export const MIN_PITCH = 0.3;
export const MAX_PITCH = 0.85;

export const DEFAULT_ADJUST = { thresholdDelta: 0, pitchDelta: 0, samples: 0 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Return a fresh adjust nudged by one correction. Signals:
//   'falsePositive' -> raise threshold (less sensitive)
//   'missed'        -> lower threshold (more sensitive)
//   'missedSecond'  -> lower threshold AND relax the learned 2C pitch strictness
//   'still1c'       -> raise the 2C pitch gate (2C must sound clearly higher)
//   'confirmed'     -> unchanged (counts only as a sample)
// Unknown signals are a no-op (not even counted).
export function nudgeAdjust(adjust, signal) {
    const a = { ...DEFAULT_ADJUST, ...(adjust || {}) };
    let delta = a.thresholdDelta;
    let pitch = a.pitchDelta;
    if (signal === 'falsePositive') delta += ADJUST_STEP;
    else if (signal === 'missed') delta -= ADJUST_STEP;
    else if (signal === 'missedSecond') { delta -= ADJUST_STEP; pitch -= PITCH_STEP; }
    else if (signal === 'still1c') pitch += PITCH_STEP;
    else if (signal !== 'confirmed') return a;
    return {
        thresholdDelta: clamp(delta, MIN_THRESHOLD_DELTA, MAX_THRESHOLD_DELTA),
        pitchDelta: clamp(pitch, 0, MAX_PITCH_DELTA),
        samples: a.samples + 1,
    };
}

// Merge a learned adjust onto base detection settings -> effective settings.
export function applyAdjust(baseSettings, adjust) {
    const base = baseSettings || {};
    const a = { ...DEFAULT_ADJUST, ...(adjust || {}) };
    const baseThreshold = base.thresholdMultiplier == null ? 1.5 : base.thresholdMultiplier;
    const basePitch = base.secondCrackPitch == null ? 0.5 : base.secondCrackPitch;
    return {
        ...base,
        thresholdMultiplier: clamp(baseThreshold + a.thresholdDelta, MIN_THRESHOLD, MAX_THRESHOLD),
        secondCrackPitch: clamp(basePitch + a.pitchDelta, MIN_PITCH, MAX_PITCH),
    };
}

// Human-readable summary for the settings UI. baseSettings optional (used to
// show the resulting effective values).
export function describeAdjust(adjust, baseSettings) {
    const a = { ...DEFAULT_ADJUST, ...(adjust || {}) };
    if (!a.samples || (a.thresholdDelta === 0 && a.pitchDelta === 0)) return 'not yet tuned';
    const parts = [];
    if (a.thresholdDelta !== 0) {
        const dir = a.thresholdDelta > 0 ? 'less sensitive' : 'more sensitive';
        const eff = baseSettings ? applyAdjust(baseSettings, a).thresholdMultiplier : null;
        const effStr = eff == null ? '' : ` (now ${eff.toFixed(1)}×)`;
        const sign = a.thresholdDelta > 0 ? '+' : '';
        parts.push(`${dir}${effStr} — ${sign}${a.thresholdDelta.toFixed(1)}×`);
    }
    if (a.pitchDelta !== 0) {
        const effP = baseSettings ? applyAdjust(baseSettings, a).secondCrackPitch : null;
        const effPStr = effP == null ? '' : ` (now ${Math.round(effP * 100)}%)`;
        parts.push(`stricter 2C pitch${effPStr} — +${Math.round(a.pitchDelta * 100)}%`);
    }
    const n = a.samples;
    return `${parts.join('; ')} from ${n} correction${n === 1 ? '' : 's'}`;
}
