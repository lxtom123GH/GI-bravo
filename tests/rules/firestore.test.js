import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = 'gi-bravo';
let env;

beforeAll(async () => {
    env = await initializeTestEnvironment({
        projectId: 'demo-gi-bravo',
        firestore: {
            rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: 8089
        }
    });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

// helpers to reach the per-user and per-space paths
const userPantry = (db, uid, docId) =>
    db.collection('apps').doc(APP).collection('users').doc(uid).collection('pantry').doc(docId);
const spaceDoc = (db, sid) => db.collection('apps').doc(APP).collection('spaces').doc(sid);
const spaceMember = (db, sid, uid) => spaceDoc(db, sid).collection('members').doc(uid);
const spaceItem = (db, sid, name, docId) =>
    spaceDoc(db, sid).collection('data').doc(name).collection('items').doc(docId);
const userRoastLab = (db, uid, docId) =>
    db.collection('apps').doc(APP).collection('users').doc(uid).collection('roastLabSessions').doc(docId);

describe('per-user data isolation', () => {
    it('denies unauthenticated reads/writes', async () => {
        const db = env.unauthenticatedContext().firestore();
        await assertFails(userPantry(db, 'alice', 'b1').get());
        await assertFails(userPantry(db, 'alice', 'b1').set({ name: 'Yirg' }));
    });

    it('lets the owner read/write their own data', async () => {
        const alice = env.authenticatedContext('alice').firestore();
        await assertSucceeds(userPantry(alice, 'alice', 'b1').set({ name: 'Yirg', updatedAt: 1 }));
        await assertSucceeds(userPantry(alice, 'alice', 'b1').get());
    });

    it("denies access to another user's data", async () => {
        const bob = env.authenticatedContext('bob').firestore();
        await assertFails(userPantry(bob, 'alice', 'b1').get());
        await assertFails(userPantry(bob, 'alice', 'b1').set({ name: 'hijack' }));
    });

    // Roast Lab captures (B8a) are a new personal collection; confirm the per-user wildcard rule
    // covers them — the owner can read/write their own, nobody else can, unauth is denied.
    it('isolates roastLabSessions like any other personal collection', async () => {
        const alice = env.authenticatedContext('alice').firestore();
        await assertSucceeds(userRoastLab(alice, 'alice', 's1').set({ id: 's1', updatedAt: 1, meta: {} }));
        await assertSucceeds(userRoastLab(alice, 'alice', 's1').get());
        const bob = env.authenticatedContext('bob').firestore();
        await assertFails(userRoastLab(bob, 'alice', 's1').get());
        await assertFails(userRoastLab(bob, 'alice', 's1').set({ id: 's1', hacked: true }));
        const anon = env.unauthenticatedContext().firestore();
        await assertFails(userRoastLab(anon, 'alice', 's1').get());
    });
});

describe('shared identity profile + emailIndex', () => {
    it('any signed-in user can read a profile; only owner writes', async () => {
        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        await assertSucceeds(alice.collection('users').doc('alice').set({ uid: 'alice' }));
        await assertSucceeds(bob.collection('users').doc('alice').get());
        await assertFails(bob.collection('users').doc('alice').set({ uid: 'alice', hacked: true }));
    });

    // emailIndex maps email -> uid for share-by-email. The doc-id must be the caller's OWN
    // (lowercased) token email — see SEC-2a in firestore.rules.
    const emailIdx = (db, id) => db.collection('emailIndex').doc(id);

    it('lets a user map THEIR OWN email (lowercased) to their uid', async () => {
        const alice = env.authenticatedContext('alice', { email: 'a@x.com', email_verified: true }).firestore();
        await assertSucceeds(emailIdx(alice, 'a@x.com').set({ uid: 'alice', email: 'a@x.com' }));
    });

    it('matches case-insensitively (id is lowercased; token may be mixed case)', async () => {
        // auth.js writes the id as email.toLowerCase(); the rule compares token.email.lower().
        const alice = env.authenticatedContext('alice', { email: 'Alice@X.com', email_verified: true }).firestore();
        await assertSucceeds(emailIdx(alice, 'alice@x.com').set({ uid: 'alice', email: 'alice@x.com' }));
    });

    it('DENIES an unverified-email user from writing their own index (SEC-2a hardening)', async () => {
        // Blocks registering an unclaimed email you don't own and squatting the index.
        const bob = env.authenticatedContext('bob', { email: 'b@x.com', email_verified: false }).firestore();
        await assertFails(emailIdx(bob, 'b@x.com').set({ uid: 'bob', email: 'b@x.com' }));
    });

    it('DENIES mapping someone else\'s email to yourself (share-hijack, SEC-2a)', async () => {
        // The core hole: alice, pointing at her OWN uid, tries to claim victim's email doc.
        const alice = env.authenticatedContext('alice', { email: 'a@x.com', email_verified: true }).firestore();
        await assertFails(emailIdx(alice, 'victim@x.com').set({ uid: 'alice', email: 'victim@x.com' }));
    });

    it('DENIES writing an index row that points at another uid', async () => {
        const alice = env.authenticatedContext('alice', { email: 'a@x.com', email_verified: true }).firestore();
        await assertFails(emailIdx(alice, 'a@x.com').set({ uid: 'bob', email: 'a@x.com' }));
    });

    it('lets a user delete only their OWN email index row', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await emailIdx(db, 'a@x.com').set({ uid: 'alice', email: 'a@x.com' });
            await emailIdx(db, 'victim@x.com').set({ uid: 'victim', email: 'victim@x.com' });
        });
        const alice = env.authenticatedContext('alice', { email: 'a@x.com', email_verified: true }).firestore();
        await assertSucceeds(emailIdx(alice, 'a@x.com').delete());
        await assertFails(emailIdx(alice, 'victim@x.com').delete());
    });
});

describe('shared spaces (collaboration)', () => {
    // Seed a space owned by alice with bob as editor and carol as viewer.
    async function seedSpace() {
        await env.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await spaceDoc(db, 'sp1').set({ ownerUid: 'alice', name: 'Home roastery' });
            await spaceMember(db, 'sp1', 'alice').set({ uid: 'alice', role: 'owner' });
            await spaceMember(db, 'sp1', 'bob').set({ uid: 'bob', role: 'editor' });
            await spaceMember(db, 'sp1', 'carol').set({ uid: 'carol', role: 'viewer' });
        });
    }

    it('owner can create a space only with ownerUid == self', async () => {
        const alice = env.authenticatedContext('alice').firestore();
        await assertSucceeds(spaceDoc(alice, 'new1').set({ ownerUid: 'alice', name: 'Mine' }));
        await assertFails(spaceDoc(alice, 'new2').set({ ownerUid: 'bob', name: 'Spoof' }));
    });

    it('owner can bootstrap a new space AND their own owner membership (the createSpace path)', async () => {
        const alice = env.authenticatedContext('alice').firestore();
        // 1) create the space doc with ownerUid = self
        await assertSucceeds(spaceDoc(alice, 'boot1').set({ ownerUid: 'alice', name: 'Home roastery' }));
        // 2) create own membership with role 'owner' — denied by the old role-based check,
        //    allowed now via space-doc ownership (regression test for the go-live share bug).
        await assertSucceeds(spaceMember(alice, 'boot1', 'alice').set({ uid: 'alice', role: 'owner' }));
        // 3) the owner can then share with another member (editor) by email
        await assertSucceeds(spaceMember(alice, 'boot1', 'bob').set({ uid: 'bob', role: 'editor' }));
    });

    it('a non-owner cannot self-add as editor/owner (only viewer self-join)', async () => {
        const alice = env.authenticatedContext('alice').firestore();
        await assertSucceeds(spaceDoc(alice, 'boot2').set({ ownerUid: 'alice', name: 'Mine' }));
        const bob = env.authenticatedContext('bob').firestore();
        await assertFails(spaceMember(bob, 'boot2', 'bob').set({ uid: 'bob', role: 'editor' }));
        await assertFails(spaceMember(bob, 'boot2', 'bob').set({ uid: 'bob', role: 'owner' }));
        await assertSucceeds(spaceMember(bob, 'boot2', 'bob').set({ uid: 'bob', role: 'viewer' }));
    });

    it('editor member can read AND write shared pantry items', async () => {
        await seedSpace();
        const bob = env.authenticatedContext('bob').firestore();
        await assertSucceeds(spaceItem(bob, 'sp1', 'pantry', 'b1').set({ name: 'Shared bean', updatedAt: 1 }));
        await assertSucceeds(spaceItem(bob, 'sp1', 'pantry', 'b1').get());
    });

    it('viewer member can read but NOT write shared items', async () => {
        await seedSpace();
        const carol = env.authenticatedContext('carol').firestore();
        await assertSucceeds(spaceItem(carol, 'sp1', 'pantry', 'b1').get());
        await assertFails(spaceItem(carol, 'sp1', 'pantry', 'b1').set({ name: 'nope' }));
    });

    it('a non-member is denied reading/writing shared items', async () => {
        await seedSpace();
        const mallory = env.authenticatedContext('mallory').firestore();
        await assertFails(spaceItem(mallory, 'sp1', 'pantry', 'b1').get());
        await assertFails(spaceItem(mallory, 'sp1', 'pantry', 'b1').set({ name: 'nope' }));
    });

    it('an editor CANNOT escalate roles by writing a members doc (only owner can)', async () => {
        await seedSpace();
        const bob = env.authenticatedContext('bob').firestore();
        // bob (editor) tries to make himself owner
        await assertFails(spaceMember(bob, 'sp1', 'bob').set({ uid: 'bob', role: 'owner' }));
        // owner can
        const alice = env.authenticatedContext('alice').firestore();
        await assertSucceeds(spaceMember(alice, 'sp1', 'dave').set({ uid: 'dave', role: 'editor' }));
    });
});
