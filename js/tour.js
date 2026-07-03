// Lightweight, dependency-free guided tour (coach-marks). Spotlights key UI
// elements with a short caption and Back/Next/Skip. Auto-offered on first run
// and re-launchable from the Help tab.

const STEPS = [
    { sel: '.nav-links', sidebar: true, title: 'Navigation', text: 'Switch between Active Roast, Bean Pantry, Roast History and Help here.' },
    { sel: '#sidebarPrefs', sidebar: true, title: 'Preferences', text: 'Choose how much detail you want — Easy, Moderate or Expert Mode — and turn on 💡 hints for tap-to-explain badges. Change them any time.' },
    { sel: '#roasterControl', tab: 'dashboard', title: 'Your roaster', text: 'This is your machine. Most people use one (no setup needed); tap “Manage roasters” if you use more than one (yours, a friend’s, a different model).' },
    { sel: '#startBtn', tab: 'dashboard', title: 'Start a roast', text: 'Tap to begin — the app listens through your mic and detects first & second crack automatically.' },
    { sel: '#dashboard .demo-btn', tab: 'dashboard', title: 'Try a demo', text: 'New here? Watch a simulated roast — no microphone needed.' },
    { sel: '#roastCurve', tab: 'dashboard', title: 'Live roast curve', text: 'Your roast is drawn here in real time, with crack markers.' },
    { sel: '.nav-links li[data-target="history"]', sidebar: true, title: 'After the roast', text: 'Open Roast History to log the roasted weight, add tasting notes, and take a colour-corrected photo to track how dark each batch is. See Help → “Roast-colour photos”.' },
    { sel: '#syncSidebarBtn', sidebar: true, title: 'Back up & sync (optional)', text: 'Your data is always saved on this device — no account needed. Tap here any time to sign in and back up or sync across devices, or share a pantry with someone by email.' },
    { sel: '.nav-links li[data-target="help"]', sidebar: true, title: 'Help anytime', text: 'Open Help for a quick guide or to replay this tour.' }
];

let backdrop, highlight, tooltip, idx = 0;

export function initTour() {
    document.querySelectorAll('.tour-btn').forEach(b => b.addEventListener('click', () => startTour()));
    // First visit: offer the tour with a quiet banner instead of hijacking the
    // screen — people like to look around before being walked around.
    if (!localStorage.getItem('tourSeen')) offerTour();
}

function offerTour() {
    const dash = document.getElementById('dashboard');
    const h1 = dash && dash.querySelector('h1');
    if (!h1) return;

    const banner = document.createElement('div');
    banner.className = 'card stage-pre';
    banner.id = 'tourOffer';
    banner.style.cssText = 'display:flex; gap:12px; align-items:center; flex-wrap:wrap; border-color:var(--accent);';
    banner.innerHTML = `
        <span style="flex:1; min-width:200px;">👋 <strong>New here?</strong> Take a 1-minute tour of the screen, or watch a simulated roast.</span>
        <button type="button" id="tourOfferStart" style="font-size:0.9rem; padding:8px 14px;">🧭 Quick tour</button>
        <button type="button" id="tourOfferDemo" class="secondary" style="font-size:0.9rem; padding:8px 14px;">▶ Watch a demo</button>
        <button type="button" id="tourOfferDismiss" class="secondary" aria-label="Dismiss" style="font-size:0.9rem; padding:8px 12px;">✕</button>`;
    h1.insertAdjacentElement('afterend', banner);

    const settle = () => { localStorage.setItem('tourSeen', '1'); banner.remove(); };
    banner.querySelector('#tourOfferStart').addEventListener('click', () => { settle(); startTour(); });
    banner.querySelector('#tourOfferDemo').addEventListener('click', () => {
        settle();
        const demoBtn = document.querySelector('#dashboard .demo-btn');
        if (demoBtn) demoBtn.click();
    });
    banner.querySelector('#tourOfferDismiss').addEventListener('click', settle);
}

function isMobile() { return window.innerWidth <= 768; }

function startTour() {
    if (backdrop) return;
    idx = 0;

    backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2000;';

    // NOTE: no transition on this box — its 9999px cut-out shadow repaints the whole
    // screen, and animating that made some tour steps crawl on slower machines.
    highlight = document.createElement('div');
    highlight.style.cssText = 'position:fixed;z-index:2001;border:2px solid var(--accent);border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,0.65);pointer-events:none;';

    tooltip = document.createElement('div');
    tooltip.className = 'card';
    tooltip.style.cssText = 'position:fixed;z-index:2002;max-width:280px;margin:0;';

    document.body.append(backdrop, highlight, tooltip);
    window.addEventListener('resize', show);
    showStep();
}

function end() {
    localStorage.setItem('tourSeen', '1');
    window.removeEventListener('resize', show);
    [backdrop, highlight, tooltip].forEach(el => el && el.remove());
    backdrop = highlight = tooltip = null;
}

function showStep() {
    const step = STEPS[idx];
    // Steps that live on a specific tab switch to it first (so the tour works
    // when launched from the Help tab too).
    if (step.tab) {
        const link = document.querySelector(`.nav-links li[data-target="${step.tab}"]`);
        if (link && !link.classList.contains('active')) link.click();
    }
    // On mobile, sidebar steps need the drawer open.
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('open', !!step.sidebar && isMobile());
    show();
}

function show() {
    if (!tooltip) return;
    const step = STEPS[idx];
    const target = document.querySelector(step.sel);
    // Skip steps whose target is missing OR hidden (customised away / tier-gated),
    // so the spotlight never points at empty space.
    if (!target || target.getClientRects().length === 0) { next(); return; }

    // Instant scroll, then measure: with smooth scrolling the rect was captured
    // mid-glide, so the spotlight sat in the wrong place until the page settled.
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    highlight.style.top = `${r.top - pad}px`;
    highlight.style.left = `${r.left - pad}px`;
    highlight.style.width = `${r.width + pad * 2}px`;
    highlight.style.height = `${r.height + pad * 2}px`;

    tooltip.innerHTML = `
        <div style="font-weight:bold;margin-bottom:6px;">${step.title} <span style="color:var(--text-muted);font-weight:normal;font-size:0.8rem;">(${idx + 1}/${STEPS.length})</span></div>
        <p style="font-size:0.9rem;margin-bottom:10px;">${step.text}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="tourSkip" style="font-size:0.8rem;padding:5px 10px;background:var(--border-color);">Skip</button>
            <button id="tourBack" style="font-size:0.8rem;padding:5px 10px;" ${idx === 0 ? 'disabled' : ''}>Back</button>
            <button id="tourNext" style="font-size:0.8rem;padding:5px 10px;background:var(--success);">${idx === STEPS.length - 1 ? 'Done' : 'Next'}</button>
        </div>`;

    // Position the tooltip below the target if there's room, else above.
    const tipH = 150, margin = 12;
    let top = r.bottom + margin;
    if (top + tipH > window.innerHeight) top = Math.max(margin, r.top - tipH - margin);
    let left = Math.min(Math.max(margin, r.left), window.innerWidth - 280 - margin);
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    tooltip.querySelector('#tourSkip').onclick = end;
    tooltip.querySelector('#tourBack').onclick = () => { if (idx > 0) { idx--; showStep(); } };
    tooltip.querySelector('#tourNext').onclick = next;
}

function next() {
    if (idx >= STEPS.length - 1) { end(); return; }
    idx++;
    showStep();
}
