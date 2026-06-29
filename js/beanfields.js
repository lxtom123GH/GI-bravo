// "Customise fields" for the Add-bean form: let each person hide the optional detail fields
// they don't track (origin, process, cost, supplier, density/size), so the form shows only
// what's relevant to how THEY buy beans. Mirrors the dashboard customiser (js/customise.js)
// and reuses its pure keep/hide `decide`. Choices are per-device (localStorage), like
// `dashboardHidden` — a UI preference, not roast data, so it isn't part of the JSON backup.

import { decide } from './customise.js';

const KEY = 'beanFieldsHidden';

// The optional fields offered for hiding, matched by a data-beanfield attribute in index.html.
export const BEAN_FIELDS = [
    { key: 'country', label: 'Country of origin' },
    { key: 'region', label: 'Region' },
    { key: 'farm', label: 'Farm / producer' },
    { key: 'process', label: 'Process' },
    { key: 'cost', label: 'Cost per kg' },
    { key: 'supplier', label: 'Supplier & re-order link' },
    { key: 'densitysize', label: 'Density & bean size' }
];

export { decide };

export function getHiddenFields() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch { return new Set(); }
}

export function saveHiddenFields(set) {
    localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function applyField(key, hidden) {
    document.querySelectorAll(`[data-beanfield="${key}"]`).forEach(el => {
        el.style.display = hidden ? 'none' : '';
    });
}

export function applyAllFields() {
    const hidden = getHiddenFields();
    BEAN_FIELDS.forEach(f => applyField(f.key, hidden.has(f.key)));
}

function renderPanel() {
    const container = document.getElementById('beanFieldOptions');
    if (!container) return;
    const hidden = getHiddenFields();
    container.innerHTML = '';
    BEAN_FIELDS.forEach(f => {
        const row = document.createElement('label');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 0.9rem; margin: 0;';
        row.innerHTML = `<input type="checkbox" style="width: auto; margin: 0;"> Show ${f.label}`;
        const cb = row.querySelector('input');
        cb.checked = !hidden.has(f.key);
        cb.addEventListener('change', () => {
            const set = decide(getHiddenFields(), f.key, cb.checked);
            saveHiddenFields(set);
            applyField(f.key, !cb.checked);
        });
        container.appendChild(row);
    });
}

export function initBeanFields() {
    applyAllFields(); // honour saved choices even if the panel isn't rendered
    renderPanel();
    // A backup import can change the field set elsewhere; keep panel + form in sync.
    window.addEventListener('settingsImported', () => { applyAllFields(); renderPanel(); });
}
