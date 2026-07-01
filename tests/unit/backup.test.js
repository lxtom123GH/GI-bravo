import { describe, it, expect, beforeEach } from 'vitest';

// storage.js talks to localStorage directly and the default vitest env is 'node'
// (jsdom isn't a dependency), so provide a minimal in-memory shim BEFORE importing
// storage.js — then dynamic-import it so the shim is guaranteed present at load.
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
};

const { exportAllData, importAllData, getRoastLabSessions, saveRoastLabSessions } =
    await import('../../js/storage.js');

describe('backup round-trip — REL-1: roastLabSessions is included', () => {
    beforeEach(() => store.clear());

    it('exportAllData includes roastLabSessions', () => {
        saveRoastLabSessions([{ id: 'r1', features: [1, 2, 3] }]);
        expect(exportAllData().roastLabSessions).toEqual([{ id: 'r1', features: [1, 2, 3] }]);
    });

    it('importAllData restores roastLabSessions onto a fresh device', () => {
        saveRoastLabSessions([{ id: 'r1', v: 1 }, { id: 'r2', v: 2 }]);
        const dump = exportAllData();          // a valid backup (pantry/roastHistory present as [])
        store.clear();                          // simulate a clean install
        expect(getRoastLabSessions()).toEqual([]);
        importAllData(dump);
        expect(getRoastLabSessions()).toEqual([{ id: 'r1', v: 1 }, { id: 'r2', v: 2 }]);
    });

    it('tolerates a pre-REL-1 backup with no roastLabSessions key (no throw)', () => {
        expect(() => importAllData({ pantry: [], roastHistory: [] })).not.toThrow();
        expect(getRoastLabSessions()).toEqual([]);
    });
});
