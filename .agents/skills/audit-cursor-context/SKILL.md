---
name: audit-cursor-context
description: Audit Cursor IDE context-bar consumption (rules, tools, skills, MCP, AGENTS.md) and recommend cuts. Use when the user complains rules/tools/AGENTS.md are taking too much context, opens the context bar and asks why a layer is large, asks to reclaim context budget, or asks to audit Cursor configuration for token bloat.
disable-model-invocation: true
---

# Audit Cursor Context

Investigate what is consuming the always-on portion of the Cursor context window in this workspace and recommend specific cuts. Always-on layers (system prompt + tools + rules + skills + MCP) load before the user types — every token there is a token unavailable to the conversation.

## Reference

Companion research doc: `docs/research/cursor-context-budget-audit.md` (findings, recommendations, May 2026 best practices).

## Methodology

Run the seven steps below in order. Use the table at the end as the deliverable.

### Step 1: Read the user's reported context-bar numbers

Ask the user to share their Cursor context bar values, or read them from a screenshot if attached. The eight layers to capture:

| Layer                   | What lives there                                       |
| ----------------------- | ------------------------------------------------------ |
| System prompt           | Cursor's built-in agent prompt                         |
| Tools                   | Built-in editor tools + MCP tool schemas               |
| Rules                   | `AGENTS.md` + `.cursor/rules/*.mdc` with `alwaysApply` |
| Skills                  | Frontmatter (description) of every installed skill     |
| MCP                     | MCP server-level instructions (not per-tool schemas)   |
| Subagents               | Subagent type catalog                                  |
| Summarized conversation | Compacted older turns                                  |
| Conversation            | Live message history                                   |

### Step 2: Inventory `.cursor/rules/`

```bash
for f in .cursor/rules/*.mdc; do
  echo "=== $f ==="
  head -5 "$f"
  wc -l "$f"
done
```

Flag every rule with `alwaysApply: true`. Healthy baseline: ≤3 always-applied rules totalling <3K tokens (≈12KB).

### Step 3: Measure `AGENTS.md` overhead

```bash
wc -c AGENTS.md   # bytes
wc -l AGENTS.md   # lines
echo "≈$(($(wc -c < AGENTS.md) / 4)) tokens"   # 3.7 chars/token rule of thumb
```

If `AGENTS.md` exceeds **8K tokens (≈32KB)**, it is too large. The ceiling matters because `AGENTS.md` is always loaded.

### Step 4: Inventory skills

```bash
ls .agent/skills/
# personal skills
ls ~/.agent/skills/ 2>/dev/null
ls ~/.agent/skills-cursor/ 2>/dev/null
```

Skills are progressive-disclosure — only their frontmatter (`name` + `description`) is loaded until invoked. Each costs ≈50–250 tokens. **Do not** recommend deleting skills to save context; recommend `disable-model-invocation: true` on skills that should only run when explicitly typed (`/skill-name`).

### Step 5: Inventory MCP servers

```bash
cat .cursor/mcp.json 2>/dev/null
ls ~/.cursor/projects/*/mcps/ 2>/dev/null
```

For each server, count tools (each MCP tool descriptor lives at `mcps/<server>/tools/*.json`). Cursor enforces a **40-tool ceiling**. If the workspace ships >40 tools, Cursor silently drops the overflow.

### Step 6: Map each context-bar number to its source

Use these rough conversions to attribute bytes → tokens (English prose, ~3.7 chars/token):

| Source                                               | Approximate tokens                    |
| ---------------------------------------------------- | ------------------------------------- |
| `AGENTS.md` (bytes / 4)                              | Always-loaded contribution to Rules   |
| Sum of `alwaysApply: true` rule bodies               | Always-loaded contribution to Rules   |
| Each MCP tool schema (`name + description + params`) | ≈50–300 tokens depending on verbosity |
| Each skill frontmatter                               | ≈50–250 tokens                        |
| MCP server `serverUseInstructions`                   | Variable; can be 1–3K each            |

### Step 7: Produce the deliverable

Output a single markdown table the user can act on:

```markdown
| Layer  | Reported | Largest contributor                                               | Recommended action                                                   | Reclaimed (est.) |
| ------ | -------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------- |
| Rules  | 59.3K    | `AGENTS.md` (147KB ≈ 37K tokens)                                  | Split into lean core + glob-scoped `.cursor/rules/learned-*.mdc`     | ≈30K             |
| Tools  | 22.4K    | `cursor-ide-browser` MCP server (~20 tools, verbose descriptions) | Trim per-tool descriptions to ≤50 words; disable unused tools        | ≈8K              |
| Skills | 4.4K     | 30 skills × frontmatter                                           | Add `disable-model-invocation: true` to skills only invoked manually | ≈0.5K            |
```

## Decision rules

- **Rules > 20K tokens** → audit `AGENTS.md` size first. Anything over 8K tokens in a single always-loaded file is the prime suspect.
- **Tools > 15K tokens** → enumerate MCP servers; suspect the one with the longest `serverUseInstructions` and most verbs.
- **Skills > 10K tokens** → unusually high; skills are normally cheap. Re-check whether any skill is being inlined instead of frontmatter-only.
- **MCP > 10K tokens** → trim `serverUseInstructions` blocks (move detailed playbooks into a skill).
- **Always recommend** layering a lean `AGENTS.md` (architectural core, ≤8K tokens) on top of glob-scoped `.cursor/rules/*.mdc` for long-tail facts. Never recommend deleting `AGENTS.md` outright — it is portable across Claude Code / Copilot / Cursor.
- **Never recommend** deleting skills, only marking them `disable-model-invocation: true`.
- **Never recommend** disabling Cursor's dynamic context discovery (tool-output-to-file, summarization-with-history-search) — those are wins, not costs.

## Refactoring patterns

### Pattern A: Split a fat `AGENTS.md` paragraph into a scoped rule

Move the long-tail "Learned Workspace Facts" / "Learned User Preferences" paragraphs into focused, glob-scoped `.cursor/rules/*.mdc` files:

```yaml
---
description: Graphics-pipeline facts for the CAD viewer (Three.js, WebGPU, TSL)
globs:
  - 'apps/ui/app/components/geometry/**'
  - 'apps/ui/app/machines/graphics.machine.ts'
alwaysApply: false
---
```

The agent loads the file only when the user is touching matching paths. Token cost when not touched: zero.

### Pattern B: Convert a verbose MCP tool description to a skill

If an MCP server ships paragraph-length `serverUseInstructions`, move the detailed playbook into a `.agent/skills/<name>/SKILL.md` and shrink the server-level instructions to ≤50 words pointing at the skill name. Skill bodies load only when the skill is invoked.

### Pattern C: Convert an `alwaysApply: true` rule to glob-scoped

Rewrite the rule's frontmatter:

```yaml
# Before
alwaysApply: true

# After
globs:
  - "**/*.ts"
  - "**/*.tsx"
alwaysApply: false
```

Audit the body to confirm every guideline is genuinely scoped to those file types. If one guideline is universal (e.g. "use pnpm"), keep that one as a separate small `alwaysApply: true` rule (≤300 tokens) and scope the rest.

## Anti-patterns

- **Don't** delete `AGENTS.md` — split it instead. Other agents (Claude Code, Copilot) read it.
- **Don't** delete skills to reclaim Skills-line tokens — the line is already small (frontmatter only).
- **Don't** measure tokens with `wc -w`; use bytes / 3.7 (English prose) or bytes / 4 (mixed code) as the conversion.
- **Don't** recommend running every audit through `ctxaudit` if the workspace already has the seven-step shell methodology above; the CLI is a convenience, not a requirement.

## External tooling (optional)

[`sanjeed5/ctxaudit`](https://github.com/sanjeed5/ctxaudit) is a Python CLI that automates Steps 2–6 across user-level and project-level Cursor configuration. Use it as a sanity check after manual cuts:

```bash
pipx run ctxaudit
```

## Output checklist

When this skill finishes, the user should have:

- [ ] A table mapping each context-bar layer to its filesystem origin
- [ ] An explicit "largest contributor" call-out per layer
- [ ] A prioritized list of cuts with estimated tokens reclaimed
- [ ] No recommendation to disable dynamic context discovery
- [ ] No recommendation to delete `AGENTS.md` outright
- [ ] No recommendation to delete skills
