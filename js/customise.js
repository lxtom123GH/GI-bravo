// Dashboard customise: let each person hide the controls they don't use, so the
// Active Roast screen isn't cluttered. This is ADDITIVE — hidden sections are forced
// off regardless of the Mode/tier, while shown sections still follow the tier rules.
// Choices persist per-device in localStorage.

const KEY = 'dashboardHidden';

// The optional sections offered for hiding. `sel` may match multiple elements
// (grouped rows) via a data-section attribute, or a single element by id.
const SECTIONS = [
    { key: 'calibrate', label: 'Calibrate Noise button', sel: '#calibrateBtn' },
    { key: 'dryend', label: 'Mark: Dry End button', sel: '#markDryEndBtn' },
    { key: 'temp', label: 'Temperature & probe logging', sel: '[data-section="temp"]' },
    { key: 'reference', label: 'Follow a reference roast', sel: '[data-section="reference"]' },
    { key: 'detection', label: 'Detection settings', sel: '[data-section="detection"]' },
    { key: 'logactions', label: 'Behmor Prog A–D buttons', sel: '[data-section="logactions"]' }
];

function getHidden() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch { return new Set(); }
}
function saveHidden(set) {
    localStorage.setItem(KEY, JSON.stringify([...set]));
}

function applySection(key, hidden) {
    const def = SECTIONS.find(s => s.key === key);
    if (!def) return;
    document.querySelectorAll(def.sel).forEach(el => {
        // display:none forces hidden; '' hands control back to the tier CSS.
        el.style.display = hidden ? 'none' : '';
    });
}

function applyAll() {
    const hidden = getHidden();
    SECTIONS.forEach(s => applySection(s.key, hidden.has(s.key)));
}

export function initCustomise() {
    const container = document.getElementById('customiseOptions');
    applyAll(); // apply saved choices even if the panel UI isn't present

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
            const set = getHidden();
            if (cb.checked) set.delete(s.key); else set.add(s.key);
            saveHidden(set);
            applySection(s.key, !cb.checked);
        });
        container.appendChild(row);
    });

    // Re-apply if a backup import changed things.
    window.addEventListener('settingsImported', applyAll);
}
