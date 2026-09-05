---
name: audit-agent-context
description: Measures agent instruction, skill and tool context in the active Codex or Claude host and recommends source-backed reductions. Use when agent context is bloated, instructions are duplicated, skills activate poorly, or a task needs a harness context audit.
---

# Audit Agent Context

Measure the actual host and applicable instruction chain. Follow [AGENTS policy](../../../docs/policy/agents-md-policy.md) and [MCP capability policy](../../../docs/policy/mcp-tool-budget-policy.md). Resolve a durable research owner through [Create Research](../create-research/SKILL.md) when the audit produces substantive evidence.

## Measure before changing

1. Record host, version, model, startup directory and target directories. Inspect available host diagnostics; use user-provided screenshots when relevant. Report unavailable measurements instead of inventing a context-layer number.
2. Enumerate the root-to-target AGENTS chain and adjacent Claude imports. Measure canonical UTF-8 bytes and the effective chain; count an import's content once. Tau budgets are 8 KiB root, 4 KiB per nested file and 16 KiB per chain. Inspect actual startup/discovery behavior separately from these static sizes.
3. Inventory the host's discovered skills and native tool/server catalogs. Resolve symlinks to deduplicate `.agents/skills` and its `.claude/skills` alias. Inspect optional native metadata and relevant global settings read-only, without printing credentials. Do not assume every skill body is loaded because its description is advertised.
4. Attribute exposed context to repository instructions, skill descriptions/bodies, tool schemas, server instructions and conversation/retrieved evidence. Treat system prompts or host-managed content as unavailable when the host does not expose them. Byte counts are exact; byte-to-token estimates are labeled estimates, never measured savings.
5. Find duplicated owners, stale paths, long rationale in active instructions, ambiguous triggers and unused capabilities. Follow each current procedure end to end before proposing consolidation. Preserve cross-directory and file-type policy routes when narrowing an instruction boundary.

## Make the smallest correct reduction

Move detailed rationale to its existing policy/research/README owner and keep a concise operational route. Keep one authored skill tree with progressive disclosure. Consolidate or retire a skill only with evidence of duplicated ownership, supersession or lack of a current task; description tokens alone are insufficient.

Keep model selection and composition enabled by default. Do not recommend `disable-model-invocation` as a context-saving technique: Claude and Codex implement invocation controls differently, and disabling a helper can break its parent workflow. A deliberate user manual-initiation exception requires separate native evidence and the policy's recorded reason.

Use host-native search, existing CLI/source or an available browser tool when those already supply a capability. Measure tool schemas and latency before changing optional servers; there is no universal project tool-count ceiling. Do not disable useful retrieval/offloading or edit user-global settings without the current task's authorization.

## Verify and report

Run `pnpm nx run scripts:validate-agent-config` for repository changes. Probe the relevant native chain, natural skill trigger, explicit invocation, composition and unrelated prompt after changes. Preserve commands, versions, before/after bytes, observed selection and any unavailable native surface. Static metadata is not behavioral proof.

Report a compact table of layer, observed amount, largest source, proposed change and measured or estimated effect. Link the owning files and identify which current tasks retain their capability. An audit-only request ends with findings; an authorized correction proceeds within its scope.
