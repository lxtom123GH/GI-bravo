// js/suggest.js — low-friction bean entry. Pure helpers (no DOM) so they're unit-testable.
//
// Three layers, all driven by the user's own data + a small seed vocabulary, no scraping:
//  1. buildSuggestions() → autocomplete lists for supplier / country / region / process / farm,
//     ordered by how often the user has used each value (their go-to places float to the top).
//  2. Cascading: bySupplier / byCountry let the UI re-order child suggestions by the chosen parent
//     (pick a supplier → the countries you buy from it first; pick a country → its usual processes).
//  3. parseBeanName() splits a structured supplier name ("Ethiopia Yirgacheffe Natural") into
//     country / region / process so pasting a name pre-fills the fields.

// Day-one seed vocabulary so autocomplete works before any history exists (history always wins).
export const SEED_COUNTRIES = [
    'Ethiopia', 'Kenya', 'Colombia', 'Brazil', 'Guatemala', 'Costa Rica', 'Honduras',
    'El Salvador', 'Nicaragua', 'Panama', 'Peru', 'Bolivia', 'Ecuador', 'Mexico', 'Jamaica',
    'Yemen', 'Rwanda', 'Burundi', 'Tanzania', 'Uganda', 'Congo', 'Democratic Republic of Congo',
    'Indonesia', 'Sumatra', 'Java', 'Sulawesi', 'Flores', 'Papua New Guinea', 'India', 'Vietnam',
    'China', 'Timor-Leste', 'Myanmar', 'Thailand', 'Philippines', 'Malawi', 'Zambia', 'Zimbabwe',
];

export const SEED_PROCESSES = [
    'Washed', 'Natural', 'Honey', 'Pulped Natural', 'Anaerobic', 'Wet-Hulled', 'Monsooned', 'Decaf',
];

function norm(s) { return String(s == null ? '' : s).trim(); }

// Order distinct values by frequency (most-used first), then alphabetically for ties.
function rankByFrequency(values) {
    const counts = new Map();
    values.map(norm).filter(Boolean).forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([v]) => v);
}

// Merge ranked history values with a seed list (history first, seed fills the rest), de-duped
// case-insensitively so "ethiopia" and "Ethiopia" don't both appear.
function mergeWithSeed(ranked, seed) {
    const out = [];
    const seen = new Set();
    [...ranked, ...seed].forEach(v => {
        const key = v.toLowerCase();
        if (!seen.has(key)) { seen.add(key); out.push(v); }
    });
    return out;
}

// Build all autocomplete + cascading suggestion structures from the user's pantry (+ optional
// roast-history bean names, which add a little more vocabulary).
export function buildSuggestions(pantry = [], history = []) {
    const beans = Array.isArray(pantry) ? pantry : [];

    const suppliers = rankByFrequency(beans.map(b => b && b.supplier));
    const countries = mergeWithSeed(rankByFrequency(beans.map(b => b && b.country)), SEED_COUNTRIES);
    const processes = mergeWithSeed(rankByFrequency(beans.map(b => b && b.process)), SEED_PROCESSES);
    const regions = rankByFrequency(beans.map(b => b && b.region));
    const farms = rankByFrequency(beans.map(b => b && b.farm));

    // Cascading: which countries each supplier is used for, and which processes/regions each country.
    const bySupplier = {};
    const byCountry = {};
    beans.forEach(b => {
        if (!b) return;
        const sup = norm(b.supplier), cty = norm(b.country), proc = norm(b.process), reg = norm(b.region);
        if (sup && cty) (bySupplier[sup] = bySupplier[sup] || []).push(cty);
        if (cty) {
            byCountry[cty] = byCountry[cty] || { processes: [], regions: [] };
            if (proc) byCountry[cty].processes.push(proc);
            if (reg) byCountry[cty].regions.push(reg);
        }
    });
    Object.keys(bySupplier).forEach(s => { bySupplier[s] = { countries: rankByFrequency(bySupplier[s]) }; });
    Object.keys(byCountry).forEach(c => {
        byCountry[c] = {
            processes: rankByFrequency(byCountry[c].processes),
            regions: rankByFrequency(byCountry[c].regions),
        };
    });

    return { suppliers, countries, processes, regions, farms, bySupplier, byCountry };
}

// Re-order a base list so the values used for `parent` come first (cascading suggestions).
// e.g. orderByContext(allCountries, suggestions.bySupplier[supplier]?.countries).
export function orderByContext(base, preferred) {
    if (!preferred || !preferred.length) return base.slice();
    const pref = preferred.map(norm).filter(Boolean);
    const prefSet = new Set(pref.map(v => v.toLowerCase()));
    const rest = base.filter(v => !prefSet.has(v.toLowerCase()));
    // Keep any preferred values that aren't already in base too (history can outrun the seed).
    const merged = [];
    const seen = new Set();
    [...pref, ...rest].forEach(v => {
        const k = v.toLowerCase();
        if (!seen.has(k)) { seen.add(k); merged.push(v); }
    });
    return merged;
}

// If exactly one value was ever used for a context, return it for a safe auto-fill (else '').
export function uniqueValue(list) {
    return Array.isArray(list) && list.length === 1 ? list[0] : '';
}

// Greedy longest-match of a known country at the START of the token list. Returns
// { country, rest } where rest is the remaining tokens, or null if no match.
function matchCountryFromStart(tokens, countries) {
    const byLen = countries.slice().sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
    for (const c of byLen) {
        const cTokens = c.split(/\s+/);
        if (cTokens.length > tokens.length) continue;
        const head = tokens.slice(0, cTokens.length).join(' ');
        if (head.toLowerCase() === c.toLowerCase()) {
            return { country: c, rest: tokens.slice(cTokens.length) };
        }
    }
    return null;
}

// Find a known process phrase anywhere in the tokens (longest first). Returns
// { process, tokens } with the matched phrase removed, or { process:'', tokens } unchanged.
function extractProcess(tokens, processes) {
    const variants = [];
    processes.forEach(p => {
        variants.push(p);
        if (p.includes('-')) variants.push(p.replace(/-/g, ' ')); // "Wet-Hulled" ↔ "Wet Hulled"
    });
    variants.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
    const lower = tokens.map(t => t.toLowerCase());
    for (const v of variants) {
        const vTokens = v.toLowerCase().split(/\s+/);
        for (let i = 0; i + vTokens.length <= lower.length; i++) {
            if (vTokens.every((vt, j) => lower[i + j] === vt)) {
                const canonical = processes.find(p => p.toLowerCase() === v.toLowerCase().replace(/ /g, '-'))
                    || processes.find(p => p.toLowerCase() === v.toLowerCase()) || v;
                return { process: canonical, tokens: tokens.slice(0, i).concat(tokens.slice(i + vTokens.length)) };
            }
        }
    }
    return { process: '', tokens };
}

// Parse a structured supplier bean name into { country, region, process }. Best-effort and
// conservative — unknown words become the region; anything unrecognised stays empty.
export function parseBeanName(name, opts = {}) {
    const countries = opts.countries || SEED_COUNTRIES;
    const processes = opts.processes || SEED_PROCESSES;
    const result = { country: '', region: '', process: '' };

    let tokens = norm(name).split(/\s+/).filter(Boolean);
    if (!tokens.length) return result;

    const proc = extractProcess(tokens, processes);
    result.process = proc.process;
    tokens = proc.tokens;

    const c = matchCountryFromStart(tokens, countries);
    if (c) { result.country = c.country; tokens = c.rest; }

    result.region = tokens.join(' ').trim();
    return result;
}
