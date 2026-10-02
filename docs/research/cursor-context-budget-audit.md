---
title: 'Cursor Context Budget Audit'
description: 'Findings and recommendations for auditing Cursor IDE context usage (rules, tools, skills, MCP, AGENTS.md) and reclaiming the always-on token budget'
status: active
created: '2026-05-13'
updated: '2026-05-13'
category: audit
related:
  - .agent/skills/audit-cursor-context/SKILL.md
---

# Cursor Context Budget Audit

Investigation into why the Tau workspace's Cursor context bar reports `~142.4K / 300K (47%)` with `Rules: 59.3K` and `Tools: 22.4K` consumed before the user types a message, plus the May 2026 best practices for reclaiming that budget.

## Executive Summary

The 200K–300K token context window in Cursor (May 2026) is consumed by four always-on layers — system prompt, tools, rules, and skills metadata — that load before any user message. In the Tau workspace these layers occupy 93.4K tokens (≈31% of a 300K window) at session start, leaving Conversation + Summarized conversation to compete for the remaining 207K. The dominant cost (Rules: 59.3K) traces to a single 148KB `AGENTS.md` file. Rule frontmatter discipline is otherwise strong (only 1 of 10 `.cursor/rules/*.mdc` is `alwaysApply: true`). The architectural fix is to (a) shrink/segment `AGENTS.md`, (b) audit MCP server tool counts against Cursor's 40-tool ceiling, and (c) leave skills as-is — skills are progressive-disclosure by design and only their description (~50–250 tokens each) is loaded until invoked.

## Problem Statement

The user's Cursor context bar (May 2026) shows the following pre-message breakdown for a Tau session:

| Layer                   | Tokens     | % of 300K |
| ----------------------- | ---------- | --------- |
| System prompt           | 4.5K       | 1.5%      |
| Tools                   | 22.4K      | 7.5%      |
| **Rules**               | **59.3K**  | **19.8%** |
| Skills                  | 4.4K       | 1.5%      |
| MCP                     | 2.8K       | 0.9%      |
| Subagents               | 1.1K       | 0.4%      |
| Summarized conversation | 18.3K      | 6.1%      |
| Conversation            | 29.4K      | 9.8%      |
| **Total**               | **142.4K** | **47.5%** |

The user perceives "rules and tools are taking way too much context" and wants a repeatable audit workflow. The smoking gun is the Rules row.

## Methodology

1. Web research across May 2026 sources (Cursor docs, community forums, third-party analyses, the `ctxaudit` tool).
2. Static inspection of the workspace:
   - `.cursor/rules/*.mdc` frontmatter (`alwaysApply`, `globs`, `description`).
   - `AGENTS.md` size in bytes (`wc -c`) and line count.
   - `.agent/skills/*/SKILL.md` count and `disable-model-invocation` settings.
   - `.cursor/mcp.json` server count and inferred tool count.
3. Mapping each context-bar layer to its file-system origin so the audit can be re-run programmatically.

## Findings

### Finding 1: AGENTS.md dominates the Rules budget

`AGENTS.md` at the workspace root is 147,877 bytes spread across 141 lines — a small number of extremely long lines holding the `Learned User Preferences` and `Learned Workspace Facts` paragraphs. At ~3.7 chars/token for English prose, this single file accounts for **≈37–40K tokens**, or **65–70% of the 59.3K Rules line**.

Both Cursor and the upstream tooling treat `AGENTS.md` as an always-applied workspace rule (it is injected into `<always_applied_workspace_rules>` of the system prompt, alongside any `.cursor/rules/*.mdc` with `alwaysApply: true`). It is not gated on the user `@`-mentioning it, on a glob, or on agent intent.

### Finding 2: `.cursor/rules/*.mdc` discipline is already strong

Audit of all 10 rules:

| Rule                      | alwaysApply | Globs                                | Lines |
| ------------------------- | ----------- | ------------------------------------ | ----- |
| `agents-md.mdc`           | false       | `AGENTS.md`                          | 15    |
| `context-engineering.mdc` | false       | `**/tools/**`, `**/prompts/**`       | 45    |
| `documentation.mdc`       | false       | `apps/ui/content/docs/**`, `docs/**` | 60    |
| `eslint.mdc`              | false       | `*.ts, *.tsx`                        | 30    |
| `package-manager.mdc`     | **true**    | (none)                               | 42    |
| `parameter-design.mdc`    | false       | `*.ts, *.tsx, *.js, *.jsx`           | 66    |
| `tailwind.mdc`            | false       | `*.tsx`                              | 8     |
| `testing.mdc`             | false       | `*.test.ts`                          | 60    |
| `ui-design.mdc`           | false       | `*.tsx`                              | 18    |
| `xstate.mdc`              | false       | `*.machine.ts`                       | 41    |

Only `package-manager.mdc` (42 lines, ≈250 tokens) is always-applied. This is well below the public benchmark of "22 always-apply rules totalling 2,700 lines" reported as a typical bloat case in the third-party analysis. The remaining ≈19K of the 59.3K Rules line therefore comes from `AGENTS.md` blocks expanded into the system prompt as `Learned User Preferences` / `Learned Workspace Facts` (which the IDE injects whether or not the user is editing a file the rule scopes match).

### Finding 3: Tools at 22.4K signals MCP tool bloat

Cursor enforces a hard ceiling of **40 MCP tools per session** (May 2026). Each tool schema with verbose descriptions and ~5 parameters costs ≈200 tokens; 31 tools costs 3K–5K tokens; the Tau session's 22.4K tools line implies **≈100+ tool schemas** being shipped (built-in editor tools + MCP servers). The active MCP servers in this workspace are:

- `cursor-ide-browser` (browser automation, ~20 tools — large per-tool descriptions)
- `plugin-stripe-stripe`
- `user-nrwl.angular-console-extension-nx-mcp`
- `user-eamodio.gitlens-extension-GitKraken`
- `user-github`

`cursor-ide-browser` alone, with its multi-paragraph `serverUseInstructions` and ~20 verb-style tools (snapshot, click, type, navigate, lock, unlock, profile, etc.), is the dominant tools-budget consumer.

### Finding 4: Skills are correctly progressive-disclosure

The 16 skills under `.agent/skills/` plus ~14 personal skills under `~/.agent/skills*/` together cost only 4.4K tokens — Cursor loads only each skill's frontmatter (`name`, `description`, ~50–250 tokens) until invoked. Setting `disable-model-invocation: true` on a skill makes the agent ignore it for ambient routing without removing the description, which is a small additional win (~10% of a skill's metadata footprint).

### Finding 5: `Conversation` + `Summarized conversation` reflect normal session growth

The 47.7K combined conversation cost is healthy at this point in a session. The dynamic-context-discovery design Cursor adopted in 2026 (long tool outputs spilled to files, MCP tool sets loaded on demand, chat-history search instead of lossy compaction) is doing its job here — the audit should not target these layers.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                               | Priority | Effort | Impact                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------- |
| R1  | Split `AGENTS.md` into a lean architectural core (≤300 lines, ≤8K tokens) plus glob-scoped sub-rules (e.g. `runtime-facts.mdc`, `ui-facts.mdc`, `agent-facts.mdc`) under `.cursor/rules/`.                                                                           | P0       | Medium | ≈30K tokens reclaimed  |
| R2  | Audit MCP servers: disable unused tools per server (Cursor lets you toggle individual tools), or remove servers whose tools never get called in practice. Aim for ≤25 active tools.                                                                                  | P0       | Low    | ≈10K tokens reclaimed  |
| R3  | Where verbose `serverUseInstructions` exist (e.g. `cursor-ide-browser`), trim each tool description to ≤50 words and move detailed playbooks into a skill that loads on demand.                                                                                      | P1       | Medium | ≈3–5K tokens reclaimed |
| R4  | Move "Learned User Preferences" and "Learned Workspace Facts" paragraphs out of `AGENTS.md` into `.cursor/rules/learned-*.mdc` files with **descriptive globs** (e.g. graphics facts → `apps/ui/app/components/geometry/**`, runtime facts → `packages/runtime/**`). | P0       | Medium | ≈25K tokens reclaimed  |
| R5  | Add `disable-model-invocation: true` to skills that should only load when the user types `/skill-name` (e.g. `mine`, `submit-pr`, `package-release`, `occt-wasm-build`).                                                                                             | P2       | Low    | ≈0.5K tokens reclaimed |
| R6  | Adopt the [`ctxaudit`](https://github.com/sanjeed5/ctxaudit) Python CLI (or the equivalent Tau audit script) as a pre-flight check whenever Rules > 20K tokens.                                                                                                      | P2       | Low    | Visibility             |
| R7  | Document the audit workflow as a Cursor skill (`audit-cursor-context`) so any contributor can re-run it from chat.                                                                                                                                                   | P0       | Low    | Workflow               |

Expected outcome after R1+R2+R4: Rules drops from 59.3K → ≈4–6K, Tools from 22.4K → ≈12K, returning **≈60K tokens (20% of a 300K window)** to the conversation budget.

## Trade-offs

| Approach                                    | Pro                                                                              | Con                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| Keep `AGENTS.md` as one file                | Single source of truth; portable across Claude Code / Copilot / Cursor           | Always-loaded; 40K-token tax on every session |
| Glob-scoped `.cursor/rules/*.mdc`           | Loads only when relevant files are touched                                       | Cursor-specific; not portable to other agents |
| Layer both: lean `AGENTS.md` + scoped rules | Portability for the architectural core; surgical context for the long-tail facts | Two files to maintain                         |

The third option matches the May 2026 community consensus (Cursor blog "agent-best-practices", thepromptshelf.dev guide) and is what R1+R4 prescribe.

## Code Examples

### Example: splitting a long-tail facts paragraph into a scoped rule

Before (`AGENTS.md`, contributes to every session):

```markdown
## Learned Workspace Facts

- Three.js CAD viewers dual-stack WebGL and WebGPU: `graphics.machine` probes
  `navigator.gpu.requestAdapter()`, persisted GraphicsViewSettings includes
  graphicsBackend, ... [3,000 more words about graphics] ...
```

After (`.cursor/rules/graphics-facts.mdc`, loads only when graphics files are touched):

```markdown
---
description: Three.js / WebGPU graphics-pipeline facts for the CAD viewer
globs:
  - 'apps/ui/app/components/geometry/**'
  - 'apps/ui/app/machines/graphics.machine.ts'
alwaysApply: false
---

# Graphics-Pipeline Facts

- Three.js CAD viewers dual-stack WebGL and WebGPU: `graphics.machine` probes ...
```

### Example: counting always-applied rule tokens

```bash
# bytes → ~tokens (English prose, 3.7 chars/token)
total_bytes=$(awk '/alwaysApply: true/{found=FILENAME} END{}' .cursor/rules/*.mdc \
  | xargs wc -c \
  | tail -1 \
  | awk '{print $1}')
echo "always-applied rules: ~$((total_bytes / 4)) tokens"

# AGENTS.md cost
echo "AGENTS.md: ~$(($(wc -c < AGENTS.md) / 4)) tokens"
```

## Diagrams

```
                         ┌─────────────────────────────────┐
   System prompt 4.5K ──▶│                                 │
   Tools        22.4K ──▶│  ALWAYS-ON  ── 93.4K tokens     │
   Rules        59.3K ──▶│  (loaded before any user input) │
   Skills (meta) 4.4K ──▶│                                 │
   MCP           2.8K ──▶│                                 │
                         └─────────────────────────────────┘
                                       │
                                       ▼
                         ┌─────────────────────────────────┐
   Conversation 29.4K ──▶│                                 │
   Summary      18.3K ──▶│  DYNAMIC ── grows per turn      │
   (tool output spilled  │                                 │
    to files when large) │                                 │
                         └─────────────────────────────────┘
```

## References

- Cursor docs: [Rules](https://cursor.com/docs/context/memories), [Skills](https://cursor.com/help/customization/skills), [Agent best practices](https://cursor.com/blog/agent-best-practices), [Dynamic context discovery](https://cursor.com/blog/dynamic-context-discovery)
- Community: [The alwaysApply Tax](https://agenticthinking.ai/blog/alwaysapply-tax/) — audit case study (22 always-apply rules → 65% reduction)
- Community: [Cursor token budget — nedcodes](https://nedcodes.dev/guides/cursor-token-budget) — 3,000-token always-loaded budget recommendation
- Tooling: [`sanjeed5/ctxaudit`](https://github.com/sanjeed5/ctxaudit) — CLI that audits the "invisible context tax"
- Forum: [About limitation of the number of MCP tools](https://forum.cursor.com/t/about-limitation-of-the-number-of-mcp-tools/107844) — 40-tool ceiling
- Analysis: [MCP tool token overhead](https://fazm.ai/blog/mcp-tool-token-overhead-optimization) — 31 tools ≈ 3–5K tokens
- Comparison: [Cursor Rules vs AGENTS.md](https://thepromptshelf.dev/blog/cursorrules-vs-claude-md/) — layer both
- Related skill: `.agent/skills/audit-cursor-context/SKILL.md`

## Appendix: Tau workspace inventory snapshot (2026-05-13)

| Asset                                 | Count         | Notes                                                                                                                                                 |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` size                      | 147,877 bytes | ≈37–40K tokens always-loaded                                                                                                                          |
| `.cursor/rules/*.mdc`                 | 10            | 1 with `alwaysApply: true` (`package-manager.mdc`, 42 lines)                                                                                          |
| `.agent/skills/*`                     | 16            | Progressive-disclosure (frontmatter only loaded)                                                                                                      |
| Personal skills (`~/.agent/skills*/`) | 14            | Same progressive-disclosure model                                                                                                                     |
| Active MCP servers                    | 5             | `cursor-ide-browser`, `plugin-stripe-stripe`, `user-nrwl.angular-console-extension-nx-mcp`, `user-eamodio.gitlens-extension-GitKraken`, `user-github` |
| Estimated MCP tool count              | ≈100+         | Above the 40-tool ceiling — needs trim                                                                                                                |
