import { getPantry, addBeanToPantry, deleteBeanFromPantry, addLotToBean, deleteLotFromBean, getRoastHistory, logRoastedUsage, updateBean, addBeanLedgerEntry, deleteBeanLedgerEntry } from './storage.js';
import { buildSuggestions, parseBeanName, orderByContext, uniqueValue } from './suggest.js';
import { greenAge, fifoBeanId, roastRest, roastedRemaining, roastedStock, ROASTED_USAGE_WHERE } from './freshness.js';
import { fefoLotOrder } from './lots.js';
import { priceHistory, priceTrend } from './sourcebook.js';
import { summariseLedger, LEDGER_DIRS } from './ledger.js';
import { openPlanModal } from './planner.js';
import { escapeHtml } from './escape.js';

const LOW_STOCK_THRESHOLD_G = 250;

// "bought today" / "bought yesterday" / "bought 5 days ago" — greenAge returns the bare
// words "today"/"yesterday", which read wrong with a trailing " ago".
function boughtPhrase(text) {
    return (text === 'today' || text === 'yesterday') ? `bought ${text}` : `bought ${text} ago`;
}

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
            const supplier = document.getElementById('beanSupplier')?.value || '';
            const supplierUrl = document.getElementById('beanSupplierUrl')?.value || '';

            if (!name) {
                alert('Bean Name is required');
                return;
            }

            const newBean = { name, region, country, farm, process, quantity, costPerKg, density, size, supplier, supplierUrl };
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

    initBeanSuggestions();
    renderPantryList();
    renderRoastedStock();
    window.addEventListener('pantryUpdated', () => { renderPantryList(); renderRoastedStock(); });
    // Roasted stock comes from roast history (e.g. a roasted weight was just recorded).
    window.addEventListener('historyUpdated', renderRoastedStock);
}

// --- Low-friction bean entry: autocomplete + cascading suggestions + name parsing ---
// All suggestions come from the user's own pantry/history (+ a seed vocabulary). Free text
// always works; this only re-orders <datalist> options and pre-fills empty fields.
let beanSuggestions = null;

function fillDatalist(id, values) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

// Rebuild the suggestion model + base datalists from current data.
function refreshBeanSuggestions() {
    beanSuggestions = buildSuggestions(getPantry(), getRoastHistory());
    fillDatalist('supplierList', beanSuggestions.suppliers);
    fillDatalist('countryList', beanSuggestions.countries);
    fillDatalist('regionList', beanSuggestions.regions);
    fillDatalist('farmList', beanSuggestions.farms);
}

function setInputIfEmpty(el, value) {
    if (el && !el.value.trim() && value) el.value = value;
}

// Only set a <select> if it's untouched and the value is one of its options.
function setSelectIfEmpty(sel, value) {
    if (!sel || sel.value || !value) return;
    if ([...sel.options].some(o => o.value === value)) sel.value = value;
}

function initBeanSuggestions() {
    const nameEl = document.getElementById('beanName');
    if (!nameEl) return;
    const supEl = document.getElementById('beanSupplier');
    const ctyEl = document.getElementById('beanCountry');
    const regEl = document.getElementById('beanRegion');
    const procEl = document.getElementById('beanProcess');

    refreshBeanSuggestions();
    window.addEventListener('pantryUpdated', refreshBeanSuggestions);

    // Country chosen → float its usual regions to the top, and pre-fill the process if there's
    // only ever been one for this country.
    const reorderForCountry = (country) => {
        const ctx = beanSuggestions.byCountry[(country || '').trim()];
        if (!ctx) return;
        fillDatalist('regionList', orderByContext(beanSuggestions.regions, ctx.regions));
        setSelectIfEmpty(procEl, uniqueValue(ctx.processes));
    };

    // Type/paste a structured name → fill empty origin fields (lowest-friction of all).
    nameEl.addEventListener('change', () => {
        const parsed = parseBeanName(nameEl.value, {
            countries: beanSuggestions.countries, processes: beanSuggestions.processes,
        });
        setInputIfEmpty(ctyEl, parsed.country);
        setInputIfEmpty(regEl, parsed.region);
        setSelectIfEmpty(procEl, parsed.process);
        if (parsed.country) reorderForCountry(parsed.country);
    });

    // Supplier chosen → float the countries you buy from there first; pre-fill if there's only one.
    if (supEl) supEl.addEventListener('change', () => {
        const ctx = beanSuggestions.bySupplier[supEl.value.trim()];
        if (!ctx) return;
        fillDatalist('countryList', orderByContext(beanSuggestions.countries, ctx.countries));
        setInputIfEmpty(ctyEl, uniqueValue(ctx.countries));
        if (ctyEl && ctyEl.value) reorderForCountry(ctyEl.value);
    });

    if (ctyEl) ctyEl.addEventListener('change', () => reorderForCountry(ctyEl.value));
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

        let details = `<strong>${escapeHtml(bean.name)}</strong>`;
        const info = [];
        if (bean.country) info.push(escapeHtml(bean.country));
        if (bean.region) info.push(escapeHtml(bean.region));
        if (bean.farm) info.push(escapeHtml(bean.farm));
        if (bean.process) info.push(escapeHtml(bean.process));

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
        if (bean.supplier) {
            details += `<br><small style="color: var(--text-muted);">🏷️ ${escapeHtml(bean.supplier)}</small>`;
        }
        // Borrowed/lent ledger summary — keeps the "owe Mark 250 g" side honest.
        if (Array.isArray(bean.ledger) && bean.ledger.length) {
            const led = summariseLedger(bean.ledger);
            if (led.owed > 0) details += `<br><small style="color: var(--accent);">🤝 you owe ${led.owed} g (borrowed)</small>`;
            if (led.lent > 0) details += `<br><small style="color: var(--text-muted);">↗ lent out ${led.lent} g</small>`;
        }

        // Green-bean age + freshness. Green keeps ~a year; flag old lots and the
        // oldest in-stock bean to roast first (FIFO).
        const age = greenAge(bean.purchasedAt);
        if (age) {
            const ageColor = age.stale ? 'var(--danger)' : 'var(--text-muted)';
            const staleNote = age.stale ? ' — old, roast soon' : '';
            details += `<br><small style="color: ${ageColor};">🌱 ${boughtPhrase(age.text)}${staleNote}</small>`;
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

        // Borrowed/lent detail — text nodes so a free-text "who"/note can't inject markup.
        if (Array.isArray(bean.ledger) && bean.ledger.length) {
            const ledWrap = document.createElement('details');
            ledWrap.style.marginTop = '6px';
            const sum = document.createElement('summary');
            sum.style.cssText = 'cursor: pointer; font-size: 0.8rem; color: var(--text-muted);';
            sum.textContent = `Loans (${bean.ledger.length})`;
            ledWrap.appendChild(sum);
            bean.ledger.forEach(entry => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.8rem; margin-top: 4px;';
                const span = document.createElement('span');
                const verb = entry.dir === 'borrowed' ? 'Borrowed from' : 'Lent to';
                span.textContent = `${verb} ${entry.who || '—'}: ${Number(entry.grams) || 0} g${entry.note ? ` — ${entry.note}` : ''}`;
                row.appendChild(span);
                const del = document.createElement('button');
                del.textContent = '✕';
                del.title = 'Remove this entry';
                del.style.cssText = 'padding: 1px 7px; font-size: 0.75rem;';
                del.addEventListener('click', () => {
                    deleteBeanLedgerEntry(bean.id, entry.id);
                    renderPantryList();
                    window.dispatchEvent(new Event('pantryUpdated'));
                });
                row.appendChild(del);
                ledWrap.appendChild(row);
            });
            infoDiv.appendChild(ledWrap);
        }

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';
        btnGroup.style.flexWrap = 'wrap';

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

        const sourceBtn = document.createElement('button');
        sourceBtn.textContent = 'Source';
        sourceBtn.style.padding = '5px 10px';
        sourceBtn.setAttribute('data-hint', 'Where you buy this bean and what it has cost over time — re-order in one tap and see if the price is trending up or down.');
        sourceBtn.addEventListener('click', () => openSourceModal(bean));

        const loanBtn = document.createElement('button');
        loanBtn.textContent = 'Loan';
        loanBtn.style.padding = '5px 10px';
        loanBtn.setAttribute('data-hint', 'Track beans swapped with friends: "borrowed from Mark — owe 250 g" or "lent Sam 200 g", so you remember who owes whom.');
        loanBtn.addEventListener('click', () => openLedgerModal(bean));

        btnGroup.appendChild(planBtn);
        btnGroup.appendChild(restockBtn);
        btnGroup.appendChild(sourceBtn);
        btnGroup.appendChild(loanBtn);
        btnGroup.appendChild(deleteBtn);
        beanCard.appendChild(infoDiv);
        beanCard.appendChild(btnGroup);
        pantryListDiv.appendChild(beanCard);
    });
}

// Roasted stock — coffee already roasted and still on hand. Deliberately simple: grams
// left + a soft "days since roast" freshness note, oldest first. Sourced from roast history
// (a roast with a recorded roasted weight), so there's no separate schema to maintain.
export function renderRoastedStock() {
    const div = document.getElementById('roastedStockList');
    if (!div) return;

    const pantry = getPantry();
    const stock = roastedStock(getRoastHistory());
    div.innerHTML = '';

    if (!stock.length) {
        div.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No roasted stock yet — finish a roast and record its roasted weight in Roast History.</p>';
        return;
    }

    stock.forEach((roast, idx) => {
        const remaining = roastedRemaining(roast);
        const bean = pantry.find(b => b.id === roast.beanId);
        const name = (bean && bean.name) || roast.beanName || 'Roast';
        const rest = roastRest(new Date(roast.date).getTime());

        const card = document.createElement('div');
        card.className = 'card bean-card';
        card.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

        const info = document.createElement('div');
        let html = `<strong>${escapeHtml(name)}</strong>`;
        html += `<br><small style="color: var(--text-muted);">roasted ${new Date(roast.date).toLocaleDateString()}</small>`;
        const remColor = remaining < 100 ? 'var(--accent)' : 'var(--text-muted)';
        html += `<br><small style="color: ${remColor};">${remaining} g left</small>`;
        if (rest) {
            const c = rest.phase === 'past' ? 'var(--danger)' : (rest.phase === 'peak' ? 'var(--accent)' : 'var(--text-muted)');
            html += `<br><small style="color: ${c};">🌱 ${rest.text}</small>`;
        }
        if (idx === 0 && stock.length > 1) {
            html += `<br><small style="color: var(--accent);">⏳ oldest roast — drink this first</small>`;
        }
        info.innerHTML = html;

        // "Where it went" trail — only once something's been logged. Built with text nodes so a
        // free-text note can't inject markup.
        if (Array.isArray(roast.usageLog) && roast.usageLog.length) {
            const trail = document.createElement('details');
            trail.style.marginTop = '6px';
            const sum = document.createElement('summary');
            sum.style.cssText = 'cursor: pointer; font-size: 0.8rem; color: var(--text-muted);';
            sum.textContent = `Where it went (${roast.usageLog.length})`;
            trail.appendChild(sum);
            [...roast.usageLog].reverse().forEach(e => {
                const line = document.createElement('div');
                line.style.cssText = 'font-size: 0.8rem; margin-top: 3px; color: var(--text-muted);';
                const when = e.date ? new Date(e.date).toLocaleDateString() : '';
                line.textContent = `${when} · ${Number(e.grams) || 0} g · ${e.where || 'other'}${e.note ? ` — ${e.note}` : ''}`;
                trail.appendChild(line);
            });
            info.appendChild(trail);
        }

        const btns = document.createElement('div');
        btns.style.cssText = 'display: flex; gap: 8px;';

        const drank = document.createElement('button');
        drank.textContent = 'Drank some';
        drank.style.padding = '5px 10px';
        drank.setAttribute('data-hint', 'Log what you used and where it went (brewed, gift, cupping…) so the grams left stays honest. A cup is roughly 15–18 g.');
        drank.addEventListener('click', () => openUsageModal(roast, { name, remaining }));

        const finished = document.createElement('button');
        finished.textContent = 'Finished';
        finished.className = 'danger';
        finished.style.padding = '5px 10px';
        finished.setAttribute('data-hint', 'Log the rest as used (prefilled with what is left) and note where it went.');
        finished.addEventListener('click', () => openUsageModal(roast, { name, remaining, finishing: true }));

        btns.appendChild(drank);
        btns.appendChild(finished);
        card.appendChild(info);
        card.appendChild(btns);
        div.appendChild(card);
    });
}

// Log roasted-stock usage: how much you used and where it went. Floor = grams + a destination
// (Brewed by default); an optional note folds behind nothing — it's just one small field. When
// "finishing", grams prefill with what's left. Writes via logRoastedUsage (decrements + trails).
function openUsageModal(roast, { name, remaining, finishing = false } = {}) {
    const whereLabels = { brewed: 'Brewed', gift: 'Gift', cupping: 'Cupping', other: 'Other' };

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3>${finishing ? 'Finished' : 'Used some'} — where did it go?</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">${Math.round(remaining)} g of this roast on hand.</p>
        <label class="field-label" for="useGrams">Grams used <span class="req">*</span></label>
        <input type="number" id="useGrams" min="1" step="1" placeholder="e.g. 18 (about a cup)">
        <label class="field-label" for="useWhere">Where</label>
        <select id="useWhere" style="width: 100%;">
            ${ROASTED_USAGE_WHERE.map(w => `<option value="${w}">${whereLabels[w]}</option>`).join('')}
        </select>
        <label class="field-label" for="useNote">Note</label>
        <input type="text" id="useNote" placeholder="Optional — e.g. gift for Mum, V60 dial-in">
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 15px;">
            <button id="useCancel">Cancel</button>
            <button id="useSave" style="background-color: var(--success);">Log it</button>
        </div>
    `;
    bg.appendChild(modal);
    document.body.appendChild(bg);

    const gramsInput = modal.querySelector('#useGrams');
    if (finishing) gramsInput.value = String(Math.round(remaining));
    gramsInput.focus();

    const close = () => document.body.removeChild(bg);
    modal.querySelector('#useCancel').addEventListener('click', close);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });

    modal.querySelector('#useSave').addEventListener('click', () => {
        const grams = parseFloat(gramsInput.value);
        if (!(grams > 0)) { alert('Enter how many grams you used.'); return; }
        logRoastedUsage(roast.id, grams, modal.querySelector('#useWhere').value, modal.querySelector('#useNote').value.trim());
        close();
        renderRoastedStock();
    });
}

// One line describing a green lot: grams, when it was bought, price and best-before.
// `isFirst` marks the FEFO lot to roast next.
function lotDescription(lot, isFirst) {
    const span = document.createElement('span');
    const grams = Number(lot.grams) || 0;
    const bits = [`${grams} g`];
    const age = greenAge(lot.date);
    if (age) bits.push(boughtPhrase(age.text));
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
        <h3>Add stock — ${escapeHtml(bean.name)}</h3>
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

// Source book for a bean: where it comes from (editable supplier + re-order link) and what
// it has cost over time (price history + trend, derived from its priced lots).
function openSourceModal(bean) {
    const history = priceHistory(bean);
    const trend = priceTrend(history);

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto;';

    const histRows = history.length
        ? history.map(p => `<li>${new Date(p.date).toLocaleDateString()} — ${p.price.toFixed(2)}/kg${p.grams ? ` <span style="color: var(--text-muted);">(${p.grams} g)</span>` : ''}</li>`).join('')
        : '<li style="color: var(--text-muted);">No priced purchases yet — add a price when you add a lot.</li>';

    let trendLine = '';
    if (trend) {
        const arrow = trend.direction === 'up' ? '▲' : (trend.direction === 'down' ? '▼' : '▬');
        const col = trend.direction === 'up' ? 'var(--danger)' : (trend.direction === 'down' ? 'var(--success)' : 'var(--text-muted)');
        const word = trend.direction === 'flat' ? 'unchanged' : (trend.direction === 'up' ? 'higher' : 'lower');
        trendLine = `<p style="color: ${col}; font-size: 0.9rem;">${arrow} ${Math.abs(trend.deltaPct).toFixed(0)}% ${word} than your first purchase (${trend.first.toFixed(2)} → ${trend.last.toFixed(2)}/kg)</p>`;
    }

    modal.innerHTML = `
        <h3>Source — ${escapeHtml(bean.name)}</h3>
        <label class="field-label" for="srcSupplier">Supplier / roaster</label>
        <input type="text" id="srcSupplier" placeholder="Where you buy it">
        <label class="field-label" for="srcUrl">Re-order link</label>
        <input type="text" id="srcUrl" inputmode="url" placeholder="Product page URL">
        <p style="margin-bottom: 4px;"><strong>Price history</strong></p>
        <ul style="margin-top: 4px;">${histRows}</ul>
        ${trendLine}
        <div style="display: flex; justify-content: space-between; gap: 8px; margin-top: 15px;">
            <button id="srcReorder">↗ Re-order</button>
            <div style="display: flex; gap: 8px;">
                <button id="srcClose">Close</button>
                <button id="srcSave" style="background-color: var(--success);">Save</button>
            </div>
        </div>
    `;
    bg.appendChild(modal);
    document.body.appendChild(bg);

    // Set values via JS (avoids HTML-escaping user text into attributes).
    modal.querySelector('#srcSupplier').value = bean.supplier || '';
    modal.querySelector('#srcUrl').value = bean.supplierUrl || '';

    const close = () => document.body.removeChild(bg);
    modal.querySelector('#srcClose').addEventListener('click', close);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });

    const save = () => updateBean(bean.id, {
        supplier: modal.querySelector('#srcSupplier').value.trim(),
        supplierUrl: modal.querySelector('#srcUrl').value.trim()
    });

    modal.querySelector('#srcSave').addEventListener('click', () => {
        save();
        close();
        renderPantryList();
        window.dispatchEvent(new Event('pantryUpdated'));
    });

    modal.querySelector('#srcReorder').addEventListener('click', () => {
        let url = modal.querySelector('#srcUrl').value.trim();
        if (!url) {
            alert('Add a re-order link (the product page URL) first.');
            return;
        }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        save(); // keep any edits before leaving
        window.open(url, '_blank', 'noopener');
    });
}

// Record a borrowed/lent bean swap with a friend. Direction + who + grams (+ optional note).
function openLedgerModal(bean) {
    const dirLabels = { borrowed: 'I borrowed this (I owe them)', lent: 'I lent this out (they owe me)' };

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3 id="ledTitle"></h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Track beans swapped with friends so you remember who owes whom.</p>
        <label class="field-label" for="ledDir">What happened</label>
        <select id="ledDir" style="width: 100%;">
            ${LEDGER_DIRS.map(d => `<option value="${d}">${dirLabels[d]}</option>`).join('')}
        </select>
        <label class="field-label" for="ledWho">Who <span class="req">*</span></label>
        <input type="text" id="ledWho" placeholder="e.g. Mark">
        <label class="field-label" for="ledGrams">Grams <span class="req">*</span></label>
        <input type="number" id="ledGrams" min="1" step="1" placeholder="e.g. 250">
        <label class="field-label" for="ledNote">Note</label>
        <input type="text" id="ledNote" placeholder="Optional — e.g. that Ethiopian natural">
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 15px;">
            <button id="ledCancel">Cancel</button>
            <button id="ledSave" style="background-color: var(--success);">Save</button>
        </div>
    `;
    bg.appendChild(modal);
    document.body.appendChild(bg);
    modal.querySelector('#ledTitle').textContent = `Loan — ${bean.name}`; // textContent = injection-safe

    const close = () => document.body.removeChild(bg);
    modal.querySelector('#ledCancel').addEventListener('click', close);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    modal.querySelector('#ledWho').focus();

    modal.querySelector('#ledSave').addEventListener('click', () => {
        const who = modal.querySelector('#ledWho').value.trim();
        const grams = parseFloat(modal.querySelector('#ledGrams').value);
        if (!who) { alert('Who did you swap with?'); return; }
        if (!(grams > 0)) { alert('Enter how many grams.'); return; }
        addBeanLedgerEntry(bean.id, {
            dir: modal.querySelector('#ledDir').value,
            who, grams,
            note: modal.querySelector('#ledNote').value.trim()
        });
        close();
        renderPantryList();
        window.dispatchEvent(new Event('pantryUpdated'));
    });
}
