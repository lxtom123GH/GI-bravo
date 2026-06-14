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

// Rate of Rise between consecutive manual temperature readings.
// temps: [{ t (ms from start), temp }] -> [{ t, temp, ror (deg/min) }]
export function computeRoRPoints(temps) {
    if (!temps || temps.length < 2) return [];
    const pts = [];
    for (let i = 1; i < temps.length; i++) {
        const dtMin = (temps[i].t - temps[i - 1].t) / 60000;
        const ror = dtMin > 0 ? (temps[i].temp - temps[i - 1].temp) / dtMin : 0;
        pts.push({ t: temps[i].t, temp: temps[i].temp, ror });
    }
    return pts;
}

export function formatRoR(ror) {
    if (ror == null || isNaN(ror)) return '--';
    return `${ror.toFixed(1)}°/min`;
}

// Weight loss (yield) percentage from green and roasted weights.
export function computeWeightLoss(greenWeightG, roastedWeightG) {
    const g = Number(greenWeightG), r = Number(roastedWeightG);
    if (!g || !r || g <= 0 || r <= 0) return null;
    return ((g - r) / g) * 100;
}

export function formatPct(p) {
    if (p == null || isNaN(p)) return '--';
    return `${p.toFixed(1)}%`;
}

// Behmor batch-size settings and their labels per weight unit.
export const BEHMOR_GRAMS = { '1/4': 113, '1/2': 227, '1': 454 };

export function weightLabel(key, unit) {
    if (unit === 'imperial') return { '1/4': '¼ lb', '1/2': '½ lb', '1': '1 lb' }[key] || key;
    return BEHMOR_GRAMS[key] != null ? `${BEHMOR_GRAMS[key]} g` : key;
}
