// Roaster profiles UI. Frictionless by default: single-roaster mode shows no picker,
// just your machine. "I use more than one roaster" opts into a picker + per-machine tagging
// (e.g. Mum's Behmor, my KKTO, Mark's KKTO v2, Stuart's Behmor). Each roast is tagged with
// the active roaster (see audio.js saveFinalRoast). Dispatches 'roasterChanged' so the
// dashboard re-applies the right control panel.

import {
    getRoasters, addRoaster, deleteRoaster, getRoasterMode, saveRoasterMode,
    getActiveRoasterId, saveActiveRoasterId, getActiveRoaster
} from './storage.js';
import { roasterCapacity } from './planner.js';
import { BEHMOR_MODELS } from './roaster-panel.js';

const MODEL_LABELS = { behmor: 'Behmor 2000AB Plus', kkto: 'KKTO' };

function announce() { window.dispatchEvent(new Event('roasterChanged')); }

export function initRoasters() {
    // Ensure an active roaster is set.
    if (!getActiveRoasterId()) {
        const list = getRoasters();
        if (list[0]) saveActiveRoasterId(list[0].id);
    }
    renderRoasterControl();
    window.addEventListener('settingsImported', renderRoasterControl);
    // Re-render the picker when roasters change (incl. cloud-sync writes).
    window.addEventListener('roasterChanged', renderRoasterControl);
}

// Render the compact roaster control in the Roast Setup card.
function renderRoasterControl() {
    const mount = document.getElementById('roasterControl');
    if (!mount) return;
    const mode = getRoasterMode();
    const roasters = getRoasters();
    const active = getActiveRoaster();
    mount.innerHTML = '';

    if (mode === 'multi' && roasters.length > 1) {
        const sel = document.createElement('select');
        sel.id = 'roasterSelect';
        sel.innerHTML = roasters.map(r =>
            `<option value="${r.id}" ${r.id === active.id ? 'selected' : ''}>${r.name} · ${MODEL_LABELS[r.model] || r.model}</option>`
        ).join('');
        sel.addEventListener('change', () => { saveActiveRoasterId(sel.value); announce(); });
        mount.appendChild(sel);
    } else {
        // Single-roaster: just the name, no picker.
        const line = document.createElement('div');
        line.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 0;';
        line.innerHTML = `<strong>${active.name}</strong> <span style="color: var(--text-muted); font-size: 0.85rem;">${MODEL_LABELS[active.model] || active.model}</span>`;
        mount.appendChild(line);
    }

    const manage = document.createElement('button');
    manage.type = 'button';
    manage.textContent = '⚙ Manage roasters';
    manage.style.cssText = 'font-size: 0.8rem; padding: 5px 10px; margin-top: 6px;';
    manage.setAttribute('data-hint', 'Add your roaster(s) and switch between single- and multi-roaster mode.');
    manage.addEventListener('click', openRoasterModal);
    mount.appendChild(manage);
}

function openRoasterModal() {
    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 440px; max-height: 90vh; overflow-y: auto;';
    bg.appendChild(modal);
    document.body.appendChild(bg);
    const close = () => document.body.removeChild(bg);

    const draw = () => {
        const mode = getRoasterMode();
        const roasters = getRoasters();
        const activeId = (getActiveRoaster() || {}).id;
        modal.innerHTML = `
            <h3>Roasters</h3>
            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <input type="checkbox" id="multiToggle" ${mode === 'multi' ? 'checked' : ''} style="width: auto; margin: 0;">
                I use more than one roaster
            </label>
            <div id="roasterRows" style="display: flex; flex-direction: column; gap: 8px;"></div>
            <div style="border-top: 1px solid var(--border-color); margin-top: 14px; padding-top: 12px;">
                <label><strong>Add a roaster</strong></label>
                <input type="text" id="newRoasterName" placeholder="Name (e.g. Mark's KKTO)">
                <select id="newRoasterModel">
                    <option value="behmor">Behmor 2000AB Plus</option>
                    <option value="kkto">KKTO</option>
                </select>
                <select id="newBehmorModel" title="Which Behmor model?">
                    ${BEHMOR_MODELS.map(m => `<option value="${m}">Behmor ${m}</option>`).join('')}
                </select>
                <label style="font-size: 0.85rem; color: var(--text-muted);">Drum capacity (g) — used by the batch planner</label>
                <div style="display: flex; gap: 8px;">
                    <input type="number" id="newRoasterMin" placeholder="Min g" style="width: 50%;">
                    <input type="number" id="newRoasterMax" placeholder="Max g" style="width: 50%;">
                </div>
                <button id="addRoasterBtn" type="button">Add roaster</button>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 15px;">
                <button id="roasterDone" style="background-color: var(--success);">Done</button>
            </div>
        `;
        const rows = modal.querySelector('#roasterRows');
        roasters.forEach(r => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
            const isActive = r.id === activeId;
            row.innerHTML = `
                <button class="pick-roaster ${isActive ? 'active' : ''}" data-id="${r.id}" style="flex: 1; text-align: left; font-size: 0.9rem;">
                    ${isActive ? '✓ ' : ''}${r.name} · ${MODEL_LABELS[r.model] || r.model}
                </button>
                <button class="del-roaster danger" data-id="${r.id}" style="font-size: 0.75rem; padding: 5px 8px;" ${roasters.length <= 1 ? 'disabled' : ''}>Delete</button>
            `;
            row.querySelector('.pick-roaster').addEventListener('click', () => { saveActiveRoasterId(r.id); announce(); draw(); });
            row.querySelector('.del-roaster').addEventListener('click', () => {
                if (roasters.length <= 1) return;
                if (confirm(`Delete roaster "${r.name}"?`)) { deleteRoaster(r.id); announce(); draw(); }
            });
            rows.appendChild(row);
        });

        // Prefill the capacity fields from the model's default, and update on model change.
        const modelSel = modal.querySelector('#newRoasterModel');
        const behmorSel = modal.querySelector('#newBehmorModel');
        const minIn = modal.querySelector('#newRoasterMin');
        const maxIn = modal.querySelector('#newRoasterMax');
        const fillCap = () => {
            const c = roasterCapacity(modelSel.value); minIn.placeholder = `Min ${c.min}`; maxIn.placeholder = `Max ${c.max}`;
            if (behmorSel) behmorSel.style.display = modelSel.value === 'behmor' ? 'block' : 'none';
        };
        fillCap();
        modelSel.addEventListener('change', fillCap);

        modal.querySelector('#multiToggle').addEventListener('change', (e) => {
            saveRoasterMode(e.target.checked ? 'multi' : 'single');
            announce();
        });
        modal.querySelector('#addRoasterBtn').addEventListener('click', () => {
            const name = modal.querySelector('#newRoasterName').value.trim();
            const model = modelSel.value;
            if (!name) { alert('Give the roaster a name.'); return; }
            const def = roasterCapacity(model);
            const minG = parseFloat(minIn.value) || def.min;
            const maxG = parseFloat(maxIn.value) || def.max;
            const extra = model === 'behmor' && behmorSel ? { behmorModel: behmorSel.value } : {};
            const r = addRoaster({ name, model, minG, maxG, ...extra });
            // Adding a second roaster implies multi-roaster use.
            if (getRoasters().length > 1) saveRoasterMode('multi');
            saveActiveRoasterId(r.id);
            announce();
            draw();
        });
        modal.querySelector('#roasterDone').addEventListener('click', () => { renderRoasterControl(); close(); });
    };
    draw();
}
