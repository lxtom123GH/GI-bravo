// ==========================================================================
// synced-collection.js — local-first collection backed by Firestore (opt-in).
// ==========================================================================
// Signed OUT: nothing here runs; the host app's existing local store is untouched.
// Signed IN: on start() we reconcile local <-> cloud once (first-sign-in merge), then
// keep them in sync via onSnapshot (cloud->local) and the host app's change event
// (local->cloud). All listeners are torn down on stop().
//
// SCOPE ISOLATION (no cross-scope bleed). There is ONE live host store per collection
// (e.g. localStorage 'coffeePantry'), but a user may have several scopes: Personal plus
// each shared space. We keep the live store == the ACTIVE scope's data, and stash every
// INACTIVE scope's data in a per-scope localStorage cache. Switching scope = save the
// live store to the leaving scope's cache, load the entering scope's cache into the live
// store, then reconcile. Invariant: **whenever signed out, the live store holds Personal
// data** (sign-out swaps the view back), so the app never shows a space's data as if it
// were the user's own.
//
// The merge math lives in ./reconcile.js (pure, unit-tested). This file is the I/O shell.

import {
    collection, doc, getDocs, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { getFirebase } from './firebase-config.js';
import { reconcile } from './reconcile.js';

const SNAP_PREFIX = '__sync_snapshot__';
const LOCAL_PREFIX = '__sync_local__';   // per-scope cache of INACTIVE scopes' local data

// Key/value persistence for snapshots + per-scope caches. Defaults to localStorage (no-op
// and safe when it's unavailable, e.g. SSR/tests); injectable via cfg.storage for tests.
const defaultStorage = {
    getItem(k) { try { return (typeof localStorage !== 'undefined') ? localStorage.getItem(k) : null; } catch { return null; } },
    setItem(k, v) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch {} }
};

/**
 * @param {object} cfg
 * @param {string} cfg.appId                 namespace (e.g. "gi-bravo")
 * @param {string} cfg.name                  collection name (e.g. "pantry")
 * @param {object} cfg.localAdapter          { read(): rec[], write(rec[]): void }
 * @param {(r)=>any}   [cfg.idOf]            default r.id
 * @param {(r)=>number}[cfg.updatedAtOf]     default r.updatedAt || 0
 * @param {(r)=>object}[cfg.toCloud]         local -> cloud doc data
 * @param {(d)=>object}[cfg.fromCloud]       cloud doc data -> local record
 * @param {object} [cfg.db]                  injected Firestore (default: shared singleton)
 * @param {()=>number} [cfg.now]             clock (default Date.now) — injectable for tests
 */
export function createSyncedCollection(cfg) {
    const {
        appId, name, localAdapter,
        idOf = (r) => r.id,
        updatedAtOf = (r) => Number(r && r.updatedAt) || 0,
        toCloud = (r) => r,
        fromCloud = (d) => d,
        db = getFirebase().db,
        now = () => Date.now(),
        storage = defaultStorage
    } = cfg;

    let user = null;          // { uid }
    let spaceId = null;       // null = personal scope
    let unsub = null;
    let running = false;
    let busy = false;
    let queued = false;
    let busyPromise = Promise.resolve();   // resolves when the in-flight (+ queued) cycle finishes

    // Scope keys: a space -> "s:{spaceId}", personal -> "u:{uid}".
    const keyFor = (sid) => (sid ? `s:${sid}` : `u:${user.uid}`);
    const snapStoreKey = () => `${SNAP_PREFIX}${appId}:${name}:${keyFor(spaceId)}`;
    const cacheKey = (sid) => `${LOCAL_PREFIX}${appId}:${name}:${keyFor(sid)}`;

    const saveCache = (sid, list) => {
        try { storage.setItem(cacheKey(sid), JSON.stringify(list || [])); } catch {}
    };
    // Returns the cached list, or null if this scope has never been cached.
    const loadCache = (sid) => {
        try { const v = storage.getItem(cacheKey(sid)); return v ? JSON.parse(v) : null; }
        catch { return null; }
    };

    // Per-user:  apps/{appId}/users/{uid}/{name}                 (5 segments)
    // Per-space: apps/{appId}/spaces/{spaceId}/data/{name}/items (7 segments) — nested under
    //   a literal "data" so the items rule can't overlap the sibling "members" collection.
    const colRef = () => spaceId
        ? collection(db, 'apps', appId, 'spaces', spaceId, 'data', name, 'items')
        : collection(db, 'apps', appId, 'users', user.uid, name);

    const loadSnapshot = () => {
        try { return JSON.parse(storage.getItem(snapStoreKey())) || {}; }
        catch { return {}; }
    };
    const saveSnapshot = (s) => {
        try { storage.setItem(snapStoreKey(), JSON.stringify(s)); } catch {}
    };

    async function fetchCloud() {
        const snap = await getDocs(colRef());
        return snap.docs.map((d) => fromCloud({ id: d.id, ...d.data() }));
    }

    async function applyPlan(plan) {
        // Local side.
        if (plan.localDeletes.length || plan.localUpserts.length) {
            const list = localAdapter.read();
            const byId = new Map(list.map((r) => [String(idOf(r)), r]));
            for (const id of plan.localDeletes) byId.delete(String(id));
            for (const r of plan.localUpserts) byId.set(String(idOf(r)), r);
            localAdapter.write([...byId.values()]);
        }
        // Cloud side.
        if (plan.cloudUpserts.length || plan.cloudDeletes.length) {
            const batch = writeBatch(db);
            for (const r of plan.cloudUpserts) {
                batch.set(doc(colRef(), String(idOf(r))), { ...toCloud(r), _syncedAt: serverTimestamp() });
            }
            for (const id of plan.cloudDeletes) batch.delete(doc(colRef(), String(id)));
            await batch.commit();
        }
    }

    function syncOnce() {
        if (!running) return Promise.resolve();
        if (busy) { queued = true; return busyPromise; }   // coalesce; caller awaits this cycle
        busy = true;
        busyPromise = (async () => {
            try {
                const local = localAdapter.read();
                const cloud = await fetchCloud();
                const plan = reconcile({
                    local, cloud, lastSynced: loadSnapshot(), now: now(), idOf, updatedAtOf
                });
                await applyPlan(plan);
                saveSnapshot(plan.nextSynced);
            } catch (e) {
                console.warn(`[sync:${name}] reconcile failed (will retry on next change):`, e?.message || e);
            } finally {
                busy = false;
                if (queued) { queued = false; await syncOnce(); }   // drain a coalesced request
            }
        })();
        return busyPromise;
    }

    function subscribe() {
        unsub = onSnapshot(colRef(), () => { syncOnce(); }, (err) => {
            console.warn(`[sync:${name}] snapshot error:`, err?.message || err);
        });
    }

    // Swap the live store from the current scope's view to `target`'s view, preserving each
    // side in its per-scope cache so nothing bleeds across scopes.
    function loadScopeView(target) {
        // Stash the scope we're leaving.
        saveCache(spaceId, localAdapter.read());
        spaceId = target || null;
        // Show the scope we're entering (empty if it's never been cached locally — cloud
        // data, if any, arrives on the reconcile that follows).
        localAdapter.write(loadCache(spaceId) || []);
    }

    return {
        name,
        /** Begin syncing for a signed-in user (optionally scoped to a space). */
        async start(signedInUser, opts = {}) {
            user = signedInUser;
            const target = opts.spaceId || null;
            // Invariant: the live store currently holds PERSONAL data. If we're booting
            // straight into a space, preserve personal and show the space's cache; if we're
            // in personal scope, leave the live store as-is so first-sign-in merges it up.
            if (target) {
                saveCache(null, localAdapter.read());
                localAdapter.write(loadCache(target) || []);
            }
            spaceId = target;
            running = true;
            await syncOnce();                       // initial / first-sign-in merge
            subscribe();
            return this;
        },
        /** Switch the active scope (Personal <-> a space) without bleeding data across. */
        async setScope(newSpaceId) {
            const target = newSpaceId || null;
            if (target === spaceId) return;
            if (unsub) { unsub(); unsub = null; }
            loadScopeView(target);
            await syncOnce();
            subscribe();
        },
        /** Union `list` into the active scope's live store and push up (e.g. "copy my pantry
         *  into this space"). New ids only — never clobbers an existing item. */
        async importItems(list) {
            const cur = localAdapter.read();
            const byId = new Map(cur.map((r) => [String(idOf(r)), r]));
            let added = 0;
            for (const r of list || []) {
                const id = String(idOf(r));
                if (!byId.has(id)) { byId.set(id, r); added++; }
            }
            if (added) { localAdapter.write([...byId.values()]); await syncOnce(); }
            return added;
        },
        /** Read another scope's locally-cached items (e.g. Personal) without switching to it. */
        peekScope(sid) { return loadCache(sid || null) || []; },
        /** Trigger a reconcile (call when local data changed). */
        push() { return syncOnce(); },
        /** Stop syncing and tear down listeners. On sign-out, swap the live store back to the
         *  Personal view so the signed-out app never shows a space's data. Local data intact. */
        stop() {
            running = false;
            if (unsub) { unsub(); unsub = null; }
            if (user && spaceId) {              // leaving a space on sign-out
                saveCache(spaceId, localAdapter.read());
                localAdapter.write(loadCache(null) || []);
            }
            user = null; spaceId = null;
        },
        // exposed for tests / diagnostics
        _syncOnce: syncOnce,
        get _spaceId() { return spaceId; }
    };
}
