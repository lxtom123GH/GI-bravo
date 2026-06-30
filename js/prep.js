// Roast prep — "weigh-out" batches. The user portions green beans into containers,
// snaps a photo to remember which is which, then loads a batch (bean + weight + photo)
// onto the Active Roast screen in one tap. Photos are downscaled and stored inline.

import { getPantry, getPrepBatches, addPrepBatch, deletePrepBatch } from './storage.js';
import { escapeHtml } from './escape.js';
import { fileToScaledDataURL } from './photos.js';

export function initPrep() {
    const newBtn = document.getElementById('newPrepBatchBtn');
    if (newBtn) newBtn.addEventListener('click', openPrepModal);

    renderPrepList();
    renderPrepDashboard();

    // Keep both views fresh when beans or prep batches change.
    window.addEventListener('pantryUpdated', () => { renderPrepList(); renderPrepDashboard(); });
    window.addEventListener('prepUpdated', () => { renderPrepList(); renderPrepDashboard(); });
    window.addEventListener('settingsImported', () => { renderPrepList(); renderPrepDashboard(); });

    // Load a prepped batch onto the dashboard.
    const sel = document.getElementById('prepBatchSelect');
    if (sel) sel.addEventListener('change', () => applyPrepBatch(sel.value));
}

const fmtBean = (b) => `${escapeHtml(b.name)}${b.process ? ` (${escapeHtml(b.process)})` : ''}`;

// --- Pantry view: cards of prepped batches -------------------------------------
function renderPrepList() {
    const wrap = document.getElementById('prepList');
    if (!wrap) return;
    const batches = getPrepBatches().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    wrap.innerHTML = '';
    if (batches.length === 0) {
        wrap.innerHTML = '<small style="color: var(--text-muted);">No prepped batches yet. Weigh one out before roasting.</small>';
        return;
    }
    batches.forEach(batch => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'margin: 0; width: 160px; padding: 10px; text-align: center;';
        const img = batch.photo
            ? `<img src="${batch.photo}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px;">`
            : '<div style="height: 110px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);">No photo</div>';
        card.innerHTML = `
            ${img}
            <div style="font-weight: bold; margin-top: 6px;">${batch.beanName ? escapeHtml(batch.beanName) : 'Bean'}</div>
            <div style="color: var(--text-muted); font-size: 0.85rem;">${batch.grams} g${batch.note ? ` · ${escapeHtml(batch.note)}` : ''}</div>
            <button class="prep-del danger" data-id="${batch.id}" style="font-size: 0.75rem; padding: 4px 10px; margin-top: 8px;">Delete</button>
        `;
        card.querySelector('.prep-del').addEventListener('click', () => {
            if (confirm(`Delete the prepped batch of ${batch.beanName} (${batch.grams} g)?`)) {
                deletePrepBatch(batch.id);
                window.dispatchEvent(new Event('prepUpdated'));
            }
        });
        wrap.appendChild(card);
    });
}

// --- Dashboard view: a selector that fills bean + green weight ------------------
function renderPrepDashboard() {
    const row = document.getElementById('prepBatchRow');
    const sel = document.getElementById('prepBatchSelect');
    if (!row || !sel) return;
    const batches = getPrepBatches().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    row.style.display = batches.length ? 'block' : 'none';
    const keep = sel.value;
    sel.innerHTML = '<option value="">None</option>' +
        batches.map(b => `<option value="${b.id}">${escapeHtml(b.beanName)} — ${b.grams} g${b.note ? ` (${escapeHtml(b.note)})` : ''}</option>`).join('');
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}

function applyPrepBatch(id) {
    const thumb = document.getElementById('prepBatchThumb');
    const batch = getPrepBatches().find(b => b.id === id);
    if (!batch) { if (thumb) thumb.style.display = 'none'; return; }

    const beanSelect = document.getElementById('beanSelect');
    const greenWeightInput = document.getElementById('greenWeightInput');
    if (beanSelect && batch.beanId) {
        beanSelect.value = batch.beanId;
        beanSelect.dispatchEvent(new Event('change'));
    }
    if (greenWeightInput && batch.grams) greenWeightInput.value = batch.grams;
    if (thumb) {
        if (batch.photo) { thumb.src = batch.photo; thumb.style.display = 'block'; }
        else thumb.style.display = 'none';
    }
}

// --- Create-batch modal --------------------------------------------------------
function openPrepModal() {
    const pantry = getPantry();
    if (pantry.length === 0) { alert('Add beans to your pantry first.'); return; }

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3>Weigh out a batch</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Pick the bean, enter the weight you portioned out, and snap a photo of the container so you can tell it apart.</p>
        <label><strong>Bean</strong></label>
        <select id="prepBean">${pantry.map(b => `<option value="${b.id}">${fmtBean(b)}</option>`).join('')}</select>
        <label><strong>Weight (g)</strong></label>
        <input type="number" id="prepGrams" min="0" step="1" placeholder="e.g. 400">
        <label><strong>Photo of the container</strong></label>
        <input type="file" id="prepPhoto" accept="image/*" capture="environment">
        <label><strong>Note (optional)</strong></label>
        <input type="text" id="prepNote" placeholder="e.g. left jar, espresso batch">
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
            <button id="prepCancel" class="secondary">Cancel</button>
            <button id="prepSave" style="background-color: var(--success);">Save batch</button>
        </div>
    `;
    bg.appendChild(modal);
    document.body.appendChild(bg);
    const close = () => document.body.removeChild(bg);
    modal.querySelector('#prepCancel').addEventListener('click', close);

    modal.querySelector('#prepSave').addEventListener('click', async () => {
        const beanId = modal.querySelector('#prepBean').value;
        const bean = pantry.find(b => b.id === beanId);
        const grams = parseFloat(modal.querySelector('#prepGrams').value) || 0;
        const note = modal.querySelector('#prepNote').value.trim();
        const file = modal.querySelector('#prepPhoto').files[0];
        if (!bean) { alert('Pick a bean.'); return; }
        if (!(grams > 0)) { alert('Enter the weight in grams.'); return; }
        try {
            const photo = file ? await fileToScaledDataURL(file, 700, 0.6) : null;
            addPrepBatch({ beanId, beanName: bean.name, grams, note, photo });
            close();
            window.dispatchEvent(new Event('prepUpdated'));
        } catch (err) {
            alert(`Could not save batch: ${err.message}`);
        }
    });
}
