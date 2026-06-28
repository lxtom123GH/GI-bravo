# Collective space — go-live checklist

> ## ✅ LIVE as of 2026-06-28
> The collective space is live on the shared Firebase hub **`lx-apps`**:
> - **Auth:** Email/Password + Google enabled (public-facing name "LX Apps", support email set).
> - **Firestore:** created in **`australia-southeast1`** (Sydney), production mode, `(default)` db.
> - **Rules + index deployed:** `firestore.rules` + the `members.uid` collection-group index.
> - **Config:** real `VITE_FB_*` values in local `.env` (gitignored) **and** in Vercel env vars; redeployed.
> - **Storage:** deliberately **NOT** enabled — new projects now need the **Blaze** plan for a
>   bucket, and the pilot syncs only Firestore data (photo sync is a later follow-up). Stayed on
>   free **Spark**. Deploy was `--only firestore:rules,firestore:indexes` (no `storage`).
> - **Verified live:** cross-device pantry/roast sync; share-by-email across two accounts.
> - **Rules fix during go-live:** first share hit `permission-denied` — the space owner couldn't
>   create their own `members/{uid}` doc (ownership was read from that not-yet-existing doc).
>   Fixed by checking the space doc's `ownerUid` (`isSpaceDocOwner`); +2 regression tests (13 total).
>
> The steps below are kept as the as-built record / a template for rolling this out to the other apps.

The collective-space code is **complete and merged**: opt-in cloud sync (email/password + Google
sign-in), a **shared pantry, roast history, blends and roaster profiles** scoped to a "space" you
can **share by email**, plus personal calibration that stays per-device. It runs against the local
Firebase **emulator** out of the box; going **live** needs a few Firebase console steps that only
you can do. Claude can't create the project, enter the console, or handle account credentials.

Until these steps are done the app behaves exactly as today (local-first); the Cloud Sync card
shows a "not configured yet" note and nothing else changes.

## What Claude already did
- `js/sync/` engine (auth, reconcile = union-by-id + last-write-wins, synced collections, spaces).
- Shared collections wired: **pantry, roastHistory, blends, roasters** (space-scoped); calibration
  (referenceSamples, colorTargets) stays personal.
- `firestore.rules` / `storage.rules` (path-generic; fail-closed; members-only writes; owner-only
  role changes). New collections need **no** rules change.
- Opt-in UI (`js/sync-ui.js`), lazy-loaded so the signed-out app stays lean.
- `.env.example` + env-based config with placeholders and emulator fallback.

## Your steps (≈15 min, free Spark tier)
1. **Create / pick a Firebase project** at https://console.firebase.google.com (the code defaults to
   a shared hub id `lx-apps-hub`; any project id is fine).
2. **Add a Web app** (Project settings → General → Your apps → `</>`), and copy the config values
   (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
3. **Enable Authentication** → Sign-in method → turn on **Email/Password** and **Google**.
4. **Create Firestore** (Build → Firestore Database → Create, production mode, default db). **Skip
   Storage** unless you need photo sync — new projects require the **Blaze** plan for a bucket, and
   the pilot syncs only Firestore data. (If you do enable it later, deploy `storage` rules then.)
5. **Local config:** copy `.env.example` → `.env` and paste the 6 `VITE_FB_*` values. (`.env` is
   gitignored; these web keys aren't secret but keep them out of git.)
6. **Deploy the rules:**
   ```bash
   npm i -g firebase-tools      # if needed
   firebase login
   firebase use <your-project-id>
   firebase deploy --only firestore:rules,firestore:indexes   # add ,storage only if you enabled Storage
   ```
   (Indexes are needed for the `members.uid` collection-group query behind "list my shared spaces".)
7. **(Optional) validate the rules** with the emulator: `npm run test:rules`.
8. **Production env (Vercel):** add the same `VITE_FB_*` vars in the Vercel project's
   Environment Variables (since `.env` isn't committed), then redeploy.
9. **Verify live:** open the app → **Roast History → Cloud Sync** → create an account → sign in →
   confirm pantry/roasts/blends/roasters sync across two browsers. Then **share a space by email**
   with a second account and confirm they can read/edit.

## Notes
- **Cost:** the free Spark tier is plenty for personal/family use. If you ever approach limits,
  we'll discuss before enabling billing (per your earlier decision).
- **Privacy:** only data in a *shared space* is visible to its members; signed-out and personal
  data never leave the device.
- See `PORTFOLIO_AUTH_SYNC.md` for the full design/contract.
