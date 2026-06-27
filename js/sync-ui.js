// ==========================================================================
// sync-ui.js — GI-bravo glue for the app-agnostic portfolio-sync module.
// ==========================================================================
// Defines this app's local adapters, manages synced collections across auth changes,
// and renders the opt-in "Cloud Sync" + "Share" UI in the History tab. Signed OUT, this
// module does nothing to the local data path — the app behaves exactly as before.

import {
    onAuthState, signUp, signIn, signInWithGoogle, signOut, sendReset,
    createSyncedCollection, createSpace, shareSpaceByEmail, listMySpaces,
    isPlaceholderConfig, useEmulator
} from './sync/index.js';
import {
    getPantry, savePantry, getRoastHistory, saveRoastHistory,
    getReferenceSamples, saveReferenceSamples, getColorTargets, saveColorTargets
} from './storage.js';

const APP_ID = 'gi-bravo';

// A local adapter whose write() also fires the app's existing refresh event so the UI
// re-renders when cloud changes land. `shared` collections re-scope to a selected space.
function defs() {
    const adapter = (read, write, evt) => ({
        read,
        write: (list) => { write(list); window.dispatchEvent(new Event(evt)); }
    });
    return [
        { key: 'pantry', shared: true, evt: 'pantryUpdated',
          adapter: adapter(getPantry, savePantry, 'pantryUpdated') },
        { key: 'roastHistory', shared: true, evt: 'historyUpdated',
          adapter: adapter(getRoastHistory, saveRoastHistory, 'historyUpdated') },
        // Calibration data is personal (device/user), not shared inventory.
        { key: 'referenceSamples', shared: false, evt: 'settingsImported',
          adapter: adapter(getReferenceSamples, saveReferenceSamples, 'settingsImported') },
        { key: 'colorTargets', shared: false, evt: 'settingsImported',
          adapter: adapter(getColorTargets, saveColorTargets, 'settingsImported') }
    ];
}

let collections = [];   // [{ key, shared, evt, sc }]
let currentUser = null;
let activeSpaceId = null;

function buildCollections() {
    collections = defs().map((d) => ({
        ...d,
        sc: createSyncedCollection({ appId: APP_ID, name: d.key, localAdapter: d.adapter })
    }));
}

async function startAll(user) {
    for (const c of collections) {
        const spaceId = c.shared ? activeSpaceId : null;
        try { await c.sc.start(user, { spaceId }); }
        catch (e) { console.warn(`[sync] start ${c.key} failed:`, e?.message || e); }
    }
}
function stopAll() {
    for (const c of collections) c.sc.stop();
}

// Push local changes up when the app dispatches its refresh events (debounced per event).
const debouncers = {};
function wireLocalPush() {
    const events = [...new Set(defs().map((d) => d.evt))];
    for (const evt of events) {
        window.addEventListener(evt, () => {
            if (!currentUser) return;
            clearTimeout(debouncers[evt]);
            debouncers[evt] = setTimeout(() => {
                collections.filter((c) => c.evt === evt).forEach((c) => c.sc.push());
            }, 400);
        });
    }
}

// ---- UI -------------------------------------------------------------------

function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

function renderSignedOut(mount) {
    const note = (isPlaceholderConfig && !useEmulator)
        ? `<p style="color: var(--text-muted); font-size: 0.8rem;">⚠️ Cloud sync isn't configured yet (placeholder Firebase config). It works against the local emulator in dev; production needs the real config — see PORTFOLIO_AUTH_SYNC.md.</p>`
        : '';
    mount.innerHTML = '';
    mount.appendChild(el(`
        <div>
            <h3>Cloud Sync <span style="font-weight: normal; font-size: 0.8rem; color: var(--text-muted);">(optional)</span></h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 10px;">
                Your data stays on this device. Sign in to back it up and sync across devices —
                everything keeps working offline and signed out.
            </p>
            ${note}
            <form id="syncAuthForm" style="display: flex; flex-direction: column; gap: 8px; max-width: 320px;">
                <input type="text" id="syncName" placeholder="Display name (for new account)" autocomplete="name">
                <input type="email" id="syncEmail" placeholder="Email" autocomplete="email" required>
                <input type="password" id="syncPassword" placeholder="Password" autocomplete="current-password" required>
                <div id="syncAuthError" style="color: var(--danger, #ef4444); font-size: 0.85rem; display: none;"></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="submit" id="syncSignIn">Sign in</button>
                    <button type="button" id="syncSignUp">Create account</button>
                    <button type="button" id="syncGoogle">Sign in with Google</button>
                </div>
                <a href="#" id="syncForgot" style="font-size: 0.8rem;">Forgot password?</a>
            </form>
        </div>
    `));

    const err = mount.querySelector('#syncAuthError');
    const showErr = (m) => { err.textContent = m; err.style.display = 'block'; };
    const creds = () => ({
        email: mount.querySelector('#syncEmail').value.trim(),
        password: mount.querySelector('#syncPassword').value
    });

    mount.querySelector('#syncAuthForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await signIn(creds()); } catch (ex) { showErr(ex.message); }
    });
    mount.querySelector('#syncSignUp').addEventListener('click', async () => {
        const displayName = mount.querySelector('#syncName').value.trim();
        try { await signUp({ ...creds(), displayName }); } catch (ex) { showErr(ex.message); }
    });
    mount.querySelector('#syncGoogle').addEventListener('click', async () => {
        try { await signInWithGoogle(); } catch (ex) { showErr(ex.message); }
    });
    mount.querySelector('#syncForgot').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = mount.querySelector('#syncEmail').value.trim();
        if (!email) return showErr('Enter your email first.');
        try { await sendReset(email); showErr('✅ Reset email sent.'); } catch (ex) { showErr(ex.message); }
    });
}

async function renderSignedIn(mount, user) {
    mount.innerHTML = '';
    mount.appendChild(el(`
        <div>
            <h3>Cloud Sync <span style="font-weight: normal; font-size: 0.8rem; color: var(--success, #10b981);">● synced</span></h3>
            <p style="font-size: 0.9rem; margin-bottom: 10px;">
                Signed in as <strong>${user.displayName || user.email}</strong>.
                <button type="button" id="syncSignOut" style="font-size: 0.8rem; padding: 3px 8px;">Sign out</button>
            </p>
            <label for="syncSpace"><strong>Pantry &amp; roasts scope</strong></label>
            <select id="syncSpace"><option value="">Personal (just me)</option></select>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; align-items: center;">
                <input type="email" id="syncShareEmail" placeholder="Share with (email)" style="flex: 1; min-width: 160px;">
                <button type="button" id="syncShareBtn" style="font-size: 0.85rem;">Share</button>
                <button type="button" id="syncNewSpace" style="font-size: 0.85rem;">New shared space</button>
            </div>
            <div id="syncShareMsg" style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;"></div>
        </div>
    `));

    const sel = mount.querySelector('#syncSpace');
    const msg = mount.querySelector('#syncShareMsg');
    const setMsg = (m) => { msg.textContent = m; };

    // Populate spaces I belong to.
    try {
        const spaces = await listMySpaces(APP_ID, user.uid);
        for (const s of spaces) {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = `${s.name} (${s.role})`;
            sel.appendChild(o);
        }
        sel.value = activeSpaceId || '';
    } catch (e) { setMsg('Could not load shared spaces: ' + (e?.message || e)); }

    mount.querySelector('#syncSignOut').addEventListener('click', () => signOut());

    sel.addEventListener('change', async () => {
        activeSpaceId = sel.value || null;
        // Re-scope shared collections to the chosen space.
        for (const c of collections.filter((x) => x.shared)) {
            c.sc.stop();
            try { await c.sc.start(currentUser, { spaceId: activeSpaceId }); }
            catch (e) { console.warn('[sync] rescope failed:', e?.message || e); }
        }
        setMsg(activeSpaceId ? 'Now syncing pantry & roasts to the shared space.' : 'Back to personal data.');
    });

    mount.querySelector('#syncNewSpace').addEventListener('click', async () => {
        const name = prompt('Name this shared space (e.g. "Home roastery"):');
        if (!name) return;
        try {
            const id = await createSpace(APP_ID, user.uid, name);
            const o = document.createElement('option');
            o.value = id; o.textContent = `${name} (owner)`;
            sel.appendChild(o); sel.value = id; sel.dispatchEvent(new Event('change'));
            setMsg('Shared space created. Use "Share" to add people by email.');
        } catch (e) { setMsg('Could not create space: ' + (e?.message || e)); }
    });

    mount.querySelector('#syncShareBtn').addEventListener('click', async () => {
        const email = mount.querySelector('#syncShareEmail').value.trim();
        if (!email) return setMsg('Enter an email to share with.');
        let spaceId = sel.value;
        try {
            if (!spaceId) { // auto-create a space the first time they share
                spaceId = await createSpace(APP_ID, user.uid, 'Shared roastery');
                const o = document.createElement('option');
                o.value = spaceId; o.textContent = 'Shared roastery (owner)';
                sel.appendChild(o); sel.value = spaceId; sel.dispatchEvent(new Event('change'));
            }
            const r = await shareSpaceByEmail(APP_ID, spaceId, email, 'editor');
            setMsg(r.ok ? `Shared with ${email}.` : (r.reason === 'no-such-user'
                ? `${email} has no account yet — ask them to sign in once, then share again.`
                : 'Could not share.'));
        } catch (e) { setMsg('Could not share: ' + (e?.message || e)); }
    });
}

export function initSync() {
    const mount = document.getElementById('cloudSyncCard');
    if (!mount) return;
    // Defensive: a Firebase init/config failure must NEVER break the signed-out app.
    try {
        buildCollections();
        wireLocalPush();
        onAuthState(async (user) => {
            currentUser = user;
            try {
                if (user) {
                    await startAll(user);
                    await renderSignedIn(mount, user);
                } else {
                    activeSpaceId = null;
                    stopAll();
                    renderSignedOut(mount);
                }
            } catch (e) {
                console.warn('[sync] auth handler failed:', e?.message || e);
            }
        });
    } catch (e) {
        console.warn('[sync] disabled (init failed):', e?.message || e);
        mount.innerHTML = '<h3>Cloud Sync</h3><p style="color: var(--text-muted); font-size: 0.85rem;">Cloud sync is unavailable in this environment. Your data is safe locally.</p>';
    }
}
