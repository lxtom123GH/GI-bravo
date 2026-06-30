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
    return (chips || []).map((c, i) => ({ id: c.id || `${brand}-${i + 1}`, name: c.name || `chip ${i + 1}`, rgb: c.rgb, brand }));
}

// Render a grade's recommended slot layout as a buyable shopping list. `withBrand` shows which brand
// each chip is from (used for the cross-brand mixed set). Only prints slots that got a chip.
function shoppingList(g, chipById, withBrand) {
    return g.slots
        .filter(s => s.chipId)
        .map(s => {
            const c = chipById.get(s.chipId);
            const tag = withBrand && c ? ` (${c.brand})` : '';
            return `      ${s.role.padEnd(13)} → ${c ? c.name : s.chipId}${tag}`;
        });
}

function flagSummary(g) {
    const miss = [];
    if (!g.quality.greyRamp) miss.push('grey ramp');
    if (!g.quality.coffeeAnchor) miss.push('a warm/coffee anchor');
    if (!g.quality.conditioned) miss.push('more colour spread (add a saturated cool chip)');
    return miss.length ? `needs: ${miss.join(', ')}` : 'all checks pass';
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
    const graded = [];          // { brand, chips, g }
    const allChips = [];        // every chip, tagged with its brand
    const chipById = new Map();

    // ── Per-brand: the "buy it all from one shop" kit ──
    for (const [brand, chipsIn] of Object.entries(brands)) {
        const chips = withIds(chipsIn, brand);
        chips.forEach(c => { allChips.push(c); chipById.set(c.id, c); });
        const g = gradeTarget(chips);
        graded.push({ brand, chips, g });

        console.log(`\n══ ${brand}  (${chips.length} chips measured) — single-brand kit ══`);
        console.log(`   overall ${tick(g.quality.overall)}  ·  ${flagSummary(g)}`);
        console.log(`   grey ramp ${g.greyRamp.ramp.length} steps / L* range ${Math.round(g.greyRamp.rangeL)} / evenness ${(g.greyRamp.evenness * 100).toFixed(0)}%  ·  conditioning ${g.conditioning.ratio.toExponential(2)} ${tick(g.conditioning.ok)}`);
        console.log(`   shopping list (${g.slots.filter(s => s.chipId).length} chips):`);
        shoppingList(g, chipById, false).forEach(l => console.log(l));
    }

    // ── If you only want ONE brand: the best single-brand choice ──
    graded.sort((a, b) => compareRankKeys(rankKey(a.g), rankKey(b.g)));
    const top = graded[0];
    console.log(`\n🏆 BEST FROM A SINGLE BRAND (one trip): ${top.brand} ${tick(top.g.quality.overall)}`);
    console.log(`   → ${top.chips.filter(c => top.g.slots.some(s => s.chipId === c.id)).map(c => c.name).join(', ')}`);

    // ── Best possible: cherry-pick the best chip per role across ALL brands ──
    const gMix = gradeTarget(allChips);
    console.log(`\n🌈 BEST MIXED SET (cherry-pick across brands) ${tick(gMix.quality.overall)}  ·  ${flagSummary(gMix)}`);
    shoppingList(gMix, chipById, true).forEach(l => console.log(l));
    const gaps = gMix.slots.filter(s => !s.chipId).map(s => s.role);
    if (gaps.length) console.log(`   (unfilled roles — nothing suitable in your samples: ${gaps.join(', ')})`);

    console.log(`\nNote: this is Phase-1 *screening* (are the chips technically good?). Phase 2 — shoot the`);
    console.log(`shortlisted cards on a fixed reference under 2–3 different lights and compare the corrected`);
    console.log(`readings — proves they actually hold up before you recommend them.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
