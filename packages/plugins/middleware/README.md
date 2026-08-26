# @taucad/middleware

[![npm](https://img.shields.io/npm/v/@taucad/middleware)](https://www.npmjs.com/package/@taucad/middleware)
[![downloads](https://img.shields.io/npm/dm/@taucad/middleware)](https://www.npmjs.com/package/@taucad/middleware)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/middleware)](https://www.npmjs.com/package/@taucad/middleware)
[![license](https://img.shields.io/npm/l/@taucad/middleware)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

First-party runtime middleware toolkit for Tau

## Why @taucad/middleware?

- **The five stages every host wants** — parameter file resolution, two caches, coordinate transform, edge detection.
- **Kernel-agnostic** — each stage works on the runtime's own parameter and glTF shapes, never on a kernel's internals.
- **Ordered by you** — the preset gives the canonical order; the role factories let you interleave your own stages.
- **Onion-model hooks** — caches short-circuit on a hit and write on the way back up.

## Install

```bash
npm i @taucad/middleware @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { middleware } from '@taucad/middleware';

const runtime = defineRuntime({ plugins: [middleware()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export                    | Kind               | Use                                                                                |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `middleware`              | toolkit factory    | package-named authoring factory; presets select capabilities                       |
| `plugin`                  | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key      |
| `parameterFileResolver`   | middleware factory | loads `<parameters>/<entry>.json` beside a model and merges it into the parameters |
| `parameterCache`          | middleware factory | caches `getParameters` on the runtime's dependency hash                            |
| `geometryCache`           | middleware factory | content-addressable cache over `createGeometry` results                            |
| `gltfCoordinateTransform` | middleware factory | Y-up/metres to Z-up/millimetres, vertices and node TRS alike                       |
| `gltfEdgeDetection`       | middleware factory | adds CAD edge overlay primitives to triangle meshes                                |

Two presets: `default` selects all five in that order; `cache` selects `parameterCache` followed by
`geometryCache`.

Ordering is the point: to interleave your own stages, compose the role factories in `defineRuntime`'s
`middleware` bucket instead of calling `middleware()`.

## Environment

| Host           | Supported | Notes                                                      |
| -------------- | --------- | ---------------------------------------------------------- |
| Browser worker | Yes       | pure JavaScript; no WASM, no Node built-ins in the payload |
| Node.js        | Yes       | `>=24`                                                     |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/middleware)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/middleware/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
