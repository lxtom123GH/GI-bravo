// ==========================================================================
// spaces.js — shared "spaces" (collaboration) helpers.
// ==========================================================================
// A space is owned by one user and has /members/{uid} docs carrying a role. Shared
// collections live under /apps/{appId}/spaces/{spaceId}/data/{collection}. Minimal v1:
// the owner adds members by email; added members see the space via listMySpaces().

import {
    collection, collectionGroup, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp
} from 'firebase/firestore';
import { getFirebase } from './firebase-config.js';

/** Create a new shared space owned by the current user. Returns its id. */
export async function createSpace(appId, ownerUid, name) {
    const { db } = getFirebase();
    const ref = doc(collection(db, 'apps', appId, 'spaces'));
    await setDoc(ref, { ownerUid, name: name || 'Shared space', createdAt: serverTimestamp() });
    await setDoc(doc(db, 'apps', appId, 'spaces', ref.id, 'members', ownerUid), {
        uid: ownerUid, role: 'owner', addedAt: serverTimestamp()
    });
    return ref.id;
}

/** Resolve an email to a uid via the shared emailIndex (null if unknown). */
export async function resolveEmailToUid(email) {
    const { db } = getFirebase();
    const snap = await getDoc(doc(db, 'emailIndex', (email || '').toLowerCase()));
    return snap.exists() ? snap.data().uid : null;
}

/**
 * Share a space with another user by email (owner-only, enforced by rules).
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function shareSpaceByEmail(appId, spaceId, email, role = 'editor') {
    const { db } = getFirebase();
    const uid = await resolveEmailToUid(email);
    if (!uid) return { ok: false, reason: 'no-such-user' };
    await setDoc(doc(db, 'apps', appId, 'spaces', spaceId, 'members', uid), {
        uid, email: (email || '').toLowerCase(), role, addedAt: serverTimestamp()
    });
    return { ok: true };
}

/** List spaces the current user is a member of: [{ id, name, role }]. */
export async function listMySpaces(appId, uid) {
    const { db } = getFirebase();
    const q = query(collectionGroup(db, 'members'), where('uid', '==', uid));
    const memberSnap = await getDocs(q);
    const out = [];
    for (const m of memberSnap.docs) {
        const spaceRef = m.ref.parent.parent; // .../spaces/{spaceId}
        if (!spaceRef || spaceRef.parent.parent?.id !== appId) continue; // scope to this app
        const sSnap = await getDoc(spaceRef);
        if (sSnap.exists()) out.push({ id: spaceRef.id, name: sSnap.data().name, role: m.data().role });
    }
    return out;
}
