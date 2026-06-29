// js/roastlab.js — "Roast Lab": pure helpers for capturing, summarising and exporting
// a roast feature timeline (RMS, high-band ratio, MFCC vector) plus crack/clear events,
// so the owner can A/B detection across real roasts and analyse the data offline.
//
// OBSERVATIONAL ONLY. Nothing here touches crack detection — it just records what the
// detector already computes. Kept pure (no DOM / audio / Date) so it can be unit-tested.

export const ROAST_LAB_FRAME_MS = 500; // target capture cadence (~2 frames/sec)

// Round to a fixed number of decimals, or null for non-finite input (keeps logs compact).
function round(v, dp) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    const m = Math.pow(10, dp);
    return Math.round(v * m) / m;
}

// Build an empty capture session. `meta` carries roast context for later analysis
// (bean, roaster, sampleRate, dateStr, detection settings…).
export function createSession(meta = {}) {
    return { meta: { ...meta }, frames: [], events: [] };
}

// Append a feature frame. `t` is ms since roast start. Returns the session (chainable).
export function addFrame(session, frame = {}) {
    if (!session) return session;
    session.frames.push({
        t: Math.round(frame.t || 0),
        rms: round(frame.rms, 5),
        bandRatio: round(frame.bandRatio, 5),
        mfcc: Array.isArray(frame.mfcc) ? frame.mfcc.map(v => round(v, 4)) : null,
    });
    return session;
}

// Append an event. type is 'crack' (detected or manually marked) or 'clear' (false alarm).
export function addEvent(session, event = {}) {
    if (!session) return session;
    session.events.push({
        t: Math.round(event.t || 0),
        type: event.type || 'event',
        label: event.label || '',
        auto: !!event.auto,
    });
    return session;
}

// Roll the session up into headline numbers for the live readout + log line.
export function summariseRoastLab(session) {
    const frames = (session && session.frames) || [];
    const events = (session && session.events) || [];
    const last = frames.length ? frames[frames.length - 1] : null;
    const mfccDims = frames.reduce((m, f) => Math.max(m, f.mfcc ? f.mfcc.length : 0), 0);
    return {
        frames: frames.length,
        events: events.length,
        durationMs: last ? last.t : 0,
        cracks: events.filter(e => e.type === 'crack').length,
        clears: events.filter(e => e.type === 'clear').length,
        mfccDims,
    };
}

// Full-fidelity JSON dump for offline analysis.
export function formatRoastLabJson(session) {
    return JSON.stringify(session || createSession(), null, 2);
}

function csvNum(v) { return (typeof v === 'number' && isFinite(v)) ? String(v) : ''; }
function csvField(s) {
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Flat CSV for eyeballing in a spreadsheet: one row per feature frame plus one row per
// event, all sorted by time. MFCC coefficients become mfcc_0..mfcc_n columns.
export function formatRoastLabCsv(session) {
    const { mfccDims } = summariseRoastLab(session);
    const header = ['t_ms', 't_s', 'rms', 'bandRatio'];
    for (let i = 0; i < mfccDims; i++) header.push('mfcc_' + i);
    header.push('event', 'event_label');

    const frameRows = ((session && session.frames) || []).map(f => {
        const cols = [f.t, (f.t / 1000).toFixed(2), csvNum(f.rms), csvNum(f.bandRatio)];
        for (let i = 0; i < mfccDims; i++) cols.push(csvNum(f.mfcc ? f.mfcc[i] : null));
        cols.push('', '');
        return { t: f.t, cols };
    });
    const eventRows = ((session && session.events) || []).map(e => {
        const cols = [e.t, (e.t / 1000).toFixed(2), '', ''];
        for (let i = 0; i < mfccDims; i++) cols.push('');
        cols.push(e.auto ? e.type + ':auto' : e.type, csvField(e.label));
        return { t: e.t, cols };
    });

    const rows = frameRows.concat(eventRows).sort((a, b) => a.t - b.t);
    return [header.join(',')].concat(rows.map(r => r.cols.join(','))).join('\n');
}

// One-line text summary for the copy-to-clipboard button (quick paste into chat).
export function formatRoastLabSummaryText(session) {
    const s = summariseRoastLab(session);
    const evs = ((session && session.events) || [])
        .map(e => `${(e.t / 1000).toFixed(1)}s ${e.type}${e.auto ? '(auto)' : ''} ${e.label}`.trim())
        .join('; ');
    const dur = (s.durationMs / 1000).toFixed(0);
    return `Roast Lab capture — ${s.frames} frames over ${dur}s, ${s.mfccDims} MFCC dims, `
        + `${s.cracks} crack / ${s.clears} clear event(s). Events: ${evs || 'none'}.`;
}

// Build a clean, sortable export filename. Caller supplies meta.dateStr (keeps this pure).
export function roastLabFilename(meta, ext) {
    const bean = ((meta && meta.bean) || 'roast')
        .replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'roast';
    const date = (meta && meta.dateStr) || 'session';
    return `roastlab-${bean}-${date}.${ext}`;
}
