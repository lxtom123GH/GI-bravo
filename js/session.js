// ==========================================================================
// session.js — batch roast sessions (several sequential roasts in one sitting).
// ==========================================================================
// OPT-IN. A single roast never creates a session, so the everyday path is
// completely unchanged. When you plan a batch, the app pre-fills each roast in
// turn, auto-advances on drop, tracks a light "cooling" status so you can start
// the next roast while the last one cools, and — if you label containers — tells
// you the tin hand-off ("Roasted Ethiopia → Tin A; Tin A is free, load Brazil").
//
// The pure state helpers at the top are unit-tested (js/session.test.js). The
// DOM wiring in initSession() is deliberately thin and defensive: if the markup
// is absent the whole feature no-ops and the app is unaffected.

import {
    getActiveRoastSession, upsertRoastSession, deleteRoastSession, getPantry,
    updateRoastInHistory, getActiveRoaster
} from './storage.js';

export const ITEM_STATUS = { QUEUED: 'queued', ROASTING: 'roasting', COOLING: 'cooling', DONE: 'done' };

let _seq = 0;

export function makeSessionItem({ id, beanId = '', beanName = '', weightG = 0, isDecaf = false, container = '' } = {}) {
    return {
        id: id || `it${++_seq}`,
        beanId, beanName, weightG: Number(weightG) || 0, isDecaf: !!isDecaf, container: container || '',
        status: ITEM_STATUS.QUEUED, roastId: null
    };
}

export function createSession({ id, roasterId = null, items = [] } = {}) {
    return { id: id || `s${++_seq}`, date: null, roasterId, status: 'planning', items };
}

export function sessionProgress(session) {
    const items = (session && session.items) || [];
    const by = (s) => items.filter(i => i.status === s).length;
    return { total: items.length, done: by('done'), cooling: by('cooling'), roasting: by('roasting'), queued: by('queued') };
}

export function nextQueuedIndex(session) {
    return ((session && session.items) || []).findIndex(i => i.status === ITEM_STATUS.QUEUED);
}

export function roastingIndex(session) {
    return ((session && session.items) || []).findIndex(i => i.status === ITEM_STATUS.ROASTING);
}

/** Immutably set one item's status (+ optional field patch), returning a new session. */
export function setItemStatus(session, index, status, patch = {}) {
    const items = (session.items || []).map((it, i) => (i === index ? { ...it, ...patch, status } : it));
    return { ...session, items };
}

/** Complete when there's at least one item and none are still queued or roasting. */
export function isSessionComplete(session) {
    const items = (session && session.items) || [];
    return items.length > 0 && !items.some(i => i.status === ITEM_STATUS.QUEUED || i.status === ITEM_STATUS.ROASTING);
}

/** Human hand-off line shown after a drop (uses container labels when present). */
export function handoffHint(session, finishedIndex) {
    const items = (session && session.items) || [];
    const done = items[finishedIndex];
    if (!done) return '';
    // Prefer the next queued item after this one; fall back to any other queued item.
    // Never return the just-finished item, even if its status hasn't been updated yet.
    const next = items.find((i, idx) => idx > finishedIndex && i.status === ITEM_STATUS.QUEUED)
        || items.find((i, idx) => idx !== finishedIndex && i.status === ITEM_STATUS.QUEUED);
    let msg = `Roasted ${done.beanName || 'this batch'}`;
    if (done.container) msg += ` → ${done.container}`;
    msg += ' is cooling.';
    if (next) {
        msg += ` Next: load ${next.beanName || 'the next bean'}`;
        if (done.container) msg += ` — ${done.container} is free now`;
        msg += ' into the chamber.';
    } else {
        msg += ' Last roast of the batch. 🎉';
    }
    return msg;
}

// ---------------------------------------------------------------------------
// DOM wiring (thin). Everything below is guarded so a missing element no-ops.
// ---------------------------------------------------------------------------

export function initSession() {
    const strip = document.getElementById('sessionStrip');
    const itemsWrap = document.getElementById('batchItems');
    const addBtn = document.getElementById('batchAddItem');
    const startBtn = document.getElementById('batchStart');
    const clearBtn = document.getElementById('batchClear');
    const planner = document.getElementById('batchPlanner');
    if (!strip && !planner) return; // feature markup absent → no-op

    let active = getActiveRoastSession();

    const beanOptions = () => getPantry().map(b => ({ id: b.id, name: b.name, weight: b.defaultWeightG || 0 }));

    // ---- Plan builder ------------------------------------------------------
    function addRow(prefill = {}) {
        if (!itemsWrap) return;
        const row = document.createElement('div');
        row.className = 'batch-row';
        row.style.cssText = 'display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;';

        const sel = document.createElement('select');
        sel.className = 'batch-bean';
        sel.style.cssText = 'flex:1; min-width:120px; margin-bottom:0;';
        const blank = document.createElement('option');
        blank.value = ''; blank.textContent = 'Select bean…';
        sel.appendChild(blank);
        beanOptions().forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id; opt.textContent = o.name; opt.dataset.weight = o.weight;
            sel.appendChild(opt);
        });
        if (prefill.beanId) sel.value = prefill.beanId;

        const weight = document.createElement('input');
        weight.type = 'number'; weight.className = 'batch-weight'; weight.min = '0'; weight.step = '5';
        weight.placeholder = 'g'; weight.style.cssText = 'width:80px; margin-bottom:0;';
        if (prefill.weightG) weight.value = prefill.weightG;
        // Picking a bean fills its default weight when the field is empty.
        sel.addEventListener('change', () => {
            const w = Number(sel.selectedOptions[0] && sel.selectedOptions[0].dataset.weight) || 0;
            if (w && !weight.value) weight.value = w;
        });

        const container = document.createElement('input');
        container.type = 'text'; container.className = 'batch-container';
        container.placeholder = 'Tin (optional)'; container.style.cssText = 'width:110px; margin-bottom:0;';
        if (prefill.container) container.value = prefill.container;

        const decafLabel = document.createElement('label');
        decafLabel.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:0.85rem; margin-bottom:0;';
        const decaf = document.createElement('input');
        decaf.type = 'checkbox'; decaf.className = 'batch-decaf'; decaf.style.cssText = 'width:auto; margin:0;';
        if (prefill.isDecaf) decaf.checked = true;
        decafLabel.append(decaf, document.createTextNode('decaf'));

        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'batch-remove secondary';
        remove.textContent = '✕'; remove.style.cssText = 'font-size:0.8rem; padding:4px 8px; margin-bottom:0;';
        remove.addEventListener('click', () => row.remove());

        row.append(sel, weight, container, decafLabel, remove);
        itemsWrap.appendChild(row);
    }

    function readPlanner() {
        if (!itemsWrap) return [];
        return [...itemsWrap.querySelectorAll('.batch-row')].map(row => {
            const sel = row.querySelector('.batch-bean');
            const opt = sel && sel.selectedOptions[0];
            return makeSessionItem({
                beanId: sel ? sel.value : '',
                beanName: opt ? opt.textContent : '',
                weightG: Number(row.querySelector('.batch-weight').value) || 0,
                container: row.querySelector('.batch-container').value.trim(),
                isDecaf: row.querySelector('.batch-decaf').checked
            });
        }).filter(it => it.beanId || it.weightG); // drop empty rows
    }

    // ---- Arming / pre-fill the Active Roast setup from an item --------------
    function armItem(idx) {
        if (!active || !active.items[idx]) return;
        const item = active.items[idx];
        const beanSelect = document.getElementById('beanSelect');
        const weightInput = document.getElementById('greenWeightInput');
        if (beanSelect && item.beanId && [...beanSelect.options].some(o => o.value === item.beanId)) {
            beanSelect.value = item.beanId;
            beanSelect.dispatchEvent(new Event('change'));
        }
        if (weightInput && item.weightG) weightInput.value = item.weightG;
    }

    // ---- Progress strip ----------------------------------------------------
    function renderStrip() {
        if (!strip) return;
        if (!active || !active.items.length) { strip.hidden = true; strip.textContent = ''; return; }
        strip.hidden = false;
        strip.textContent = '';
        const title = document.createElement('strong');
        title.textContent = '🗓 Batch: ';
        strip.appendChild(title);
        active.items.forEach((it) => {
            const mark = it.status === 'done' ? '✓' : it.status === 'cooling' ? '♨' : it.status === 'roasting' ? '▶' : '⏳';
            const chip = document.createElement('span');
            chip.className = `session-item session-${it.status}`;
            chip.style.cssText = 'display:inline-block; margin:0 6px 4px 0; padding:2px 8px; border-radius:10px; background:var(--border-color); font-size:0.8rem;';
            chip.textContent = `${mark} ${it.beanName || 'Roast'}${it.container ? ' · ' + it.container : ''}${it.isDecaf ? ' (decaf)' : ''}`;
            strip.appendChild(chip);
        });
        const p = sessionProgress(active);
        const count = document.createElement('span');
        count.style.cssText = 'color:var(--text-muted); font-size:0.8rem;';
        count.textContent = `(${p.done + p.cooling}/${p.total})`;
        strip.appendChild(count);
        if (isSessionComplete(active)) {
            const finish = document.createElement('button');
            finish.type = 'button'; finish.className = 'secondary';
            finish.style.cssText = 'font-size:0.75rem; padding:3px 8px; margin-left:8px;';
            finish.textContent = 'Clear batch';
            finish.addEventListener('click', () => { deleteRoastSession(active.id); active = null; renderStrip(); });
            strip.appendChild(finish);
        }
    }

    // ---- Post-roast "next up" block (appended to stage.js's saved card) -----
    function injectNextUp(finishedIdx) {
        // stage.js builds #postRoastCard on the same roastSaved event; wait a frame.
        requestAnimationFrame(() => {
            const card = document.getElementById('postRoastCard');
            if (!card || !active) return;
            if (card.querySelector('.session-nextup')) return;
            const box = document.createElement('div');
            box.className = 'session-nextup';
            box.style.cssText = 'margin-top:12px; padding:10px; border-radius:8px; background:var(--border-color);';
            const line = document.createElement('p');
            line.style.cssText = 'margin:0 0 8px;';
            line.textContent = handoffHint(active, finishedIdx);
            box.appendChild(line);
            const nextIdx = nextQueuedIndex(active);
            if (nextIdx >= 0) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = `Set up next roast → ${active.items[nextIdx].beanName || ''}`.trim();
                btn.addEventListener('click', () => {
                    armItem(nextIdx);
                    card.hidden = true;
                });
                box.appendChild(btn);
            }
            card.appendChild(box);
        });
    }

    // ---- Auto-advance wiring ----------------------------------------------
    window.addEventListener('roastStarted', () => {
        if (!active) return;
        const idx = nextQueuedIndex(active);
        if (idx < 0) return;
        active = setItemStatus(active, idx, ITEM_STATUS.ROASTING);
        active.status = 'active';
        upsertRoastSession(active);
        renderStrip();
    });

    window.addEventListener('roastSaved', (e) => {
        if (!active) return;
        const idx = roastingIndex(active);
        if (idx < 0) return;
        const roast = e.detail && e.detail.roast;
        active = setItemStatus(active, idx, ITEM_STATUS.COOLING, { roastId: roast ? roast.id : null });
        if (isSessionComplete(active)) active.status = 'done';
        upsertRoastSession(active);
        if (roast) {
            roast.sessionId = active.id;
            roast.sessionItemId = active.items[idx].id;
            updateRoastInHistory(roast);
        }
        injectNextUp(idx);
        renderStrip();
    });

    // ---- Plan-builder buttons ---------------------------------------------
    if (addBtn) addBtn.addEventListener('click', () => addRow());
    if (clearBtn) clearBtn.addEventListener('click', () => { if (itemsWrap) itemsWrap.textContent = ''; });
    if (startBtn) startBtn.addEventListener('click', () => {
        const items = readPlanner();
        if (!items.length) return;
        const roaster = getActiveRoaster() || {};
        active = createSession({ roasterId: roaster.id || null, items });
        active.date = new Date().toISOString();
        upsertRoastSession(active);
        if (itemsWrap) itemsWrap.textContent = '';
        if (planner && planner.tagName === 'DETAILS') planner.open = false;
        armItem(nextQueuedIndex(active)); // pre-fill the first roast
        renderStrip();
    });

    // Restore an in-flight session on load (e.g. page reload mid-batch).
    if (active) { renderStrip(); const n = nextQueuedIndex(active); if (n >= 0) armItem(n); }
    // Seed the planner with one empty row so it's obvious how to start.
    if (itemsWrap && !itemsWrap.children.length) addRow();
}
