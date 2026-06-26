// Reusable roast-curve renderer.
// Draws audio energy (RMS) over time with vertical markers for crack events.
//
// curve:   array of { t, rms } where t is milliseconds since roast start
// markers: { firstCrackMs, secondCrackMs, totalMs } (any may be null/undefined)
export function drawRoastCurve(canvas, curve, markers = {}) {
    if (!canvas) return;

    // Size the backing store to the displayed size for crisp lines.
    const width = canvas.width = canvas.clientWidth || canvas.width || 500;
    const height = canvas.height = canvas.clientHeight || canvas.height || 150;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 8, right: 8, top: 12, bottom: 18 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    if (!curve || curve.length < 2) {
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No roast curve data', width / 2, height / 2);
        return;
    }

    const totalMs = markers.totalMs || curve[curve.length - 1].t || 1;
    const maxRms = Math.max(0.1, ...curve.map(p => p.rms));

    const xOf = t => pad.left + (t / totalMs) * plotW;
    const yOf = rms => pad.top + plotH - (rms / maxRms) * plotH;

    // Baseline axis
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Energy curve
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    curve.forEach((p, i) => {
        const x = xOf(p.t);
        const y = yOf(p.rms);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Crack markers
    drawMarker(ctx, xOf(markers.firstCrackMs), pad, plotH, '#2196f3', '1C', markers.firstCrackMs);
    drawMarker(ctx, xOf(markers.secondCrackMs), pad, plotH, '#9c27b0', '2C', markers.secondCrackMs);
}

// Plot a metric across roasts over time. series: [{ label, value }] in chronological order.
export function drawTrend(canvas, series, opts = {}) {
    if (!canvas) return;

    const width = canvas.width = canvas.clientWidth || canvas.width || 500;
    const height = canvas.height = canvas.clientHeight || canvas.height || 180;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 40, right: 10, top: 14, bottom: 26 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const pts = (series || []).filter(p => p.value != null && !isNaN(p.value));
    if (pts.length === 0) {
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No data for this metric yet', width / 2, height / 2);
        return;
    }

    const values = pts.map(p => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }

    const xOf = i => pad.left + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
    const yOf = v => pad.top + plotH - ((v - min) / (max - min)) * plotH;

    // Axes + min/max labels
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    ctx.fillStyle = '#a0a0a0';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(max.toFixed(opts.decimals ?? 1), pad.left - 4, pad.top + 8);
    ctx.fillText(min.toFixed(opts.decimals ?? 1), pad.left - 4, pad.top + plotH);

    // Line + dots
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
        const x = xOf(i), y = yOf(p.value);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#ff9800';
    pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(xOf(i), yOf(p.value), 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // First/last x labels
    ctx.fillStyle = '#a0a0a0';
    ctx.textAlign = 'left';
    ctx.fillText(pts[0].label || '', pad.left, pad.top + plotH + 16);
    if (pts.length > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(pts[pts.length - 1].label || '', pad.left + plotW, pad.top + plotH + 16);
    }
}

// Draw the energy curve plus a second line (e.g. Rate of Rise) on independent
// scales (shared time axis). secondCurve: [{ t, v }]; secondLabel names it.
export function drawRoastCurveDual(canvas, energyCurve, secondCurve, markers = {}, secondLabel = 'temp') {
    if (!canvas) return;
    const width = canvas.width = canvas.clientWidth || canvas.width || 500;
    const height = canvas.height = canvas.clientHeight || canvas.height || 150;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 8, right: 8, top: 12, bottom: 18 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const energy = (energyCurve || []).filter(p => p && p.rms != null);
    const second = (secondCurve || []).filter(p => p && p.v != null && !isNaN(p.v));
    const lastT = Math.max(
        energy.length ? energy[energy.length - 1].t : 0,
        second.length ? second[second.length - 1].t : 0
    );
    const totalMs = markers.totalMs || lastT || 1;
    const xOf = t => pad.left + (t / totalMs) * plotW;

    // Baseline
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    const drawLine = (pts, valOf, min, max, color) => {
        if (pts.length < 2 || max <= min) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const y = pad.top + plotH - ((valOf(p) - min) / (max - min)) * plotH;
            const x = xOf(p.t);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    };

    // Energy (orange, scaled to its own max)
    const maxRms = Math.max(0.1, ...energy.map(p => p.rms));
    drawLine(energy, p => p.rms, 0, maxRms, '#ff9800');

    // Second series (red, scaled to its own range)
    if (second.length) {
        const sv = second.map(p => p.v);
        let smin = Math.min(...sv), smax = Math.max(...sv);
        if (smin === smax) { smin -= 1; smax += 1; }
        drawLine(second, p => p.v, smin, smax, '#e53935');
    }

    // Crack markers
    const mark = (x, color, label, value) => {
        if (value == null) return;
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillText(label, x, pad.top + plotH + 14);
        ctx.restore();
    };
    mark(xOf(markers.firstCrackMs), '#2196f3', '1C', markers.firstCrackMs);
    mark(xOf(markers.secondCrackMs), '#9c27b0', '2C', markers.secondCrackMs);

    // Legend
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#ff9800'; ctx.fillText('energy', pad.left + 4, pad.top + 10);
    if (second.length) { ctx.fillStyle = '#e53935'; ctx.fillText(secondLabel, pad.left + 60, pad.top + 10); }
}

// Overlay several roast curves on one canvas, time-aligned, with a legend.
// series: array of { curve, color, label, firstCrackMs, secondCrackMs }
export function drawRoastCurves(canvas, series = []) {
    if (!canvas) return;

    const width = canvas.width = canvas.clientWidth || canvas.width || 500;
    const height = canvas.height = canvas.clientHeight || canvas.height || 180;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 8, right: 8, top: 12, bottom: 18 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const valid = series.filter(s => s.curve && s.curve.length >= 2);
    if (valid.length === 0) {
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Select two roasts with curve data to compare', width / 2, height / 2);
        return;
    }

    // Shared scales across all series so curves are directly comparable.
    const totalMs = Math.max(...valid.map(s => s.curve[s.curve.length - 1].t)) || 1;
    const maxRms = Math.max(0.1, ...valid.flatMap(s => s.curve.map(p => p.rms)));

    const xOf = t => pad.left + (t / totalMs) * plotW;
    const yOf = rms => pad.top + plotH - (rms / maxRms) * plotH;

    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    valid.forEach(s => {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.curve.forEach((p, i) => {
            const x = xOf(p.t), y = yOf(p.rms);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // First-crack marker in the series colour (skip 2C to reduce clutter).
        if (s.firstCrackMs != null) {
            ctx.save();
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(xOf(s.firstCrackMs), pad.top);
            ctx.lineTo(xOf(s.firstCrackMs), pad.top + plotH);
            ctx.stroke();
            ctx.restore();
        }
    });

    // Legend
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    valid.forEach((s, i) => {
        const ly = pad.top + 4 + i * 16;
        ctx.fillStyle = s.color;
        ctx.fillRect(pad.left + 4, ly, 10, 10);
        ctx.fillText(s.label || `Roast ${i + 1}`, pad.left + 18, ly + 9);
    });
}

function drawMarker(ctx, x, pad, plotH, color, label, value) {
    if (value == null) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, pad.top + plotH + 14);
    ctx.restore();
}
