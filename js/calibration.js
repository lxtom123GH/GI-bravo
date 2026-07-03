// Rolling noise-floor estimator for auto-calibration (pure, unit-tested).
//
// Instead of one short manual sample, the app keeps a sliding window of recent
// room-loudness (RMS) readings while you set up, and freezes the floor the
// moment a roast starts. RECENCY beats duration here: a long accumulated
// window would let prep clatter (grinder, bags, trays) push the floor too
// high and deafen first-crack detection, so old samples are evicted and the
// baseline always reflects "the room as it sounds right now" — including the
// roaster warming up, which a pre-roast manual sample usually misses.
//
// The 90th-percentile choice matches the manual Calibrate Noise button: with
// intermittent talking the mean sits near the quiet floor and chatter then
// trips detection, so the high percentile lifts the baseline to roughly the
// louder room level.

export function createNoiseFloor({ windowMs = 45000, percentile = 0.9, minSamples = 20 } = {}) {
    let samples = []; // { t, rms } in arrival (time) order

    return {
        // Record one reading at time `t` (ms) and evict everything older than
        // the window.
        add(t, rms) {
            samples.push({ t, rms });
            const cutoff = t - windowMs;
            while (samples.length && samples[0].t < cutoff) samples.shift();
        },

        // The current noise floor, or null while there isn't enough data to
        // trust (callers then keep their previous baseline).
        baseline() {
            if (samples.length < minSamples) return null;
            const sorted = samples.map(s => s.rms).sort((a, b) => a - b);
            return sorted[Math.min(sorted.length - 1, Math.floor(percentile * sorted.length))];
        },

        // Replace the window with a manual calibration's samples (all stamped
        // `t`), so the button and the rolling floor agree and rolling updates
        // continue from there.
        seed(t, rmsValues) {
            samples = (rmsValues || []).map(rms => ({ t, rms }));
        },

        reset() { samples = []; },
        size() { return samples.length; }
    };
}
