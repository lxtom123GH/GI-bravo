// Blend builder. Define a recipe (components + ratios), then "weigh out" turns it into
// per-component prep batches (e.g. 60% Colombia + 40% Brazil of 450 g → 270 g + 180 g),
// which flow onto Active Roast via the existing prep-batch loader. Pre-blend (roast
// together) vs post-blend (roast separately, combine after) is recorded on the recipe.

import { getPantry, getBlends, addBlend, deleteBlend, addPrepBatch, getLastGreenWeight } from './storage.js';

// A few classic starting points (see the research links in ROASTER_JOURNEY.md).
const CLASSIC_BLENDS = [
    { name: 'Everyday (Colombia/Brazil)', ratio: '60% Colombia · 40% Brazil' },
    { name: 'Bold espresso', ratio: '50% Sumatra · 30% Colombia · 20% Ethiopia' },
    { name: 'Mocha-Java (classic)', ratio: '25% Yemen/Ethiopia · 75% Indonesian' }
];

// PURE: assess whether components suit PRE-blending (roast together). Beans of differing
// density or size roast unevenly in one batch, so flag it and suggest post-blend instead.
// `beans` is the pantry list (to look up density/size by beanId).
export function preBlendWarning(componentBeanIds, beans) {
    const get = (id, key) => { const b = (beans || []).find(x => x.id === id); return b ? (b[key] || '') : ''; };
    const densities = new Set(componentBeanIds.map(id => get(id, 'density')).filter(Boolean));
    const sizes = new Set(componentBeanIds.map(id => get(id, 'size')).filter(Boolean));
    if (densities.size > 1 || sizes.size > 1) {
        return { level: 'warn', msg: '⚠️ These beans differ in density/size — they may roast unevenly together. Consider post-blend (roast each separately, then combine).' };
    }
    const allHave = componentBeanIds.length > 0 && componentBeanIds.every(id => get(id, 'density') || get(id, 'size'));
    if (allHave) return { level: 'ok', msg: '✓ Similar size & density — should co-roast evenly.' };
    return { level: 'info', msg: 'Tip: pre-blending works best with beans of similar size & density. Add those details to your beans for a compatibility check.' };
}

// PURE: split a total weight across components by percentage. Rounds to whole grams and
// puts any rounding remainder on the largest component so the parts sum to the total.
export function splitBlend(components, totalG) {
    const grams = components.map(c => ({ ...c, grams: Math.round((Number(c.pct) || 0) / 100 * totalG) }));
    const diff = totalG - grams.reduce((s, c) => s + c.grams, 0);
    if (diff !== 0 && grams.length) {
        const big = grams.reduce((a, b) => (b.pct > a.pct ? b : a));
        big.grams += diff;
    }
    return grams;
}

export function initBlends() {
    const newBtn = document.getElementById('newBlendBtn');
    if (newBtn) newBtn.addEventListener('click', openBlendModal);
    renderBlends();
    window.addEventListener('pantryUpdated', renderBlends);
    window.addEventListener('blendsUpdated', renderBlends);
    window.addEventListener('settingsImported', renderBlends);
}

function pctSum(components) {
    return components.reduce((s, c) => s + (Number(c.pct) || 0), 0);
}

function renderBlends() {
    const wrap = document.getElementById('blendList');
    if (!wrap) return;
    const blends = getBlends();
    wrap.innerHTML = '';
    if (blends.length === 0) {
        wrap.innerHTML = `<small style="color: var(--text-muted);">No blends yet. Classic starting points: ${CLASSIC_BLENDS.map(b => `<em>${b.name}</em> (${b.ratio})`).join(' · ')}.</small>`;
        return;
    }
    blends.forEach(blend => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'margin: 0; padding: 12px;';
        const parts = blend.components.map(c => `${c.pct}% ${c.beanName}`).join(' · ');
        card.innerHTML = `
            <div style="font-weight: bold;">${blend.name} <span style="font-weight: normal; color: var(--text-muted); font-size: 0.8rem;">(${blend.type === 'post' ? 'roast separately' : 'roast together'})</span></div>
            <div style="color: var(--text-muted); font-size: 0.9rem; margin: 4px 0;">${parts}</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="blend-weigh" data-id="${blend.id}" style="font-size: 0.85rem;">Weigh out…</button>
                <button class="blend-del danger" data-id="${blend.id}" style="font-size: 0.8rem; padding: 5px 10px;">Delete</button>
            </div>
        `;
        card.querySelector('.blend-weigh').addEventListener('click', () => weighOutBlend(blend));
        card.querySelector('.blend-del').addEventListener('click', () => {
            if (confirm(`Delete blend "${blend.name}"?`)) { deleteBlend(blend.id); window.dispatchEvent(new Event('blendsUpdated')); }
        });
        wrap.appendChild(card);
    });
}

// Turn a blend into per-component prep batches for a chosen total weight.
function weighOutBlend(blend) {
    const def = getLastGreenWeight() || 450;
    const input = prompt(`Total batch weight for "${blend.name}" (g)?`, String(def));
    const total = parseFloat(input);
    if (!(total > 0)) return;
    const parts = splitBlend(blend.components, total);
    const tag = `${blend.name} (${blend.type === 'post' ? 'post-blend' : 'pre-blend'})`;
    parts.forEach(p => {
        addPrepBatch({ beanId: p.beanId, beanName: p.beanName, grams: p.grams, note: tag, photo: null });
    });
    window.dispatchEvent(new Event('prepUpdated'));
    const summary = parts.map(p => `${p.grams} g ${p.beanName}`).join(' + ');
    alert(`Weighed out ${blend.name}: ${summary}.\nAdded as prep batches — find them in Roast prep, then load on Active Roast.`);
}

function openBlendModal() {
    const pantry = getPantry();
    if (pantry.length < 2) { alert('Add at least two beans to your pantry to build a blend.'); return; }

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 460px; max-height: 90vh; overflow-y: auto;';
    bg.appendChild(modal);
    document.body.appendChild(bg);
    const close = () => document.body.removeChild(bg);

    const beanOptions = pantry.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    const componentRow = () => `
        <div class="blend-comp" style="display: flex; gap: 8px; margin-bottom: 6px;">
            <select class="comp-bean" style="flex: 1; margin: 0;">${beanOptions}</select>
            <input type="number" class="comp-pct" placeholder="%" min="0" max="100" style="width: 80px; margin: 0;">
            <button type="button" class="comp-del danger" style="font-size: 0.75rem; padding: 5px 8px;">✕</button>
        </div>`;

    modal.innerHTML = `
        <h3>Create a blend</h3>
        <label><strong>Name</strong></label>
        <input type="text" id="blendName" placeholder="e.g. House espresso">
        <label><strong>Type</strong></label>
        <select id="blendType">
            <option value="pre">Pre-blend (mix greens, roast together)</option>
            <option value="post">Post-blend (roast each separately, then combine)</option>
        </select>
        <label><strong>Components</strong> <span id="pctTotal" style="color: var(--text-muted); font-weight: normal;"></span></label>
        <div id="blendComps">${componentRow()}${componentRow()}</div>
        <button type="button" id="addCompBtn" style="font-size: 0.85rem; padding: 6px 12px;">＋ Add component</button>
        <div id="blendCompat" style="font-size: 0.85rem; margin-top: 8px;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
            <button id="blendCancel" class="danger">Cancel</button>
            <button id="blendSave" style="background-color: var(--success);">Save blend</button>
        </div>
    `;

    const compsWrap = modal.querySelector('#blendComps');
    const pctTotalEl = modal.querySelector('#pctTotal');
    const compatEl = modal.querySelector('#blendCompat');
    const typeSel = modal.querySelector('#blendType');
    const refreshTotal = () => {
        const total = [...compsWrap.querySelectorAll('.comp-pct')].reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
        pctTotalEl.textContent = `— total ${total}%${total === 100 ? ' ✓' : ''}`;
        pctTotalEl.style.color = total === 100 ? 'var(--success)' : 'var(--text-muted)';
    };
    // Pre-blend compatibility note (only meaningful when roasting together).
    const refreshCompat = () => {
        if (typeSel.value !== 'pre') { compatEl.textContent = ''; return; }
        const ids = [...compsWrap.querySelectorAll('.comp-bean')].map(s => s.value);
        const w = preBlendWarning(ids, pantry);
        compatEl.textContent = w.msg;
        compatEl.style.color = w.level === 'warn' ? 'var(--danger, #ef4444)' : (w.level === 'ok' ? 'var(--success)' : 'var(--text-muted)');
    };
    const wireRow = (row) => {
        row.querySelector('.comp-del').addEventListener('click', () => {
            if (compsWrap.querySelectorAll('.blend-comp').length > 1) { row.remove(); refreshTotal(); refreshCompat(); }
        });
        row.querySelector('.comp-pct').addEventListener('input', refreshTotal);
        row.querySelector('.comp-bean').addEventListener('change', refreshCompat);
    };
    compsWrap.querySelectorAll('.blend-comp').forEach(wireRow);
    typeSel.addEventListener('change', refreshCompat);
    refreshTotal();
    refreshCompat();

    modal.querySelector('#addCompBtn').addEventListener('click', () => {
        const tmp = document.createElement('div');
        tmp.innerHTML = componentRow();
        const row = tmp.firstElementChild;
        compsWrap.appendChild(row);
        wireRow(row);
        refreshCompat();
    });
    modal.querySelector('#blendCancel').addEventListener('click', close);

    modal.querySelector('#blendSave').addEventListener('click', () => {
        const name = modal.querySelector('#blendName').value.trim();
        const type = modal.querySelector('#blendType').value;
        const components = [...compsWrap.querySelectorAll('.blend-comp')].map(row => {
            const beanId = row.querySelector('.comp-bean').value;
            const bean = pantry.find(b => b.id === beanId);
            return { beanId, beanName: bean ? bean.name : 'Bean', pct: parseFloat(row.querySelector('.comp-pct').value) || 0 };
        }).filter(c => c.pct > 0);
        if (!name) { alert('Name the blend.'); return; }
        if (components.length < 2) { alert('A blend needs at least two components with a percentage.'); return; }
        const total = pctSum(components);
        if (Math.abs(total - 100) > 0.5) { alert(`Percentages add up to ${total}% — they should total 100%.`); return; }
        addBlend({ name, type, components });
        close();
        window.dispatchEvent(new Event('blendsUpdated'));
    });
}
