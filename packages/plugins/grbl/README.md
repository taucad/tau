# @taucad/grbl

[![npm](https://img.shields.io/npm/v/@taucad/grbl)](https://www.npmjs.com/package/@taucad/grbl)
[![downloads](https://img.shields.io/npm/dm/@taucad/grbl)](https://www.npmjs.com/package/@taucad/grbl)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/grbl)](https://www.npmjs.com/package/@taucad/grbl)
[![license](https://img.shields.io/npm/l/@taucad/grbl)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Grbl 1.1 and grblHAL CNC router machine plugin, modelled on the Sienci LongMill MK2 30×30 on its LongBoard.

## Why @taucad/grbl?

- **One call composes it** — `grbl()` registers the serial provider with `defineRuntime`.
- **Safe by construction** — held jogs send short `$J=` segments that end by themselves; stop holds, waits for the
  machine to settle, then resets, so the position is kept; jobs load under a feed hold and start at the machine.
- **Homing switches optional** — with homing off (`$22` bit 0 clear: `$22=0` on a stock LongMill; grblHAL's `$22` is
  a bitfield), the session offers no homing and works from the work zero a person sets.
- **A simulator behind the real protocol** — `grblSimulatorMachine` runs the same session against a virtual Grbl 1.1h
  controller (no homing switches unless its binding sets `homingSwitches`), and `grblDemoProgram()` cuts a sign in
  about a minute.

## Install

```bash
npm i @taucad/grbl @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. This toolkit's
generated configuration schemas make `zod` a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/host';
import { grbl } from '@taucad/grbl';

const runtime = defineRuntime({ plugins: [grbl()] });
```

This creates an outer host definition with separate `cad`, `jobs`, and `machines` capabilities. Bind it to a
trusted host implementation that provides `listSerialPorts` and `openSerial`; a host without serial access discovers
nothing unless a person enters the port (the discovery `endpoint`'s serial path), and cannot connect.

## API

| Export                 | Kind            | Use                                                                           |
| ---------------------- | --------------- | ----------------------------------------------------------------------------- |
| `grbl`                 | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`               | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `grblMachine`          | machine factory | the LongMill over USB serial (115200 baud)                                    |
| `grblSimulatorMachine` | machine factory | the same session against a virtual Grbl 1.1h controller                       |
| `grblDemoProgram`      | function        | a demonstration G-code program for the simulator                              |

One preset, `default`, selecting `machines.default`.

## Environment

| Host           | Supported | Notes                                                          |
| -------------- | --------- | -------------------------------------------------------------- |
| Browser worker | No        | `taucad.hostTarget: daemon` — this package is not browser-safe |
| Node.js        | Yes       | `>=24`                                                         |

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with `@taucad/runtime`, so the peer range always matches a published runtime.
See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and
[provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE). Bundled third-party payloads keep their own licenses.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/grbl)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/grbl/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
