// ==========================================================================
// firebase-config.js — shared Firebase init for the portfolio identity hub.
// ==========================================================================
// Pattern adapted from golf_handicap_tracker/src/firebase-config.js:
//   - initializeFirestore with persistentLocalCache (IndexedDB, multi-tab) for offline,
//   - automatic emulator routing on localhost (or when VITE_FB_USE_EMULATOR=1).
//
// The web config values are read from Vite env vars (VITE_FB_*). They are NOT secrets
// (they ship in the client bundle) but live in `.env` (gitignored). When unset, clearly
// marked PLACEHOLDERS are used so the app builds and runs against the local emulator
// without any real project. See .env.example.

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    connectFirestoreEmulator
} from 'firebase/firestore';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const firebaseConfig = {
    apiKey: env.VITE_FB_API_KEY || 'PLACEHOLDER_API_KEY',
    authDomain: env.VITE_FB_AUTH_DOMAIN || 'lx-apps-hub.firebaseapp.com',
    projectId: env.VITE_FB_PROJECT_ID || 'lx-apps-hub',
    storageBucket: env.VITE_FB_STORAGE_BUCKET || 'lx-apps-hub.appspot.com',
    messagingSenderId: env.VITE_FB_MESSAGING_SENDER_ID || 'PLACEHOLDER_SENDER_ID',
    appId: env.VITE_FB_APP_ID || 'PLACEHOLDER_APP_ID'
};

// True when the config still holds placeholders — i.e. no real project wired yet.
export const isPlaceholderConfig = firebaseConfig.apiKey === 'PLACEHOLDER_API_KEY';

const onLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const useEmulator = env.VITE_FB_USE_EMULATOR === '1' || onLocalhost;

let _app = null, _auth = null, _db = null, _wired = false;

/** Lazily initialise Firebase and return { app, auth, db }. Safe to call repeatedly. */
export function getFirebase() {
    if (_app) return { app: _app, auth: _auth, db: _db };
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = initializeFirestore(_app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
    if (useEmulator && !_wired) {
        _wired = true;
        try {
            connectAuthEmulator(_auth, 'http://127.0.0.1:9099', { disableWarnings: true });
            connectFirestoreEmulator(_db, '127.0.0.1', 8089);
            console.log('[sync] Connected to Firebase emulators (auth:9099, firestore:8080).');
        } catch (e) {
            console.warn('[sync] Emulator wiring failed:', e);
        }
    }
    return { app: _app, auth: _auth, db: _db };
}
