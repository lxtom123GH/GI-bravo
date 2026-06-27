# Portfolio Auth + Sync — reusable module spec

_Thread 1 deliverable. Written 2026-06-27. Reference implementation: `golf_handicap_tracker`
(Firebase). Pilot implementer: GI-bravo. Decision: standardize the portfolio on **Firebase**._

This is the **contract** the consumer apps implement to get one shared sign-in (SSO) and
opt-in cloud sync, while staying fully usable offline with no account. It is extracted from
how `golf_handicap_tracker` already does auth/rules/Firestore, adapted from its
**cloud-required** model to a **local-first, cloud-optional** model.

---

## 1. What golf_handicap_tracker already does (the reference)

A mature, working Firebase app on SDK `^12.10.0`, project `golf-handicap-tracker-b677c`,
Functions in `australia-southeast1`.

- **Init (`src/firebase-config.js`)** — `initializeApp` + `getAuth` +
  `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager:
  persistentMultipleTabManager() }) })` + `getStorage` + `getFunctions(app, 'australia-southeast1')`.
  A hostname sniff (`localhost`/`127.0.0.1`) routes to the Auth/Firestore/Functions **emulators**.
- **Auth (`src/auth-v2.js`)** — email/password (`createUserWithEmailAndPassword`,
  `signInWithEmailAndPassword`), `updateProfile` for display name, `sendPasswordResetEmail`.
  On register it creates a `users/{uid}` doc with role flags (`isApproved`, `isAdmin`,
  `isCoach`, `coaches[]`, `createdAt: serverTimestamp()`). A `preapproved_emails/{email}`
  collection gates approval; localhost auto-approves.
- **`onAuthStateChanged` is the central state machine** — fetches `users/{uid}` (with a
  3-retry loop to absorb replication lag), then toggles auth-overlay / main-app / pending UI,
  sets role flags, and **boots the app via a callback** (`setupAuthUI(bootstrapApplication)` in
  `app-v4.js`). **Fail-closed:** a read failure holds the user on the overlay — it never grants
  access on error.
- **Data access (e.g. `src/whs.js`)** — flat top-level collections (`whs_rounds`, `shots`,
  `practice_rounds`, `competitions`, `comp_rounds`, `profiles`, `feed`). Every doc carries a
  `uid` owner field. Live reads are `onSnapshot(query(collection, where('uid','==',viewingPlayerId),
  orderBy(...)))`, kept in a module-level `unsubscribe` handle and torn down before re-subscribing.
  Writes use `addDoc`/`updateDoc`/`deleteDoc`/`setDoc` with `serverTimestamp()`.
- **Rules (`firestore.rules`)** — helpers `isAuthenticated()`, `isAdmin()` (reads the user doc),
  `isCoachOf(uid)`; ownership enforced via `resource.data.uid == request.auth.uid` with
  coach/admin overrides; `create` validates `request.resource.data.uid == request.auth.uid`.
- **Storage (`storage.rules`)** — per-user paths: `audio_diaries/{userId}/**` allowed only when
  `request.auth.uid == userId`.
- **Offline** — handled natively by Firestore `persistentLocalCache` (IndexedDB, multi-tab);
  writes queue offline and flush on reconnect. A separate transient `localStorage` cache
  (`persistence.js`) holds only the in-progress round.
- **Functions** — `onCall` callables (AI features) + Firestore triggers (`onRoundCreated/Deleted`
  for derived data).

**Directly reusable:** the init file, the rules helper/ownership template, the storage-rules
shape, the `uid`-on-every-doc + `onSnapshot`/`unsubscribe` data pattern, the emulator routing,
and the Functions region/scaffold.

---

## 2. The one thing golf does NOT do (net-new for the pilot)

Golf is **cloud-required**: the auth overlay blocks the app until you sign in, and all durable
data lives in Firestore from the first write. GI-bravo (and GI-alpha, tempovibes) must be
**local-first / cloud-optional**:

- Fully usable with **no account** — local store stays the source of truth (GI-bravo today:
  `localStorage` + IndexedDB photos).
- Sign-in is **opt-in**. On first sign-in the existing local data must **merge up** to the
  cloud, and thereafter local ↔ cloud stay reconciled.

So we **invert golf's boot order** (app boots into local mode immediately; auth is a side
channel that enables sync) and **add a reconciliation layer** golf never needed.

---

## 3. Module API (the contract)

A small, app-agnostic package (e.g. `portfolio-sync/`) the apps drop in. Suggested surface:

```
// config — per shared project, set once
initSync({ appId, firebaseConfig, region, collections })

// identity
getCurrentUser()                      // -> {uid, email, displayName} | null
onAuthState(cb)                       // cb(user|null); fires immediately with current state
signUp({email, password, displayName})
signIn({email, password})
signOut()
sendReset(email)

// per-collection local-first store (the heart of it)
const store = syncedCollection(name, {
  localAdapter,        // read/write the app's existing local store (localStorage/IDB/dexie)
  toCloud(localDoc),   // map local shape -> cloud doc (stamps uid, updatedAt)
  fromCloud(cloudDoc), // map cloud doc -> local shape
  idOf(doc), updatedAtOf(doc)   // for merge/conflict resolution
})
store.list()          // local-first read
store.upsert(doc)     // write local now; mirror to cloud if signed in
store.remove(id)
store.subscribe(cb)   // local changes + (when signed in) onSnapshot deltas
```

`appId` namespaces every app's data inside the **one shared project** (see §4). `collections`
declares the app's collection names so rules and helpers stay consistent.

**Responsibilities**
1. **Local-first:** every read/write hits the local adapter first; the app works unchanged offline
   and signed-out.
2. **Opt-in mirror:** when a user is signed in, writes also go to Firestore (`uid`-stamped);
   `onSnapshot` deltas merge back into local. Use Firestore `persistentLocalCache` for offline
   queueing (copy golf's init verbatim).
3. **First-sign-in merge:** on the `null -> user` transition, push all local docs lacking a cloud
   twin and pull all cloud docs lacking a local twin; on id collision keep the newer `updatedAt`
   (last-write-wins v1; document the limitation).
4. **Sign-out:** tear down all `onSnapshot` listeners (golf's `unsubscribe` pattern); local store
   remains intact so the app keeps working.

---

## 4. Shared-project data model (SSO + per-app namespacing)

**Constraint that drives the design:** Firebase Auth users and Firestore `request.auth` are
**per-project** — auth in one project cannot authorize data in another. So **true SSO ⇒ one
shared Firebase project holding both Auth and all consumer-app data**, namespaced by path.

Recommended layout in the shared project:

```
/users/{uid}                      // shared identity/profile across all apps
/apps/{appId}/users/{uid}/{collection}/{docId}   // per-app, per-user data
```

Rules template (generalize golf's helpers):

```
function isAuthed() { return request.auth != null; }
function isOwner(uid) { return isAuthed() && request.auth.uid == uid; }

match /users/{uid} {
  allow read, write: if isOwner(uid);
}
match /apps/{appId}/users/{uid}/{document=**} {
  allow read, write: if isOwner(uid);
}
```

This gives: sign in once → identity works in every app; each app sees only its own
`/apps/{appId}/...` subtree; per-user isolation by `uid`. Community/sharing features add explicit
public paths later (golf already shows the `visibility == "public"` pattern).

**Provisioning:** create a **new, neutrally-named** shared Firebase project as the identity hub
(don't overload `golf-handicap-tracker-b677c`). The APS pair stays in its own
`aps-mobility-engine` project (no per-user data — out of identity scope).

---

## 5. Rollout (start small, grow to all)

1. **Pilot — GI-bravo.** Stand up the shared project; build `portfolio-sync` here against
   GI-bravo's existing `localStorage`/IndexedDB. Ship signed-out = today's behaviour exactly;
   signed-in = opt-in sync.
2. **GI-alpha** — strong pull (VISION §9 multi-user households); reuse the module against dexie.
3. **tempovibes** — trivial drop-in; completes the "one login across the golf apps" story.
4. **golf_handicap_tracker LAST** — it's the *pattern source* but has **live users + data**, so
   its migration into the shared project (or re-pointing its auth) is the riskiest step. Do it
   once the module is proven on the greenfield apps.
5. **APS pair** — only if they add personalization (saved comparisons/watchlists); then they
   adopt the same shared auth.

---

## 6. Open decisions before coding the pilot

- **Shared project name/brand** for the identity hub.
- **Auth methods:** email/password (golf has it) only, or add Google/Apple sign-in for fewer
  passwords across apps?
- **Conflict policy:** last-write-wins (simplest, proposed v1) vs per-field merge for any app.
- **Free-tier headroom:** confirm Firestore/Auth/Functions free limits cover the expected
  multi-app usage in `australia-southeast1`.
```
