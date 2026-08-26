# @taucad/openrscad-native

[![npm](https://img.shields.io/npm/v/@taucad/openrscad-native)](https://www.npmjs.com/package/@taucad/openrscad-native)
[![downloads](https://img.shields.io/npm/dm/@taucad/openrscad-native)](https://www.npmjs.com/package/@taucad/openrscad-native)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/openrscad-native)](https://www.npmjs.com/package/@taucad/openrscad-native)
[![license](https://img.shields.io/npm/l/@taucad/openrscad-native)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native N-API OpenRSCAD kernel for Node hosts — same artifacts as @taucad/openrscad, without the WebAssembly startup cost

This is `@taucad/openrscad`'s kernel over a native N-API build of the same engine, not a second
engine. Both are one Rust pipeline behind two marshalling layers, and a parity gate holds every
artifact — GLB and 3MF, byte for byte — identical between them.

Because it is the same kernel, it declares the **same capability id** (`openrscad`): a host recipe
registers this package _or_ `@taucad/openrscad`, never both. Its `version` carries a `+native`
suffix so the runtime's build cache cannot serve one build's artifacts to the other.

## Why @taucad/openrscad-native?

- **One call composes it** — `openrscadNative()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `openrscadNativeKernel()` supports direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/openrscad-native @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { openrscadNative } from '@taucad/openrscad-native';

const runtime = defineRuntime({ plugins: [openrscadNative()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export                  | Kind            | Use                                                                           |
| ----------------------- | --------------- | ----------------------------------------------------------------------------- |
| `openrscadNative`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`                | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `openrscadNativeKernel` | kernel factory  | direct `kernels` composition, with options                                    |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/openrscad-native)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/openrscad-native/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
