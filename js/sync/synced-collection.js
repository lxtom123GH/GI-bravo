// ==========================================================================
// synced-collection.js — local-first collection backed by Firestore (opt-in).
// ==========================================================================
// Signed OUT: nothing here runs; the host app's existing local store is untouched.
// Signed IN: on start() we reconcile local <-> cloud once (first-sign-in merge), then
// keep them in sync via onSnapshot (cloud->local) and the host app's change event
// (local->cloud). All listeners are torn down on stop().
//
// The merge math lives in ./reconcile.js (pure, unit-tested). This file is the I/O shell.

import {
    collection, doc, getDocs, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { getFirebase } from './firebase-config.js';
import { reconcile } from './reconcile.js';

const SNAP_PREFIX = '__sync_snapshot__';

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
        now = () => Date.now()
    } = cfg;

    let user = null;          // { uid }
    let spaceId = null;       // null = personal scope
    let unsub = null;
    let running = false;
    let busy = false;
    let queued = false;

    const scopeKey = () => (spaceId ? `s:${spaceId}` : `u:${user.uid}`);
    const snapStoreKey = () => `${SNAP_PREFIX}${appId}:${name}:${scopeKey()}`;

    // Per-user:  apps/{appId}/users/{uid}/{name}                 (5 segments)
    // Per-space: apps/{appId}/spaces/{spaceId}/data/{name}/items (7 segments) — nested under
    //   a literal "data" so the items rule can't overlap the sibling "members" collection.
    const colRef = () => spaceId
        ? collection(db, 'apps', appId, 'spaces', spaceId, 'data', name, 'items')
        : collection(db, 'apps', appId, 'users', user.uid, name);

    const loadSnapshot = () => {
        try { return JSON.parse(localStorage.getItem(snapStoreKey())) || {}; }
        catch { return {}; }
    };
    const saveSnapshot = (s) => {
        try { localStorage.setItem(snapStoreKey(), JSON.stringify(s)); } catch {}
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

    async function syncOnce() {
        if (!running) return;
        if (busy) { queued = true; return; }
        busy = true;
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
            if (queued) { queued = false; syncOnce(); }
        }
    }

    return {
        name,
        /** Begin syncing for a signed-in user (optionally scoped to a space). */
        async start(signedInUser, opts = {}) {
            user = signedInUser;
            spaceId = opts.spaceId || null;
            running = true;
            await syncOnce();                       // initial / first-sign-in merge
            unsub = onSnapshot(colRef(), () => { syncOnce(); }, (err) => {
                console.warn(`[sync:${name}] snapshot error:`, err?.message || err);
            });
            return this;
        },
        /** Trigger a reconcile (call when local data changed). */
        push() { return syncOnce(); },
        /** Stop syncing and tear down listeners. Local data is left intact. */
        stop() {
            running = false;
            if (unsub) { unsub(); unsub = null; }
            user = null; spaceId = null;
        },
        // exposed for tests / diagnostics
        _syncOnce: syncOnce
    };
}
