# @taucad/picovoxel

[![npm](https://img.shields.io/npm/v/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![downloads](https://img.shields.io/npm/dm/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![license](https://img.shields.io/npm/l/@taucad/picovoxel)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

PicoVoxel WebAssembly voxel, implicit and lattice geometry kernel

> **Interim dependency.** Until `picovoxel` is published to npm, this package depends on the vendored
> candidate `vendor/picovoxel-0.1.0.tgz` through a `file:` specifier. That is an approved, temporary
> exception to Tau's registry-only dependency policy; do not publish this package until the dependency
> is replaced by the matching registry release.

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

Each kernel worker compiles and instantiates each build once and keeps one warm PicoVoxel runtime per
build (the multi build's thread pool included); every render opens a fresh session on it and disposes
it, together with any session the model created itself, when the render ends. A runtime is replaced
after a WebAssembly trap or once its heap passes 1.5 GiB. Renders are cancelled cooperatively: a
superseded render stops at its next PicoVoxel call.

If the multi build runs out of memory (or cannot start), the render is rebuilt once on the serial build
and the result carries a `RESOURCE_LIMIT` warning naming the remedy (a coarser `voxelSize`).

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

## Local candidate provenance

| Field           | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Picovoxel base  | `6779245` (local `webgpu`) + `lanes/ratified-menu` `add8e7b` + `perf/runtime-reuse` `a36e41d`     |
| Version         | `picovoxel@0.1.0`                                                                                 |
| Tarball         | `vendor/picovoxel-0.1.0.tgz`                                                                      |
| Files           | 40                                                                                                |
| Compressed size | 2,781,792 bytes                                                                                   |
| Unpacked size   | 12,868,529 bytes                                                                                  |
| SHA-1           | `dc4f069d76ead5cf4f510d6304160aaf309ae964`                                                        |
| SHA-256         | `ab1ff8445121882be5ca82249ecf87fc9c14cd43b4a8d683169f3204b4c85c25`                                |
| Integrity       | `sha512-LTwo10Gw9vlcLPoFnxBsLCMreK48CEfBxAo1k4pBuZKM/EEi9ZzwGm18WpqYi68xuPpuJSIaJbUrNr9OKt8cgw==` |

The candidate is packed from a local, unpushed merge branch (`integration/local-tarball`) that
combines the ratified lane menu and the shared-runtime API ahead of their pull requests; both
WebAssembly artifacts are byte-identical to the previous candidate's. The registry release replaces
it. The merged branches' own suites pass at 100% statement, branch, function, and line coverage.

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

Apache-2.0 — see [LICENSE](./LICENSE). The vendored Picovoxel candidate is Apache-2.0 and retains its
own `LICENSE` and `NOTICE` inside the tarball.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/picovoxel)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/picovoxel/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
