// Roast timing metrics shared across the dashboard, history, and exports.

// Format a millisecond duration as M:SS (or "--" when not available).
export function formatMs(ms) {
    if (ms == null || isNaN(ms)) return '--';
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Compute roast metrics from a timeline ({ startTime, firstCrackTime,
// secondCrackTime, endTime }). `endTime` may be omitted for an in-progress
// roast, in which case pass `now` to measure against the current time.
export function computeRoastMetrics(timeline, now = Date.now()) {
    const start = timeline.startTime;
    const end = timeline.endTime || now;
    const fc = timeline.firstCrackTime;
    const sc = timeline.secondCrackTime;

    const totalMs = start ? end - start : null;
    const timeToFirstCrackMs = fc ? fc - start : null;
    const developmentTimeMs = fc ? end - fc : null;
    // Development Time Ratio: share of the roast spent after first crack.
    const dtr = (developmentTimeMs != null && totalMs) ? developmentTimeMs / totalMs : null;

    return { totalMs, timeToFirstCrackMs, secondCrackMs: sc ? sc - start : null, developmentTimeMs, dtr };
}

// Format a DTR fraction (0..1) as a percentage string.
export function formatDtr(dtr) {
    if (dtr == null || isNaN(dtr)) return '--';
    return `${(dtr * 100).toFixed(1)}%`;
}
