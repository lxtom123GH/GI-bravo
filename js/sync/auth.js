// ==========================================================================
// auth.js — thin auth wrapper over Firebase Auth (email/password + Google).
// ==========================================================================
// App-agnostic. onAuthState fires immediately with the current state. All sign-in is
// OPT-IN: nothing here runs unless the host app calls it, so a signed-out app is untouched.

import {
    onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut as fbSignOut, updateProfile, sendPasswordResetEmail,
    GoogleAuthProvider, signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebase } from './firebase-config.js';

// Minimal, serializable view of the signed-in user the app cares about.
export function toPublicUser(u) {
    return u ? { uid: u.uid, email: u.email, displayName: u.displayName || u.email } : null;
}

// Upsert the shared cross-app profile + an email->uid lookup row (used by share-by-email).
async function ensureProfile(db, user) {
    const email = (user.email || '').toLowerCase();
    await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid, email, displayName: user.displayName || email, updatedAt: Date.now()
    }, { merge: true });
    if (email) {
        await setDoc(doc(db, 'emailIndex', email), {
            uid: user.uid, email, _syncedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
    }
}

export async function signUp({ email, password, displayName }) {
    const { auth, db } = getFirebase();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    await ensureProfile(db, cred.user);
    return toPublicUser(cred.user);
}

export async function signIn({ email, password }) {
    const { auth, db } = getFirebase();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureProfile(db, cred.user).catch(() => {});
    return toPublicUser(cred.user);
}

export async function signInWithGoogle() {
    const { auth, db } = getFirebase();
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    await ensureProfile(db, cred.user).catch(() => {});
    return toPublicUser(cred.user);
}

export async function signOut() {
    const { auth } = getFirebase();
    await fbSignOut(auth);
}

export async function sendReset(email) {
    const { auth } = getFirebase();
    await sendPasswordResetEmail(auth, email);
}

/** Subscribe to auth state. Returns an unsubscribe fn; fires immediately. */
export function onAuthState(cb) {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (u) => cb(toPublicUser(u)));
}
