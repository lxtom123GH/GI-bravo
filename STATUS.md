# STATUS — what's built, what's live, what's next

**This file is the single source of truth for project status.** If you want to know whether
something is done, look here first. Other docs play specific roles and should *link here* rather than
restate status:

- `README.md` — what the app is + how to run/build it + project structure.
- `FUTURE_FEATURES.md` — the detailed backlog + design notes + research behind each item.
- `ROASTER_JOURNEY.md` — the narrative "day/week in the life" walkthrough (aspirational framing).
- `HANDOFF.md` — cross-session threads/decisions only.
- `PORTFOLIO_AUTH_SYNC.md` / `GO_LIVE_CHECKLIST.md` — the backend's *design decision* + *as-built* record.

_Last reconciled: 2026-06-30._

GI-bravo is a browser-only PWA coffee-roasting tracker (vanilla JS + Vite), deployed at
https://gi-bravo.vercel.app. Local-first (localStorage + IndexedDB) with an **opt-in** cloud sync.

---

## ✅ Shipped (in `main`, live)

**Roasting & detection**
- Mic crack detection (1C/2C via low/high FFT bands), live roast curve, DTR, RoR, target alarms,
  reference-roast follow mode with a first-crack ETA, "Start (no mic)" manual mode (`js/audio.js`).
- Opt-in **auto-tune** that learns each roaster's sensitivity from your ✗/Mark corrections
  (`js/detector-learning.js`).
- 🧪 **MFCC features** — experimental, opt-in, default OFF; computes a timbre fingerprint alongside
  detection, no effect on it yet (`js/mfcc.js`).
- 🧪 **Roast Lab** — opt-in, default OFF; captures a per-roast feature timeline + crack/clear events,
  exports JSON/CSV, **Share capture** (Web Share) for multi-device collection (`js/roastlab.js`).
- 🫥 **Shadow detector bank** — LOG-ONLY; runs several differently-tuned crack detectors alongside
  the live one (when Roast Lab is on) and logs what each *would* have called, for offline comparison.
  Never alarms or changes detection (`js/shadow.js`).

**Beans, pantry & history**
- Bean pantry with **green lots** (dated/priced, weighted-avg cost, FEFO drawdown — `js/lots.js`),
  **roasted stock** (grams + days since roast), and a **source book** (supplier, re-order link,
  price history/trend — `js/sourcebook.js`). Progressive-disclosure add-bean form.
- **Choose-your-fields** add-bean customiser (`js/beanfields.js`); **borrowed/lent ledger**
  (`js/ledger.js`); **roasted-stock usage trail** (where it went); **prep batches** (`js/prep.js`);
  **receipt quick-add** for multi-bean entry (`js/receipts.js`; OCR is *not* built — see Parked).
- **Low-friction bean entry** — autocomplete + cascading suggestions + name parsing, with an
  Australian green-bean supplier seed (`js/suggest.js`).
- **Batch planner** — drum-fitting roast sizes that divide a bag evenly (`js/planner.js`).
- Roast history, comparison, trends, JSON backup/restore (`js/history.js`, `js/storage.js`).

**Tasting & value**
- Tiered cupping/brew log incl. official **SCA 100-point** and **SCA CVA (2024)** forms; flavor wheel.
- **Tastiness-per-dollar leaderboard** — ranks roasts by cup quality ÷ cost per cup (`js/value.js`).
- Experiential rest/peak guidance grounded in your own dated tastings (`js/tasting.js`,
  `js/freshness.js`).

**Photos & colour**
- IndexedDB roast photos + reference-card white balance (`js/photos.js`).
- **ColorChecker** + **DIY custom colour-target** colour correction, linear-light fit
  (`js/colorcheck.js`, `js/colourtarget.js`).

**Roasters & hardware**
- Single-roaster by default, opt-in multi-roaster (`js/roasters.js`); model-aware Behmor + KKTO
  **control panel** guides (`js/roaster-panel.js`).
- **Bluetooth thermocouple** probe → auto temperature logging + RoR (`js/bluetooth.js`), plus a
  **Web Serial** USB path (`js/serial.js`). DIY build documented in `HARDWARE_GUIDE.md`
  (ESP32 + MAX31855 + K-type, parts + drilling for Behmor & KKTO).

**Platform & UX**
- PWA (manifest, icons, offline SW), responsive mobile layout, complexity tiers (Easy/Moderate/
  Expert) with per-feature overrides, "Ember" design system, onboarding (demo, tour, hints, Help).

**☁️ Cloud sync & sharing — LIVE (opt-in)** — see the dedicated section below.

---

## ☁️ What the backend does today

The backend is **built and live in production** (since 2026-06-28), not a plan. It's a reusable
`js/sync/` module wired up by `js/sync-ui.js`, against a shared Firebase identity hub (project
`lx-apps`, free **Spark** tier). The app stays **fully usable signed out** — sync is opt-in.

- **Auth:** email/password + Google sign-in (`js/sync/auth.js`).
- **Synced collections (7):** `pantry`, `roastHistory`, `blends`, `roasters` (shared — travel with a
  selected *space*), and `referenceSamples`, `colorTargets`, `roastLabSessions` (personal, per-user;
  `roastLabSessions` is opt-in via the Roast Lab cloud toggle — B8a). Each is a local-first
  `createSyncedCollection` with first-sign-in merge + live `onSnapshot` (`js/sync/synced-collection.js`,
  merge math in `reconcile.js`, both unit-tested).
- **Shared "spaces":** create a space and **share it by email** (owner / editor / viewer roles) so a
  couple/household share one pantry + roast history (`js/sync/spaces.js`).
- **Security rules** (`firestore.rules`): per-user data under `apps/{appId}/users/{uid}/**` (owner
  only, via a wildcard so any personal collection is covered); shared data under a space's
  `data/{name}/items` (members read, editors/owners write); fail-closed.
- **Free-tier limits / not yet synced:** Firestore-only — **no Cloud Functions** (needs Blaze), and
  **photos are not synced** (IndexedDB; a follow-up). Roast-lab captures are not synced yet either
  (that's B8a, below).

Design rationale: `PORTFOLIO_AUTH_SYNC.md`. As-built + go-live record: `GO_LIVE_CHECKLIST.md`.

---

## 🔜 Next / in progress

- **B8a — sync roast-lab captures.** **App side ✅ shipped** (opt-in **"Back up captures to cloud"**
  toggle, default OFF; a personal `roastLabSessions` synced collection capped to the last 6 captures;
  emulator rules test). With it on + signed in, captures auto-collect across your devices. **Read side
  ⏳ pending:** `tools/pull-roast-logs.mjs` is written but needs a one-time **Firebase service-account
  key** (owner-only console step) before Claude can pull captures into `roast-logs/`. Reused the
  existing synced-collection (fine at a small cap — captures change once per roast); a per-session-doc
  path is a future optimization only if it grows.
- **Photo sync** — the one user-data type the cloud pilot doesn't sync yet (Firestore-only free tier).
- See `FUTURE_FEATURES.md` for the full backlog and the "deliberately not built" rationale.

---

## ⏸️ Parked / deliberately not built (with rationale)

- **B8b — community comparison** (compare your roast of a bean vs other users') — the backend now
  exists, so the old "needs a backend" blocker is gone; what remains is a **product/privacy design**
  (what's pooled, how it's anonymised, what's shown). Re-open candidate, not yet scoped.
- **DIY colour-target photos / Bunnings paint chips** — on hold until the owner sources the chips.
- **ColorChecker auto-detect** (find the chart automatically) — needs real CV; manual corner-tap works.
- **Artisan interoperability** — needs a real round-trip test rig; generic CSV already serves export.
- **Bluetooth scales / water-brew profiles** — per-device BLE + consumer-brew scope creep, no hardware.
- **Production scheduling** — commercial focus, out of scope for a home-roast app.
- **Receipt OCR** — `receipts.js` keeps the photo as the foundation, but OCR parsing isn't built.
