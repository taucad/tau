# @taucad/chat-surfaces

## Responsibility

Tau UI app chat surfaces: chat Markdown, reference chips, the composer's context-chip node and chat questions, composed from the chat, files and editor features

- Nx project: `chat-surfaces`
- Project root: `apps/libs/chat-surfaces`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled; tests run in jsdom
- Tags: `scope:ui, type:app-lib, layer:feature, ui:chat-surfaces`

## Entrypoints

- `package.json` exports: one subpath per module under `src/`; pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint chat-surfaces
pnpm nx test chat-surfaces --watch=false
pnpm nx typecheck chat-surfaces
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [apps AGENTS](../../AGENTS.md)
- [apps/libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- Layer L2 (`ui:chat-surfaces`): `eslint.config.mjs` names the UI app libraries it may depend on (`chat-ui`, `files-ui`, `editor-ui`, `ui-core`, `ui-kit`). Never import `apps/ui`, another L2 library or `agent-host-ui`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
