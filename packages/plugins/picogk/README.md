# @taucad/picogk

[![npm](https://img.shields.io/npm/v/@taucad/picogk)](https://www.npmjs.com/package/@taucad/picogk)
[![downloads](https://img.shields.io/npm/dm/@taucad/picogk)](https://www.npmjs.com/package/@taucad/picogk)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/picogk)](https://www.npmjs.com/package/@taucad/picogk)
[![license](https://img.shields.io/npm/l/@taucad/picogk)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

PicoGK native C# voxel modeling kernel for Tau

## Why @taucad/picogk?

- **One call composes it** — `picogk()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `picogkKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/picogk @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an
options schema adds `zod` as a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { picogk } from '@taucad/picogk';

const runtime = defineRuntime({ plugins: [picogk()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export         | Kind            | Use                                                                           |
| -------------- | --------------- | ----------------------------------------------------------------------------- |
| `picogk`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`       | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `picogkKernel` | kernel factory  | direct `kernels` composition, with options                                    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                        |
| -------------- | --------- | ------------------------------------------------------------ |
| Browser worker | No        | `taucad.hostTarget: node` — this package is not browser-safe |
| Node.js        | Yes       | `>=24`                                                       |

## Native performance gate

`pnpm nx benchmark-native picogk` runs 200 source edits through one warm worker plus a 0.25 mm
high-resolution build. It fails on worker recycling, retained native memory, monotonic resource
growth, leaked mesh artifacts, or source-save latency above 50 ms p50 / 100 ms p95.

The 2026-09-03 Apple M2 Pro baseline measured 16.59 ms p50 / 24.14 ms p95 save-to-settled,
819.62 ms cold handshake, and 105.48 ms for the high-resolution build. The worker stayed at one
generation with 149 file descriptors, three stable .NET diagnostic files, and zero PicoGK native
bytes after every settled build.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/picogk)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/picogk/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
