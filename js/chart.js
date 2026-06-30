// Reusable roast-curve renderer.
// Draws audio energy (RMS loudness — not temperature) over time, lit from
// within, with phase bands behind it and a quiet oscilloscope grid.
//
// curve:   array of { t, rms } where t is milliseconds since roast start
// markers: { dryEndMs, firstCrackMs, secondCrackMs, totalMs } (any may be null)
//
// All colours come from the CSS theme tokens via getComputedStyle, so swapping
// the theme file re-skins the canvas too. Hardcoded fallbacks match the coffee
// theme for non-DOM contexts (e.g. unit tests).

const THEME_FALLBACK = {
    '--color-bg': '#15100C',
    '--color-border': '#3A2E24',
    '--color-text-muted': '#9C8B7B',
    '--color-accent': '#F2A24C',
    '--color-accent-hot': '#FF7A3C',
    '--roast-drying': '#6B4A2E',
    '--roast-maillard': '#B5702E',
    '--roast-development': '#FF6A2E',
    '--font-mono': "ui-monospace, 'SF Mono', monospace",
};

function readTheme(canvas) {
    let cs = null;
    try {
        const doc = (canvas && canvas.ownerDocument) || (typeof document !== 'undefined' ? document : null);
        if (doc && typeof getComputedStyle === 'function') cs = getComputedStyle(doc.documentElement);
    } catch (_) { cs = null; }
    const get = name => {
        const v = cs && cs.getPropertyValue(name).trim();
        return v || THEME_FALLBACK[name];
    };
    return {
        bg: get('--color-bg'),
        border: get('--color-border'),
        muted: get('--color-text-muted'),
        accent: get('--color-accent'),
        accentHot: get('--color-accent-hot'),
        drying: get('--roast-drying'),
        maillard: get('--roast-maillard'),
        development: get('--roast-development'),
        mono: get('--font-mono'),
    };
}

// Translucent variant of a #rgb / #rrggbb colour. Non-hex inputs pass through.
function withAlpha(color, a) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
    if (!m) return color;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const STD_PAD = { left: 8, right: 8, top: 12, bottom: 18 };

function sizeCanvas(canvas, fallbackH) {
    const width = canvas.width = canvas.clientWidth || canvas.width || 500;
    const height = canvas.height = canvas.clientHeight || canvas.height || fallbackH;
    return { width, height, ctx: canvas.getContext('2d') };
}

function emptyMessage(ctx, t, width, height, msg) {
    ctx.fillStyle = t.muted;
    ctx.font = `12px ${t.mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(msg, width / 2, height / 2);
}

// Faint oscilloscope grid: 3 horizontal + 3 vertical lines.
function drawGrid(ctx, pad, plotW, plotH) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    }
    for (let i = 1; i <= 3; i++) {
        const x = pad.left + (plotW * i) / 4;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
    }
    ctx.restore();
}

// Phase bands behind the curve. Honest by design: only paint a phase once the
// marker that bounds it is real.
//  - dry-end + first-crack  -> drying / Maillard / development (3 bands)
//  - first-crack only       -> Maillard (pre-1C) / development (post) — never a guessed drying split
//  - dry-end only (running) -> drying band only, no development before 1C
//  - nothing marked         -> a single soft elapsed wash, no phase implied
function drawPhaseBands(ctx, t, pad, plotH, xOf, markers, totalMs) {
    const top = pad.top;
    const left = xOf(0), right = xOf(totalMs);
    const band = (x0, x1, color, alpha) => {
        if (x1 <= x0) return;
        ctx.fillStyle = withAlpha(color, alpha);
        ctx.fillRect(x0, top, x1 - x0, plotH);
    };
    const dashAt = x => {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
        ctx.restore();
    };
    const { dryEndMs, firstCrackMs } = markers;

    if (firstCrackMs != null) {
        const fcX = xOf(firstCrackMs);
        if (dryEndMs != null) {
            const deX = xOf(dryEndMs);
            band(left, deX, t.drying, 0.16);
            band(deX, fcX, t.maillard, 0.18);
            band(fcX, right, t.development, 0.24);
            dashAt(deX); dashAt(fcX);
        } else {
            band(left, fcX, t.maillard, 0.18);
            band(fcX, right, t.development, 0.24);
            dashAt(fcX);
        }
    } else if (dryEndMs != null) {
        const deX = xOf(dryEndMs);
        band(left, deX, t.drying, 0.16);
        dashAt(deX);
    } else {
        band(left, right, t.accent, 0.05);
    }
}

// The lit "now" point — a glowing dot at the leading edge of the live line.
function drawNowDot(ctx, x, y) {
    // createRadialGradient throws on non-finite coords (e.g. a degenerate curve with
    // totalMs 0 or a NaN rms), which surfaced as a console error on some renders.
    // A glow dot with no valid position simply shouldn't draw.
    if (!isFinite(x) || !isFinite(y)) return;
    ctx.save();
    const halo = ctx.createRadialGradient(x, y, 0, x, y, 13);
    halo.addColorStop(0, 'rgba(255,122,60,0.30)');
    halo.addColorStop(1, 'rgba(255,122,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    const dot = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, 6);
    dot.addColorStop(0, '#FFC79A');
    dot.addColorStop(1, '#FF7A3C');
    ctx.fillStyle = dot;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// Crack marker: a faint dashed accent line + a ring on the baseline + label.
function drawRing(ctx, t, x, value, pad, plotH, label) {
    if (value == null) return;
    ctx.save();
    ctx.strokeStyle = withAlpha(t.accent, 0.5);
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
    ctx.setLineDash([]);
    const ry = pad.top + plotH;
    ctx.fillStyle = t.bg;
    ctx.beginPath(); ctx.arc(x, ry, 5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = t.accent;
    ctx.beginPath(); ctx.arc(x, ry, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = t.accent; ctx.font = `bold 11px ${t.mono}`; ctx.textAlign = 'center';
    ctx.fillText(label, x, pad.top + plotH + 14);
    ctx.restore();
}

// Stroke the amber, left-to-right gradient energy line + the glow beneath it.
function drawLitLine(ctx, pad, plotW, plotH, path, baseY) {
    // Glow fill under the line.
    ctx.save();
    ctx.beginPath();
    path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineTo(path[path.length - 1][0], baseY);
    ctx.lineTo(path[0][0], baseY);
    ctx.closePath();
    const glow = ctx.createLinearGradient(0, pad.top, 0, baseY);
    glow.addColorStop(0, 'rgba(255,122,60,0.32)');
    glow.addColorStop(1, 'rgba(255,122,60,0)');
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();

    // The lit line itself.
    const grad = ctx.createLinearGradient(pad.left, 0, pad.left + plotW, 0);
    grad.addColorStop(0, '#C9622E');
    grad.addColorStop(0.5, '#FF8A3C');
    grad.addColorStop(1, '#FFB27A');
    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
}

export function drawRoastCurve(canvas, curve, markers = {}) {
    if (!canvas) return;
    const { width, height, ctx } = sizeCanvas(canvas, 150);
    const t = readTheme(canvas);

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, width, height);

    const pad = STD_PAD;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const baseY = pad.top + plotH;

    if (!curve || curve.length < 2) {
        emptyMessage(ctx, t, width, height, 'No roast curve data');
        return;
    }

    const totalMs = markers.totalMs || curve[curve.length - 1].t || 1;
    const maxRms = Math.max(0.1, ...curve.map(p => p.rms));
    const xOf = ms => pad.left + (Math.max(0, Math.min(ms, totalMs)) / totalMs) * plotW;
    const yOf = rms => pad.top + plotH - (rms / maxRms) * plotH;

    drawPhaseBands(ctx, t, pad, plotH, xOf, markers, totalMs);
    drawGrid(ctx, pad, plotW, plotH);

    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(pad.left + plotW, baseY); ctx.stroke();

    const path = curve.map(p => [xOf(p.t), yOf(p.rms)]);
    drawLitLine(ctx, pad, plotW, plotH, path, baseY);

    const [nx, ny] = path[path.length - 1];
    drawNowDot(ctx, nx, ny);

    drawRing(ctx, t, xOf(markers.firstCrackMs), markers.firstCrackMs, pad, plotH, '1C');
    drawRing(ctx, t, xOf(markers.secondCrackMs), markers.secondCrackMs, pad, plotH, '2C');
}

// Plot a metric across roasts over time. series: [{ label, value }] chronological.
export function drawTrend(canvas, series, opts = {}) {
    if (!canvas) return;
    const { width, height, ctx } = sizeCanvas(canvas, 180);
    const t = readTheme(canvas);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 40, right: 10, top: 14, bottom: 26 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const pts = (series || []).filter(p => p.value != null && !isNaN(p.value));
    if (pts.length === 0) {
        emptyMessage(ctx, t, width, height, 'No data for this metric yet');
        return;
    }

    const values = pts.map(p => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }

    const xOf = i => pad.left + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
    const yOf = v => pad.top + plotH - ((v - min) / (max - min)) * plotH;

    drawGrid(ctx, pad, plotW, plotH);

    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    ctx.fillStyle = t.muted;
    ctx.font = `10px ${t.mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(max.toFixed(opts.decimals ?? 1), pad.left - 4, pad.top + 8);
    ctx.fillText(min.toFixed(opts.decimals ?? 1), pad.left - 4, pad.top + plotH);

    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
        const x = xOf(i), y = yOf(p.value);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = t.accent;
    pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(xOf(i), yOf(p.value), 3, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = t.muted;
    ctx.textAlign = 'left';
    ctx.fillText(pts[0].label || '', pad.left, pad.top + plotH + 16);
    if (pts.length > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(pts[pts.length - 1].label || '', pad.left + plotW, pad.top + plotH + 16);
    }
}

// Energy curve plus a subordinate second line (e.g. Rate of Rise) on an
// independent scale, sharing the time axis. secondCurve: [{ t, v }].
export function drawRoastCurveDual(canvas, energyCurve, secondCurve, markers = {}, secondLabel = 'temp') {
    if (!canvas) return;
    const { width, height, ctx } = sizeCanvas(canvas, 150);
    const t = readTheme(canvas);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, width, height);

    const pad = STD_PAD;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const baseY = pad.top + plotH;

    const energy = (energyCurve || []).filter(p => p && p.rms != null);
    const second = (secondCurve || []).filter(p => p && p.v != null && !isNaN(p.v));
    const lastT = Math.max(
        energy.length ? energy[energy.length - 1].t : 0,
        second.length ? second[second.length - 1].t : 0
    );
    const totalMs = markers.totalMs || lastT || 1;
    const xOf = ms => pad.left + (Math.max(0, Math.min(ms, totalMs)) / totalMs) * plotW;

    drawPhaseBands(ctx, t, pad, plotH, xOf, markers, totalMs);
    drawGrid(ctx, pad, plotW, plotH);

    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(pad.left + plotW, baseY); ctx.stroke();

    // Subordinate second line (muted, thin) drawn first so the energy line sits on top.
    if (second.length >= 2) {
        const sv = second.map(p => p.v);
        let smin = Math.min(...sv), smax = Math.max(...sv);
        if (smin === smax) { smin -= 1; smax += 1; }
        ctx.save();
        ctx.strokeStyle = t.muted; ctx.lineWidth = 1.5;
        ctx.beginPath();
        second.forEach((p, i) => {
            const y = pad.top + plotH - ((p.v - smin) / (smax - smin)) * plotH;
            const x = xOf(p.t);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
    }

    // Lit energy line.
    if (energy.length >= 2) {
        const maxRms = Math.max(0.1, ...energy.map(p => p.rms));
        const yOf = rms => pad.top + plotH - (rms / maxRms) * plotH;
        const path = energy.map(p => [xOf(p.t), yOf(p.rms)]);
        drawLitLine(ctx, pad, plotW, plotH, path, baseY);
        const [nx, ny] = path[path.length - 1];
        drawNowDot(ctx, nx, ny);
    }

    drawRing(ctx, t, xOf(markers.firstCrackMs), markers.firstCrackMs, pad, plotH, '1C');
    drawRing(ctx, t, xOf(markers.secondCrackMs), markers.secondCrackMs, pad, plotH, '2C');

    // Legend.
    ctx.font = `bold 11px ${t.mono}`; ctx.textAlign = 'left';
    ctx.fillStyle = t.accent; ctx.fillText('energy', pad.left + 4, pad.top + 10);
    if (second.length) { ctx.fillStyle = t.muted; ctx.fillText(secondLabel, pad.left + 60, pad.top + 10); }
}

// Overlay several roast curves on one canvas, time-aligned, with a legend.
// series: array of { curve, color, label, firstCrackMs, secondCrackMs, dashed }
export function drawRoastCurves(canvas, series = []) {
    if (!canvas) return;
    const { width, height, ctx } = sizeCanvas(canvas, 180);
    const t = readTheme(canvas);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, width, height);

    const pad = STD_PAD;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const valid = series.filter(s => s.curve && s.curve.length >= 2);
    if (valid.length === 0) {
        emptyMessage(ctx, t, width, height, 'Select two roasts with curve data to compare');
        return;
    }

    const totalMs = Math.max(...valid.map(s => s.curve[s.curve.length - 1].t)) || 1;
    const maxRms = Math.max(0.1, ...valid.flatMap(s => s.curve.map(p => p.rms)));
    const xOf = ms => pad.left + (ms / totalMs) * plotW;
    const yOf = rms => pad.top + plotH - (rms / maxRms) * plotH;

    drawGrid(ctx, pad, plotW, plotH);

    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    valid.forEach(s => {
        const color = s.color || t.accent;
        const dashed = s.dashed || /reference/i.test(s.label || '');
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (dashed) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        s.curve.forEach((p, i) => {
            const x = xOf(p.t), y = yOf(p.rms);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        // First-crack marker in the series colour (skip 2C to reduce clutter).
        if (s.firstCrackMs != null) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(xOf(s.firstCrackMs), pad.top);
            ctx.lineTo(xOf(s.firstCrackMs), pad.top + plotH);
            ctx.stroke();
            ctx.restore();
        }
    });

    // Legend.
    ctx.font = `bold 11px ${t.mono}`;
    ctx.textAlign = 'left';
    valid.forEach((s, i) => {
        const ly = pad.top + 4 + i * 16;
        ctx.fillStyle = s.color || t.accent;
        ctx.fillRect(pad.left + 4, ly, 10, 10);
        ctx.fillText(s.label || `Roast ${i + 1}`, pad.left + 18, ly + 9);
    });
}
