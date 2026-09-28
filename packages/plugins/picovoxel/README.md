# @taucad/picovoxel

[![npm](https://img.shields.io/npm/v/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![downloads](https://img.shields.io/npm/dm/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![license](https://img.shields.io/npm/l/@taucad/picovoxel)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

PicoVoxel WebAssembly voxel, implicit and lattice geometry kernel

## Why @taucad/picovoxel?

- **One call composes it** — `picovoxel()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `picovoxelKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/picovoxel @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an
options schema adds `zod` as a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { picovoxel } from '@taucad/picovoxel';

const runtime = defineRuntime({ plugins: [picovoxel()] });
```

Picovoxel source files export `default main(pico, params)` and return a `Mesh`, `Voxels`, or a flat
non-empty array of those values. Tau owns the selected session lifecycle:

```typescript
import type { Pico } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, radius: 10 };

export default function main(pico: Pico, params = defaultParams) {
  return pico.createVoxels({ shape: 'sphere', radius: params.radius });
}
```

### Lanes

Every build runs in one of two lanes. The viewer renders in the **fast** lane (render option
`lane`, default `'fast'`); exports default to the **exact** lane (export option `lane`, default
`'exact'`), so an export after a fast render replays the model exactly. Exact always runs on the
serial build, so exact output is identical in every host.

- STL: an explicit `lane: 'fast'` export writes a `LANE=fast` STL header.
- GLB: a fast-lane GLB export is refused with a typed `REPRESENTATION_UNSUPPORTED` issue.
- An exact build that reads fast-lane data (a `LANE=fast` STL or `.vdb`, or a `fastRenorm: true`
  offset) is refused with a typed `REPRESENTATION_UNSUPPORTED` issue naming the remedy.
- Exactly-zero-area triangles are dropped from every snapshot; area, volume and every other triangle
  are unchanged.

### Runtime lifetime

Each kernel worker compiles each build's WebAssembly module once (or instantiates the module its host
compiled for the same URL) and keeps one warm PicoVoxel runtime per build (the multi build's thread
pool included); every render opens a fresh session on it and disposes it, together with any session
the model created itself, when the render ends. A runtime is replaced after a WebAssembly trap or once
its heap passes 1.5 GiB; the replacement instantiates the module already compiled. Renders are
cancelled cooperatively: a superseded render stops at its next PicoVoxel call.

The binaries and the pthread worker script load from explicit URLs of picovoxel's asset subpaths
(`picovoxel/wasm`, `picovoxel/multi/wasm`, `picovoxel/multi/worker`), which Tau's runtime asset plugin
emits as files; in Node the worker script is passed as a filesystem path.

If the multi build runs out of memory, the render is rebuilt once on the serial build and the result
carries a `RESOURCE_LIMIT` warning naming the remedy (a coarser `voxelSize`). If it cannot start, the
same rebuild carries a `KERNEL_CAPABILITY_MISSING` warning.

### WebAssembly build

The `wasm` kernel option selects the build for the fast lane:

```typescript
picovoxel({ kernels: { default: { wasm: 'auto' } } }); // the default
```

`'auto'` resolves in the worker: the multi-threaded build when the realm is cross-origin isolated with
`SharedArrayBuffer` and can reserve the build's shared memory, otherwise serial with the reason
logged. Node reports isolated, so `'auto'` selects multi there; pin
`wasm: 'serial'` for single-threaded, deterministic headless hosts. An explicit `'multi'` that cannot
run fails the fast build with a `KERNEL_CAPABILITY_MISSING` issue rather than silently downgrading;
exact builds still work. GLB is normalized through Tau's geometry pipeline; STL is emitted by
PicoVoxel's pure serializer.

## Dependency provenance

| Field     | Value                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------- |
| Specifier | `picovoxel@0.1.0` (exact workspace catalog pin)                                                   |
| Source    | `taucad/picovoxel` release `v0.1.0`, commit `11c51188a8f4cc754a25bde77e07c107523f7986`            |
| Version   | `0.1.0`                                                                                           |
| CI run    | [36368135314](https://github.com/taucad/picovoxel/actions/runs/36368135314), every job green      |
| Size      | 12,799,269 bytes unpacked                                                                         |
| Integrity | `sha512-X8Q4YlKfIuNc8HbH8KusVUW1T/nz8xJUFjJ2pvh3KTCB8gev24gf0EQZzdB8IDE6px8aGp5z266vm6tTmJ56PQ==` |

Both WebAssembly binaries are CI-built. The kernel version carries the package version, both binary
digests and one digest over every shipped script; `picovoxel.asset-ownership.test.ts` recomputes all
four, so moving the dependency fails that test until the kernel's constants follow it.

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export            | Kind            | Use                                                                           |
| ----------------- | --------------- | ----------------------------------------------------------------------------- |
| `picovoxel`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`          | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `picovoxelKernel` | kernel factory  | direct `kernels` composition, with options                                    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                            |
| -------------- | --------- | ------------------------------------------------ |
| Browser worker | Yes       | multi requires COOP/COEP and `SharedArrayBuffer` |
| Node.js        | Yes       | `>=24`; serial and multi supported               |

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

Apache-2.0 — see [LICENSE](./LICENSE). The `picovoxel` dependency is Apache-2.0 and ships its own
`license` and `NOTICE`.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/picovoxel)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/picovoxel/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
