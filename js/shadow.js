// js/shadow.js — "shadow detector v2": a bank of parallel, LOG-ONLY crack detectors.
//
// What this is (and very deliberately is NOT):
//  - A set of independent detector *variants* that run alongside the live detector during a roast,
//    each fed the same per-frame features the live loop already computes (rms + high-band ratio).
//  - Each variant decides 1C/2C on its own thresholds and emits a candidate event into the Roast
//    Lab capture, tagged with which variant fired. That's it.
//  - It NEVER alarms, NEVER drives the UI, NEVER touches the live detector or roastState. It only
//    produces log entries so the owner can compare, offline, "current detector vs each shadow
//    variant vs my own Manual:Mark / ✗ ground truth" across the weekend's roasts.
//
// Why a *bank* and not one shadow path: the expensive work (FFT, RMS, band ratio, MFCC) is computed
// once per frame and shared, so running N decision functions over those features is almost free.
// One roast therefore yields a labelled comparison of many parameterisations at once — exactly the
// dataset needed before committing to a trained v2 classifier (which we can't build without labels).
//
// Pure + deterministic (no Date.now, no DOM): the caller passes frame-relative time `t` (ms since
// roast start), so the whole module is unit-testable by replaying a synthetic frame timeline.

// Live-detector constants, mirrored here so a "balanced" variant can sit near the real machine and
// the others vary around it. Kept local on purpose — the live values live in js/audio.js and we
// don't want a shared-mutable coupling between the live loop and the shadow bank.
const BASE = {
    thresholdMultiplier: 2.0, // spike must exceed baselineNoise × this …
    spikeRatio: 2.0,          // …and recentAvg × this …
    floorRms: 0.05,           // …and this absolute floor.
    cracksRequired: 3,        // snaps clustered within clusterWindowMs to declare a crack phase
    secondCrackPitch: 0.5,    // avg high-band ratio at/above this reads as 2C-like (higher pitched)
    cooldownMs: 100,          // min gap between counted snaps (TRANSIENT_COOLDOWN_MS)
    clusterWindowMs: 5000,    // snaps must fall within this window (CLUSTER_WINDOW_MS)
    secondCrackMinGapMs: 20000, // earliest 2C can follow 1C (SECOND_CRACK_MIN_GAP_MS)
    ratioWindow: 8,           // recent snaps averaged for the pitch signature (RATIO_WINDOW)
    historyLen: 10,           // rms history length (HISTORY_LENGTH)
    baselineAlpha: 0.05,      // EMA rate for the self-tracked ambient noise floor (quiet frames only)
};

// The variant bank. Each entry overrides a few BASE params so we sweep the axes that matter:
// sensitivity (threshold/cracks), 2C pitch strictness, and cluster tightness. Add/remove freely —
// the wiring is data-driven, so more variants cost almost nothing.
export const SHADOW_VARIANTS = [
    { id: 'balanced', label: 'Balanced (≈ live)', params: {} },
    { id: 'sensitive', label: 'Sensitive', params: { thresholdMultiplier: 1.6, spikeRatio: 1.6, cracksRequired: 2 } },
    { id: 'strict', label: 'Strict', params: { thresholdMultiplier: 2.6, spikeRatio: 2.4, cracksRequired: 4 } },
    { id: 'pitch-strict', label: 'Strict 2C pitch', params: { secondCrackPitch: 0.62 } },
    { id: 'tight-cluster', label: 'Tight cluster', params: { clusterWindowMs: 3000, cooldownMs: 150 } },
];

function variantParams(overrides = {}) {
    return { ...BASE, ...overrides };
}

function freshState() {
    return {
        rmsHistory: [],
        baseline: BASE.floorRms, // adapts via EMA toward ambient on quiet frames
        lastSnapT: -Infinity,
        clusterCount: 0,
        ratios: [],
        transients: 0,      // total counted snaps (a rough "activity" measure for the readout)
        firstCrackT: null,
        secondCrackT: null,
    };
}

// Build a fresh bank. Each variant carries its resolved params + independent mutable state.
export function createShadowBank(variants = SHADOW_VARIANTS) {
    return {
        variants: variants.map(v => ({
            id: v.id,
            label: v.label,
            params: variantParams(v.params),
            state: freshState(),
        })),
    };
}

function mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// Advance one variant by a single frame. Returns a fired event {variantId, kind, t} or null.
// Mirrors the live detectTransient cluster logic, but every threshold is the variant's own and all
// timing is frame-relative (the caller owns the clock).
function stepVariant(variant, frame) {
    const p = variant.params;
    const s = variant.state;
    const { t, rms } = frame;
    const bandRatio = typeof frame.bandRatio === 'number' ? frame.bandRatio : 0;

    // Expire a stale cluster after a quiet gap (the live detector does this on a timer).
    if (s.clusterCount > 0 && t - s.lastSnapT > p.clusterWindowMs) {
        s.clusterCount = 0;
        s.ratios = [];
    }

    s.rmsHistory.push(rms);
    if (s.rmsHistory.length > p.historyLen) s.rmsHistory.shift();
    const recentAvg = mean(s.rmsHistory);

    const spikeThreshold = Math.max(s.baseline * p.thresholdMultiplier, recentAvg * p.spikeRatio, p.floorRms);

    const isSnap = rms > spikeThreshold && (t - s.lastSnapT > p.cooldownMs);

    if (!isSnap) {
        // Quiet-ish frame: let the ambient noise floor drift toward it (only when clearly below
        // threshold, so cracks don't inflate the baseline).
        if (rms < spikeThreshold) s.baseline = s.baseline * (1 - p.baselineAlpha) + rms * p.baselineAlpha;
        return null;
    }

    // Counted snap.
    s.lastSnapT = t;
    s.clusterCount++;
    s.transients++;
    s.ratios.push(bandRatio);
    if (s.ratios.length > p.ratioWindow) s.ratios.shift();
    const ratio = mean(s.ratios);

    if (s.firstCrackT == null) {
        if (s.clusterCount >= p.cracksRequired) {
            s.firstCrackT = t;
            return { variantId: variant.id, kind: 'firstCrack', t };
        }
    } else if (s.secondCrackT == null &&
               t - s.firstCrackT > p.secondCrackMinGapMs &&
               s.ratios.length >= p.cracksRequired &&
               ratio >= p.secondCrackPitch) {
        s.secondCrackT = t;
        return { variantId: variant.id, kind: 'secondCrack', t };
    }
    return null;
}

// Advance the whole bank by one frame. Returns the list of events fired this frame (often empty).
// frame = { t, rms, bandRatio } where t is ms since roast start.
export function stepShadowBank(bank, frame) {
    if (!bank || !bank.variants) return [];
    const events = [];
    for (const variant of bank.variants) {
        const ev = stepVariant(variant, frame);
        if (ev) events.push(ev);
    }
    return events;
}

// A compact per-variant summary for the live readout + offline glance:
// [{ id, label, transients, firstCrackT, secondCrackT }].
export function summariseShadowBank(bank) {
    if (!bank || !bank.variants) return [];
    return bank.variants.map(v => ({
        id: v.id,
        label: v.label,
        transients: v.state.transients,
        firstCrackT: v.state.firstCrackT,
        secondCrackT: v.state.secondCrackT,
    }));
}
