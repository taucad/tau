# @taucad/manifold

[![npm](https://img.shields.io/npm/v/@taucad/manifold)](https://www.npmjs.com/package/@taucad/manifold)
[![downloads](https://img.shields.io/npm/dm/@taucad/manifold)](https://www.npmjs.com/package/@taucad/manifold)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/manifold)](https://www.npmjs.com/package/@taucad/manifold)
[![license](https://img.shields.io/npm/l/@taucad/manifold)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Manifold kernel plugin for Tau

## Why @taucad/manifold?

- **Manifold as a kernel** — author `.ts`/`.js` models against `manifold-3d` and export glTF.
- **Guaranteed-manifold booleans** — the mesh library the kernel wraps keeps solids watertight through CSG.
- **Swappable WASM** — `manifoldKernel({ wasmUrl })` points at a custom build for benchmarking.
- **No module-scope work** — the Manifold backend loads in `initialize()`, one instance per worker.

## Install

```bash
npm i @taucad/manifold @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { manifold } from '@taucad/manifold';

const runtime = defineRuntime({ plugins: [manifold()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export            | Kind            | Use                                                                           |
| ----------------- | --------------- | ----------------------------------------------------------------------------- |
| `manifold`        | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`          | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `manifoldKernel`  | kernel factory  | direct `kernels` composition; reads `ts`, `js`                                |
| `ManifoldOptions` | type            | `{ wasmUrl?: string }` — override the bundled Manifold WASM                   |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                                |
| -------------- | --------- | -------------------------------------------------------------------- |
| Browser worker | Yes       | single-threaded `manifold-3d` WASM; no cross-origin isolation needed |
| Node.js        | Yes       | `>=24`                                                               |

A bundler plugin such as [`@taucad/esbuild`](https://www.npmjs.com/package/@taucad/esbuild) turns a
TypeScript model into the module this kernel evaluates.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/manifold)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/manifold/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
