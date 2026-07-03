// Dashboard customise: let each person hide the controls they don't use, so the
// Active Roast screen isn't cluttered. This is ADDITIVE — hidden sections are forced
// off regardless of the Mode/tier, while shown sections still follow the tier rules.
// Choices persist per-device in localStorage and are shared with the swipe personaliser
// (js/swipe.js), which writes the same `dashboardHidden` set.

const KEY = 'dashboardHidden';

// The optional sections offered for hiding. `sel` may match multiple elements
// (grouped rows) via a data-section attribute, or a single element by id.
export const SECTIONS = [
    { key: 'calibrate', label: 'Calibrate Noise button', desc: 'Sample room noise before a roast to improve crack detection.', sel: '#calibrateBtn' },
    { key: 'dryend', label: 'Mark: Dry End button', desc: 'Log the “dry end” / yellowing point during a roast.', sel: '#markDryEndBtn' },
    { key: 'temp', label: 'Temperature & probe logging', desc: 'Log bean temps by hand or stream them from a Bluetooth probe.', sel: '[data-section="temp"]' },
    { key: 'reference', label: 'Follow a reference roast', desc: 'Overlay a past roast’s curve to reproduce a good batch.', sel: '[data-section="reference"]' },
    { key: 'detection', label: 'Detection settings', desc: 'Fine-tune crack-detection sensitivity and pitch.', sel: '[data-section="detection"]' },
    { key: 'scope', label: 'Live audio waveform', desc: 'The raw microphone view while listening for cracks.', sel: '[data-section="scope"]' },
    { key: 'curve', label: 'Live roast curve', desc: 'The roast’s audio-energy curve, drawn as it happens.', sel: '[data-section="curve"]' }
];

export function getHidden() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch { return new Set(); }
}
export function saveHidden(set) {
    localStorage.setItem(KEY, JSON.stringify([...set]));
}

// PURE: return a new hidden-set with `key` kept (removed) or hidden (added).
export function decide(hidden, key, keep) {
    const set = new Set(hidden);
    if (keep) set.delete(key); else set.add(key);
    return set;
}

export function applySection(key, hidden) {
    const def = SECTIONS.find(s => s.key === key);
    if (!def) return;
    document.querySelectorAll(def.sel).forEach(el => {
        // display:none forces hidden; '' hands control back to the tier CSS.
        el.style.display = hidden ? 'none' : '';
    });
}

export function applyAll() {
    const hidden = getHidden();
    SECTIONS.forEach(s => applySection(s.key, hidden.has(s.key)));
}

function renderPanel() {
    const container = document.getElementById('customiseOptions');
    if (!container) return;
    const hidden = getHidden();
    container.innerHTML = '';
    SECTIONS.forEach(s => {
        // Skip options whose target isn't on the page (e.g. roaster-specific rows).
        if (!document.querySelector(s.sel)) return;
        const id = `cust_${s.key}`;
        const row = document.createElement('label');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 0.9rem; margin: 0;';
        row.innerHTML = `<input type="checkbox" id="${id}" style="width: auto; margin: 0;"> Show ${s.label}`;
        const cb = row.querySelector('input');
        cb.checked = !hidden.has(s.key);
        cb.addEventListener('change', () => {
            const set = decide(getHidden(), s.key, cb.checked);
            saveHidden(set);
            applySection(s.key, !cb.checked);
        });
        container.appendChild(row);
    });
}

export function initCustomise() {
    applyAll(); // apply saved choices even if the panel UI isn't present
    renderPanel();
    // Keep the panel + dashboard in sync when the swipe personaliser or a backup import changes things.
    window.addEventListener('customiseChanged', () => { applyAll(); renderPanel(); });
    window.addEventListener('settingsImported', () => { applyAll(); renderPanel(); });
}
