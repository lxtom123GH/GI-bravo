// ==========================================================================
// portfolio-sync — public API barrel (app-agnostic).
// ==========================================================================
// Drop this `js/sync/` folder into any portfolio app. The host app supplies its
// appId, local adapters, and a small UI; everything here is reusable.
//
// Usage sketch:
//   import { onAuthState, signIn, createSyncedCollection } from './sync/index.js';
//   const pantry = createSyncedCollection({ appId: 'gi-bravo', name: 'pantry',
//       localAdapter: { read: getPantry, write: savePantry } });
//   onAuthState(user => user ? pantry.start(user) : pantry.stop());

export { getFirebase, firebaseConfig, isPlaceholderConfig, useEmulator } from './firebase-config.js';
export {
    onAuthState, signUp, signIn, signInWithGoogle, signOut, sendReset, toPublicUser
} from './auth.js';
export { createSyncedCollection } from './synced-collection.js';
export { reconcile, hashRecord } from './reconcile.js';
export { createSpace, shareSpaceByEmail, resolveEmailToUid, listMySpaces } from './spaces.js';
