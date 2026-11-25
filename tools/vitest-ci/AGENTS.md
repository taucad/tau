# @taucad/vitest-ci

## Responsibility

Shared Vitest reporter list, CI test outcome recorder and recorded retry for every Tau test target

- Nx project: `vitest-ci`
- Project root: `tools/vitest-ci`
- Placement: `tools`
- Build mode: none; consumers import the TypeScript source through `exports` (like `tools/nx`), so no test target waits on a build and no third-party declarations are bundled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:tool`

## Entrypoints

- `src/test-reporters.ts` (`@taucad/vitest-ci`): `testReporters`, the list every Vitest config uses, and `testRetry`, the `retry` every config sets beside it
- `src/outcome-reporter.ts` (`@taucad/vitest-ci/outcome-reporter`): `OutcomeReporter` and the outcome row schema
- `src/retry-policy.ts` (`@taucad/vitest-ci/retry-policy`): `RetryPolicyReporter`, `judgeRetries` and `retryBudget`, the recorded retry of testing policy § 16.2
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint vitest-ci
pnpm nx test vitest-ci --watch=false
pnpm nx typecheck vitest-ci
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

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- The recorded retry (CI flake quarantine blueprint FQ-4, RT-1 to RT-5): `testRetry()` is 1 on CI and 0 locally or under the flake harness (`TAU_FLAKE_REPRO_SEED`). `RetryPolicyReporter` prints each retried pass as a warning annotation and a job summary row, and fails the task (`process.exitCode = 1`) for a retried pass in a file the change touches (merge base of `NX_BASE` and `NX_HEAD`, on a pull request or merge-queue run), under the harness, or when the change cannot be read; for more than three retried passes in the task (counted from the outcome file, across Vitest processes); and for a test that ran more than two attempts on CI. It runs after `OutcomeReporter` in `testReporters`, so the outcome file is complete when it counts. The run cap of five is the `Run affected tasks` gate's, in `ci.yml`, from the run's `test-outcomes-*` artifacts. `scripts/src/test-retry-policy.test.ts` keeps every config on `retry: testRetry()`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
