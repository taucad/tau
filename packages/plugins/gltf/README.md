# @taucad/gltf

[![npm](https://img.shields.io/npm/v/@taucad/gltf)](https://www.npmjs.com/package/@taucad/gltf)
[![downloads](https://img.shields.io/npm/dm/@taucad/gltf)](https://www.npmjs.com/package/@taucad/gltf)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/gltf)](https://www.npmjs.com/package/@taucad/gltf)
[![license](https://img.shields.io/npm/l/@taucad/gltf)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

glTF import and transcoding toolkit for Tau

## Why @taucad/gltf?

- **`glb` and `gltf` import** — read an existing asset into the runtime instead of evaluating a model.
- **Bidirectional transcoding** — all four `glb`/`gltf` routes, including same-format codec conversion.
- **Standard Draco interchange** — `KHR_draco_mesh_compression` input decodes automatically; output compression is opt-in.
- **Lazy dependency assets** — decoder and encoder WASM load independently from `draco3dgltf` only when needed.

## Install

```bash
npm i @taucad/gltf @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { gltf } from '@taucad/gltf';

const runtime = defineRuntime({ plugins: [gltf()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export           | Kind               | Use                                                                           |
| ---------------- | ------------------ | ----------------------------------------------------------------------------- |
| `gltf`           | toolkit factory    | package-named authoring factory; presets select capabilities                  |
| `plugin`         | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key |
| `gltfKernel`     | kernel factory     | direct `kernels` composition; reads `glb`, `gltf`                             |
| `gltfTranscoder` | transcoder factory | direct `transcoders` composition; all four `glb`/`gltf` source-target edges   |

One preset, `default`, selecting `kernels.default`, `transcoders.default`.

Compressed output is an explicit second step after any kernel export:

```typescript
const exported = await client.export('glb', { source });
if (!exported.success) throw new Error('GLB export failed');

const compressed = await client.transcode({
  from: 'glb',
  to: 'glb',
  files: exported.data,
  options: { compression: 'draco' },
});
```

`compression` defaults to `none`. Draco output is rejected when a document carries Tau or KittyCAD topology metadata because compression can reorder vertices and invalidate its face/edge mappings.

## Environment

| Host           | Supported | Notes                                                            |
| -------------- | --------- | ---------------------------------------------------------------- |
| Browser worker | Yes       | dependency-owned Draco WASM is emitted by Tau's Vite integration |
| Node.js        | Yes       | `>=24`; codec WASM resolves from `draco3dgltf`                   |

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

Apache-2.0 — see [LICENSE](./LICENSE). Runtime codec payloads retain their upstream licenses.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/gltf)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/gltf/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
