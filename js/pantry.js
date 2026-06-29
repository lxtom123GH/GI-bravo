import { getPantry, addBeanToPantry, deleteBeanFromPantry, addLotToBean, deleteLotFromBean } from './storage.js';
import { greenAge, fifoBeanId } from './freshness.js';
import { fefoLotOrder } from './lots.js';
import { openPlanModal } from './planner.js';

const LOW_STOCK_THRESHOLD_G = 250;

export function initPantry() {
    const pantryForm = document.getElementById('addBeanForm');
    if (pantryForm) {
        pantryForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('beanName').value;
            const region = document.getElementById('beanRegion').value;
            const country = document.getElementById('beanCountry').value;
            const farm = document.getElementById('beanFarm').value;
            const process = document.getElementById('beanProcess').value;
            const quantity = parseFloat(document.getElementById('beanQuantity').value) || 0;
            const costPerKg = parseFloat(document.getElementById('beanCost').value) || 0;
            const density = document.getElementById('beanDensity')?.value || '';
            const size = document.getElementById('beanSize')?.value || '';

            if (!name) {
                alert('Bean Name is required');
                return;
            }

            const newBean = { name, region, country, farm, process, quantity, costPerKg, density, size };
            addBeanToPantry(newBean);

            pantryForm.reset();
            // Collapse the optional-detail expander so the form returns to its short floor.
            const detail = document.getElementById('beanDetail');
            if (detail) detail.open = false;
            renderPantryList();

            // Dispatch event so active roast tab can update its bean dropdown
            window.dispatchEvent(new Event('pantryUpdated'));
        });
    }

    renderPantryList();
    window.addEventListener('pantryUpdated', renderPantryList);
}

export function renderPantryList() {
    const pantryListDiv = document.getElementById('pantryList');
    if (!pantryListDiv) return;

    const pantry = getPantry();
    pantryListDiv.innerHTML = '';

    if (pantry.length === 0) {
        pantryListDiv.innerHTML = '<p>Your pantry is empty. Add some beans to get started!</p>';
        return;
    }

    const useFirstId = fifoBeanId(pantry); // oldest in-stock green → gentle FIFO nudge

    pantry.forEach(bean => {
        const beanCard = document.createElement('div');
        beanCard.className = 'card bean-card';
        beanCard.style.display = 'flex';
        beanCard.style.justifyContent = 'space-between';
        beanCard.style.alignItems = 'center';

        let details = `<strong>${bean.name}</strong>`;
        let info = [];
        if (bean.country) info.push(bean.country);
        if (bean.region) info.push(bean.region);
        if (bean.farm) info.push(bean.farm);
        if (bean.process) info.push(bean.process);

        if (info.length > 0) {
            details += `<br><small>${info.join(' - ')}</small>`;
        }

        const qty = Number(bean.quantity) || 0;
        let qtyColor = 'var(--text-muted)';
        let qtyLabel = `${qty} g on hand`;
        if (qty <= 0) {
            qtyColor = 'var(--danger)';
            qtyLabel = 'Out of stock';
        } else if (qty < LOW_STOCK_THRESHOLD_G) {
            qtyColor = 'var(--accent)';
            qtyLabel = `${qty} g on hand (low)`;
        }
        details += `<br><small style="color: ${qtyColor};">${qtyLabel}</small>`;

        const cost = Number(bean.costPerKg) || 0;
        const pricedLots = Array.isArray(bean.lots) ? bean.lots.filter(l => (Number(l.price) || 0) > 0).length : 0;
        if (cost > 0) {
            const onHandValue = (qty / 1000) * cost;
            const avgNote = pricedLots > 1 ? ' avg' : '';
            details += `<br><small style="color: var(--text-muted);">${cost.toFixed(2)}/kg${avgNote} · stock value ${onHandValue.toFixed(2)}</small>`;
        }

        // Green-bean age + freshness. Green keeps ~a year; flag old lots and the
        // oldest in-stock bean to roast first (FIFO).
        const age = greenAge(bean.purchasedAt);
        if (age) {
            const ageColor = age.stale ? 'var(--danger)' : 'var(--text-muted)';
            const staleNote = age.stale ? ' — old, roast soon' : '';
            details += `<br><small style="color: ${ageColor};">🌱 bought ${age.text} ago${staleNote}</small>`;
        }
        if (qty > 0 && bean.id === useFirstId) {
            details += `<br><small style="color: var(--accent);">⏳ oldest in stock — roast this first</small>`;
        }

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = details;

        // Per-lot breakdown — only for beans the user has split into lots. Shown in
        // FEFO ("use first") order so the lot to roast next is at the top.
        if (Array.isArray(bean.lots) && bean.lots.length) {
            const lotsWrap = document.createElement('details');
            lotsWrap.style.marginTop = '6px';
            const summary = document.createElement('summary');
            summary.style.cssText = 'cursor: pointer; font-size: 0.8rem; color: var(--text-muted);';
            summary.textContent = `Lots (${bean.lots.length})`;
            lotsWrap.appendChild(summary);

            fefoLotOrder(bean.lots).forEach((lot, i) => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.8rem; margin-top: 4px;';
                row.appendChild(lotDescription(lot, i === 0));

                const del = document.createElement('button');
                del.textContent = '✕';
                del.title = 'Remove this lot';
                del.style.cssText = 'padding: 1px 7px; font-size: 0.75rem;';
                del.addEventListener('click', () => {
                    if (confirm(`Remove this ${Number(lot.grams) || 0} g lot of ${bean.name}?`)) {
                        deleteLotFromBean(bean.id, lot.id);
                        renderPantryList();
                        window.dispatchEvent(new Event('pantryUpdated'));
                    }
                });
                row.appendChild(del);
                lotsWrap.appendChild(row);
            });
            infoDiv.appendChild(lotsWrap);
        }

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';

        const planBtn = document.createElement('button');
        planBtn.textContent = 'Plan roasts';
        planBtn.style.padding = '5px 10px';
        planBtn.setAttribute('data-hint', "Work out roast sizes that fit your roaster and divide this bag evenly (e.g. 2.5 kg → 6 × 417 g, no leftover).");
        planBtn.addEventListener('click', () => openPlanModal(bean.name, Number(bean.quantity) || 0));

        const restockBtn = document.createElement('button');
        restockBtn.textContent = '＋ Lot';
        restockBtn.style.padding = '5px 10px';
        restockBtn.setAttribute('data-hint', "Add a fresh batch you bought. Just grams is enough; add a date, price or best-before if you want to track lots separately (cost becomes a weighted average and the oldest lot is flagged to roast first).");
        restockBtn.addEventListener('click', () => openLotModal(bean));

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'danger';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${bean.name}?`)) {
                deleteBeanFromPantry(bean.id);
                renderPantryList();
                window.dispatchEvent(new Event('pantryUpdated'));
            }
        });

        btnGroup.appendChild(planBtn);
        btnGroup.appendChild(restockBtn);
        btnGroup.appendChild(deleteBtn);
        beanCard.appendChild(infoDiv);
        beanCard.appendChild(btnGroup);
        pantryListDiv.appendChild(beanCard);
    });
}

// One line describing a green lot: grams, when it was bought, price and best-before.
// `isFirst` marks the FEFO lot to roast next.
function lotDescription(lot, isFirst) {
    const span = document.createElement('span');
    const grams = Number(lot.grams) || 0;
    const bits = [`${grams} g`];
    const age = greenAge(lot.date);
    if (age) bits.push(`bought ${age.text} ago`);
    if (Number(lot.price) > 0) bits.push(`${Number(lot.price).toFixed(2)}/kg`);

    let html = bits.join(' · ');
    if (lot.expiry) {
        const days = Math.floor((lot.expiry - Date.now()) / 86_400_000);
        if (days < 0) html += ` · <span style="color: var(--danger);">best-before passed</span>`;
        else if (days <= 14) html += ` · <span style="color: var(--accent);">best-before in ${days} d</span>`;
        else html += ` · best-before in ${Math.round(days / 30)} mo`;
    }
    if (isFirst) html = `⏳ <strong>use first</strong> — ${html}`;
    span.innerHTML = html;
    return span;
}

// Modal to add a green lot (a dated purchase) to a bean. Floor = grams; date defaults to
// today; price and best-before fold behind "＋ more" (progressive disclosure).
function openLotModal(bean) {
    const today = new Date().toISOString().slice(0, 10);

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3>Add stock — ${bean.name}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">A new batch you bought. Just grams is enough — add a date, price or best-before to track this lot on its own.</p>
        <label class="field-label" for="lotGrams">Grams <span class="req">*</span></label>
        <input type="number" id="lotGrams" min="1" step="1" placeholder="e.g. 1000">
        <label class="field-label" for="lotDate">Purchase date</label>
        <input type="date" id="lotDate" value="${today}">
        <details style="margin-top: 10px;">
            <summary style="cursor: pointer; color: var(--accent);">＋ more <span style="color: var(--text-muted); font-weight: normal;">(price, best-before)</span></summary>
            <div style="margin-top: 10px;">
                <label class="field-label" for="lotPrice">Cost per kg</label>
                <input type="number" id="lotPrice" min="0" step="0.01" placeholder="Optional">
                <label class="field-label" for="lotExpiry">Best-before</label>
                <input type="date" id="lotExpiry">
            </div>
        </details>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 15px;">
            <button id="lotCancel">Cancel</button>
            <button id="lotSave" style="background-color: var(--success);">Add lot</button>
        </div>
    `;
    bg.appendChild(modal);
    document.body.appendChild(bg);

    const close = () => document.body.removeChild(bg);
    modal.querySelector('#lotCancel').addEventListener('click', close);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    modal.querySelector('#lotGrams').focus();

    modal.querySelector('#lotSave').addEventListener('click', () => {
        const grams = parseFloat(modal.querySelector('#lotGrams').value);
        if (!(grams > 0)) {
            alert('Enter how many grams you bought.');
            return;
        }
        const dateStr = modal.querySelector('#lotDate').value;
        const priceVal = parseFloat(modal.querySelector('#lotPrice').value);
        const expiryStr = modal.querySelector('#lotExpiry').value;
        const lot = { grams };
        lot.date = dateStr ? new Date(dateStr).getTime() : Date.now();
        if (priceVal > 0) lot.price = priceVal;
        if (expiryStr) lot.expiry = new Date(expiryStr).getTime();

        addLotToBean(bean.id, lot);
        close();
        renderPantryList();
        window.dispatchEvent(new Event('pantryUpdated'));
    });
}
