// ==========================================================================
// reconcile.js — pure local-first sync engine (app-agnostic, no Firebase deps)
// ==========================================================================
// Conflict policy (per the portfolio spec): UNION BY ID (adds/deletes never conflict)
// + LAST-WRITE-WINS by `updatedAt` on a genuine same-id edit. Deletions are inferred
// from a "last synced" snapshot rather than tombstones: if an id we previously synced
// is now missing from one side, that side deleted it.
//
// This module is deliberately free of any I/O so it can be unit-tested exhaustively.
// `syncedCollection` feeds it local + cloud records and applies the returned plan.

// Stable content hash of a record, ignoring sync bookkeeping fields and key order.
export function hashRecord(rec, { ignore = ['updatedAt', '_syncedAt'] } = {}) {
    const seen = new WeakSet();
    const norm = (v) => {
        if (v === null || typeof v !== 'object') return v;
        if (seen.has(v)) return '[circular]';
        seen.add(v);
        if (Array.isArray(v)) return v.map(norm);
        const out = {};
        for (const k of Object.keys(v).sort()) {
            if (ignore.includes(k)) continue;
            out[k] = norm(v[k]);
        }
        return out;
    };
    return JSON.stringify(norm(rec));
}

const toMap = (list, idOf) => {
    const m = new Map();
    for (const r of list || []) m.set(String(idOf(r)), r);
    return m;
};

/**
 * Compute a two-way sync plan.
 *
 * @param {object}   args
 * @param {object[]} args.local       current local records
 * @param {object[]} args.cloud       current cloud records
 * @param {object}   [args.lastSynced] map id -> { updatedAt, hash } from the previous sync
 *                                      ({} or omitted = first sign-in merge: never deletes)
 * @param {number}   args.now         timestamp used to stamp records missing updatedAt
 * @param {(r)=>any} args.idOf
 * @param {(r)=>number} [args.updatedAtOf]  defaults to r.updatedAt || 0
 * @returns {{ localUpserts: object[], localDeletes: string[],
 *             cloudUpserts: object[], cloudDeletes: string[],
 *             nextSynced: object }}
 */
export function reconcile({ local, cloud, lastSynced = {}, now, idOf, updatedAtOf }) {
    const ua = updatedAtOf || ((r) => Number(r && r.updatedAt) || 0);
    const L = toMap(local, idOf);
    const C = toMap(cloud, idOf);
    const stamp = (r) => (ua(r) ? r : { ...r, updatedAt: now });

    const plan = { localUpserts: [], localDeletes: [], cloudUpserts: [], cloudDeletes: [], nextSynced: {} };
    const record = (r) => { plan.nextSynced[String(idOf(r))] = { updatedAt: ua(r), hash: hashRecord(r) }; };

    const ids = new Set([...L.keys(), ...C.keys(), ...Object.keys(lastSynced)]);

    for (const id of ids) {
        const l = L.get(id);
        const c = C.get(id);
        const s = lastSynced[id];

        // Both sides present -> in sync or an edit conflict.
        if (l && c) {
            const lh = hashRecord(l);
            const ch = hashRecord(c);
            if (lh === ch) { record(l); continue; }

            const localChanged = !s || s.hash !== lh;
            const cloudChanged = !s || s.hash !== ch;

            let winner;
            if (localChanged && !cloudChanged) winner = stamp(l);          // only local edited
            else if (cloudChanged && !localChanged) winner = c;            // only cloud edited
            else winner = ua(l) >= ua(c) ? stamp(l) : c;                   // true conflict -> LWW

            if (winner === c) plan.localUpserts.push(c);
            else plan.cloudUpserts.push(winner);
            record(winner);
            continue;
        }

        // Local only.
        if (l && !c) {
            // Present locally, gone from cloud. Honour the cloud's delete only if the
            // local copy is UNTOUCHED since the last sync. If we edited it here since
            // then, this is an edit-vs-delete conflict: a delete must not silently
            // discard a concurrent edit, so resurrect it by re-pushing the edit up
            // (edit wins over delete — deletions are tombstone-free, so there is no
            // delete timestamp to last-write-wins against).
            if (s && hashRecord(l) === s.hash) { plan.localDeletes.push(id); }
            else { const w = stamp(l); plan.cloudUpserts.push(w); record(w); }
            continue;
        }

        // Cloud only.
        if (!l && c) {
            // Mirror of the above: gone locally, present in cloud. Honour the local
            // delete only if the cloud copy is untouched since the last sync; if the
            // cloud copy was edited, preserve that edit by pulling it back down.
            if (s && hashRecord(c) === s.hash) { plan.cloudDeletes.push(id); }
            else { plan.localUpserts.push(c); record(c); }
            continue;
        }

        // Neither present (only in lastSynced) -> gone everywhere; drop from snapshot.
    }

    return plan;
}
