# @taucad/rhino

[![npm](https://img.shields.io/npm/v/@taucad/rhino)](https://www.npmjs.com/package/@taucad/rhino)
[![downloads](https://img.shields.io/npm/dm/@taucad/rhino)](https://www.npmjs.com/package/@taucad/rhino)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/rhino)](https://www.npmjs.com/package/@taucad/rhino)
[![license](https://img.shields.io/npm/l/@taucad/rhino)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Rhino 3DM import toolkit for Tau

## Why @taucad/rhino?

- **Rhino `.3dm` import** — read a Rhino model into the runtime's glTF geometry through `rhino3dm`.
- **Import only** — a read path for Rhino files, without a modelling kernel in the install.
- **Role factory** — `rhinoKernel()` composes directly when ordering or options matter.
- **No module-scope work** — the `rhino3dm` backend loads in `initialize()`, one instance per worker.

## Install

```bash
npm i @taucad/rhino @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { rhino } from '@taucad/rhino';

const runtime = defineRuntime({ plugins: [rhino()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export        | Kind            | Use                                                                           |
| ------------- | --------------- | ----------------------------------------------------------------------------- |
| `rhino`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`      | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `rhinoKernel` | kernel factory  | direct `kernels` composition; reads `3dm`                                     |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                             |
| -------------- | --------- | ----------------------------------------------------------------- |
| Browser worker | Yes       | single-threaded `rhino3dm` WASM; no cross-origin isolation needed |
| Node.js        | Yes       | `>=24`                                                            |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/rhino)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/rhino/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
