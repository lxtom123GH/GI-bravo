# CLAUDE.md — working conventions for GI-bravo

GI-bravo is a **browser-only PWA coffee-roasting tracker** (vanilla JS + Vite, no framework),
deployed to https://gi-bravo.vercel.app. Data is local-first (localStorage + IndexedDB); an
opt-in Firebase auth/sync pilot exists (see `PORTFOLIO_AUTH_SYNC.md`).

## ✅ Definition of done for ANY user-facing feature
When you add or change a feature, treat it as **incomplete** until you have also:
1. **In-app guidance** — add/refresh:
   - `data-hint` attributes on new controls (the 💡 Show-hints system in `js/hints.js`).
   - the **Help tab** content in `index.html` (the casual user reads this, not the repo docs).
   - the **guided tour** (`js/tour.js`) if the feature is on a main path.
   - the **demo** (`js/demo.js`) if it changes the core roast flow.
2. **Docs** — update every doc the change touches:
   - `README.md` — feature list + project structure.
   - `USER_GUIDE.md` — how a person actually uses it.
   - `FUTURE_FEATURES.md` — move the item to "done" / record deferrals.
   - `ROASTER_JOURNEY.md` — flip ✨/◐ to ✅ as roadmap items ship.
   - `HANDOFF.md` — only for cross-session threads/decisions.
3. **Backup** — if it adds persisted data, include it in `exportAllData`/`importAllData`
   (`js/storage.js`).
4. **Build + verify** — `npm run build` passes; verify in a browser (the `verify`/`run` skills or
   `vite preview` + the Chrome tools); rebuild `dist` and normalise line endings to **LF**
   (`sed -i 's/\r$//'`) — Vercel rebuilds anyway, but keep the committed `dist` clean.
5. **Tests** — `npm run test` (pure units) stays green; add emulator tests for sync/rules changes.

Do these **as a matter of course**, in the same change — not as a follow-up.

## Design principles (from the owner)
- **Frictionless by default, complexity on demand.** Most people should get a simple screen with
  zero setup; power users opt into more (e.g. single-roaster default vs multi-roaster). A little
  onboarding up front is fine if it makes the everyday path effortless.
- **Reflect the user's real world** — match the actual machine (Behmor weights are 100/200/400 g),
  let people hide what they don't use ("Customise this screen"), and personalise.
- **Non-technical users matter** (e.g. "Mum"): plain language, big obvious controls, safe fallbacks
  (e.g. "Start (no mic)").

## Repo map / conventions
- Entry: `main.js` wires `init*()` modules from `js/`. Add new modules there.
- `js/storage.js` — all localStorage; `js/photos.js` — IndexedDB photos.
- Roast flow: `js/roast.js` (setup), `js/audio.js` (detection/timer/alarm), `js/metrics.js`.
- Onboarding: `js/hints.js`, `js/tour.js`, `js/demo.js`, `js/customise.js`.
- Commit/PR trailers are configured in the environment; **commit/push only when asked**, branch
  off `main`, one feature per PR (or a coherent batch) — and remember Vercel runs its own
  `vite build`, so the committed `dist` hash won't match the live one (that's fine).

## Workflow notes
- **Stacked PRs — the trap (learned 2026-06-27):** if you base a PR on another *feature* branch
  (`base: feature/x`), clicking "merge" merges it **into that branch, not `main`**. Merging the
  whole stack that way lands nothing in `main` except the PRs whose base is `main`. **Fix:** either
  base every PR on `main` (rebase onto `main` so the diff is clean), OR before merging, **retarget
  each stacked PR's base to `main`** and merge bottom-up. When you do stack, say so explicitly and
  give the merge/retarget steps. Recovery if it happens: the top branch contains the whole stack —
  merge it into `main` in one go.
- Building on an open PR's branch avoids `index.html`/`dist` conflicts, but only helps `main` if
  the above retarget/merge-order is followed.
- **Pushes after a merge are stranded (learned 2026-06-28):** once a PR is merged it closes, so any
  commit pushed to that branch afterwards lands on the branch with **no open PR** — the owner won't
  see it. (Happened with the KKTO panel: #59 merged at the Behmor commit, the later KKTO push needed
  a brand-new PR #60.) **Fix:** when more work is still coming on a feature, tell the owner
  explicitly **"don't merge yet — more coming"** vs **"safe to merge now"** on each PR. If a push
  does get stranded, open a fresh branch/PR off the current tip (the diff vs `main` is just the new
  commits).
- After merging, the live bundle hash changes — verify features by checking the live page HTML +
  bundle, not by hash.
