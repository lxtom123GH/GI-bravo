// Machine-faithful Behmor control panel. The Behmor manual is famously confusing because
// the SAME buttons do different things before vs during a roast. This panel makes that
// explicit: a SETUP guide (what each button does before Start) and a LIVE mode (what they
// do during the roast) that logs your presses onto the roast timeline.
//
// Button behaviour grounded in the Behmor 2000AB Plus manual / Behmor docs:
//   Setup:  Weight → Profile (P1 hottest … P5 coolest) → Start.
//   Live:   A = exhaust-temp readout, B = wall-temp readout (info only),
//           C = add time (Rosetta), D = drum speed, P1–P5 = change heat, Cool = drop.
//   Safety: at ~75% it beeps — press Start to continue or it goes to Cool.

import { getActiveRoaster, updateRoaster } from './storage.js';

// PURE, testable description of each control in both phases.
export const BEHMOR_BUTTONS = [
    { id: 'weight', label: 'Weight', setup: 'Pick your batch size first (100 / 200 / 400 g) — it sets the program timing.', live: '—' },
    { id: 'profile', label: 'P1–P5 (heat)', setup: 'Pick a heat profile before Start. P1 = hottest, P5 = coolest.', live: 'Change the heat mid-roast — drop to a lower setting (e.g. P3) after first crack.' },
    { id: 'start', label: 'Start', setup: 'Begins the roast once Weight + Profile are set.', live: 'Press again at the ~75% safety beep to keep roasting (or it goes to Cool).' },
    { id: 'A', label: 'A', setup: '(no effect before the roast)', live: 'Reads the exhaust-channel temperature (info only — not bean temp).' },
    { id: 'B', label: 'B', setup: '(no effect before the roast)', live: 'Reads the chamber-wall temperature (info only — not bean temp).' },
    { id: 'C', label: 'C', setup: '(no effect before the roast)', live: 'Adds time (resets to the “Rosetta” times) to extend the roast.' },
    { id: 'D', label: 'D', setup: '(no effect before the roast)', live: 'Changes the drum speed.' },
    { id: 'cool', label: 'Cool', setup: '—', live: 'Ends the roast and runs the cooling cycle (the “drop”).' }
];

export function buttonHelp(id, phase) {
    const b = BEHMOR_BUTTONS.find(x => x.id === id);
    return b ? (b[phase] || '') : '';
}

// Behmor models differ a little (verified vs Behmor docs / Sweet Maria's): the 1600 Plus has
// NO A/B temperature readouts (added in the 2000AB) and drum 8/16 rpm; the 2000AB blinks (no
// beep) at the 75% safety check; the 2000AB Plus adds the audible beep. So the panel is
// model-aware rather than assuming one layout.
export const BEHMOR_MODELS = ['2000AB Plus', '2000AB', '1600 Plus', 'Other / not sure'];

const VARIANT_OVERRIDES = {
    '1600 Plus': {
        A: { live: '(no temperature readout on the 1600 — that was added on the 2000AB)' },
        B: { live: '(no temperature readout on the 1600 — that was added on the 2000AB)' },
        D: { live: 'Changes the drum speed (8 / 16 rpm on the 1600).' }
    },
    '2000AB': { D: { live: 'Changes the drum speed (16 / 32 rpm).' } },
    '2000AB Plus': { D: { live: 'Changes the drum speed (16 / 32 rpm).' } }
};
const SAFETY = {
    '2000AB Plus': '⚠️ Around 75% in, the Behmor gives an audible beep + blinks — press Start to keep roasting, or it runs the Cool cycle.',
    '2000AB': '⚠️ Around 75% in, the lights blink for 30 s (no beep) — press Start to keep roasting, or it runs the Cool cycle.',
    '1600 Plus': '⚠️ Around 75% in, the lights blink for 30 s (no beep) — press Start to keep roasting, or it runs the Cool cycle.'
};

// PURE: the button reference + safety note for a given Behmor model.
export function behmorPanel(variant) {
    const ov = VARIANT_OVERRIDES[variant] || {};
    const buttons = BEHMOR_BUTTONS.map(b => ({ ...b, ...(ov[b.id] || {}) }));
    const safety = SAFETY[variant]
        || '⚠️ Most Behmors warn around 75% in (a beep and/or blinking) — press Start to continue, or it cools. Check your model’s manual for the exact behaviour.';
    return { buttons, safety, uncertain: !SAFETY[variant] };
}

// The Behmor sub-model is stored on the roaster PROFILE (so each machine — Mum's, Stuart's —
// remembers its own), with the old global localStorage value as a fallback for existing setups.
const MODEL_KEY = 'behmorModel';
export function getBehmorModel() {
    const r = getActiveRoaster();
    if (r && BEHMOR_MODELS.includes(r.behmorModel)) return r.behmorModel;
    const m = localStorage.getItem(MODEL_KEY);
    return BEHMOR_MODELS.includes(m) ? m : '2000AB Plus';
}
function saveBehmorModel(m) {
    const r = getActiveRoaster();
    if (r && r.id) updateRoaster(r.id, { behmorModel: m });
    localStorage.setItem(MODEL_KEY, m); // keep a fallback default for new/unsaved roasters
}

// Live quick-log controls (the during-roast actions worth recording on the timeline).
const LIVE_ACTIONS = [
    { id: 'P1', label: 'P1', log: 'Heat → P1 (hottest)' },
    { id: 'P2', label: 'P2', log: 'Heat → P2' },
    { id: 'P3', label: 'P3', log: 'Heat → P3' },
    { id: 'P4', label: 'P4', log: 'Heat → P4' },
    { id: 'P5', label: 'P5', log: 'Heat → P5 (coolest)' },
    { id: 'C', label: '+ Time (C)', log: 'Added time (C)' },
    { id: 'D', label: 'Drum (D)', log: 'Changed drum speed (D)' },
    { id: 'cool', label: 'Cool / drop', log: 'Cool cycle — dropped (Cool)' }
];

let mode = 'setup';

export function initRoasterPanel() {
    const mount = document.getElementById('roasterPanel');
    if (!mount) return;
    const render = () => renderPanel(mount);
    render();
    window.addEventListener('roasterChanged', render);
    window.addEventListener('roastStarted', () => { mode = 'live'; render(); });
    window.addEventListener('roastStopped', () => { mode = 'setup'; render(); });
}

function renderPanel(mount) {
    const roaster = getActiveRoaster() || { model: 'behmor' };
    if (roaster.model === 'kkto') { renderKktoPanel(mount); return; }
    if (roaster.model !== 'behmor') {
        mount.innerHTML = `<details><summary style="cursor:pointer;color:var(--text-muted);">🎛️ Roaster control panel</summary>
            <p style="color:var(--text-muted);font-size:0.9rem;padding-top:8px;">Guided panels exist for the Behmor and KKTO so far. For ${roaster.model.toUpperCase()}, use the controls above and Manual: Mark for cracks.</p></details>`;
        return;
    }
    renderBehmorPanel(mount);
}

function renderBehmorPanel(mount) {
    const variant = getBehmorModel();
    const { buttons, safety, uncertain } = behmorPanel(variant);
    const modelOptions = BEHMOR_MODELS.map(m => `<option value="${m}" ${m === variant ? 'selected' : ''}>Behmor ${m}</option>`).join('');

    const refRows = buttons.map(b => `
        <tr>
            <td style="padding:4px 8px;font-weight:bold;white-space:nowrap;">${b.label}</td>
            <td style="padding:4px 8px;color:${mode === 'setup' ? 'var(--text-main)' : 'var(--text-muted)'};">${b.setup}</td>
            <td style="padding:4px 8px;color:${mode === 'live' ? 'var(--text-main)' : 'var(--text-muted)'};">${b.live}</td>
        </tr>`).join('');

    const liveControls = mode === 'live' ? `
        <div style="margin-top:10px;">
            <strong>Log a button press (live):</strong>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                ${LIVE_ACTIONS.map(a => `<button class="rp-live" data-log="${a.log}" style="font-size:0.8rem;padding:6px 10px;">${a.label}</button>`).join('')}
            </div>
            <small style="color:var(--text-muted);">Each press is timestamped onto the roast log.</small>
        </div>` : '';

    const setupGuide = mode === 'setup' ? `
        <p style="margin:6px 0;"><strong>Setup sequence:</strong> 1) <em>Weight</em> → 2) <em>Profile</em> (P1 hottest … P5 coolest) → 3) <em>Start</em>.</p>` : `
        <p style="margin:6px 0;color:var(--success);"><strong>● Live roast</strong> — buttons now do their <em>during-roast</em> jobs (right column).</p>`;

    mount.innerHTML = `
        <div class="card" style="margin:0;">
            <h3>🎛️ Behmor control panel <span style="font-weight:normal;font-size:0.8rem;color:var(--text-muted);">— ${mode === 'live' ? 'live' : 'setup'} guide</span></h3>
            <p style="color:var(--text-muted);font-size:0.85rem;">The same Behmor buttons do different things before vs during a roast. This shows both, and (during a roast) logs your presses.</p>
            <label style="font-size:0.85rem;">Your Behmor model
                <select id="rpModel" style="width:auto;margin:0 0 8px;">${modelOptions}</select>
            </label>
            ${uncertain ? '<p style="color:var(--text-muted);font-size:0.8rem;">Model functions vary a little — please double-check against your own manual.</p>' : ''}
            ${setupGuide}
            <div style="overflow-x:auto;">
            <table style="border-collapse:collapse;font-size:0.85rem;width:100%;">
                <thead><tr style="text-align:left;color:var(--text-muted);">
                    <th style="padding:4px 8px;">Button</th><th style="padding:4px 8px;">Before roast</th><th style="padding:4px 8px;">During roast</th>
                </tr></thead>
                <tbody>${refRows}</tbody>
            </table>
            </div>
            <p style="color:var(--text-muted);font-size:0.8rem;margin-top:8px;">${safety}</p>
            ${liveControls}
        </div>`;

    const modelSel = mount.querySelector('#rpModel');
    if (modelSel) modelSel.addEventListener('change', () => { saveBehmorModel(modelSel.value); renderPanel(mount); });

    bindLive(mount);
}

// Shared: live-mode buttons log a timestamped action onto the roast.
function bindLive(mount) {
    mount.querySelectorAll('.rp-live').forEach(btn => {
        btn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('logRoasterAction', { detail: btn.dataset.log }));
        });
    });
}

// --- KKTO (Koffee Kosmo Turbo Oven): a DIY drum/agitator roaster. No fixed buttons/programs
// like the Behmor — you control HEAT and AIRFLOW (the turbo oven) by hand over the roast, with
// the agitator keeping beans moving. Builds vary, so this is a control + phase guide, not a
// button decode. Capacity ~300–700 g (sweet spot 500–650).

export const KKTO_CONTROLS = [
    { label: 'Heat', does: 'The turbo oven element drives the temperature / Rate of Rise. Start high to charge, then ease it back into and after first crack to control development.' },
    { label: 'Airflow (fan)', does: 'Convection + chaff. More airflow = more even convective heat and clears chaff; too much can strip heat and stall the rise. Adjust to steer the curve.' },
    { label: 'Agitator / drum', does: 'Keeps the beans tumbling for an even roast — run it throughout.' }
];

export const KKTO_PHASES = [
    'Charge — preheat, then load (sweet spot 500–650 g)',
    'Drying — steady heat until the beans turn yellow',
    'Maillard — browning; watch the Rate of Rise',
    'First crack — ease the heat back to control development',
    'Development — hold to taste',
    'Drop — cut heat, maximise airflow / tip out to cool'
];

const KKTO_LIVE = [
    { label: 'Heat ↑', log: 'Heat increased' },
    { label: 'Heat ↓', log: 'Heat reduced' },
    { label: 'Airflow ↑', log: 'Airflow increased' },
    { label: 'Airflow ↓', log: 'Airflow reduced' },
    { label: 'Drop', log: 'Dropped — cooling' }
];

function renderKktoPanel(mount) {
    const refRows = KKTO_CONTROLS.map(c => `
        <tr>
            <td style="padding:4px 8px;font-weight:bold;white-space:nowrap;">${c.label}</td>
            <td style="padding:4px 8px;">${c.does}</td>
        </tr>`).join('');

    const phaseList = KKTO_PHASES.map(p => `<li>${p}</li>`).join('');

    const liveControls = mode === 'live' ? `
        <div style="margin-top:10px;">
            <strong>Log a change (live):</strong>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                ${KKTO_LIVE.map(a => `<button class="rp-live" data-log="${a.log}" style="font-size:0.8rem;padding:6px 10px;">${a.label}</button>`).join('')}
            </div>
            <small style="color:var(--text-muted);">Each is timestamped onto the roast log.</small>
        </div>` : `
        <p style="margin:6px 0;"><strong>Roast flow:</strong></p><ol style="margin-top:0;">${phaseList}</ol>`;

    mount.innerHTML = `
        <div class="card" style="margin:0;">
            <h3>🎛️ KKTO control guide <span style="font-weight:normal;font-size:0.8rem;color:var(--text-muted);">— ${mode === 'live' ? 'live' : 'setup'}</span></h3>
            <p style="color:var(--text-muted);font-size:0.85rem;">The KKTO is a manual DIY roaster — you steer the roast with <strong>heat</strong> and <strong>airflow</strong> (turbo oven), with the agitator keeping beans moving. There are no fixed programs; builds vary, so set your drum capacity under ⚙ Manage roasters.</p>
            ${mode === 'live' ? '<p style="margin:6px 0;color:var(--success);"><strong>● Live roast</strong> — log your heat/airflow changes below.</p>' : ''}
            <div style="overflow-x:auto;">
            <table style="border-collapse:collapse;font-size:0.85rem;width:100%;">
                <thead><tr style="text-align:left;color:var(--text-muted);"><th style="padding:4px 8px;">Control</th><th style="padding:4px 8px;">What it does</th></tr></thead>
                <tbody>${refRows}</tbody>
            </table>
            </div>
            <p style="color:var(--text-muted);font-size:0.8rem;margin-top:8px;">Capacity ~300–700 g (sweet spot 500–650 g). Heat/airflow controls depend on your build.</p>
            ${liveControls}
        </div>`;

    bindLive(mount);
}
