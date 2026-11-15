# Tau Desktop

`apps/desktop` is the Electron app. Its main process discovers ACP agents with `@taucad/host`'s registry and hands the descriptors to the renderer, so a launch from Finder, the Dock, the Start menu or a `.desktop` entry must find the same agents as a terminal.

## Policy routes

- ACP agent discovery, refusal logging and re-discovery (`src/main/external-agent-discovery.ts`, the agent wiring in `src/main/main.ts`): read the [ACP agent policy](../../docs/policy/acp-agent-policy.md).

## Commands

Run from the workspace root:

```bash
pnpm nx lint desktop
pnpm nx test desktop --watch=false
pnpm nx typecheck desktop
```
