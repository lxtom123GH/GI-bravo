# LESSONS — best-practice radar & cross-app learnings

The output of the **best-practice radar** (a weekly web scan + monthly retro — see
`CLAUDE.md` / `PORTFOLIO_CONVENTIONS.md`). Each entry is dated; findings are tagged
**Adopt** (do it), **Watch** (track, not yet), or **Ignore** (enterprise-only / not for a
solo dev). Portfolio-general lessons should be promoted to the shared
`portfolio-conventions` once it exists. _Filtered for a solo developer using **both Claude
and Gemini**._

---

## 2026-06-27 — Radar #1 (first run)

### Agent docs: AGENTS.md is now the cross-tool standard — **Adopt**
- `AGENTS.md` is read natively by **Claude Code AND Gemini CLI** (plus Cursor, Codex,
  Copilot, Windsurf…), 60k+ repos, stewarded by the Linux Foundation. Originated at Anthropic,
  open-sourced late 2025.
- **Why it matters here:** you use *both* Claude and Gemini, so one `AGENTS.md` (with a
  `CLAUDE.md` → `@AGENTS.md` shim) means both tools read the *same* instructions — no drift.
  (If it were Claude-only, the advice is "just use CLAUDE.md"; it isn't, so AGENTS.md wins.)
- **Action:** execute the `PORTFOLIO_CONVENTIONS.md` plan — rename each app's agent file to
  `AGENTS.md` + add the `CLAUDE.md` shim.
- Sources: [buildbetter](https://blog.buildbetter.ai/agents-md-complete-guide-for-engineering-teams-in-2026/),
  [agent standards 2026](https://blog.agentailor.com/posts/top-ai-agent-standards-2026).

### Keep agent docs concise (<~200 lines) + end long sessions — **Adopt**
- Anthropic's guidance: keep CLAUDE.md/AGENTS.md concise (~under 200 lines); context fills fast
  and quality degrades in very long sessions — summarise state to a file and start fresh.
- **Here:** GI-bravo `CLAUDE.md` ≈ 60 lines (good); golf's ≈ 154 (fine, watch it). The durable
  docs we keep writing (HANDOFF/ROASTER_JOURNEY/this file) *are* the session-summary mitigation.
- Source: [Claude Code best practices](https://code.claude.com/docs/en/best-practices),
  [CLAUDE.md guide](https://maketocreate.com/claude-md-best-practices-the-complete-2026-guide/).

### Claude vs Gemini — division of labour — **Adopt**
- Mid-2026: **Claude Opus 4.8** leads agentic coding (SWE-bench ~88%) — best for "edit/refactor/
  test my code in the terminal." **Gemini 3.1 Pro** (~80% SWE-bench) is strong on **1M-token
  context, multimodal, Google-stack (Firebase/Android/Colab), and real-time Google-Search
  grounding**.
- **Why it matters here:** directly answers "Gemini isn't as good at coding but has other fuels."
  Use **Gemini** for: whole-codebase/large-context reads, **Firebase/Google-stack work** (relevant
  to the shared Firebase hub in `PORTFOLIO_AUTH_SYNC.md`), and research/grounding passes. Use
  **Claude** for: the actual implementation, refactors, tests, multi-file agentic edits.
- **Action:** when the Firebase hub rollout happens, consider Gemini for Google-stack specifics;
  use Gemini for big-context audit/research, Claude to implement.
- Sources: [coding comparison](https://www.cosmicjs.com/blog/best-ai-for-developers-claude-vs-gpt-vs-gemini-technical-comparison-2026),
  [Gemini CLI vs Claude Code](https://www.datacamp.com/blog/gemini-cli-vs-claude-code).

### PWA: consider `vite-plugin-pwa` + an offline fallback — **Watch → Adopt**
- 2026 best practice: `vite-plugin-pwa` (zero-config, supports vanilla JS) auto-generates a
  **precache manifest**, with stale-while-revalidate for HTML + cache-first for static + an
  **offline fallback page**; verify with the Lighthouse PWA audit.
- **Here:** our hand-rolled `public/sw.js` already does network-first navigation + SWR assets
  (good). But the **fixed `roast-tracker-v1` cache name** is a latent staleness risk; a precache
  manifest (hash-keyed) fixes that, and we lack an offline fallback page + a Lighthouse check.
- **Action (Watch):** evaluate migrating to `vite-plugin-pwa`; add a Lighthouse PWA pass to the
  release checklist. Low urgency — current SW works.
- Sources: [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa),
  [offline-first strategies](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies).

### Ignore (for now) — enterprise-only
- Heavy multi-agent orchestration / fleet CI, org-wide policy frameworks — not worth it for a
  solo dev. Revisit only if the portfolio grows a team.

### Corrections found this session — **Adopt**
- **Behmor capacity was wrong:** we'd coded a 225 g minimum; the Behmor 2000AB Plus actually
  roasts from ~**100 g** (¼ lb / ~113 g and ~100 g samples) up to **454 g**. Fixed the planner
  default and made drum capacity **editable per roaster profile** (so KKTO/variants aren't guessed).
  Source: [Sweet Maria's](https://www.sweetmarias.com/behmor-2000ab-plus-roaster.html).
- **Pre-blend (co-roast) needs similar size + density:** added optional density/size to beans + a
  pre-blend compatibility warning in the blend builder. Source:
  [Perfect Daily Grind](https://perfectdailygrind.com/2024/12/multi-variety-coffee-blends-what-roasters-should-know/).

### Behmor models differ — **Adopt**
- The 1600 Plus / 2000AB / 2000AB Plus aren't identical: the **1600 has no A/B temperature
  readouts** (added on the 2000AB) and drum **8/16 rpm**; the **2000AB** blinks (no beep) at the
  75% safety check while the **2000AB Plus** adds an **audible beep**; 2000AB(+) drum **16/32 rpm**.
  The control panel is now model-aware (`js/roaster-panel.js`). Source:
  [Sweet Maria's](https://library.sweetmarias.com/behmor-2000-ab-plus-new-model-for-2020/).
  Follow-up: store the Behmor sub-model on the roaster profile.

### KKTO = Koffee Kosmo Turbo Oven — **Adopt**
- A DIY drum/agitator roaster (turbo oven for heat); **manual** heat + airflow, no fixed programs;
  ~**300–700 g** (sweet spot 500–650). Corrected the planner's KKTO capacity guess (250–1000) →
  **300–800**, and the control panel gives KKTO a heat/airflow + phase guide (not a button decode).
  Source: [Koffee Kosmo](http://koffeekosmo.blogspot.com/). Builds vary → capacity is per-profile.

### Process lesson — stacked-PR merge trap — **Adopt**
- Merging PRs whose base is another *feature branch* merges them into that branch, **not `main`** —
  the freshness/blends/planner stack all showed "merged" but never reached `main`. Recovered by
  merging the top branch into `main`. Rule added to `CLAUDE.md`: base PRs on `main`, or retarget
  each to `main` before merging.
- **Recurred 2026-06-29 (visual-refresh stack):** #74 (chart, based on the CSS branch) was merged
  *before* #73's branch was deleted, so it landed in `feature/visual-refresh-css`, not `main`.
  Recovered with a fresh PR #75 (chart branch → `main`; clean diff since #73 was already in `main`).
  **The missing nuance:** GitHub only **auto-retargets** a child PR to `main` when you **delete the
  base branch first**. So the safe move is **delete-then-merge** (merge & delete the parent, *then*
  merge the child once it has retargeted) — or pre-retarget the child's base to `main` by hand.

### Process lesson — pushes after a merge are stranded — **Adopt**
- A merged PR is closed, so a commit pushed to that branch afterwards has **no open PR** and the
  owner can't see it (the KKTO panel push landed after #59 was merged → needed a fresh PR #60).
  Rule in `CLAUDE.md`: per PR, tell the owner **"don't merge yet — more coming"** vs **"safe to
  merge now"**; if a push is stranded, open a new branch/PR off the current tip.

---

## 2026-06-29 — Radar #2

### Claude Code: compact sessions at 60% context — **Adopt**
- Radar #1 said "end long sessions"; more precise: **manually compact (or `/clear`) once context
  hits ~60–70%**. Auto-compact fires at ~83.5% and is lossy (retains only 20–30% of detail).
  Proactive compaction preserves more useful context.
- **Action:** treat ~60% context fill as the checkpoint to review scope, compact/clear, and
  continue fresh — not something to push through.
- Source: [Claude Code usage limits playbook](https://www.developersdigest.tech/blog/claude-code-usage-limits-playbook-2026)

### Claude Code: `fallbackModel` config (v2.1.166) — **Adopt**
- New `fallbackModel` setting in `~/.claude/settings.json` lets you chain up to 3 backup models
  tried in order when the primary is overloaded. Recommended chain: `claude-opus-4-8 →
  claude-sonnet-4-6 → claude-haiku-4-5`. Prevents dead sessions during peak hours.
- **Action:** add to personal `~/.claude/settings.json`; no repo change needed.
- Source: [fallbackModel guide](https://www.aiforanything.io/blog/claude-code-fallback-model-overload-fix-2026)

### Claude Code: Writer/Reviewer two-session pattern — **Adopt**
- A fresh-context session for code review avoids the reviewer being anchored to code it just
  wrote. Practical pattern: one session implements, a second reviews (or write tests first, then
  implement to pass them). Already easy with sub-agents or `claude --continue` in a new window.
- Source: [effective Claude Code workflows](https://medium.com/data-science-collective/effective-claude-code-workflows-in-2026-what-changed-and-what-works-now-c93ebc6f8f50)

### Gemini CLI → Antigravity CLI rename — **Watch**
- Google started transitioning Gemini CLI to **Antigravity CLI** from June 18 2026. The free
  personal tier (1,000 req/day, 1M-token context) remains; tool set unchanged (Search grounding,
  file ops, shell, web fetch). v0.43.0 added surgical code-edit preference.
- **Impact on Radar #1:** division-of-labour advice stands; just track the new name. Update any
  docs that reference "Gemini CLI" once the rename is stable.
- Source: [Antigravity CLI announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)

### AGENTS.md: write it yourself — don't AI-generate it — **Adopt**
- New research (May 2026): LLM-generated AGENTS.md files reduce task success in 5/8 tested
  settings and add ~3 extra steps per task. Developer-written files improve success by 4% and
  reduce bugs 35–55%. Codex silently truncates beyond 32 KiB; target ≤ 150 lines.
- **Here:** our CLAUDE.md is ~60 lines and hand-written — keep it that way. When we rename to
  AGENTS.md (per Radar #1 plan), write the content ourselves.
- Source: [AGENTS.md spec research](https://asdlc.io/practices/agents-md-spec/)

### vite-plugin-pwa: prefer `prompt` over `autoUpdate` — **Adopt (when we migrate)**
- Refines the Radar #1 "Watch → Adopt" for `vite-plugin-pwa`: the `registerType: 'autoUpdate'`
  default silently replaces the running app mid-session. Use `registerType: 'prompt'` instead and
  show a "New version available — reload" toast. Old cache cleanup requires explicit `workbox:
  {cleanupOutdatedCaches: true}` (default in `generateSW` strategy, not in `injectManifest`).
- Source: [vite + PWA caching guide 2026](https://www.enjoytoday.cn/posts/vite-pwa-guide/)

### Ignore (for now)
- Gemini 3D interactive model output (novel but no use case here yet).
- Heavy Claude sub-agent hierarchies (3-level nested) — enterprise-scale; solo dev doesn't need
  the orchestration overhead yet.

---

_Next: Radar #3 (weekly) and first monthly retro — see the scheduled routines._
