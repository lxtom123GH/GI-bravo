// ==========================================================================
// devmode.js — owner-only Dev/Test mode (login-gated).
// ==========================================================================
// While the OWNER is signed in, the app runs in "Dev mode": every roast is
// captured (Roast Lab) and the MFCC + shadow-detector sweep run automatically,
// so test roasts always produce comparison data WITHOUT the owner having to
// remember to flip toggles mid-roast. A banner shows it's on.
//
// For anyone else (Mum, future users) nothing changes — this is the
// Dev → Production boundary: production is simply "not the owner". When we're
// happy with detection we just stop shipping to the owner allowlist (or gate it
// behind a build flag) and the same code base is the production app.
//
// Gating is keyed on the signed-in email from the Firebase auth pilot. We do NOT
// import the sync/Firebase chunk here — that would defeat the lazy-load (first
// paint stays Firebase-free). Instead sync-ui.js dispatches a window
// `authUserChanged` event and we react to it. If the user never signs in, the
// event never fires and Dev mode never activates — the app is untouched.

import { setDevModeCaptureLock } from './audio.js';

// Owner allowlist. Anyone here gets Dev mode; everyone else gets the normal app.
// Lower-cased compare. Easy to extend, or move to config when we formalise prod.
const OWNER_EMAILS = ['lxtom123@gmail.com'];

// Per-device stickiness: once the owner has been seen on a device, remember it so
// a brief auth gap (e.g. the lazy sync chunk still loading, or a token refresh
// mid-roast) can't silently stop capture. Cleared the moment a non-owner /
// signed-out state is observed on this device.
const STICKY_KEY = 'devModeOwnerDevice';

let active = false;

function isOwner(user) {
    return !!(user && user.email && OWNER_EMAILS.includes(String(user.email).toLowerCase()));
}

function ensureBanner() {
    let el = document.getElementById('devModeBanner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'devModeBanner';
    el.setAttribute('role', 'status');
    el.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:4000',
        'background:#7c3aed', 'color:#fff', 'font-size:0.78rem', 'font-weight:600',
        'text-align:center', 'padding:4px 8px', 'letter-spacing:0.02em',
        'box-shadow:0 1px 4px rgba(0,0,0,0.35)'
    ].join(';');
    el.textContent = '🧪 Dev mode — logging every roast (Roast Lab + MFCC + shadow detectors on)';
    document.body.appendChild(el);
    return el;
}

function apply(on) {
    if (on === active) return;
    active = on;
    // Never let a UI hiccup break the app.
    try { setDevModeCaptureLock(on); } catch (e) { console.warn('[devmode] capture lock skipped:', e && e.message); }
    if (on) {
        ensureBanner().style.display = 'block';
        document.body.classList.add('dev-mode');
    } else {
        const banner = document.getElementById('devModeBanner');
        if (banner) banner.style.display = 'none';
        document.body.classList.remove('dev-mode');
    }
}

/** True while owner-only Dev mode is active. */
export function isDevMode() { return active; }

export function initDevMode() {
    // Optimistic: if the owner has used this device before, turn Dev mode on
    // immediately so early actions (starting a roast before the sync chunk has
    // finished loading) are still captured. The auth event reconciles below.
    let sticky = false;
    try { sticky = localStorage.getItem(STICKY_KEY) === 'true'; } catch { /* private mode */ }
    if (sticky) apply(true);

    // Authoritative signal: sync-ui dispatches this whenever Firebase auth state
    // changes (fires with the resumed session on load for a signed-in owner).
    window.addEventListener('authUserChanged', (e) => {
        const owner = isOwner(e && e.detail && e.detail.user);
        apply(owner);
        try { localStorage.setItem(STICKY_KEY, owner ? 'true' : 'false'); } catch { /* ignore */ }
    });
}
