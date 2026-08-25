# @taucad/openrscad

[![npm](https://img.shields.io/npm/v/@taucad/openrscad)](https://www.npmjs.com/package/@taucad/openrscad)
[![downloads](https://img.shields.io/npm/dm/@taucad/openrscad)](https://www.npmjs.com/package/@taucad/openrscad)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/openrscad)](https://www.npmjs.com/package/@taucad/openrscad)
[![license](https://img.shields.io/npm/l/@taucad/openrscad)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

OpenRSCAD Rust WebAssembly kernel for OpenSCAD language models

## Why @taucad/openrscad?

- **OpenSCAD language, Rust engine** — `.scad` models, including nested `use`/`include` dependencies.
- **Customizer parameters** — OpenSCAD customizer annotations become the parameter schema a host renders.
- **Deterministic exports** — authored-scene GLB for preview, GLB and object-aware 3MF for download.
- **Readable scene graph** — user module calls become nested named nodes; anonymous geometry falls back to hex material names.

## Install

```bash
npm i @taucad/openrscad @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad';

const runtime = defineRuntime({ plugins: [openrscad()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export                         | Kind            | Use                                                                              |
| ------------------------------ | --------------- | -------------------------------------------------------------------------------- |
| `openrscad`                    | toolkit factory | package-named authoring factory; presets select capabilities                     |
| `plugin`                       | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key    |
| `openrscadKernel`              | kernel factory  | direct `kernels` composition; reads `scad`                                       |
| `createOpenrscadKernel`        | kernel builder  | the same kernel with an injected engine binding, for hosts that supply their own |
| `openrscadRenderSchema`        | zod schema      | preview render options                                                           |
| `openrscadExportSchemas`       | zod schemas     | per-target export options (`glb`, `3mf`)                                         |
| `CreateOpenrscadKernelOptions` | type            | `{ loadBackend?, version? }` — a host recipe's backend choice, never a probe     |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                                |
| -------------- | --------- | -------------------------------------------------------------------- |
| Browser worker | Yes       | single-threaded WebAssembly engine; no cross-origin isolation needed |
| Node.js        | Yes       | `>=24`; the same WASM build, selected by export condition            |

A Node host that wants the native engine composes
[`@taucad/openrscad-native`](https://www.npmjs.com/package/@taucad/openrscad-native) instead — same
artifacts, no WASM startup cost.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/openrscad)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/openrscad/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
