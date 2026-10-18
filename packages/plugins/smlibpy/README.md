# @taucad/smlibpy

[![npm](https://img.shields.io/npm/v/@taucad/smlibpy)](https://www.npmjs.com/package/@taucad/smlibpy)
[![downloads](https://img.shields.io/npm/dm/@taucad/smlibpy)](https://www.npmjs.com/package/@taucad/smlibpy)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/smlibpy)](https://www.npmjs.com/package/@taucad/smlibpy)
[![license](https://img.shields.io/npm/l/@taucad/smlibpy)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native SMLibPy kernel for trusted Tau desktop and Node hosts: the SMLib NURBS kernel's Python API, with the
capabilities of the SMLib WebAssembly kernel (`@taucad/smlib`).

The pinned engine is smlibpy 0.3.5 on CPython 3.13 with NumPy 2.5.2.

## Why @taucad/smlibpy?

- **NURBS BRep in Python** — smlibpy's build123d-style algebra API (`Box(...) - GridLocations(...) * hole`) on SMLib.
- **The SMLib model contract** — bodies, `ShapeConfig` and `Model` dicts with names, legacy appearance or full glTF PBR
  materials and textures, and a shared `mechanism` for moving parts.
- **One build, every format** — GLB and glTF with `TAU_cad_topology`, exact STEP and STL from the retained handle,
  and `.smb` compute values for unchanged operations.
- **Supervised process** — a sealed closure, a validated protocol and artifacts, and no system-Python fallback.

## Routing beside Build123d

SMLibPy and `@taucad/build123d` both open `.py`. List `smlibpy()` first: its `detectImport` claims an entry only when
a top-level line imports `smlibpy`, and every other `.py` entry falls through to Build123d.

## Install

```bash
npm i @taucad/smlibpy @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. This toolkit's
generated configuration schemas make `zod` a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { smlibpy } from '@taucad/smlibpy';

const runtime = defineRuntime({ plugins: [smlibpy()] });
```

Hand the definition to a trusted Node host — `createNodeClient` or your own. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## Host integration

`tau-plugin.json` declares a digest-pinned closure for macOS arm64/x64 (macOS 11 or later) and Linux glibc arm64/x64
(glibc 2.27 or later). Every `smlibpyKernel` registration carries `smlibpyNative` (the `/native` deployment), so a host
that lists `smlibpy()` can prepare the closure (`tau prepare smlibpy` in the CLI) and the kernel resolves it when it
initializes. To pin a closure instead, pass `{ closure: smlibpyOptionsFromClosure(receipt) }` under `kernels.default`.
The worker ships `smlibpy_materials.py`, `smlibpy_mechanisms.py` and the pinned `tau_kernel` copy of
`@taucad/python-kernel-core`. New projects start from `project/` (`pyproject.toml`, `pylock.toml`, `uv.lock`), which
runs outside Tau with `uv run main.py`.

## API

| Export                                            | Kind                     | Use                                                                                            |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `smlibpy`                                         | toolkit factory          | package-named authoring factory; presets select capabilities                                   |
| `plugin`                                          | toolkit factory          | the same factory under its mechanical name, for loaders that read a fixed key                  |
| `smlibpyKernel`                                   | kernel factory           | direct `kernels` composition, with options                                                     |
| `smlibpyOptionsSchema`, `smlibpyClosureSchema`    | options schemas          | an optional explicit closure and the host's bounds; the files a sealed closure maps to         |
| `smlibpyOptionsFromClosure`, `sealSmlibpyClosure` | closure adapters         | map a sealed receipt to checked kernel paths; compile bytecode and verify imports when sealing |
| `smlibpyNative` (`@taucad/smlibpy/native`)        | native kernel deployment | how a host prepares the closure, carried by every kernel registration; imports no kernel code  |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                          |
| -------------- | --------- | -------------------------------------------------------------- |
| Browser worker | No        | `taucad.hostTarget: python` — this package is not browser-safe |
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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/smlibpy)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/smlibpy/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
