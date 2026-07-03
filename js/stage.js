// Roast-stage layout: the Active Roast screen adapts to where you are in the roast.
//
//   pre  — setting up: setup card, guides, start buttons, demo — everything shows.
//   live — roasting: a calm, minimal screen. CSS on body[data-roast-stage="live"]
//          hides the pre-roast tooling (.stage-pre) and reveals Stop (.stage-live);
//          the timer grows and the mark-crack buttons become the main controls.
//
// After a roast is saved (the `roastSaved` event from js/audio.js, which replaced
// the old blocking alert), a "Roast saved" summary card appears with the next
// steps — log the roasted weight / tasting notes — so the flow doesn't dead-end.

import { getPantry, getRoastHistory, updateRoastInHistory } from './storage.js';
import { computeRoastMetrics, formatMs, formatDtr, computeWeightLoss } from './metrics.js';
import { escapeHtml } from './escape.js';

function setStage(stage) {
    document.body.dataset.roastStage = stage;
}

export function initStage() {
    setStage('pre');
    const card = document.getElementById('postRoastCard');

    const hideCard = () => {
        if (card) { card.style.display = 'none'; card.innerHTML = ''; }
    };

    window.addEventListener('roastStarted', () => { hideCard(); setStage('live'); });
    window.addEventListener('roastStopped', () => setStage('pre'));
    window.addEventListener('roastSaved', (e) => renderCard(e.detail || {}));

    function renderCard({ roast, stockMsg }) {
        if (!card || !roast) return;

        const bean = getPantry().find(b => b.id === roast.beanId);
        const m = computeRoastMetrics(roast.timeline || {});
        const metric = (label, value) => `
            <div class="post-roast-metric"><span>${label}</span><strong>${value}</strong></div>`;

        card.innerHTML = `
            <h3>✅ Roast saved${bean ? ` — ${escapeHtml(bean.name)}` : ''}</h3>
            <div class="post-roast-metrics">
                ${metric('Total time', formatMs(m.totalMs))}
                ${metric('First crack', formatMs(m.timeToFirstCrackMs))}
                ${metric('Development', formatMs(m.developmentTimeMs))}
                ${metric('DTR', formatDtr(m.dtr))}
            </div>
            ${stockMsg ? `<p style="color: var(--text-muted); font-size: 0.9rem; margin: 8px 0 0;">${escapeHtml(stockMsg)}</p>` : ''}
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 8px 0 12px;">
                When the beans have cooled, weigh them right here — the weight-loss % feeds
                your consistency, freshness and value views.
            </p>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;">
                <label for="postRoastWeight" style="margin: 0;">Roasted weight</label>
                <input type="number" id="postRoastWeight" min="0" step="1" placeholder="grams"
                    style="width: 120px; margin: 0;" data-hint="Weigh the cooled beans and enter the grams — saved straight onto this roast.">
                <button type="button" id="postRoastSaveWeight">Save</button>
                <small id="postRoastWeightMsg" style="color: var(--text-muted);"></small>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" id="postRoastFinishBtn" class="secondary"
                    data-hint="Jumps to this roast in Roast History for tasting notes and a colour photo.">
                    Add notes &amp; photos →</button>
                <button type="button" id="postRoastDismissBtn" class="secondary">Done for now</button>
            </div>`;
        card.style.display = '';
        card.scrollIntoView({ block: 'nearest' });

        initWeightField(card, roast.id);
        card.querySelector('#postRoastDismissBtn').addEventListener('click', hideCard);
        card.querySelector('#postRoastFinishBtn').addEventListener('click', () => {
            openInHistory(roast.id);
            hideCard();
        });
    }

    // Save the roasted weight straight from the card. An unusual weight loss asks
    // for a second Save tap (inline message) rather than a blocking dialog.
    function initWeightField(card, roastId) {
        const input = card.querySelector('#postRoastWeight');
        const saveBtn = card.querySelector('#postRoastSaveWeight');
        const msg = card.querySelector('#postRoastWeightMsg');
        if (!input || !saveBtn) return;
        let unusualArmed = false;

        const save = () => {
            const grams = parseFloat(input.value);
            if (isNaN(grams) || grams <= 0) { msg.textContent = 'Enter a positive number of grams.'; return; }
            const roast = getRoastHistory().find(r => r.id === roastId);
            if (!roast) { msg.textContent = 'Roast not found — use Roast History instead.'; return; }
            const loss = computeWeightLoss(roast.greenWeightG, grams);
            if (loss != null && (loss < 0 || loss > 30) && !unusualArmed) {
                unusualArmed = true;
                msg.textContent = `Loss of ${loss.toFixed(1)}% looks unusual (typical 12–20%) — tap Save again to keep it.`;
                return;
            }
            roast.roastedWeightG = grams;
            updateRoastInHistory(roast);
            window.dispatchEvent(new Event('historyUpdated'));
            msg.textContent = loss != null ? `✓ Saved — weight loss ${loss.toFixed(1)}%.` : '✓ Saved.';
        };

        saveBtn.addEventListener('click', save);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
        input.addEventListener('input', () => { unusualArmed = false; msg.textContent = ''; });
    }
}

// Switch to the Roast History tab and spotlight the just-saved roast's card.
function openInHistory(roastId) {
    const link = document.querySelector('.nav-links li[data-target="history"]');
    if (link) link.click();
    // History re-renders on historyUpdated, which has already fired by now.
    const btn = document.querySelector(`.log-yield-btn[data-id="${roastId}"]`);
    const roastCard = btn && btn.closest('.roast-card');
    if (roastCard) {
        roastCard.scrollIntoView({ block: 'start' });
        roastCard.classList.add('roast-card-flash');
        setTimeout(() => roastCard.classList.remove('roast-card-flash'), 2400);
    }
}
