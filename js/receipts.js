// Receipt/invoice quick-add. Snap a photo of the receipt and add several beans in one go
// (instead of the single add-bean form, once per bean). The photo is kept with the purchase
// so you can check what you paid later; it's also the foundation for OCR parsing down the track.

import { addPurchase, getPurchases, deletePurchase, addBeanToPantry } from './storage.js';
import { addPhoto, getPhotos, deletePhotosForRoast, fileToScaledDataURL } from './photos.js';

// PURE: total spend of a purchase = Σ (kg × cost/kg). Used in the list + tests.
export function purchaseTotal(items) {
    return (items || []).reduce((s, it) => s + ((Number(it.grams) || 0) / 1000) * (Number(it.costPerKg) || 0), 0);
}

const photoKey = (purchaseId) => 'purchase-' + purchaseId;

export function initReceipts() {
    const btn = document.getElementById('receiptAddBtn');
    if (btn) btn.addEventListener('click', openReceiptModal);
    renderRecentPurchases();
    window.addEventListener('pantryUpdated', renderRecentPurchases);
}

function rowHtml() {
    return `<div class="rcpt-row" style="display:flex; gap:6px; margin-bottom:6px;">
        <input type="text" class="rcpt-name" placeholder="Bean name" style="flex:2; margin:0;">
        <input type="number" class="rcpt-grams" placeholder="grams" style="flex:1; margin:0;">
        <input type="number" class="rcpt-cost" placeholder="$/kg" step="0.01" style="flex:1; margin:0;">
        <button type="button" class="rcpt-del danger" style="font-size:0.75rem; padding:5px 8px;">✕</button>
    </div>`;
}

function openReceiptModal() {
    const bg = document.createElement('div');
    bg.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width:90%; max-width:520px; max-height:90vh; overflow-y:auto;';
    const today = new Date().toISOString().slice(0, 10);

    modal.innerHTML = `
        <h3>Quick-add from receipt</h3>
        <p style="color:var(--text-muted); font-size:0.85rem;">Snap the receipt (optional) and add each bean. They go into your pantry with this purchase date.</p>
        <label><strong>Receipt photo</strong> (optional)</label>
        <input type="file" id="rcptPhoto" accept="image/*" capture="environment">
        <label style="margin-top:8px;"><strong>Purchase date</strong></label>
        <input type="date" id="rcptDate" value="${today}">
        <label style="margin-top:8px;"><strong>Supplier / note</strong> (optional)</label>
        <input type="text" id="rcptNote" placeholder="e.g. Bean Grain, 2.5 kg bag">
        <label style="margin-top:8px;"><strong>Beans</strong></label>
        <div id="rcptRows">${rowHtml()}${rowHtml()}</div>
        <button type="button" id="rcptAddRow" style="font-size:0.85rem; padding:6px 12px;">＋ Add bean</button>
        <p id="rcptTotal" style="color:var(--text-muted); margin-top:8px;"></p>
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
            <button id="rcptCancel" class="secondary">Cancel</button>
            <button id="rcptSave" style="background-color:var(--success);">Add to pantry</button>
        </div>`;
    bg.appendChild(modal);
    document.body.appendChild(bg);
    const close = () => document.body.removeChild(bg);

    const rows = modal.querySelector('#rcptRows');
    const totalEl = modal.querySelector('#rcptTotal');
    const readRows = () => [...rows.querySelectorAll('.rcpt-row')].map(r => ({
        name: r.querySelector('.rcpt-name').value.trim(),
        grams: parseFloat(r.querySelector('.rcpt-grams').value) || 0,
        costPerKg: parseFloat(r.querySelector('.rcpt-cost').value) || 0
    }));
    const refreshTotal = () => {
        const t = purchaseTotal(readRows());
        totalEl.textContent = t > 0 ? `Estimated total: ${t.toFixed(2)}` : '';
    };
    const wireRow = (row) => {
        row.querySelector('.rcpt-del').addEventListener('click', () => {
            if (rows.querySelectorAll('.rcpt-row').length > 1) { row.remove(); refreshTotal(); }
        });
        row.querySelectorAll('input').forEach(i => i.addEventListener('input', refreshTotal));
    };
    rows.querySelectorAll('.rcpt-row').forEach(wireRow);
    modal.querySelector('#rcptAddRow').addEventListener('click', () => {
        const tmp = document.createElement('div');
        tmp.innerHTML = rowHtml();
        const row = tmp.firstElementChild;
        rows.appendChild(row);
        wireRow(row);
    });
    modal.querySelector('#rcptCancel').addEventListener('click', close);

    modal.querySelector('#rcptSave').addEventListener('click', async () => {
        const items = readRows().filter(it => it.name && it.grams > 0);
        if (!items.length) { alert('Add at least one bean with a name and weight.'); return; }
        const date = modal.querySelector('#rcptDate').value || today;
        const note = modal.querySelector('#rcptNote').value.trim();
        const purchasedAt = new Date(date).getTime();

        const purchase = addPurchase({ date, note, items, total: purchaseTotal(items) });

        // Each bean lands in the pantry with the purchase date (drives freshness/FIFO + cost).
        items.forEach(it => addBeanToPantry({ name: it.name, quantity: it.grams, costPerKg: it.costPerKg, purchasedAt }));

        // Store the receipt photo (if any) against this purchase.
        const file = modal.querySelector('#rcptPhoto').files[0];
        if (file) {
            try {
                const dataURL = await fileToScaledDataURL(file, 1280, 0.7);
                await addPhoto(photoKey(purchase.id), dataURL, { type: 'receipt' });
            } catch (e) { console.warn('[receipts] photo save failed:', e?.message || e); }
        }
        close();
        window.dispatchEvent(new Event('pantryUpdated'));
    });
}

async function renderRecentPurchases() {
    const el = document.getElementById('recentPurchases');
    if (!el) return;
    const purchases = getPurchases();
    if (!purchases.length) { el.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No purchases logged yet.</p>'; return; }

    const cards = await Promise.all(purchases.slice(0, 8).map(async p => {
        let thumb = '';
        try {
            const photos = await getPhotos(photoKey(p.id));
            if (photos && photos.length) thumb = `<img src="${photos[0].dataURL}" alt="receipt" class="rcpt-thumb" data-src="${photos[0].dataURL}" style="width:48px; height:48px; object-fit:cover; border-radius:4px; cursor:pointer; flex:0 0 auto;">`;
        } catch (e) { /* no photo */ }
        const items = (p.items || []).map(i => i.name).join(', ');
        const total = p.total != null ? p.total : purchaseTotal(p.items);
        return `<div style="display:flex; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color);">
            ${thumb || '<div style="width:48px;height:48px;flex:0 0 auto;"></div>'}
            <div style="flex:1; min-width:0;">
                <small style="color:var(--text-muted);">${p.date || ''}${p.note ? ' · ' + p.note : ''}</small><br>
                <span style="font-size:0.9rem;">${(p.items || []).length} bean(s)${total ? ` · ${Number(total).toFixed(2)}` : ''}</span>
                <br><small style="color:var(--text-muted);">${items}</small>
            </div>
            <button class="rcpt-purge danger" data-id="${p.id}" style="font-size:0.75rem; padding:5px 8px;">✕</button>
        </div>`;
    }));
    el.innerHTML = cards.join('');

    el.querySelectorAll('.rcpt-thumb').forEach(img => img.addEventListener('click', () => viewImage(img.dataset.src)));
    el.querySelectorAll('.rcpt-purge').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Remove this purchase record? (Your pantry beans stay.)')) return;
        const id = btn.dataset.id;
        deletePurchase(id);
        try { await deletePhotosForRoast(photoKey(id)); } catch (e) { /* none */ }
        renderRecentPurchases();
    }));
}

function viewImage(src) {
    const bg = document.createElement('div');
    bg.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); display:flex; justify-content:center; align-items:center; z-index:1100; cursor:zoom-out;';
    bg.innerHTML = `<img src="${src}" style="max-width:95%; max-height:95%; border-radius:6px;">`;
    bg.addEventListener('click', () => document.body.removeChild(bg));
    document.body.appendChild(bg);
}
