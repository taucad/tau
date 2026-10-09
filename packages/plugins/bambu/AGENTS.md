# @taucad/bambu

## Responsibility

Bambu Lab Developer LAN machine plugin

- Nx project: `bambu`
- Project root: `packages/plugins/bambu`
- Placement: `packages/plugins`
- Capabilities: `machine`
- Host target: `daemon`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/bambu.plugin.ts`
- `src/bambu.machine.ts` (LAN providers) and `src/bambu.host.ts` (discovery, pinned MQTTS/FTPS, cameras)
- `src/bambu.session.ts`: the one session both the LAN provider and the simulator run; admission at send, reports, confirmation
- `src/bambu.simulator.ts` (`bambuSimulatorMachine`, `bambuA1MiniSimulatorMachine`): the real session over an in-memory printer
- `src/bambu.commands.ts`: every request payload; `bambuExternalSpoolFields` is the one external-spool table
- `src/bambu.settings.ts` (`./settings`): project preferences and the slot encoding (`bambuSlotOf`, `bambuAddressOf`)
- `src/bambu.plate.ts` (`./plate`: pre-rendered X1C and A1 mini plate/hotend GLBs in `src/assets`, from `models/{x1c,a1-mini}`)
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint bambu
pnpm nx test bambu --watch=false
pnpm nx typecheck bambu
pnpm nx build bambu
pnpm nx pkgcheck bambu
pnpm nx size bambu
pnpm nx run bambu:render-plates   # after editing either model family; the unit tests fail until re-rendered
pnpm nx run bambu:qualify-x1c -- --stage=self-check   # hardware stages need the operator's consent; see README
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

- Never contact a real printer from tests or agents; the simulators cover every action. Hardware stages run only under the operator's per-invocation consent.
- A qualification profile's `firmware` and `attachments` say what the evidence ran on; change them only with new evidence.
- Unverified on hardware (keep `designed`, marked `ponytail:` in source): external-spool forms (b) and (c) per command; the A1 mini dropping writes without Developer Mode; the X1C's pressure-advance profile cap; drying (not offered: the X1C's first AMS has no heater); flow ratio and filament presets taken from Bambu Studio's generic profiles.
