// Per-roaster adaptive crack-detection tuning (v1).
//
// Pure helpers — no DOM, no storage — so they're unit-testable; persistence
// lives in storage.js and the wiring in audio.js. This is deliberately the
// simplest form of human-in-the-loop active learning: each explicit correction
// the user makes nudges a per-machine sensitivity offset.
//   - false positive (an AUTO crack the user clears)            -> less sensitive
//   - missed (the user marks a crack the detector didn't catch) -> more sensitive
// Only the spike threshold is tuned in v1 (the biggest lever); cluster size and
// second-crack pitch stay on the manual sliders. (v2 would add MFCC features and
// a small on-device classifier — see FUTURE_FEATURES.md.)

export const ADJUST_STEP = 0.2;          // how far one correction moves the threshold
export const MIN_THRESHOLD_DELTA = -0.4; // most-sensitive shift the learner will apply
export const MAX_THRESHOLD_DELTA = 1.5;  // least-sensitive shift
// The effective threshold is also clamped to the manual slider's own range.
export const MIN_THRESHOLD = 1.1;
export const MAX_THRESHOLD = 3.0;

export const DEFAULT_ADJUST = { thresholdDelta: 0, samples: 0 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Return a fresh adjust nudged by one correction. Signals:
//   'falsePositive' -> raise threshold (less sensitive)
//   'missed'        -> lower threshold (more sensitive)
//   'confirmed'     -> unchanged (counts only as a sample)
// Unknown signals are a no-op (not even counted).
export function nudgeAdjust(adjust, signal) {
    const a = { ...DEFAULT_ADJUST, ...(adjust || {}) };
    let delta = a.thresholdDelta;
    if (signal === 'falsePositive') delta += ADJUST_STEP;
    else if (signal === 'missed') delta -= ADJUST_STEP;
    else if (signal !== 'confirmed') return a;
    return {
        thresholdDelta: clamp(delta, MIN_THRESHOLD_DELTA, MAX_THRESHOLD_DELTA),
        samples: a.samples + 1,
    };
}

// Merge a learned adjust onto base detection settings -> effective settings.
export function applyAdjust(baseSettings, adjust) {
    const base = baseSettings || {};
    const a = { ...DEFAULT_ADJUST, ...(adjust || {}) };
    const baseThreshold = base.thresholdMultiplier == null ? 1.5 : base.thresholdMultiplier;
    return { ...base, thresholdMultiplier: clamp(baseThreshold + a.thresholdDelta, MIN_THRESHOLD, MAX_THRESHOLD) };
}

// Human-readable summary for the settings UI. baseSettings optional (used to
// show the resulting effective threshold).
export function describeAdjust(adjust, baseSettings) {
    const a = { ...DEFAULT_ADJUST, ...(adjust || {}) };
    if (!a.samples || a.thresholdDelta === 0) return 'not yet tuned';
    const dir = a.thresholdDelta > 0 ? 'less sensitive' : 'more sensitive';
    const eff = baseSettings ? applyAdjust(baseSettings, a).thresholdMultiplier : null;
    const effStr = eff == null ? '' : ` (now ${eff.toFixed(1)}×)`;
    const sign = a.thresholdDelta > 0 ? '+' : '';
    const n = a.samples;
    return `${dir}${effStr} — ${sign}${a.thresholdDelta.toFixed(1)}× from ${n} correction${n === 1 ? '' : 's'}`;
}
