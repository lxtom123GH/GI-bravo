// "Build your colour target" — grades a set of measured paint chips and recommends which to
// keep and how to lay them out on the printable A4 target (tools/colour-target-a4.html).
//
// The forums' verdict on DIY colour charts is "you can't tell a good chip from a bad one by eye"
// (see COLOUR_TARGET_DESIGN.md). This module measures it instead: it works in CIELAB, scores each
// chip's neutrality (for greys) and hue (for chromatics), checks the grey ramp covers light→dark
// evenly, and checks the whole set conditions the colour-correction matrix well (an all-grey set
// can't fit one). All PURE — no DOM, no storage — so it's unit-tested.
//
// A chip is { id, name?, rgb:[r,g,b] } measured (0..255 sRGB) under good daylight.

const GREY_CHROMA_MAX = 8;     // CIELAB C* below this reads as effectively neutral
const COFFEE_HUE = [25, 80];   // CIELAB hue° band where roasted coffee lives (warm orange-brown)

// ---- colour space: sRGB(0..255) -> linear -> XYZ(D65) -> CIELAB ----

function srgbToLinear(v) {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    return [
        R * 0.4124 + G * 0.3576 + B * 0.1805,
        R * 0.2126 + G * 0.7152 + B * 0.0722,
        R * 0.0193 + G * 0.1192 + B * 0.9505
    ];
}

// D65 reference white
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);

export function rgbToLab([r, g, b]) {
    const [X, Y, Z] = rgbToXyz(r, g, b);
    const fx = f(X / Xn), fy = f(Y / Yn), fz = f(Z / Zn);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function chroma([, a, bb]) {
    return Math.sqrt(a * a + bb * bb);
}

// CIELAB hue angle in degrees, 0..360.
export function hueDeg([, a, bb]) {
    const h = Math.atan2(bb, a) * 180 / Math.PI;
    return h < 0 ? h + 360 : h;
}

// Enrich each chip with lab / chroma / hue / lightness / isGrey. Pure (returns new objects).
export function classifyChips(chips) {
    return (chips || []).map(c => {
        const lab = rgbToLab(c.rgb);
        const C = chroma(lab);
        return { ...c, lab, L: lab[0], C, hue: hueDeg(lab), isGrey: C < GREY_CHROMA_MAX };
    });
}

// ---- grey ramp ----

// Pick up to n greys spanning L* as evenly as possible: always take the lightest and darkest,
// then greedily fill the largest remaining gap. Pure. Returns chosen (classified) chips + metrics.
export function pickGreyRamp(greys, n = 5) {
    const sorted = [...(greys || [])].sort((a, b) => a.L - b.L);
    if (sorted.length <= n) return rampMetrics(sorted);
    const chosen = [sorted[0], sorted[sorted.length - 1]];
    while (chosen.length < n) {
        // insert the candidate that best fills the biggest gap in the current ramp
        const inRamp = new Set(chosen);
        let best = null, bestGap = -1;
        const order = [...chosen].sort((a, b) => a.L - b.L);
        for (const cand of sorted) {
            if (inRamp.has(cand)) continue;
            // distance to nearest already-chosen point (larger = fills a bigger hole)
            let nearest = Infinity;
            for (const p of order) nearest = Math.min(nearest, Math.abs(cand.L - p.L));
            if (nearest > bestGap) { bestGap = nearest; best = cand; }
        }
        if (!best) break;
        chosen.push(best);
    }
    return rampMetrics(chosen.sort((a, b) => a.L - b.L));
}

function rampMetrics(ramp) {
    if (!ramp.length) return { ramp: [], rangeL: 0, evenness: 0, ok: false };
    const Ls = ramp.map(c => c.L);
    const rangeL = Ls[Ls.length - 1] - Ls[0];
    // evenness: 1 - (spread of gaps / mean gap), clamped 0..1; 1 = perfectly even spacing
    let evenness = 1;
    if (ramp.length >= 3) {
        const gaps = [];
        for (let i = 1; i < Ls.length; i++) gaps.push(Ls[i] - Ls[i - 1]);
        const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        const dev = gaps.reduce((s, g) => s + Math.abs(g - mean), 0) / gaps.length;
        evenness = mean > 0 ? Math.max(0, 1 - dev / mean) : 0;
    }
    // a usable ramp covers most of the L* range with at least 3 steps
    const ok = ramp.length >= 3 && rangeL >= 70;
    return { ramp, rangeL, evenness, ok };
}

// ---- chromatic spread ----

// Report on the chromatic (non-grey) chips: hue coverage, a coffee-region anchor, and a cool anchor.
export function chromaticReport(chromatics) {
    const hues = (chromatics || []).map(c => c.hue);
    const hasCoffeeAnchor = (chromatics || []).some(c => c.hue >= COFFEE_HUE[0] && c.hue <= COFFEE_HUE[1]);
    const hasCool = (chromatics || []).some(c => c.hue >= 180 && c.hue <= 300); // cyan..blue
    // hue coverage: how many of 4 quadrants (90° each) are represented
    const quad = new Set(hues.map(h => Math.floor(h / 90)));
    return { hues, hasCoffeeAnchor, hasCool, quadrants: quad.size, ok: hasCoffeeAnchor && chromatics.length >= 2 };
}

// ---- matrix conditioning ----

// Eigenvalues of a symmetric 3x3 [[a,b,c],[b,d,e],[c,e,f]], descending. Analytic (Smith 1961).
export function eig3sym(a, b, c, d, e, ff) {
    const p1 = b * b + c * c + e * e;
    if (p1 === 0) return [a, d, ff].sort((x, y) => y - x);
    const q = (a + d + ff) / 3;
    const p2 = (a - q) ** 2 + (d - q) ** 2 + (ff - q) ** 2 + 2 * p1;
    const p = Math.sqrt(p2 / 6);
    const m = [
        [(a - q) / p, b / p, c / p],
        [b / p, (d - q) / p, e / p],
        [c / p, e / p, (ff - q) / p]
    ];
    const detB =
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    let r = detB / 2;
    r = Math.max(-1, Math.min(1, r));
    const phi = Math.acos(r) / 3;
    const e1 = q + 2 * p * Math.cos(phi);
    const e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
    const e2 = 3 * q - e1 - e3;
    return [e1, e2, e3];
}

// How well the chips condition the 3x4 affine colour-correction fit. The CCM needs the chips to
// vary independently in linear R, G and B; an all-grey set varies along a single line and fits a
// degenerate matrix. Score = smallest / largest eigenvalue of the linear-RGB covariance (0..1).
export function conditioningScore(chips) {
    const pts = (chips || []).map(c => c.rgb.map(srgbToLinear));
    if (pts.length < 4) return { ratio: 0, lambda: [], ok: false };
    const n = pts.length;
    const mean = [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / n);
    let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
    for (const p of pts) {
        const dx = p[0] - mean[0], dy = p[1] - mean[1], dz = p[2] - mean[2];
        cxx += dx * dx; cyy += dy * dy; czz += dz * dz;
        cxy += dx * dy; cxz += dx * dz; cyz += dy * dz;
    }
    cxx /= n; cyy /= n; czz /= n; cxy /= n; cxz /= n; cyz /= n;
    const lambda = eig3sym(cxx, cxy, cxz, cyy, cyz, czz);
    const max = lambda[0], min = lambda[2];
    const ratio = max > 0 ? Math.max(0, min) / max : 0;
    // A degenerate (e.g. all-grey) set collapses to one axis -> ratio ~1e-16; any genuine colour
    // spread lifts the smallest axis to a few percent. 0.005 separates the two with margin.
    return { ratio, lambda, ok: ratio >= 0.005 };
}

// ---- overall grade + slot recommendation ----

// The A4 template's 12 slots, in print order, with the role each expects.
export const SLOT_ROLES = [
    'WHITE', 'TAN', 'ORANGE', 'MID_GREY',
    'LIGHT_GREY', 'COFFEE_BROWN', 'YELLOW', 'NEAR_BLACK',
    'DARK_GREY', 'DARK_BROWN', 'BLUE', 'GREEN'
];

// Assign the chosen chips to template slots by role. Greedy and forgiving — a slot with no suitable
// chip is left empty (chipId null). Returns [{ slot, role, chipId }].
export function recommendSlots(classified, greyRamp) {
    const used = new Set();
    const take = (pred, rank) => {
        const cands = classified.filter(c => !used.has(c.id) && pred(c));
        if (!cands.length) return null;
        cands.sort(rank);
        used.add(cands[0].id);
        return cands[0].id;
    };
    const warm = (c) => !c.isGrey && c.hue >= 15 && c.hue <= 95;
    const cool = (c) => !c.isGrey && c.hue >= 180 && c.hue <= 300;
    const green = (c) => !c.isGrey && c.hue > 95 && c.hue < 180;

    // greys: lightest, darkest, and three spread through the ramp by L*
    const greys = [...(greyRamp.ramp || [])].sort((a, b) => b.L - a.L);
    const byRole = {};
    if (greys.length) { byRole.WHITE = greys[0].id; used.add(greys[0].id); }
    if (greys.length > 1) { const d = greys[greys.length - 1]; byRole.NEAR_BLACK = d.id; used.add(d.id); }
    const mids = greys.filter(g => !used.has(g.id));
    if (mids[0]) { byRole.LIGHT_GREY = mids[0].id; used.add(mids[0].id); }
    if (mids[Math.floor(mids.length / 2)] && !used.has(mids[Math.floor(mids.length / 2)].id)) {
        const m = mids[Math.floor(mids.length / 2)]; byRole.MID_GREY = m.id; used.add(m.id);
    }
    const restGrey = greys.filter(g => !used.has(g.id));
    if (restGrey[0]) { byRole.DARK_GREY = restGrey[0].id; used.add(restGrey[0].id); }

    // browns/warms by lightness; chromatic anchors by hue
    byRole.TAN = take(c => warm(c) && c.L >= 50, (a, b) => b.L - a.L);
    byRole.COFFEE_BROWN = take(c => warm(c) && c.hue >= COFFEE_HUE[0] && c.hue <= COFFEE_HUE[1], (a, b) => Math.abs(a.L - 45) - Math.abs(b.L - 45));
    byRole.DARK_BROWN = take(warm, (a, b) => a.L - b.L);
    byRole.ORANGE = take(c => warm(c) && c.hue <= 55, (a, b) => b.C - a.C);
    byRole.YELLOW = take(c => warm(c) && c.hue > 55, (a, b) => b.C - a.C);
    byRole.BLUE = take(cool, (a, b) => b.C - a.C);
    byRole.GREEN = take(green, (a, b) => b.C - a.C);

    return SLOT_ROLES.map((role, i) => ({ slot: i + 1, role, chipId: byRole[role] || null }));
}

// Full grade: classify, build the grey ramp, report chromatics, check conditioning, and produce a
// recommended slot layout plus a keep/drop reason per chip.
export function gradeTarget(chips, { rampSize = 5 } = {}) {
    const classified = classifyChips(chips);
    const greys = classified.filter(c => c.isGrey);
    const chromatics = classified.filter(c => !c.isGrey);

    const greyRamp = pickGreyRamp(greys, rampSize);
    const chromatic = chromaticReport(chromatics);
    const conditioning = conditioningScore(classified);

    const slots = recommendSlots(classified, greyRamp);
    const keptIds = new Set(slots.map(s => s.chipId).filter(Boolean));

    const chipReports = classified.map(c => ({
        id: c.id, name: c.name, L: round1(c.L), C: round1(c.C), hue: round1(c.hue),
        kind: c.isGrey ? 'grey' : 'chromatic',
        keep: keptIds.has(c.id),
        reason: chipReason(c, keptIds.has(c.id), greyRamp)
    }));

    const quality = {
        enough: classified.length >= 4,
        greyRamp: greyRamp.ok,
        coffeeAnchor: chromatic.hasCoffeeAnchor,
        conditioned: conditioning.ok
    };
    quality.overall = quality.enough && quality.greyRamp && quality.coffeeAnchor && quality.conditioned;

    return { chips: chipReports, greyRamp, chromatic, conditioning, slots, quality };
}

function chipReason(c, kept, greyRamp) {
    if (c.isGrey) {
        if (!kept) return `neutral grey (L* ${round1(c.L)}) — not needed for an even ramp`;
        return `neutral grey, L* ${round1(c.L)} — part of the ramp`;
    }
    if (!kept) return `chromatic (hue ${round1(c.hue)}°) — a similar anchor is already covered`;
    if (c.hue >= COFFEE_HUE[0] && c.hue <= COFFEE_HUE[1]) return `warm/coffee-region anchor (hue ${round1(c.hue)}°) — keep`;
    return `chromatic anchor (hue ${round1(c.hue)}°) — keep`;
}

function round1(x) { return Math.round(x * 10) / 10; }
