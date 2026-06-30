# Portfolio conventions & cross-app self-learning

_Written 2026-06-27. A review of how the apps in this portfolio document conventions for
AI agents and humans, the discrepancies between them, and a proposal to **stop relearning
the same lessons** across apps. Scope reviewed: GI-bravo, GI-alpha, golf_handicap_tracker,
aps-agency-comparator, aps-mobility-engine, tempovibes (GI-charlie is empty)._

> This doc currently lives in GI-bravo as the working hub. **Proposed home: a small shared
> `portfolio-conventions` repo** (or a pinned gist) that every app links to — see §4.

> **⚠️ Execution status (reconciled 2026-06-30).** This is still a *proposal* — most of §4–§5 is
> **not yet done**, so read it as a plan, not a description of reality.
> - **Adopted:** GI-bravo now has a root **`STATUS.md`** (single source of truth for status, PR #95)
>   and a slimmed docs definition-of-done — i.e. it finally adopted the §4 `STATUS.md` convention
>   that golf/aps already had.
> - **Still pending (everywhere):** the `AGENTS.md` rename + `CLAUDE.md` shim, `DECISIONS.md`,
>   `FALSE_POSITIVES.md`, and the shared `portfolio-conventions` repo itself.
> - **Root cause to fix:** the **self-learning loop (§4c) never closed** — these were written down
>   in 2026-06-27 and not propagated. See `LESSONS.md` → Radar #3 (2026-06-30).

---

## 1. What each app does today (governance docs)

| App | Agent file | Decisions log | Backlog / status | "Don't re-investigate" | Notes |
|---|---|---|---|---|---|
| **GI-bravo** | `CLAUDE.md` (rename to `AGENTS.md` still pending) | — (no `DECISIONS.md` yet) | **`STATUS.md`** (#95) + `FUTURE_FEATURES.md` | — (no FP list yet) | "Definition of done" (docs/hints/tour/help) now points status at `STATUS.md`; narrative in `ROASTER_JOURNEY.md`. |
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

## 6. Execution plan — lean rollout without losing the gold (2026-06-30)

Refines §4–§5 with the 2026 SOTA scan (see GI-bravo `LESSONS.md` → Radar #3): the goal is **lean
standardisation**, not more governance. We unify the **meta** (where status / lessons / decisions
live) and **never** the **product gold** — each app's hard-won domain knowledge stays put.

### 6a. The gold we must NOT lose (preserve, don't flatten)
Each app has unique, valuable context that standardisation must carry forward verbatim:
- **golf** — the "Sydney protocol" state model + **Known False Positives FP-01…10** (the most mature
  self-learning asset in the portfolio — *this seeds the standard*) + `DECISIONS.md` `[D-xx]` history.
- **aps-agency-comparator / aps-mobility-engine** — the **offline-extraction contract**, the
  `model_workflow.md` **offload ledger**, numbered design-decision log, `PIR_log.md`, `PROJECT_ANCHOR.md`.
- **GI-alpha** — cognitive-accessibility / Framer rules; "Gemini PM + Jules executor" model; `VISION.md`.
- **GI-bravo** — local-first roasting UX, the detector/Roast-Lab lineage, the merge-order / dist-LF /
  stranded-push lessons.
Rule: the rollout is **additive** — it adds a lean spine (AGENTS.md / STATUS.md / FALSE_POSITIVES),
seeded *from* this gold; it deletes nothing and rewrites no domain doc.

### 6b. Step 1 — HARVEST & AUDIT first (read-only; this is the gold-protection step)
**Yes, a doc/code review of each app is a prerequisite** — GI-bravo just proved you can't trust an
app's docs until you audit doc-vs-code (its "live" backend read as "parked"). So before touching
anything, per app:
1. **Doc-vs-code drift audit** (the GI-bravo method): find contradictions, stale "not built" claims,
   aspiration-layer drift, manifest gaps.
2. **Gold inventory:** list every lesson / decision / FP / domain rule / convention worth keeping.
3. **Output:** a per-app findings report + a *proposed* lean target (what its STATUS.md / AGENTS.md /
   FALSE_POSITIVES would contain, seeded from the harvest). **No edits to the app yet.**

### 6c. Step 2 — SCAFFOLD (supervised, additive PRs, after the owner reads the harvest)
Per app, one small PR: rename `CLAUDE.md` → `AGENTS.md` + shim (single lean source, symlinked so
Claude *and* Antigravity read it), add `STATUS.md` (single status owner) + `FALSE_POSITIVES.md`
(seeded from the harvest) + a one-line pointer to these shared conventions. Keep all existing content;
verify the app's own tests still pass.

### 6d. Step 3 — CLOSE THE LOOP (the bit that's been missing)
Adopt the promote-habit: a lesson learned in one app → app `FALSE_POSITIVES`/`DECISIONS`; if general →
promoted here. Each `AGENTS.md` opens with *"Follows portfolio-conventions vN — App-specific deltas
below."* Bias lessons toward **failure → preventative rule** (ReasoningBank pattern).

### 6e. Sequence (most-mature first, so it seeds the standard)
GI-bravo (✅ done) → **golf** (harvest its FP/DECISIONS to *define* the standard) → **aps-\*** (rich
decision/offload logs) → **GI-alpha** → **tempovibes / GI-charlie** (tiny — pointer only or skip).

### 6f. Running the harvest as an overnight loop (20-min heartbeat)
Mirror last night's GI-bravo build loop, but **two important differences** for a *cross-repo* run:
**(i) Phase 1 is AUDIT-ONLY** — read + report, **no edits to other repos** (an unsupervised run must
not restructure six repos' docs and risk the gold); scaffolding PRs (Phase 2) come *after* the owner
reads the harvest. **(ii) Preconditions:** all repos reachable locally (cloned in one workspace) +
the explicit "harvest, don't replace" guardrail in the prompt.
- **Queue (one app per sprint):** golf → aps-agency-comparator → aps-mobility-engine → GI-alpha →
  tempovibes.
- **On each wake:** read the shared progress log; pick the next un-audited app; run 6b (drift audit +
  gold inventory + proposed lean target); append its findings; schedule the next wake ~1200 s.
- **Output:** a consolidated **gold inventory + per-app drift findings + draft lean-structure
  proposals** for the owner to review — then Phase 2 scaffolds the approved ones as supervised PRs.
- **Guardrails:** read-only/audit on Phase 1; never edit another repo's domain docs unsupervised;
  never delete; never merge; one app per sprint; log what was found + anything needing a decision.
- **Optional structure lens (`graphify`) — trialled, keep as a disposable onboarding aid:** as a
  *disposable* aid at the start of a sprint, run `graphify .` once to get a structure map + god-nodes +
  community clustering, read it as input to the audit, then **drop it** (`graphify-out/` is git-ignored;
  never wire the always-on MCP). The GI-bravo trial (Radar #3) confirmed it adds little where you're
  already context-aware, but its blind subsystem clustering was accurate enough to **speed up
  onboarding into apps we DON'T know** — which is exactly the harvest. **Set an `*_API_KEY`** when
  running it on the other apps so communities get *named* (the unnamed code-only output loses much of
  the value); code stays local either way. Treat INFERRED edges with suspicion (it can conflate
  same-named functions across files). Load-it-then-put-it-down, never standing infrastructure.
