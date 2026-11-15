# @taucad/cli

`@taucad/cli` is the `tau` command. `tau serve` starts the `@taucad/host` daemon and reports the ACP agents it advertises and refuses.

## Policy routes

- ACP agent refusals and fix commands in `tau serve` (`src/commands/serve.ts`) and the staged adapters (`scripts/stage-acp-adapters.mts`): read the [ACP agent policy](../../docs/policy/acp-agent-policy.md).

## Commands

Run from the workspace root:

```bash
pnpm nx lint cli
pnpm nx test cli --watch=false
pnpm nx typecheck cli
```
