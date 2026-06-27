// Swipe-style personalisation. A friendly, revisitable way to tailor the Active Roast screen:
// swipe each optional control right to KEEP it or left to HIDE it (or tap the buttons). It writes
// the same `dashboardHidden` set as "Customise this screen", so the two stay in sync.

import { SECTIONS, getHidden, saveHidden, decide, applyAll } from './customise.js';

export function initSwipe() {
    document.querySelectorAll('.swipe-start-btn').forEach(b => b.addEventListener('click', openDeck));
}

function openDeck() {
    let hidden = getHidden();
    let i = 0;

    const bg = document.createElement('div');
    bg.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index:1100; padding:16px;';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%; max-width:360px; text-align:center;';
    bg.appendChild(wrap);
    document.body.appendChild(bg);
    const close = () => { applyAll(); window.dispatchEvent(new Event('customiseChanged')); document.body.removeChild(bg); };

    const decide1 = (keep) => {
        const s = SECTIONS[i];
        hidden = decide(hidden, s.key, keep);
        saveHidden(hidden);
        i++;
        render();
    };

    function render() {
        if (i >= SECTIONS.length) {
            const shown = SECTIONS.filter(s => !hidden.has(s.key)).length;
            wrap.innerHTML = `
                <div class="card" style="margin:0;">
                    <h3>All set 🎉</h3>
                    <p>Showing <strong>${shown}</strong> of ${SECTIONS.length} optional controls. You can redo this any time, or fine-tune under “Customise this screen”.</p>
                    <button id="swipeDone" style="background-color:var(--success);">Done</button>
                </div>`;
            wrap.querySelector('#swipeDone').addEventListener('click', close);
            return;
        }
        const s = SECTIONS[i];
        const kept = !hidden.has(s.key);
        wrap.innerHTML = `
            <p style="color:var(--text-muted); margin-bottom:8px;">${i + 1} / ${SECTIONS.length} — swipe ➡️ keep · ⬅️ hide</p>
            <div id="swipeCard" class="card" style="margin:0; user-select:none; touch-action:pan-y; cursor:grab;">
                <h3 style="margin-top:0;">${s.label}</h3>
                <p style="color:var(--text-muted);">${s.desc}</p>
                <p style="font-size:0.8rem; color:var(--text-muted);">Currently: ${kept ? 'shown' : 'hidden'}</p>
            </div>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:14px;">
                <button id="swipeHide" class="danger" style="flex:1;">🚫 Hide</button>
                <button id="swipeKeep" style="flex:1; background-color:var(--success);">❤️ Keep</button>
            </div>
            <button id="swipeSkip" style="margin-top:10px; background:var(--border-color); font-size:0.85rem;">Skip the rest</button>`;
        wrap.querySelector('#swipeHide').addEventListener('click', () => decide1(false));
        wrap.querySelector('#swipeKeep').addEventListener('click', () => decide1(true));
        wrap.querySelector('#swipeSkip').addEventListener('click', close);
        enableDrag(wrap.querySelector('#swipeCard'), decide1);
    }

    render();
}

// Pointer-drag the card; release past the threshold to decide (right = keep, left = hide).
function enableDrag(card, decide1) {
    let startX = 0, dx = 0, dragging = false;
    const THRESH = 90;
    const onDown = (e) => { dragging = true; startX = (e.touches ? e.touches[0].clientX : e.clientX); card.style.transition = 'none'; };
    const onMove = (e) => {
        if (!dragging) return;
        dx = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
        card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
        card.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 400));
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(dx) > THRESH) {
            const keep = dx > 0;
            card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            card.style.transform = `translateX(${keep ? 600 : -600}px) rotate(${keep ? 30 : -30}deg)`;
            card.style.opacity = '0';
            const d = dx; dx = 0;
            setTimeout(() => decide1(d > 0), 160);
        } else {
            card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            card.style.transform = ''; card.style.opacity = '1'; dx = 0;
        }
    };
    card.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    card.addEventListener('touchstart', onDown, { passive: true });
    card.addEventListener('touchmove', onMove, { passive: true });
    card.addEventListener('touchend', onUp);
}
