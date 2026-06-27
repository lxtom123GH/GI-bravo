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

## Open thread 1 — Portfolio backend decision (was B8)
"No backend" was the *inherited* starting point, not a deliberate choice. Worth
reconsidering **across the whole app portfolio**, not just GI-bravo:
- The repos `GI-alpha / GI-bravo / GI-charlie`, `golf-handicap-tracker`, `tempovibes`
  are consumer apps that would benefit from **accounts + cross-device sync + (opt-in) community**.
- A **single shared backend** (one Supabase project: Postgres + auth + storage + row-level
  security) gives **single sign-on across all apps**, per-app data namespaces, and one free
  tier — the cost/ops amortize across the portfolio, which is the main argument *for* adding one.
- Recommended approach: **local-first + opt-in cloud sync**, GI-bravo as the pilot, then reuse
  the auth/sync module in the other apps. Keep every app fully usable offline if not signed in.
- Trade-offs: ongoing ops (auth/security/backups), privacy shifts from 100% local (so opt-in),
  community content needs light moderation, and provider keys + Vercel env setup are required.
- Decision still needed: shared vs per-app vs stay-local; which apps are in scope; provider
  (Supabase recommended; Firebase or Vercel Postgres are alternatives).

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
