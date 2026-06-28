// Integration test: scope isolation. Switching Personal -> a shared space -> back to
// Personal must NOT bleed the space's items (or other members' items) into Personal.
// Runs against the Firestore + Auth emulators with the real rules.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, getDocs, collection } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { createSyncedCollection } from '../../js/sync/synced-collection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let app, db, user, env;

beforeAll(async () => {
    // Rules-testing env is used only to SEED a space + membership with rules disabled.
    env = await initializeTestEnvironment({
        projectId: 'demo-gi-bravo',
        firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8089 }
    });
    // Raw modular app (matches what the synced-collection uses in the browser).
    app = initializeApp({ apiKey: 'demo', projectId: 'demo-gi-bravo', authDomain: 'demo' }, 'scopeitest');
    db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8089);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await signInAnonymously(auth);
    user = { uid: cred.user.uid };
});

afterAll(async () => { await deleteApp(app); await env.cleanup(); });

// A throwaway in-memory key/value store standing in for localStorage (so the per-scope
// caches actually persist within this one "device" across scope switches).
function memStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
// The single live host store (e.g. localStorage 'coffeePantry'); reflects the ACTIVE scope.
function liveStore(initial = []) {
    let arr = [...initial];
    return { read: () => arr, write: (l) => { arr = l; }, _dump: () => arr };
}

const cloudIds = async (path) => (await getDocs(collection(db, ...path))).docs.map((d) => d.id).sort();

describe('scope isolation (no cross-scope bleed)', () => {
    it('Personal -> space -> Personal keeps the space item out of Personal', async () => {
        const APP = 'gi-bravo';
        const name = 'pantry_scope_' + user.uid.slice(0, 6);
        const spaceId = 'sp_scope_' + user.uid.slice(0, 6);

        // Seed the space owned by this user, with their owner membership (rules disabled).
        await env.withSecurityRulesDisabled(async (ctx) => {
            const sdb = ctx.firestore();
            await sdb.collection('apps').doc(APP).collection('spaces').doc(spaceId).set({ ownerUid: user.uid, name: 'Home roastery' });
            await sdb.collection('apps').doc(APP).collection('spaces').doc(spaceId)
                .collection('members').doc(user.uid).set({ uid: user.uid, role: 'owner' });
        });

        const live = liveStore([{ id: 'mine1', name: 'Ethiopia (mine)', updatedAt: 1 }]);
        const sc = createSyncedCollection({ appId: APP, name, localAdapter: live, db, storage: memStorage(), now: () => 1 });

        // Personal scope: first-sign-in pushes my bean to my personal cloud.
        await sc.start(user, { spaceId: null });
        expect(await cloudIds(['apps', APP, 'users', user.uid, name])).toEqual(['mine1']);

        // Switch to the shared space: the live view becomes the space (empty); my bean is gone
        // from view but preserved in the personal cache.
        await sc.setScope(spaceId);
        expect(live._dump().map((r) => r.id)).toEqual([]);

        // Add a bean while in the space; it goes to the space cloud only.
        live.write([...live._dump(), { id: 'shared1', name: 'Brazil (shared)', updatedAt: 2 }]);
        await sc.push();
        expect(await cloudIds(['apps', APP, 'spaces', spaceId, 'data', name, 'items'])).toEqual(['shared1']);

        // Switch BACK to Personal: must show ONLY my bean — never the space's 'shared1'.
        await sc.setScope(null);
        expect(live._dump().map((r) => r.id).sort()).toEqual(['mine1']);          // <- the no-bleed guarantee
        // And the personal cloud must still hold only my bean (no leak upward either).
        expect(await cloudIds(['apps', APP, 'users', user.uid, name])).toEqual(['mine1']);

        sc.stop();
    });
});
