# Handoff / Continuation Notes

Context bridge for continuing this project in a local Claude Code CLI session
(the web session's chat history doesn't transfer; the repo + docs are the
source of truth). _Written 2026-06-27._

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
except the two open threads below.

## Thread 1 — Portfolio backend decision (was B8) — ✅ decided, pilot pending
**Decided 2026-06-27: standardize the portfolio on Firebase**, local-first + opt-in cloud
sync, GI-bravo as the pilot. Full plan in **`PORTFOLIO_AUTH_SYNC.md`** (the reusable auth+sync
module contract, data model, and rollout).

A portfolio-wide survey corrected the original premise: it is **not** "no backend everywhere."
Firebase is already the incumbent in three repos — `golf-handicap-tracker` already ships the
exact accounts + cloud-sync pattern this proposes (Firebase Auth + Firestore + Storage +
Functions), and `aps-agency-comparator` + `aps-mobility-engine` share one Firebase project
(reference data, no user accounts). So Supabase was dropped to avoid fragmenting from existing
investment; `golf-handicap-tracker` is the pattern reference and migrates **last** (it has live
data). `GI-charlie` is an empty repo.

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

## Open thread 2 — Multi-swatch DIY colour target
Extend photo colour correction beyond the current single-patch white balance and
the 24-patch ColorChecker with a **cheap DIY multi-patch target** (e.g. 4–6
Bunnings paint swatches mounted on card).
- **Why:** one grey patch only fixes white balance; **≥4 patches with good spread** let the
  existing least-squares fit solve a full 3×3 (+offset). The **deltas between patches** are what
  condition the matrix — exactly the intuition behind this idea.
- **The catch + fix:** paint swatches have no reliable published sRGB. Solution: **self-calibrate
  the target once** under good daylight (store each patch's measured colour as its reference) and
  correct future photos to that baseline — relative but repeatable. Extends the existing
  self-calibrated-sample feature.
- **Recommended swatches:** a neutral grey ramp (white / light grey / mid grey / near-black) for
  reliability; optionally add a warm + a cool saturated chip for better chroma.
- **Implementation:** a "custom target" mode reusing `js/colorcheck.js` `computeCCM`/`applyCCM`
  with N patches instead of 24, plus a self-calibration step and an N-cell grid sampler.
