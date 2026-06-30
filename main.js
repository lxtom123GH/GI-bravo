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
import { initBeanFields } from './js/beanfields.js';
import { initPrep } from './js/prep.js';
import { initRoasters } from './js/roasters.js';
import { initBlends } from './js/blends.js';
import { initRoasterPanel } from './js/roaster-panel.js';
import { initReceipts } from './js/receipts.js';
import { initSwipe } from './js/swipe.js';

// Cloud sync is OPT-IN and pulls in Firebase (~660 KB). Load that chunk only on real
// intent — the user clicks the sync button, OR they have a persisted session to resume.
// A signed-out first-time visitor never downloads Firebase, so first load stays lean
// (this is the TBT win: previously the chunk loaded on idle for *everyone*).
let syncReady = null;
function loadSync() {
    if (!syncReady) {
        syncReady = import('./js/sync-ui.js')
            .then((m) => { m.initSync(); return m; })
            .catch((e) => { console.warn('[sync] module failed to load:', e?.message || e); syncReady = null; return null; });
    }
    return syncReady;
}

// Firebase-free probe: does Firebase Auth already have a persisted session to resume?
// Reads Firebase's own IndexedDB (firebaseLocalStorageDb) WITHOUT loading the SDK, so a
// returning signed-in user still auto-resumes sync. If Firebase ever renames this store
// the probe just returns false → the user clicks the sync button instead (graceful).
function hasPersistedAuthSession() {
    return new Promise((resolve) => {
        let settled = false;
        const done = (v) => { if (!settled) { settled = true; resolve(v); } };
        try {
            const req = indexedDB.open('firebaseLocalStorageDb');
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('firebaseLocalStorage')) { db.close(); return done(false); }
                try {
                    const keysReq = db.transaction('firebaseLocalStorage', 'readonly')
                        .objectStore('firebaseLocalStorage').getAllKeys();
                    keysReq.onsuccess = () => { const ks = keysReq.result || []; db.close(); done(ks.some((k) => String(k).startsWith('firebase:authUser:'))); };
                    keysReq.onerror = () => { db.close(); done(false); };
                } catch { db.close(); done(false); }
            };
            req.onerror = () => done(false);
        } catch { done(false); }
    });
}

function initSyncLazy() {
    const sideBtn = document.getElementById('syncSidebarBtn');
    // First click loads the module AND opens the panel; once loaded, sync-ui's own
    // handler opens it (the `wasLoading` guard avoids a double-open).
    if (sideBtn) sideBtn.addEventListener('click', () => {
        const wasLoading = !!syncReady;
        loadSync().then((m) => { if (!wasLoading && m && m.openCloudSync) m.openCloudSync(); });
    });
    // Returning signed-in users: resume sync automatically, deferred to idle so it
    // doesn't compete with first paint (same timing the old eager path used).
    hasPersistedAuthSession().then((has) => {
        if (!has) return;
        if ('requestIdleCallback' in window) requestIdleCallback(() => loadSync(), { timeout: 3000 });
        else setTimeout(() => loadSync(), 1200);
    }).catch(() => {});
}

function init() {
    initTier();
    initTabs();
    initRoasters();
    initRoastDashboard();
    initRoasterPanel();
    initAudioSystem();
    initPantry();
    initBeanFields();
    initPrep();
    initReceipts();
    initBlends();
    initHistory();
    initDemo();
    initTour();
    initHints();
    initCustomise();
    initSwipe();
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
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:3000;background:var(--card-bg);color:var(--text-main);border:1px solid var(--accent);border-radius:8px;padding:10px 14px;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;gap:12px;align-items:center;font-size:0.9rem;';
    bar.innerHTML = '<span>A new version is available.</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Reload';
    btn.style.cssText = 'font-size:0.85rem;padding:5px 12px;';
    btn.addEventListener('click', () => location.reload());
    const dismiss = document.createElement('button');
    dismiss.textContent = 'Later';
    dismiss.style.cssText = 'font-size:0.85rem;padding:5px 12px;background:transparent;color:var(--text-main);border:1px solid var(--text-muted);';
    dismiss.addEventListener('click', () => bar.remove());
    bar.append(btn, dismiss);
    document.body.appendChild(bar);
}
