# @taucad/host

`@taucad/host` is the Tau Host daemon behind `tau serve`. Tau Desktop also uses its ACP agent registry, so an `src/acp` change reaches both.

## Policy routes

- ACP agent profiles, discovery, probes and sign-in (`src/acp/registry.ts`, `src/acp/locate.ts`, `src/acp/session.ts`): read the [ACP agent policy](../../docs/policy/acp-agent-policy.md).

## Commands

Run from the workspace root:

```bash
pnpm nx lint host
pnpm nx test host --watch=false
pnpm nx typecheck host
```
