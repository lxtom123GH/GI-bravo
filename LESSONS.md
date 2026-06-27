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

---

_Next: Radar #2 (weekly) and the first monthly retro — see the scheduled routines._
