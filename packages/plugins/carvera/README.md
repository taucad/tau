# @taucad/carvera

[![npm](https://img.shields.io/npm/v/@taucad/carvera)](https://www.npmjs.com/package/@taucad/carvera)
[![downloads](https://img.shields.io/npm/dm/@taucad/carvera)](https://www.npmjs.com/package/@taucad/carvera)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/carvera)](https://www.npmjs.com/package/@taucad/carvera)
[![license](https://img.shields.io/npm/l/@taucad/carvera)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Makera Carvera C1 LAN machine plugin, with a simulated Carvera

## Why @taucad/carvera?

- **One call composes it** — `carvera()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `carveraMachine()` and `carveraSimulatorMachine()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/carvera @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. This toolkit's
generated configuration schemas make `zod` a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/host';
import { carvera } from '@taucad/carvera';

const runtime = defineRuntime({ plugins: [carvera()] });
```

This creates an outer host definition with separate `cad`, `jobs`, and `machines` capabilities. Bind it to a
trusted host implementation; do not pass the host definition to the four-role CAD worker or a CAD-only client.
`carveraMachine` finds machines by their UDP 3333 broadcast and talks to the stock firmware over TCP 2222.
`carveraSimulatorMachine` is a separate provider: a simulated C1 behind the same session code, for tests and demos.

## API

| Export                    | Kind            | Use                                                                           |
| ------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `carvera`                 | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`                  | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `carveraMachine`          | machine factory | direct `machines` composition, with options                                   |
| `carveraSimulatorMachine` | machine factory | a simulated C1; register beside `carveraMachine` for tests and demos          |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/carvera)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/carvera/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
