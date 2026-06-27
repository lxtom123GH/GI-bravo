import { describe, it, expect } from 'vitest';
import { reconcile, hashRecord } from '../../js/sync/reconcile.js';

const idOf = (r) => r.id;
const run = (local, cloud, lastSynced = {}, now = 1000) =>
    reconcile({ local, cloud, lastSynced, now, idOf });

describe('hashRecord', () => {
    it('ignores updatedAt/_syncedAt and key order', () => {
        const a = { id: '1', name: 'x', qty: 5, updatedAt: 1 };
        const b = { qty: 5, name: 'x', id: '1', updatedAt: 999, _syncedAt: 7 };
        expect(hashRecord(a)).toBe(hashRecord(b));
    });
    it('differs when content differs', () => {
        expect(hashRecord({ id: '1', qty: 5 })).not.toBe(hashRecord({ id: '1', qty: 6 }));
    });
});

describe('first-sign-in merge (lastSynced empty, never deletes)', () => {
    it('pushes local-only up and pulls cloud-only down', () => {
        const local = [{ id: 'a', v: 1 }];
        const cloud = [{ id: 'b', v: 2 }];
        const p = run(local, cloud);
        expect(p.cloudUpserts.map(idOf)).toEqual(['a']);
        expect(p.localUpserts.map(idOf)).toEqual(['b']);
        expect(p.localDeletes).toEqual([]);
        expect(p.cloudDeletes).toEqual([]);
    });

    it('stamps updatedAt on records pushed without one', () => {
        const p = run([{ id: 'a', v: 1 }], []);
        expect(p.cloudUpserts[0].updatedAt).toBe(1000);
    });

    it('resolves id-collision by last-write-wins', () => {
        const local = [{ id: 'a', v: 'L', updatedAt: 50 }];
        const cloud = [{ id: 'a', v: 'C', updatedAt: 80 }];
        const p = run(local, cloud);
        // cloud newer -> pulled into local, nothing pushed
        expect(p.localUpserts).toEqual([{ id: 'a', v: 'C', updatedAt: 80 }]);
        expect(p.cloudUpserts).toEqual([]);
    });

    it('local newer wins the collision', () => {
        const local = [{ id: 'a', v: 'L', updatedAt: 90 }];
        const cloud = [{ id: 'a', v: 'C', updatedAt: 80 }];
        const p = run(local, cloud);
        expect(p.cloudUpserts).toEqual([{ id: 'a', v: 'L', updatedAt: 90 }]);
        expect(p.localUpserts).toEqual([]);
    });
});

describe('union-by-id (no conflicts on independent adds)', () => {
    it('keeps both sides additions', () => {
        const p = run([{ id: 'a', v: 1 }], [{ id: 'b', v: 2 }], {});
        const finalIds = new Set([
            ...['a'], // local already has a; b pulled
            ...p.localUpserts.map(idOf)
        ]);
        expect(finalIds.has('b')).toBe(true);
        expect(p.cloudUpserts.map(idOf)).toContain('a');
    });
});

describe('edits after a prior sync', () => {
    const synced = (rec) => ({ [rec.id]: { updatedAt: rec.updatedAt || 0, hash: hashRecord(rec) } });

    it('only-local-edited pushes local up (no ping-pong even if updatedAt stale)', () => {
        const base = { id: 'a', v: 'orig', updatedAt: 10 };
        const last = synced(base);
        const local = [{ id: 'a', v: 'EDITED', updatedAt: 10 }]; // edited but updatedAt not bumped
        const cloud = [base];
        const p = run(local, cloud, last);
        expect(p.cloudUpserts.map((r) => r.v)).toEqual(['EDITED']);
        expect(p.localUpserts).toEqual([]);
    });

    it('only-cloud-edited pulls cloud down', () => {
        const base = { id: 'a', v: 'orig', updatedAt: 10 };
        const last = synced(base);
        const local = [base];
        const cloud = [{ id: 'a', v: 'CLOUDEDIT', updatedAt: 10 }];
        const p = run(local, cloud, last);
        expect(p.localUpserts.map((r) => r.v)).toEqual(['CLOUDEDIT']);
        expect(p.cloudUpserts).toEqual([]);
    });

    it('both edited = true conflict resolved by LWW', () => {
        const base = { id: 'a', v: 'orig', updatedAt: 10 };
        const last = synced(base);
        const local = [{ id: 'a', v: 'L', updatedAt: 20 }];
        const cloud = [{ id: 'a', v: 'C', updatedAt: 30 }];
        const p = run(local, cloud, last);
        expect(p.localUpserts.map((r) => r.v)).toEqual(['C']); // cloud newer
    });

    it('no-op when both already equal', () => {
        const rec = { id: 'a', v: 1, updatedAt: 5 };
        const p = run([rec], [rec], synced(rec));
        expect(p.localUpserts).toEqual([]);
        expect(p.cloudUpserts).toEqual([]);
        expect(p.localDeletes).toEqual([]);
        expect(p.cloudDeletes).toEqual([]);
    });
});

describe('deletes (inferred from last-synced snapshot)', () => {
    const synced = (rec) => ({ [rec.id]: { updatedAt: rec.updatedAt || 0, hash: hashRecord(rec) } });

    it('local deletion (gone locally, present in cloud, was synced) deletes cloud', () => {
        const rec = { id: 'a', v: 1 };
        const p = run([], [rec], synced(rec));
        expect(p.cloudDeletes).toEqual(['a']);
        expect(p.localUpserts).toEqual([]);
    });

    it('cloud deletion (gone in cloud, present locally, was synced) deletes local', () => {
        const rec = { id: 'a', v: 1 };
        const p = run([rec], [], synced(rec));
        expect(p.localDeletes).toEqual(['a']);
        expect(p.cloudUpserts).toEqual([]);
    });

    it('does NOT delete on first sign-in (no snapshot) — treats as new add', () => {
        const p = run([{ id: 'a', v: 1 }], [], {});
        expect(p.localDeletes).toEqual([]);
        expect(p.cloudUpserts.map(idOf)).toEqual(['a']);
    });
});
