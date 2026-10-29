# @taucad/atopile

[![npm](https://img.shields.io/npm/v/@taucad/atopile)](https://www.npmjs.com/package/@taucad/atopile)
[![downloads](https://img.shields.io/npm/dm/@taucad/atopile)](https://www.npmjs.com/package/@taucad/atopile)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/atopile)](https://www.npmjs.com/package/@taucad/atopile)
[![license](https://img.shields.io/npm/l/@taucad/atopile)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

atopile EDA kernel for Tau: .ato circuits compiled by atopile and rendered to 3D boards, schematic and PCB SVG, with BOM exports

## Why @taucad/atopile?

- **One call composes it** — `atopile()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `atopileKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/atopile @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an options
schema adds `zod` as a second required peer.

> **Spike.** This package proves that atopile 0.15.x projects render in Tau. It runs atopile as a
> subprocess of an interpreter you supply and is not wired into any Tau host yet. Production work is
> tracked in `docs/research/atopile-kernel-production-blueprint.md`.

## Requirements

- CPython 3.14 with `atopile` 0.15.x installed (`uv venv -p 3.14 && uv pip install atopile==0.15.9`).
- Parts vendored as atomic parts under `parts/` (what `ato create part` writes). Parametric parts such as
  a bare `Resistor` need atopile's signed-in picker service; the kernel reports that as an issue.
- No KiCad install: Tau renders every view itself.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { atopile } from '@taucad/atopile';

const runtime = defineRuntime({
  plugins: [atopile({ kernels: { default: { python: '/path/to/venv/bin/python' } } })],
});
```

Without the `python` option the kernel uses `TAU_ATOPILE_PYTHON`, then `python3`.

## Views and exports

| Kind   | ID          | Output                                                                    |
| ------ | ----------- | ------------------------------------------------------------------------- |
| View   | `board`     | GLB board with each footprint's STEP model                                |
| View   | `schematic` | Schematic SVG laid out by `@tscircuit/core` from atopile's netlist        |
| View   | `pcb`       | PCB SVG at the KiCad layout's positions (packed when the layout is fresh) |
| Export | `board`     | `board.glb`                                                               |
| Export | `bom`       | `bom.csv` from atopile's own BOM (designators, MPN, LCSC part numbers)    |
| Export | `netlist`   | `netlist.txt`                                                             |
| Export | `circuit`   | `circuit.json`                                                            |
| Export | `kicad`     | `<build>.kicad_pcb` as atopile wrote it                                   |

## How it works

1. The kernel mirrors the project (the nearest directory holding `ato.yaml`) into a private temporary directory.
2. `python/atopile_worker.py` runs `ato build --target bom` there and prints a board IR: footprints, pads,
   nets, the board outline, embedded STEP models and atopile's BOM rows.
3. The kernel settles the IR through `@tscircuit/core` into circuit JSON, which `circuit-to-svg` and
   `circuit-json-to-gltf` render, exactly as `@taucad/tscircuit` does.

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export          | Kind            | Use                                                                           |
| --------------- | --------------- | ----------------------------------------------------------------------------- |
| `atopile`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`        | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `atopileKernel` | kernel factory  | direct `kernels` composition, with options                                    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                        |
| -------------- | --------- | ------------------------------------------------------------ |
| Browser worker | No        | `taucad.hostTarget: node` — this package is not browser-safe |
| Node.js        | Yes       | `>=24`                                                       |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/atopile)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/atopile/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
