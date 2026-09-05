# AGENTS.md

## Commands

```bash
pnpm nx run @@CREATE_REPO_slug@@:quality
pnpm nx run @@CREATE_REPO_slug@@:test
pnpm nx run @@CREATE_REPO_slug@@:build
pnpm nx run @@CREATE_REPO_slug@@:validate-pack
```

## Scope and authority

Read every AGENTS.md from the repository root to each target directory before editing. Nested instructions narrow their local scope; repository policy and current user instructions retain authority. CLAUDE.md imports the adjacent canonical body. Keep root instructions within 8 KiB, nested bodies within 4 KiB and each chain within 16 KiB.

## Architecture

@@CREATE_REPO_architecture-summary@@

## Conventions

- ESM-only public API through package exports.
- Keep `unbundle: true`; binary URL resolution depends on relative output.
- Public exports require stable JSDoc and consumer-shape tests.
- GitHub Actions is the sole npm publisher.
- Every compatibility check mark maps to a CI job.
- Admission changes are explicit budget or benchmark-identity diffs.

## Skills and learning

Read relevant procedures in `.agents/skills/`; `.claude/skills` aliases that one authored tree. Skills are selectable and composable for the current task without a slash command. Publication, commits and external changes still require task authorization.

Keep local guidance in the nearest justified AGENTS, with an adjacent `CLAUDE.md` containing only `@AGENTS.md` and a newline. Update matching learnings in place; retain evidence in the task handoff. Optional learned sections have at most 12 plain bullets of 200 characters each. Promote long rationale to its existing documentation owner. Do not overwrite authored instructions on subsequent scaffolding.

For parallel work, record disjoint file ownership and one coordinator in the existing task queue. Check live jobs before redispatch and compare file bytes to the recorded baseline; a quiet worker or unchanged Git status does not establish completion.
