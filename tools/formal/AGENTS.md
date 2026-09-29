# @taucad/formal

## Responsibility

Pinned TLA+, Apalache and Lean toolchains, the formal runner and conformance library

- Nx project: `formal`
- Project root: `tools/formal`
- Placement: `tools`
- Build mode: none; source-consumed through `package.json` `exports` and `#*.js` imports, like `tools/nx`
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:tool`

## Entrypoints

- `src/cli.ts`: the `formal` command (`setup`, `check --tier pr|nightly|lean`, `update`, `mutants`, `nightly`, `logs`, `known`, `toolchain-id`)
- `package.json` exports `./capture`, `./drift`, `./graph` and `./replay` for owner tests
- `project.json`: `setup` target; owners opt into the `formal*` target defaults in `nx.json`
- `toolchain.lock`: every tool pinned by URL and sha256

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint formal
pnpm nx test formal --watch=false
pnpm nx typecheck formal
pnpm nx run formal:setup --tools=tlc,lean,apalache
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [tools AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)
- [Formal verification policy](../../docs/policy/formal-verification-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
