// Integration test: exercise createSyncedCollection against the real Firestore + Auth
// emulators, proving a cross-device round-trip (device A writes -> device B sees it) and
// the first-sign-in merge pushing local-only data up to the cloud.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { createSyncedCollection } from '../../js/sync/synced-collection.js';

let app, db, user;

beforeAll(async () => {
    app = initializeApp({ apiKey: 'demo', projectId: 'demo-gi-bravo', authDomain: 'demo' }, 'itest');
    db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8089);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await signInAnonymously(auth);
    user = { uid: cred.user.uid };
});

afterAll(async () => { await deleteApp(app); });

// Tiny in-memory local store standing in for localStorage-backed adapters.
function memAdapter(initial = []) {
    let arr = [...initial];
    return { read: () => arr, write: (l) => { arr = l; }, _dump: () => arr };
}

describe('syncedCollection round-trip via emulator', () => {
    it('first-sign-in pushes local up; a second device pulls it down; and vice-versa', async () => {
        const name = 'pantry_' + Math.floor(user.uid.length * 7 + 13); // vary per run-ish
        const aLocal = memAdapter([{ id: 'b1', name: 'Yirgacheffe', qty: 250 }]);
        const bLocal = memAdapter([]);

        const A = createSyncedCollection({ appId: 'gi-bravo', name, localAdapter: aLocal, db, now: () => 1 });
        const B = createSyncedCollection({ appId: 'gi-bravo', name, localAdapter: bLocal, db, now: () => 2 });

        // Device A signs in -> first-sign-in merge pushes its local bean to the cloud.
        await A.start(user);
        // Device B signs in -> pulls the cloud bean into its (empty) local store.
        await B.start(user);

        const bIds = bLocal._dump().map((r) => r.id);
        expect(bIds).toContain('b1');
        expect(bLocal._dump().find((r) => r.id === 'b1').name).toBe('Yirgacheffe');

        // Device B adds a bean and pushes; device A reconciles and should see it.
        bLocal.write([...bLocal._dump(), { id: 'b2', name: 'Sidamo', qty: 500 }]);
        await B.push();
        await A.push();

        const aIds = aLocal._dump().map((r) => r.id).sort();
        expect(aIds).toEqual(['b1', 'b2']);

        A.stop(); B.stop();
    });
});
