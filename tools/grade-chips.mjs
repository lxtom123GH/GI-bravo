// tools/grade-chips.mjs — Phase-1 colour-target chip screening.
//
// Feeds measured paint-chip colours into the shipped grader (js/colourtarget.js) and prints, per
// brand: which chips to KEEP, the quality flags (grey ramp / coffee anchor / matrix conditioning),
// and the A4 slot layout. Use it to turn a pile of Dulux/Taubmans/British-Paints samples into a
// short "get these ones" recommendation for other people.
//
// ── How to get the input ──────────────────────────────────────────────────────
// 1. Photograph each brand's chips laid out FLAT in GOOD EVEN DAYLIGHT (no glare, no shadow). You are
//    NOT limited to an A4 card here — that only matters for the final card you shoot with the beans.
//    Shoot each batch a couple of times with the chips repositioned so lighting unevenness averages out.
// 2. Read each chip's sRGB (0–255). Either: (a) share the photos and let Claude sample them, or
//    (b) use any colour-picker (Preview/Photoshop/online) on each chip's centre.
// 3. Put them in a JSON file (see tools/chip-trials.example.json) and run:
//        node tools/grade-chips.mjs tools/chip-trials.json
//
// Input shape:  { "brands": { "Dulux": [ { "name": "Klavier", "rgb": [200,199,197] }, ... ], ... } }
// (an `id` is auto-assigned if you omit it; `name` is the chip's paint name/code — keep it so the
//  recommendation is something others can actually buy.)

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeTarget } from '../js/colourtarget.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function normaliseBrands(data) {
    // Accept { brands: { Name: [chips] } } OR a flat array [{ brand, name, rgb }].
    if (data && data.brands && typeof data.brands === 'object') return data.brands;
    if (Array.isArray(data)) {
        const by = {};
        for (const c of data) (by[c.brand || 'Unbranded'] ||= []).push(c);
        return by;
    }
    throw new Error('Input must be { "brands": { ... } } or a flat array of { brand, name, rgb }.');
}

function withIds(chips, brand) {
    return (chips || []).map((c, i) => ({ id: c.id || `${brand}-${i + 1}`, name: c.name || `chip ${i + 1}`, rgb: c.rgb }));
}

// Lexicographic ranking key: count of passing quality flags, then the (continuous) conditioning
// ratio — the thing that most determines a usable target — then grey-ramp evenness, then range.
// A weighted sum mis-scales because conditioning lives at ~1e-3..1e-1 while evenness is 0..1.
function rankKey(g) {
    const flags = [g.quality.enough, g.quality.greyRamp, g.quality.coffeeAnchor, g.quality.conditioned].filter(Boolean).length;
    return [flags, g.conditioning.ratio || 0, g.greyRamp.evenness || 0, g.greyRamp.rangeL || 0];
}

function compareRankKeys(a, b) {
    for (let i = 0; i < a.length; i++) if (b[i] !== a[i]) return b[i] - a[i];
    return 0;
}

const tick = (b) => (b ? '✓' : '✗');

async function main() {
    const inputPath = process.argv[2] || resolve(__dirname, 'chip-trials.json');
    let raw;
    try {
        raw = JSON.parse(await readFile(inputPath, 'utf8'));
    } catch (e) {
        console.error(`Could not read ${inputPath}\n  ${e.message}\n  (Copy tools/chip-trials.example.json to tools/chip-trials.json and fill in your measurements.)`);
        process.exit(1);
    }

    const brands = normaliseBrands(raw);
    const ranked = [];

    for (const [brand, chipsIn] of Object.entries(brands)) {
        const chips = withIds(chipsIn, brand);
        const g = gradeTarget(chips);
        ranked.push({ brand, g });

        const keep = g.chips.filter(c => c.keep);
        console.log(`\n══ ${brand}  (${chips.length} chips measured) ══`);
        console.log(`   quality: ramp ${tick(g.quality.greyRamp)}  coffee-anchor ${tick(g.quality.coffeeAnchor)}  conditioned ${tick(g.quality.conditioned)}  → overall ${tick(g.quality.overall)}`);
        console.log(`   grey ramp: ${g.greyRamp.ramp.length} steps, L* range ${Math.round(g.greyRamp.rangeL)}, evenness ${(g.greyRamp.evenness * 100).toFixed(0)}%`);
        console.log(`   matrix conditioning: ${(g.conditioning.ratio).toExponential(2)} (needs ≥ 5e-3) ${tick(g.conditioning.ok)}`);
        console.log(`   KEEP (${keep.length}):`);
        for (const c of keep) console.log(`     • ${c.name}  [${c.kind}, L*${c.L} hue ${c.hue}°] — ${c.reason}`);
        const drop = g.chips.filter(c => !c.keep);
        if (drop.length) console.log(`   drop (${drop.length}): ${drop.map(c => c.name).join(', ')}`);
    }

    ranked.sort((a, b) => compareRankKeys(rankKey(a.g), rankKey(b.g)));
    console.log(`\n══ Cross-brand ranking (best target first) ══`);
    ranked.forEach((r, i) => {
        const keepNames = r.g.chips.filter(c => c.keep).map(c => c.name).join(', ');
        console.log(`   ${i + 1}. ${r.brand} — overall ${tick(r.g.quality.overall)} — recommend: ${keepNames}`);
    });
    console.log(`\nNote: this is the Phase-1 *screening* (are the chips technically good?). Phase 2 — shoot the`);
    console.log(`shortlisted cards on a fixed reference under 2–3 different lights and compare the corrected`);
    console.log(`readings — proves they actually hold up before you recommend them.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
