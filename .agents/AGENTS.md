# Shared agent procedure instructions

## Authoring and ownership

`.agents/skills/<name>/SKILL.md` is the sole authored project skill tree. `.claude/skills` is a directory alias; adjacent CLAUDE files import canonical AGENTS bodies. Read [AGENTS policy](../docs/policy/agents-md-policy.md), [Create Skill](skills/create-skill/SKILL.md) and the actual parent/helper chain before editing a workflow.

Write precise natural task triggers and keep skill selection/composition enabled by default. A slash command is optional. Do not add `disable-model-invocation` or a false Codex implicit-invocation policy without a deliberate user requirement and the policy's recorded exception. Invocation metadata is not action authorization or a security boundary; preserve bounded input, provenance, rights, trusted-source and publication gates.

One procedure owns each output and state cursor. Compose [Create Research](skills/create-research/SKILL.md) for investigations, [Create Charter](skills/create-charter/SKILL.md) for unresolved program architecture, [Superplan](skills/superplan/SKILL.md) for a requested plan and [Work Charter](skills/work-charter/SKILL.md) for authorized selected execution. Keep one coordinator queue and disjoint worker paths. The [PR worker brief](skills/pr-review-coordinator/pr-issue-fixer.md) is portable content supplied through the available native delegation tool.

## Learning and persistence

[Update Agent Memory](skills/update-agent-memory/SKILL.md) alone promotes learned instructions; [Introspect](skills/introspect/SKILL.md) owns corpus analysis. Preserve existing collector capture identities and evidence. Reconcile matching claims in place and route detailed policy/rationale to its current owner; never grow a second transcript index or always-loaded memory dump.

Use [the artifact contract](skills/create-research/artifacts.md) for substantive outputs, checkpoints, denied-write recovery and separate Tau Brain ownership. Check live jobs before reassigning paths. Compare bytes to the recorded baseline; unchanged Git status does not mean a worker made no edits.

## Verification

Run `pnpm nx run scripts:validate-agent-config` for instruction/skill changes and relevant helper checks for executable behavior. Exercise natural selection, explicit invocation, helper composition and an unrelated prompt in each supported native host when routing changes. Record host/version and observed actions; successful metadata parsing or a worker summary is not native parity.

Keep global settings, optional plugins and credentials outside project authorship. Host-specific adapters contain only what the native host needs; do not duplicate procedure bodies or add mandatory servers without an observed capability requirement.
