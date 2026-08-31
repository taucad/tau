# @taucad/picovoxel

[![npm](https://img.shields.io/npm/v/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![downloads](https://img.shields.io/npm/dm/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/picovoxel)](https://www.npmjs.com/package/@taucad/picovoxel)
[![license](https://img.shields.io/npm/l/@taucad/picovoxel)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Picovoxel WebAssembly voxel and implicit geometry kernel

This integration intentionally uses the checked-in local candidate
`vendor/picovoxel-0.1.0.tgz`. That is an explicitly approved exception to Tau's normal
registry-only dependency policy for this uncommitted integration; do not publish this package until
the dependency is replaced by the matching registry release or the exception is formalized for release.

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

The plugin defaults to `wasm: 'serial'`. Product hosts that guarantee pthread support can select the
multi build explicitly:

```typescript
picovoxel({ kernels: { default: { wasm: 'multi' } } });
```

`wasm: 'auto'` selects multi when the current realm has `SharedArrayBuffer` and browser
cross-origin isolation, otherwise serial. Explicit `multi` fails with an actionable error rather
than silently downgrading. GLB is normalized through Tau's geometry pipeline; STL is emitted by
Picovoxel's public pure serializer. Fast-lane STL export requires an explicit `acceptLane: 'fast'`
acknowledgement.

## Local candidate provenance

| Field            | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Picovoxel commit | `802d86da6e6120a472b045fddb306ce0dfa5d5f8`                                                        |
| Version          | `picovoxel@0.1.0`                                                                                 |
| Tarball          | `vendor/picovoxel-0.1.0.tgz`                                                                      |
| Files            | 39                                                                                                |
| Compressed size  | 2,751,090 bytes                                                                                   |
| Unpacked size    | 12,842,741 bytes                                                                                  |
| SHA-1            | `7587a19df4f358559302aaa78619c7b54fe5173a`                                                        |
| SHA-256          | `1fc2c8ddbea4034d52a8502198fc86fca104bb42ef89065b4103cbfa98a1aaf0`                                |
| Integrity        | `sha512-OeU3Lrfg+BdwVmlBbgGRRLBGd7kNRJYAI29yuU8fh98j1A6WV/NJYRYZwyXaMkbC2XARtIyvO/i+Odt9Pc6Vfg==` |

The upstream full suite passes 504 tests in 57 files with 100% statement, branch, function, and line
coverage. The tarball inventory comes from `npm pack --dry-run --json --ignore-scripts` at that commit.

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
