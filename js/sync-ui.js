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
    getReferenceSamples, saveReferenceSamples, getColorTargets, saveColorTargets,
    getBlends, saveBlends, getRoasters, saveRoasters,
    getRoastLabSessions, saveRoastLabSessions
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
        // The shared roastery: blend recipes and roaster profiles travel with the space too.
        { key: 'blends', shared: true, evt: 'blendsUpdated',
          adapter: adapter(getBlends, saveBlends, 'blendsUpdated') },
        { key: 'roasters', shared: true, evt: 'roasterChanged',
          adapter: adapter(getRoasters, saveRoasters, 'roasterChanged') },
        // Calibration data is personal (device/user), not shared inventory.
        { key: 'referenceSamples', shared: false, evt: 'settingsImported',
          adapter: adapter(getReferenceSamples, saveReferenceSamples, 'settingsImported') },
        { key: 'colorTargets', shared: false, evt: 'settingsImported',
          adapter: adapter(getColorTargets, saveColorTargets, 'settingsImported') },
        // Roast Lab captures: personal debug/analysis trail (opt-in via the Roast Lab cloud toggle;
        // when off, the local list stays empty so nothing syncs). Records carry their own id +
        // updatedAt so the reconcile merges by id and several devices' captures pool together.
        { key: 'roastLabSessions', shared: false, evt: 'roastLabSessionsUpdated',
          adapter: adapter(getRoastLabSessions, saveRoastLabSessions, 'roastLabSessionsUpdated') }
    ];
}

let collections = [];   // [{ key, shared, evt, sc }]
let currentUser = null;
let activeSpaceId = null;

// Remember the last-used scope so signing in resumes it (e.g. a couple who mostly live in
// their shared "Home roastery" boot straight into it; Personal stays one tap away).
const DEFAULT_SCOPE_KEY = `${APP_ID}:defaultScope`;
const saveDefaultScope = (sid) => { try { localStorage.setItem(DEFAULT_SCOPE_KEY, sid || ''); } catch {} };
const loadDefaultScope = () => { try { return localStorage.getItem(DEFAULT_SCOPE_KEY) || null; } catch { return null; } };

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

// ---- Sidebar account affordance -------------------------------------------
// A persistent, low-key entry point so sign-in is always discoverable without a
// front-page login wall (the app stays fully usable signed out). Tapping it jumps
// to the Cloud Sync card in Roast History.

function updateSidebar(user) {
    const label = document.getElementById('syncSidebarLabel');
    if (!label) return;
    if (user) {
        label.textContent = `● ${user.displayName || user.email} · synced`;
        label.style.color = 'var(--success, #10b981)';
    } else {
        label.textContent = '☁️ Sign in to back up';
        label.style.color = '';
    }
}

export function openCloudSync() {
    const nav = document.querySelector('.nav-links li[data-target="history"]');
    if (nav) nav.click();                       // switches tab (+ closes the mobile drawer)
    const card = document.getElementById('cloudSyncCard');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.transition = 'box-shadow 0.3s';
    card.style.boxShadow = '0 0 0 2px var(--accent, #e2761b)';
    setTimeout(() => { card.style.boxShadow = ''; }, 1500);
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
            <form id="syncAuthForm" style="display: flex; flex-direction: column; gap: 6px; max-width: 340px;">
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 4px;">New here? Create an account — or use Google.</p>
                <label class="field-label" for="syncName">Display name</label>
                <input type="text" id="syncName" placeholder="e.g. Tom" autocomplete="name">
                <label class="field-label" for="syncEmail">Email</label>
                <input type="email" id="syncEmail" placeholder="you@example.com" autocomplete="email" required>
                <label class="field-label" for="syncPassword">Password</label>
                <input type="password" id="syncPassword" placeholder="At least 6 characters" autocomplete="new-password" required>
                <div id="syncAuthError" style="color: var(--danger, #ef4444); font-size: 0.85rem; display: none;"></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="submit" id="syncSignUp">Create account</button>
                    <button type="button" id="syncGoogle" class="secondary">Sign in with Google</button>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 6px 0 0;">
                    Already have an account?
                    <button type="button" id="syncSignIn" class="secondary" style="font-size: 0.8rem; padding: 4px 10px;">Sign in</button>
                </p>
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

    // The form's primary action is Create account — a new user filling in their details and
    // pressing Enter expects to sign up, not hit a failing sign-in.
    mount.querySelector('#syncAuthForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = mount.querySelector('#syncName').value.trim();
        try { await signUp({ ...creds(), displayName }); } catch (ex) { showErr(ex.message); }
    });
    mount.querySelector('#syncSignIn').addEventListener('click', async () => {
        try { await signIn(creds()); } catch (ex) { showErr(ex.message); }
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
            <select id="syncSpace"><option value="">Personal (only me)</option></select>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 4px 0 0;">
                Personal and each shared space are kept separate — switching just changes what you're
                viewing. Your personal beans stay private until you copy them in.
            </p>
            <div style="margin-top: 8px;">
                <button type="button" id="syncCopyIn" style="font-size: 0.85rem; display: none;">⬆️ Copy my personal beans &amp; roasts into this space</button>
            </div>
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
    const copyBtn = mount.querySelector('#syncCopyIn');
    const setMsg = (m) => { msg.textContent = m; };
    const updateCopyVis = () => { copyBtn.style.display = sel.value ? 'inline-block' : 'none'; };

    // Populate spaces I belong to.
    try {
        const spaces = await listMySpaces(APP_ID, user.uid);
        for (const s of spaces) {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = `${s.name} (shared · ${s.role})`;
            sel.appendChild(o);
        }
        sel.value = activeSpaceId || '';
        // The remembered default scope may no longer exist / be accessible (e.g. removed from
        // the space). <select>.value silently stays '' for a missing option — detect that and
        // fall back to Personal so we never strand the user on an empty, inaccessible scope.
        if ((activeSpaceId || '') !== sel.value) {
            activeSpaceId = null; saveDefaultScope(null);
            for (const c of collections.filter((x) => x.shared)) {
                try { await c.sc.setScope(null); } catch (e) { /* fail-soft */ }
            }
            sel.value = '';
        }
    } catch (e) { setMsg('Could not load shared spaces: ' + (e?.message || e)); }
    updateCopyVis();

    mount.querySelector('#syncSignOut').addEventListener('click', () => signOut());

    sel.addEventListener('change', async () => {
        activeSpaceId = sel.value || null;
        saveDefaultScope(activeSpaceId);
        // Re-scope shared collections — a clean view swap (no cross-scope bleed).
        for (const c of collections.filter((x) => x.shared)) {
            try { await c.sc.setScope(activeSpaceId); }
            catch (e) { console.warn('[sync] rescope failed:', e?.message || e); }
        }
        updateCopyVis();
        setMsg(activeSpaceId
            ? 'Viewing the shared space. Your personal beans stay private.'
            : 'Back to your personal data.');
    });

    copyBtn.addEventListener('click', async () => {
        if (!activeSpaceId) return setMsg('Switch to a shared space first.');
        let total = 0;
        for (const c of collections.filter((x) => x.shared)) {
            try { total += await c.sc.importItems(c.sc.peekScope(null)); }
            catch (e) { console.warn(`[sync] copy ${c.key} failed:`, e?.message || e); }
        }
        setMsg(total
            ? `Copied ${total} item(s) from your personal data into this space.`
            : 'Nothing new to copy — the space already has your items.');
    });

    mount.querySelector('#syncNewSpace').addEventListener('click', async () => {
        const name = prompt('Name this shared space (e.g. "Home roastery"):');
        if (!name) return;
        try {
            const id = await createSpace(APP_ID, user.uid, name);
            const o = document.createElement('option');
            o.value = id; o.textContent = `${name} (shared · owner)`;
            sel.appendChild(o); sel.value = id; sel.dispatchEvent(new Event('change'));
            setMsg('Shared space created (it starts empty). Use the copy button to add your beans, and "Share" to add people by email.');
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
                o.value = spaceId; o.textContent = 'Shared roastery (shared · owner)';
                sel.appendChild(o); sel.value = spaceId; sel.dispatchEvent(new Event('change'));
            }
            const r = await shareSpaceByEmail(APP_ID, spaceId, email, 'editor');
            setMsg(r.ok ? `Shared with ${email}. The space starts empty — use the copy button to add your beans.`
                : (r.reason === 'no-such-user'
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
        const sideBtn = document.getElementById('syncSidebarBtn');
        if (sideBtn) sideBtn.addEventListener('click', openCloudSync);
        onAuthState(async (user) => {
            currentUser = user;
            updateSidebar(user);
            try {
                if (user) {
                    activeSpaceId = loadDefaultScope();   // resume last-used scope
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
