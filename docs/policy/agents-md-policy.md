---
title: 'AGENTS.md Policy'
description: 'Canonical root and nested instructions, shared skills, native discovery, autonomous composition, learning and verification for Codex and Claude.'
status: active
created: '2026-03-09'
updated: '2026-09-05'
related:
  - docs/policy/context-engineering-policy.md
  - docs/policy/mcp-tool-budget-policy.md
  - docs/policy/documentation-policy.md
  - docs/policy/tool-output-location-policy.md
---

# AGENTS.md Policy

Internal reference for Tau's shared development-agent instructions and native Codex/Claude adapters.

## Rationale

Agents need current owners, applicable invariants and meaningful checks close to the work. One canonical instruction hierarchy and shared procedure tree prevent host-specific copies from drifting. Detailed policies and evidence stay with their owners and are retrieved when the task requires them.

## Rules

### 1. Keep one authority per kind of content

System, developer and current user instructions take precedence over repository material. `DESIGN.md` governs user-facing design. Applicable normative policies cannot be weakened by operational AGENTS files or skill procedures. Local AGENTS narrow ancestor operation within their directory, consistently with those policies; skills implement the resulting task contract. Resolve contradictions at the owning source.

- Root `AGENTS.md` owns repository operation, the current architecture map and conditional policy router.
- Nearest justified nested `AGENTS.md` owns local entrypoints, checks and operational invariants.
- Existing `docs/policy/*.md` owns cross-cutting standards and full normative detail.
- `.agents/skills/<name>/SKILL.md` and linked resources own repeatable procedures.
- Existing architecture/research owners and package READMEs retain rationale, incidents and superseded architecture.
- The existing program's coordinator-owned execution record holds selection, checkpoints and acceptance.
- Thin supported native adapters configure host discovery and permissions.

Do not maintain another active IDE rule hierarchy or duplicate instruction bodies. Product support for agents, skills or MCP is separate from the development harness.

### 2. Read the complete applicable chain

Before editing a path, read every `AGENTS.md` from repository root through that path's parent, in order. For multiple targets, read the union of their chains and the root's conditional policy routes. Delegated briefs identify those paths and their owned targets.

Start bounded tasks in their narrowest suitable working directory when supported. Codex startup discovery follows its ancestor chain; a root-launched task explicitly reads target descendants. This protocol supplements the native loader rather than assuming dynamic child discovery.

Every canonical AGENTS has an adjacent `CLAUDE.md` containing exactly `@AGENTS.md` plus a newline. Claude imports the shared body through native memory discovery. Keep `.claude/skills` as a verified alias of `.agents/skills`; use a byte-checked generated mirror only for an observed native limitation. Never maintain two authored skill trees.

### 3. Route conditions explicitly

Root AGENTS links exact policies for TypeScript/JavaScript/public declarations; tests and React harnesses; XState; UI/design/accessibility; prompts/tools/filesystem context; application-library placement; GeoSpec; documentation; native instructions/configuration; publication; and generated output.

Directory inheritance cannot express every file type or overlapping concern. Keep one canonical cross-project policy and a route from every affected branch. Event fan-out routes through libraries, filesystem, fs-client, runtime clients and the UI chat-session store; a geometry leaf does not govern a sibling graphics machine.

Use `create-policy` to maintain policy and routes together. Add concise pointers instead of summary copies. Verify current source before asserting that an old path, framework or export still owns a concern.

### 4. Keep operational context bounded

Root holds commands, owners, authority, routing, shared workflows and repository/evidence boundaries. Nested files hold local responsibility, non-obvious entrypoints, invariants, checks and links. A project map is a router, not an inventory of every symbol or skill.

Engineering limits are root ≤8 KiB, each nested file ≤4 KiB, and each repository root-to-leaf chain ≤16 KiB. These are Tau budgets, not vendor limits. Promote detail to its canonical policy/procedure before shortening an instruction; never truncate a qualification to meet a budget.

Optional `Learned User Preferences` and `Learned Workspace Facts` buffers contain at most 12 bullets each, with at most 200 characters per bullet. Split independent claims and route them by ownership. Long rationale belongs elsewhere. Do not grandfather oversized paragraphs or copy ancestor preferences into each descendant.

### 5. Enable relevant skills and composition by default

Models may discover, select and compose relevant shared skills during authorized work without a command-name prerequisite. Descriptions state the actual task, inputs, prerequisites and non-trigger cases. Loading a procedure does not authorize publication, external messages, destructive actions or expanded scope. A review-only request stays review-only.

Normal skills omit `disable-model-invocation` or set it to `false`. Codex's `policy.allow_implicit_invocation` defaults to `true`; do not add `agents/openai.yaml` merely to restate that default. Preserve other useful metadata.

A manual-only exception requires a deliberate user requirement. Record its requirement, workflow, trigger and native metadata in the existing skill inventory, and state the requirement with its evidence reference under `## Manual initiation` in the skill. A legacy sentence, matching test or possible side effect alone is insufficient. Required helpers of autonomous workflows cannot remain manual-only.

Claude's `disable-model-invocation: true` blocks model invocation, hides its description from the model catalog and prevents native subagent preloading. Codex's `policy.allow_implicit_invocation: false` disables implicit selection while explicit user invocation remains available. Do not claim identical hard-denial mechanics or work around a native denial by reading/copying the body through another mechanism.

Change frontmatter, trigger prose, helper calls, authoring templates, native metadata and relevant tests together. Verify natural-language selection, explicit invocation, parent/helper composition, delegated availability and unrelated-task behavior. Preserve independent input bounds, provenance, rights, read-only duties and actual action authorization.

### 6. Use native delegation and one execution owner

Use available native tasks/subagents; a shared worker brief normally suffices. Register a native role only for a real workflow need. Keep model selection and native syntax in its adapter rather than inventing a universally discovered agent directory.

Compose `work-charter` for authorized charter/blueprint execution. The coordinator owns claims, shared indexes and acceptance. Worker briefs specify task/attempt identity, prerequisites, exclusive paths, applicable instructions, source fingerprints, checks and the permitted evidence writer/return channel.

Snapshot relevant tracked and untracked bytes before dispatch; status alone misses edits to already dirty files. Inspect recorded native jobs before recovery/redispatch. Quiet live work retains ownership; fence stale attempts and reconcile unexpected edits without rolling back another writer.

Preserve approved plans and selected scope. Persist checkpoints as useful work is produced. Native UI status is an observation, not another acceptance authority. A worker completion or successful tool exit still requires semantic verification.

### 7. Promote learning through its shared owner

`update-agent-memory` owns promotion into shared instructions. Introspection, research, reviews and execution supply provenance-bearing candidates; they do not concurrently edit a learned sink or share its completion cursor.

Verify current source, filter credentials/private data/transient state, deduplicate semantics and update existing statements in place. Choose the narrowest instruction owner using actual project roots. Cross-project detail goes to an existing policy/procedure with all affected routes. Canonical updates require current authorization and exclusive path ownership.

Use explicit host-supplied history/candidate artifacts and repository-safe fingerprints. Private native memory supplements shared instructions but cannot be the sole owner of a Tau rule. No session-end hook is required. Keep deferred candidates with the existing durable owner; do not commit private transcript indexes or replace an available collector with another parser.

### 8. Preserve repository and optional-checkout boundaries

Tau owns `docs/AGENTS.md` and its Claude import. `docs/research` and `docs/reference` may resolve into Tau Brain; do not create Tau instructions inside their symlink targets. Standalone Brain instructions belong to that repository.

Follow `.agents/skills/create-research/artifacts.md` for durable program evidence. A worker without Brain uses the permitted parent-save path; it does not create a second checkout. Ordinary public install/build/test/runtime remains independent of Brain and optional dependencies.

Required dependency-maintenance guidance stays reachable through Tau-side skills/references. Optional checkouts contribute their own local instructions when present. Never copy credentials, personal configuration or native session stores into the repository to manufacture parity.

### 9. Scaffold useful instructions at project creation

All supported Nx project creators use one shared instruction-template pair to create local AGENTS and its Claude import by default. Package, core and plugin creation—including kernels—share this contract. File-addition generators do not create extra instruction boundaries.

Resolve actual package/project identity, directory, entrypoints, description, capabilities and targets from the scaffold. Link root/ancestors, README and applicable policy/skill owners with correct relative paths. Commands run from workspace root using actual Nx identity; include build only when supported. A short project-notes section invites verified local invariants, not fabricated facts or task progress.

Render instruction templates separately from code templates using native Nx `KeepExisting`. Full creators reject project/path collisions before changing instructions. Repeated writer calls preserve authored bytes and fill only missing pair members. A conflicting authored Claude body is a review finding. Do not synchronize template updates over existing projects or make the default starter opt-in.

### 10. Verify behavior and retire obsolete producers

Use `pnpm nx run scripts:validate-agent-config` for authored boundaries, imports, paths, skills, invocation contracts and budgets. Keep focused tests in existing scripts/generator projects. Observe real root/nested discovery, overlapping policy routes, composition and delegation on each supported host; configuration existence is not runtime evidence.

Use disposable fixtures and documented native isolation without changing global permissions, trust or credentials. Preserve commands, versions, output and actual file/native events. Mark unavailable cases unverified and do not declare parity without evidence.

Tau owns instruction text/templates. Nx remains its workspace/task/code-generation tool; agent provisioning is retired from supported setup. Supported install/discovery/generator commands must not recreate the retired harness. Historical research, negative fixtures, product cursor vocabulary and optional dependency repositories remain legitimate content.

Before legacy deletion, account for every physical row and independent claim with its source fingerprint and accepted destination or supported supersession; recheck current source bytes. One-time migration archives are historical evidence, not another active rule owner.

## References

- [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex skill metadata](https://learn.chatgpt.com/docs/build-skills)
- [Claude memory and imports](https://code.claude.com/docs/en/memory)
- [Claude skill invocation](https://code.claude.com/docs/en/slash-commands#control-who-invokes-a-skill)
- [Claude subagent skills](https://code.claude.com/docs/en/sub-agents#preload-skills-into-subagents)
