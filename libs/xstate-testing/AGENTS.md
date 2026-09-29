# @taucad/xstate-testing

## Responsibility

Private XState v6 test harness for owner-machine tests (xstate-policy.md MC-R23): actor guards, a step clock, path enumeration and shared fakes. It is test tooling: consumers take it as a devDependency, and `tau-lint/xstate-contract` (`harnessImport`) keeps it out of product code.

- Nx project: `xstate-testing`
- Project root: `libs/xstate-testing`
- Placement: `libs`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:tool`

## Entrypoints

- `./inspect` (`src/inspect.ts`): `guardActors`, `recordTransitions`, `validated`
- `./clock` (`src/clock.ts`): `StepClock`, `flush`
- `./paths` (`src/paths.ts`): `pathTable`, `unansweredEvents`, `unreachedStates`, `foreignEventChanges`
- `./fakes` (`src/fakes.ts`): scripted promise and callback actors, a fake parent, `recordEmitted`
- No root barrel; `src/package.test.ts` pins the exports map
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint xstate-testing
pnpm nx test xstate-testing --watch=false
pnpm nx typecheck xstate-testing
pnpm nx build xstate-testing
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- `src/watchlist.test.ts` pins the installed `xstate` version (MC-R22). An `xstate` bump fails it until the pin moves, and moving the pin means re-running the suites its message names.
- W1's `@taucad/formal` imports `./clock` and `./fakes` by their current names; keep those exports stable.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
