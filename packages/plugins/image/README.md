# @taucad/image

[![npm](https://img.shields.io/npm/v/@taucad/image)](https://www.npmjs.com/package/@taucad/image)
[![downloads](https://img.shields.io/npm/dm/@taucad/image)](https://www.npmjs.com/package/@taucad/image)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/image)](https://www.npmjs.com/package/@taucad/image)
[![license](https://img.shields.io/npm/l/@taucad/image)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Image import and export toolkit for @taucad/runtime

## Why @taucad/image?

- **GLB to PNG, WebP, or JPEG** — thumbnails rendered from kernel output through `nanoraster`'s Rust/wgpu core.
- **Contained failures** — a malformed GLB, a missing adapter, or a lost device returns a structured issue, never a throw.
- **Warm renderer** — one GPU device per process, reused by every render after the first.
- **No module-scope work** — the renderer loads in `initialize()` and stays in transcoder context.

## Install

```bash
npm i @taucad/image @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { image } from '@taucad/image';

const runtime = defineRuntime({ plugins: [image()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export             | Kind               | Use                                                                             |
| ------------------ | ------------------ | ------------------------------------------------------------------------------- |
| `image`            | toolkit factory    | package-named authoring factory; presets select capabilities                    |
| `plugin`           | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key   |
| `imageTranscoder`  | transcoder factory | direct `transcoders` composition; edges `glb → png`, `glb → webp`, `glb → jpeg` |
| `imageEdgeSchemas` | zod schemas        | per-target render options — size, background, quality, single or batch views    |

One preset, `default`, selecting `transcoders.export`.

WebP defaults to `quality: 1`, which is lossless. Set a value below `1` for lossy output, for example
`exportOptions: { quality: 0.9 }`. PNG does not accept quality; JPEG defaults to `0.92`.

If the selected graphics driver cannot encode the requested image, the runtime returns a structured
render issue with code `driver-unsupported`.

## Environment

| Host           | Supported | Notes                                                                          |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| Browser worker | Yes       | needs a WebGPU adapter; a missing adapter is reported as an issue, not a crash |
| Node.js        | Yes       | `>=24`; `nanoraster` picks its own native or WASM backend                      |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/image)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/image/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
