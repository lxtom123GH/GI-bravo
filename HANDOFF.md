# Handoff / Continuation Notes

Context bridge for continuing this project in a local Claude Code CLI session
(the web session's chat history doesn't transfer; the repo + docs are the
source of truth). _Written 2026-06-27; updated 2026-06-29._

## ▶️ Current state & next task (2026-06-28)
The **entire build roadmap (#1–#8) is shipped to `main`** — roaster profiles, freshness/FIFO,
blend builder, batch planner, the machine-faithful control panel (Behmor model-aware + KKTO),
value leaderboard, receipt quick-add, tasting-over-time, swipe personalisation, and the
collective-space code. **Firebase go-live is DONE** — the collective space is **live** (see below).

### ✅ Go-live complete (2026-06-28)
The collective space is live on the shared identity hub **`lx-apps`** (chose the shared hub over a
dedicated project, for portfolio SSO). Email/Password + Google auth on; Firestore in
`australia-southeast1`; `firestore.rules` + the `members.uid` collection-group index deployed;
real config in `.env` (gitignored) + Vercel env vars. **Storage was skipped** (new projects need
Blaze for a bucket; the pilot is Firestore-only — photo sync is a follow-up), so we stayed on free
Spark. Verified live: cross-device sync + share-by-email across two accounts. A go-live **rules bug**
was found & fixed: the space owner couldn't create their own `members/{uid}` doc (ownership was read
from that not-yet-existing doc) → now keyed off the space doc's `ownerUid` (`isSpaceDocOwner`),
+2 regression tests. Full as-built record in `GO_LIVE_CHECKLIST.md`; design notes in `PORTFOLIO_AUTH_SYNC.md` §7.

### ✅ Visual refresh shipped (2026-06-29) — the "Ember" design system
A token-driven visual refresh landed via **PR #73** (CSS token system + self-hosted fonts) and
**PR #75** (roast-curve repaint; #75 was the recovery for #74, which hit the stacked-PR trap — see
`LESSONS.md`). Two-layer plain-CSS tokens: portable (`tokens.portable.css`, `components.css`) +
theme (`theme.coffee.css`, with `theme.golf.css` proving the swap). Warm-dark Ember look, AA
contrast, self-hosted Hanken Grotesk / Spline Sans Mono / Figtree (precached for offline), and a
lit roast curve with phase bands off the existing dry-end/first-crack markers. **Visual-only** — no
behaviour change. Follow-ups: adopt `components.css` for new UI; re-theme the golf app. The
`handoff/` folder holds the designer's source bundle; design-intent round-trips go via the
`DesignSync` bridge (reads/writes the claude.ai/design project — none exists yet, so the local
bundle is the source of truth).

**Next task = pick a post-go-live follow-up.** Options: (a) **multi-space sharing + clearer scope
UI** (named spaces; also fixes a known **cross-scope local bleed** — see `FUTURE_FEATURES.md` 6.9);
(b) receipt **OCR** auto-fill; (c) a fuller pre-roast **"what will happen" simulation**; (d) roll the
`js/sync/` pattern out to the other apps (GI-alpha → tempovibes → golf last). A **weekly
best-practice radar** + **monthly retro** run as scheduled cloud routines and open `LESSONS.md` PRs.
The weekly radar also **checks the users reality** (still just the owner + Mum as GI-bravo alpha
tester? — see the users note in Thread 1), since real users would raise migration/change risk.

## How to continue locally
1. Install the CLI: `npm install -g @anthropic-ai/claude-code` (Node 18+), run `claude`, sign in.
2. Clone the apps into one folder (GI-bravo, golf-handicap-tracker, GI-alpha, GI-charlie, the private `aps-*`, tempovibes).
3. In that folder run `claude` and say: "read HANDOFF.md and FUTURE_FEATURES.md and let's continue."
4. Locally you have full filesystem access and your own git credentials, so the **private repos are reachable** (they were out of scope in the web session).

## Where GI-bravo is
A browser-only PWA coffee-roasting tracker, fully featured and shipped to `main`
(deploys to https://gi-bravo.vercel.app). See `README.md` for features,
`FUTURE_FEATURES.md` for the roadmap/research, `USER_GUIDE.md` + the in-app Help
tab for usage, `HARDWARE_GUIDE.md` for the DIY probe. The entire roadmap is done
(see the Current state section above); only the Firebase go-live remains.

## Thread 1 — Portfolio backend decision (was B8) — ✅ decided, code-complete, **LIVE** (pilot done)
**Decided 2026-06-27: standardize the portfolio on Firebase**, local-first + opt-in cloud
sync, GI-bravo as the pilot. Full plan + as-built status in **`PORTFOLIO_AUTH_SYNC.md`**
(see §7). The **pilot is implemented** in GI-bravo against the Firebase Local Emulator Suite
(reusable `js/sync/` module + opt-in UI + rules + tests); no live project wired yet — the PR
carries a NEEDS-HUMAN checklist (create `lx-apps-hub`, enable email/password + Google, paste
`.env`, deploy rules) — now captured step-by-step in **`GO_LIVE_CHECKLIST.md`**. Going live is the
immediate next step; rollout to the other apps follows.

A portfolio-wide survey corrected the original premise: it is **not** "no backend everywhere."
Firebase is already the incumbent in three repos — `golf-handicap-tracker` already ships the
exact accounts + cloud-sync pattern this proposes (Firebase Auth + Firestore + Storage +
Functions), and `aps-agency-comparator` + `aps-mobility-engine` share one Firebase project
(reference data, no user accounts). So Supabase was dropped to avoid fragmenting from existing
investment; `golf-handicap-tracker` is the pattern reference and migrates **last** (it has the most
existing data + schema complexity — **not** because of user risk; see the users note below).
`GI-charlie` is an empty repo.

> **Users reality (confirmed 2026-06-28):** there are **no real users on any app yet — just the
> owner**. The owner's **mum is the sole alpha tester for GI-bravo** (the realest "will actually use
> it" tester). So rollout risk is low everywhere — be bold/fast with changes, and optimise for "would
> Mum find this obvious?". **Revisit weekly** (fold into the weekly best-practice radar) in case a
> real user appears — if golf/any app gains live users, its migration risk goes up.

Locked decisions for the pilot:
- **Provider:** one shared Firebase project as the identity hub (placeholder id `lx-apps-hub`);
  per-app data namespaced under `/apps/{appId}/...`.
- **Auth:** email/password + optional Google sign-in.
- **Local-first / cloud-optional:** every app stays 100% usable with no account; sign-in is
  opt-in; local data merges up on first sign-in.
- **Collaboration is first-class:** data can be owned by a user OR a shared **space** (members
  map `{uid: role}`) — e.g. a shared green-bean pantry/roaster (coffee) or a round with
  participants (golf).
- **Conflict policy:** union-by-id + last-write-wins by `updatedAt` (per-collection override).
- **Cost:** stay on the free tier — **no Cloud Functions** in the pilot (Functions need Blaze);
  revisit billing before adding server-side features.

Rollout order: GI-bravo (pilot) → GI-alpha → tempovibes → migrate golf-handicap-tracker last.
The APS pair stays out of identity scope unless it adds personalization.

## Open thread 2 — Multi-swatch DIY colour target — ✅ Done
Shipped as **"Add Custom-Target Photo"** in History. `js/colorcheck.js`
(`computeCCM`/`sampleChart`) was generalized to N patches and arbitrary cols×rows
grids (the 24-patch ColorChecker is now the default). A DIY swatch card (4–6 paint
chips) is **self-calibrated once** under daylight — each patch's measured colour is
stored as the baseline (`colorTargets` in `js/storage.js`, included in backup) — and
future photos are corrected back to it via the same least-squares CCM. New photo
helpers `calibrateCustomTarget` / `createCustomTargetPhoto` (`js/photos.js`) and a
modal `openCustomTargetModal` (`js/history.js`). Result stored as a `customtarget`
roast-colour index. See `FUTURE_FEATURES.md` §B4b. _Only thread 1 remains open._
