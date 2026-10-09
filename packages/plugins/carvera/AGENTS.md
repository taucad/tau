# @taucad/carvera

## Responsibility

Makera Carvera C1 (stock firmware 1.0.7) LAN machine plugin, with a simulated Carvera

- Nx project: `carvera`
- Project root: `packages/plugins/carvera`
- Placement: `packages/plugins`
- Capabilities: `machine`
- Host target: `daemon`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/carvera.plugin.ts`
- `src/carvera.machine.ts` (`carveraMachine`: UDP 3333 discovery, TCP 2222 connect)
- `src/carvera.protocol.ts` (frames, CRC, status/diagnose parsing, halt codes, broadcasts)
- `src/carvera.session.ts` (ABI v2 session: report, actions, jog hold, jobs, stop, reconcile)
- `src/carvera.manifest.ts` (manifest, actions, submission options, `carvera-simulation` profile)
- `src/carvera.gcode.ts` (program summary for prepare)
- `src/carvera.simulator.ts` (`carveraSimulatorMachine`: in-memory controller behind the real session)
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint carvera
pnpm nx test carvera --watch=false
pnpm nx typecheck carvera
pnpm nx build carvera
pnpm nx pkgcheck carvera
pnpm nx size carvera
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)
- [packages/plugins AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Plugin workflow](../../../.agents/skills/create-plugin/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Runtime architecture policy](../../../docs/policy/runtime-architecture-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- Tests and manual checks use `createCarveraSimulator` only; never contact a real Carvera.
- Position trust comes only from an observed `Home`→other transition or a Tau-sent `reset`; stock status has no homed flag, so a machine homed before Tau connected stays `unknown` until it homes again.
- Unverified against hardware: file frame order B0–B6, cover/emergency-stop polarity in `diagnose`, the `md5sum` and `version` reply formats, the `probe.run` corner (`M495.3`) and bore (`M480.2`) subcodes, whether `P:` reaches 99 % before it disappears at the end of a file (the `completed` inference), and whether `buffer` lines survive a refused `play`. `tool.change` cannot empty the spindle (`T-1`). Keep the simulator and the session in step when one is confirmed.
