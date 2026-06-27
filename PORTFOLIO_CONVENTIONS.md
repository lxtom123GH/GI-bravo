# Portfolio conventions & cross-app self-learning

_Written 2026-06-27. A review of how the apps in this portfolio document conventions for
AI agents and humans, the discrepancies between them, and a proposal to **stop relearning
the same lessons** across apps. Scope reviewed: GI-bravo, GI-alpha, golf_handicap_tracker,
aps-agency-comparator, aps-mobility-engine, tempovibes (GI-charlie is empty)._

> This doc currently lives in GI-bravo as the working hub. **Proposed home: a small shared
> `portfolio-conventions` repo** (or a pinned gist) that every app links to — see §4.

---

## 1. What each app does today (governance docs)

| App | Agent file | Decisions log | Backlog / status | "Don't re-investigate" | Notes |
|---|---|---|---|---|---|
| **GI-bravo** | `CLAUDE.md` (new) | — | `FUTURE_FEATURES.md` | — | New "definition of done" (update docs/hints/tour/help); roadmap in `ROASTER_JOURNEY.md`. |
| **GI-alpha** | `CLAUDE.md` → `@AGENTS.md` | — | `tasks.csv`, `VISION.md` | — | Next.js; "maintained by Gemini PM + Jules executor"; strong accessibility rules. |
| **golf** | `CLAUDE.md` (154 ln) | `docs/DECISIONS.md` (`[D-xx]` + re-test) | `MASTER_BACKLOG.md` + `docs/STATUS.md` | **`Known False Positives` FP-01…10** | The most mature self-learning setup. |
| **aps-agency-comparator** | `AGENTS.md` | `docs/design_decisions_log.md` (numbered) | `MASTER_BACKLOG.md` | — | `docs/model_workflow.md` offload ledger; `handoffs/` pairs; ADR. |
| **aps-mobility-engine** | — | — | `MASTER_BACKLOG.md`, `PIR_log.md` | — | Firebase backend; `PROJECT_ANCHOR.md`. |
| **tempovibes** | — | — | — | — | Tiny static PWA; fine as-is. |

## 2. The genuinely great patterns (worth standardising — best of each)
These are the "self-learning" mechanisms the portfolio should share:
1. **golf — "Known False Positives — Do Not Re-Investigate" (FP-IDs).** Before raising a finding,
   check the list; if it matches, cite the FP-ID and stop. **This is exactly "don't relearn the
   same lesson."** Most valuable single pattern in the portfolio.
2. **golf — `DECISIONS.md` with `[D-xx]` tags + a "re-test: does this reason still hold?"** Each
   decision carries its own expiry check, so stale rules get caught. (Mirrors our memory rule that
   recalled facts reflect when they were written.)
3. **aps — `design_decisions_log.md` (durable, numbered) + `model_workflow.md` offload ledger.**
   A clean trail of *why*, and who/which model did what.
4. **golf/aps — one-page `STATUS.md` "what's next" index** over a detailed `MASTER_BACKLOG.md`.
5. **GI-bravo — the "definition of done"** (a feature isn't done until hints/tour/Help **and**
   README/USER_GUIDE/FUTURE_FEATURES are updated). None of the others encode this.
6. **GI-alpha — `CLAUDE.md` = `@AGENTS.md`.** One canonical file, auto-loaded by Claude Code,
   readable by any agent.
7. **Shared infra rules already agreed in two apps:** Firebase **region-lock `australia-southeast1`**
   and **"never deploy to `main` without sign-off"** (golf + aps). These are portfolio-level truths.

## 3. Discrepancies that don't make sense (unify these)
Same concept, different name/place — an agent landing in a repo can't predict where to look:
- **Agent file name:** `CLAUDE.md` (GI-bravo, golf) vs `AGENTS.md` (aps) vs `CLAUDE.md→@AGENTS.md`
  (GI-alpha) vs none (aps-mobility, tempovibes).
- **Decisions log:** `DECISIONS.md` (golf) vs `design_decisions_log.md` (aps) vs none.
- **Backlog/roadmap:** `MASTER_BACKLOG.md`+`STATUS.md` (golf/aps) vs `FUTURE_FEATURES.md`
  (GI-bravo) vs `tasks.csv` (GI-alpha).
- **False-positives / lessons:** only golf has it; everyone else relearns.
- **Definition of done / doc-update discipline:** only GI-bravo has it.
- **Region-lock & deploy-safety:** stated in golf + aps, absent from the consumer apps that will
  soon use the **shared Firebase hub** (see `PORTFOLIO_AUTH_SYNC.md`) — they *should* inherit it.

What is **correctly different** (do NOT force-unify): each app's domain philosophy — GI-alpha's
cognitive-accessibility/Framer rules, golf's "Sydney protocol" state model, aps's offline
extraction contract, GI-bravo's local-first roasting UX. Unify the **meta** (where things live,
DoD, self-learning), not the **product**.

## 4. Proposal — a shared baseline + self-learning loop

### 4a. One naming convention (every non-trivial app)
- **`AGENTS.md`** = the canonical agent doc (tool-neutral), with a one-line **`CLAUDE.md`
  containing `@AGENTS.md`** so Claude Code still auto-loads it. (Adopt GI-alpha's trick everywhere;
  GI-bravo/golf rename `CLAUDE.md` → `AGENTS.md` + add the import shim.)
- **`docs/DECISIONS.md`** — durable decisions, `[D-xx]` + a re-test line. (Pick this name; aps's
  `design_decisions_log.md` becomes an alias/redirect.)
- **`docs/STATUS.md`** — one-page "what's next"; **`MASTER_BACKLOG.md`** — detailed ledger.
- **`docs/FALSE_POSITIVES.md`** — "don't re-investigate" list with stable IDs (golf's pattern,
  everywhere).

### 4b. A shared `portfolio-conventions` source of truth
Create a small repo (or pinned doc) holding what is true **across** apps, so it's written once:
- The naming convention above + the **definition of done**.
- **Cross-app rules:** Firebase region-lock `australia-southeast1`; never deploy to `main` without
  sign-off; local-first + opt-in sync (the shared hub, `PORTFOLIO_AUTH_SYNC.md`); "green tests
  prove completeness, not correctness — drive the real UI" (aps); LF line-endings / Vercel rebuilds
  `dist` so hashes differ (GI-bravo lesson); frictionless-by-default UX.
- A **portfolio-level `LESSONS.md` / `FALSE_POSITIVES.md`** for lessons that generalise beyond one
  app.
Each app's `AGENTS.md` then starts with: _"Follows portfolio-conventions vN (see <link>). App-specific
deltas below."_ — so the shared parts are inherited, not copy-pasted-and-drifted.

### 4c. The self-learning loop (the habit that makes it stick)
When a lesson is learned in one app, classify it:
- **App-specific** → that app's `DECISIONS.md` / `FALSE_POSITIVES.md`.
- **Portfolio-general** → **promote** it to `portfolio-conventions` (so the next app inherits it
  instead of rediscovering it).
Reverse direction: starting work in any app, read its `AGENTS.md` (which points at the shared
conventions) **and** the shared `FALSE_POSITIVES`/`LESSONS` first. This is the concrete answer to
"how do we stop relearning the same lessons."

## 5. Suggested rollout (low-risk, incremental)
1. Stand up `portfolio-conventions` (this doc + the naming convention + cross-app rules + a
   `LESSONS.md`). One small repo.
2. In each active app (GI-bravo, golf, aps-*, GI-alpha): add the `AGENTS.md` (+ `CLAUDE.md` shim),
   a `DECISIONS.md` and `FALSE_POSITIVES.md` if missing, and a one-line pointer to the shared
   conventions. Keep all existing app-specific content.
3. Seed `FALSE_POSITIVES`/`LESSONS` from what already exists (golf's FP list; the GI-bravo
   merge-order/dist/LF lessons; the region-lock + deploy-safety rules).
4. tempovibes/GI-charlie: a tiny `AGENTS.md` pointer only (or skip until they grow).

Each app's adoption is its own small PR; nothing is forced and no product behaviour changes.
