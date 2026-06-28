// Lightweight, dependency-free guided tour (coach-marks). Spotlights key UI
// elements with a short caption and Back/Next/Skip. Auto-offered on first run
// and re-launchable from the Help tab.

const STEPS = [
    { sel: '.nav-links', sidebar: true, title: 'Navigation', text: 'Switch between Active Roast, Bean Pantry, Roast History and Help here.' },
    { sel: '#tierSelect', sidebar: true, title: 'Mode', text: 'Choose how much detail you want — Easy, Moderate or Expert. Change it any time.' },
    { sel: '#roasterControl', title: 'Your roaster', text: 'This is your machine. Most people use one (no setup needed); tap “Manage roasters” if you use more than one (yours, a friend’s, a different model).' },
    { sel: '#startBtn', title: 'Start a roast', text: 'Tap to begin — the app listens through your mic and detects first & second crack automatically.' },
    { sel: '.demo-btn', title: 'Try a demo', text: 'New here? Watch a simulated roast — no microphone needed.' },
    { sel: '#roastCurve', title: 'Live roast curve', text: 'Your roast is drawn here in real time, with crack markers.' },
    { sel: '.nav-links li[data-target="history"]', sidebar: true, title: 'After the roast', text: 'Open Roast History to log the roasted weight, add tasting notes, and take a colour-corrected photo to track how dark each batch is. See Help → “Roast-colour photos”.' },
    { sel: '#syncSidebarBtn', sidebar: true, title: 'Back up & sync (optional)', text: 'Your data is always saved on this device — no account needed. Tap here any time to sign in and back up or sync across devices, or share a pantry with someone by email.' },
    { sel: '.nav-links li[data-target="help"]', sidebar: true, title: 'Help anytime', text: 'Open Help for a quick guide or to replay this tour.' }
];

let backdrop, highlight, tooltip, idx = 0;

export function initTour() {
    document.querySelectorAll('.tour-btn').forEach(b => b.addEventListener('click', () => startTour()));
    // Auto-offer once, after the UI settles.
    if (!localStorage.getItem('tourSeen')) {
        setTimeout(() => { if (!localStorage.getItem('tourSeen')) startTour(); }, 800);
    }
}

function isMobile() { return window.innerWidth <= 768; }

function startTour() {
    if (backdrop) return;
    idx = 0;

    backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2000;';

    highlight = document.createElement('div');
    highlight.style.cssText = 'position:fixed;z-index:2001;border:2px solid var(--accent);border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,0.65);pointer-events:none;transition:all 0.2s ease;';

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
    // On mobile, sidebar steps need the drawer open.
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('open', !!step.sidebar && isMobile());
    show();
}

function show() {
    if (!tooltip) return;
    const step = STEPS[idx];
    const target = document.querySelector(step.sel);
    if (!target) { next(); return; }

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
