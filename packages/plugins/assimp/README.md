# @taucad/assimp

[![npm](https://img.shields.io/npm/v/@taucad/assimp)](https://www.npmjs.com/package/@taucad/assimp)
[![downloads](https://img.shields.io/npm/dm/@taucad/assimp)](https://www.npmjs.com/package/@taucad/assimp)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/assimp)](https://www.npmjs.com/package/@taucad/assimp)
[![license](https://img.shields.io/npm/l/@taucad/assimp)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Assimp-backed import and export toolkit for @taucad/runtime

## Why @taucad/assimp?

- **30 import extensions** — FBX, OBJ, DAE, 3DS, 3MF, PLY, STL, USD, X3D, IFC and more, meshed into glTF.
- **26 conversion routes** — GLB and glTF each reach 13 non-identity targets derived from libassimp's static catalog.
- **Strong export options** — strict, target-specific Zod schemas are generated from libassimp's public descriptors.
- **One call composes it** — `assimp({ preset: 'all' })` registers both capabilities with `defineRuntime`.
- **Role factories** — `assimpKernel()` and `assimpTranscoder()` compose directly when ordering matters.
- **No module-scope work** — the Assimp WASM payload loads in `initialize()`, one instance per worker.

## Install

```bash
npm i @taucad/assimp @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';

const runtime = defineRuntime({ plugins: [assimp({ preset: 'all' })] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export              | Kind               | Use                                                                           |
| ------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `assimp`            | toolkit factory    | package-named authoring factory; presets select capabilities                  |
| `plugin`            | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key |
| `assimpKernel`      | kernel factory     | direct `kernels` composition — import only, id `assimp`                       |
| `assimpTranscoder`  | transcoder factory | direct `transcoders` composition — export only, id `assimp`                   |
| `assimpEdgeSchemas` | zod schemas        | strict per-target export options, keyed by canonical target extension         |

| Preset              | Selects                                |
| ------------------- | -------------------------------------- |
| `default`, `export` | `transcoders.export`                   |
| `import`            | `kernels.import`                       |
| `all`               | `kernels.import`, `transcoders.export` |

## Environment

| Host           | Supported | Notes                                                                          |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| Browser worker | Yes       | import and export use libassimp with automatic JSPI or replay async resolution |
| Node.js        | Yes       | `>=24`; libassimp uses the same artifact and replay path                       |

The transcoder accepts every file in a GLB/glTF input set, preserves ordered sidecars, and exposes target-specific options through the runtime's edge metadata. `assjson` remains a libassimp diagnostic format and is deliberately not advertised as a Tau route.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/assimp)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/assimp/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
