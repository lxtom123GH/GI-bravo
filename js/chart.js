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
