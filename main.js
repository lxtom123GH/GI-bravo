// Entry point: wires together all UI modules for the Coffee Roasting Tracker.
import { initTabs, initTier } from './js/ui.js';
import { initDemo } from './js/demo.js';
import { initTour } from './js/tour.js';
import { initHints } from './js/hints.js';
import { initRoastDashboard } from './js/roast.js';
import { initAudioSystem } from './js/audio.js';
import { initPantry } from './js/pantry.js';
import { initHistory } from './js/history.js';
import { initCustomise } from './js/customise.js';
import { initPrep } from './js/prep.js';

// Cloud sync is OPT-IN and pulls in Firebase (~large), so load it lazily after the app
// is interactive — the signed-out first paint stays as lean as before.
function initSyncLazy() {
    const go = () => import('./js/sync-ui.js')
        .then((m) => m.initSync())
        .catch((e) => console.warn('[sync] module failed to load:', e?.message || e));
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1200);
}

function init() {
    initTier();
    initTabs();
    initRoastDashboard();
    initAudioSystem();
    initPantry();
    initPrep();
    initHistory();
    initDemo();
    initTour();
    initHints();
    initCustomise();
    initSyncLazy();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Register the service worker for offline / installable PWA support, and show a
// small banner when a new version has been deployed.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { scope: './' })
            .then(reg => {
                reg.addEventListener('updatefound', () => {
                    const sw = reg.installing;
                    if (!sw) return;
                    sw.addEventListener('statechange', () => {
                        // A new version finished installing while an old one was controlling the page.
                        if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
                    });
                });
            })
            .catch(err => console.warn('Service worker registration failed:', err));
    });
}

function showUpdateBanner() {
    if (document.getElementById('updateBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'updateBanner';
    bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:3000;background:var(--card-bg);color:var(--text-main);border:1px solid var(--accent);border-radius:8px;padding:10px 14px;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;gap:12px;align-items:center;font-size:0.9rem;';
    bar.innerHTML = '<span>A new version is available.</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Reload';
    btn.style.cssText = 'font-size:0.85rem;padding:5px 12px;';
    btn.addEventListener('click', () => location.reload());
    const dismiss = document.createElement('button');
    dismiss.textContent = 'Later';
    dismiss.style.cssText = 'font-size:0.85rem;padding:5px 12px;background:var(--border-color);';
    dismiss.addEventListener('click', () => bar.remove());
    bar.append(btn, dismiss);
    document.body.appendChild(bar);
}
