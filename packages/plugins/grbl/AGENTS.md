# @taucad/grbl

## Responsibility

Grbl 1.1 and grblHAL CNC router machine plugin

- Nx project: `grbl`
- Project root: `packages/plugins/grbl`
- Placement: `packages/plugins`
- Capabilities: `machine`
- Host target: `daemon`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/grbl.plugin.ts`
- `src/grbl.machine.ts` (serial discovery and connection; the session loads lazily)
- `src/grbl.session.ts` (session ABI v2 over one serial stream; `grbl.report.ts` builds its report and observation deltas)
- `src/grbl.stream.ts` (streams a job: loads under a feed hold, character-counted feed, bit-change pauses, refused lines)
- `src/grbl.protocol.ts` (pure Grbl 1.1 framing, parsing, realtime bytes, character counting, code tables)
- `src/grbl.program.ts` (G-code summary and start checks)
- `src/grbl.manifest.ts` (LongMill MK2 30×30 manifest)
- `src/grbl.simulator.ts` (virtual Grbl 1.1h controller and `grblSimulatorMachine`)
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint grbl
pnpm nx test grbl --watch=false
pnpm nx typecheck grbl
pnpm nx build grbl
pnpm nx pkgcheck grbl
pnpm nx size grbl
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

- Tests never open a serial port: the session runs against `VirtualGrbl` through `createVirtualGrblStream`.
- A held controller still switches its relays, so a job's stream waits at its first `M3`/`M4`/`M7`/`M8` until Play.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
