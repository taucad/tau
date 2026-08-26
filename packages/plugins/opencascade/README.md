# @taucad/opencascade

[![npm](https://img.shields.io/npm/v/@taucad/opencascade)](https://www.npmjs.com/package/@taucad/opencascade)
[![downloads](https://img.shields.io/npm/dm/@taucad/opencascade)](https://www.npmjs.com/package/@taucad/opencascade)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/opencascade)](https://www.npmjs.com/package/@taucad/opencascade)
[![license](https://img.shields.io/npm/l/@taucad/opencascade)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Browser/WASM OpenCascade kernel plugin for Tau

## Why @taucad/opencascade?

- **OCCT in the browser** — the full OpenCascade class surface, reachable from a `.ts`/`.js` model.
- **Two WASM builds** — single-threaded `full` everywhere, pthread-enabled `multi` where `SharedArrayBuffer` is available.
- **`wasm: 'auto'`** — picks `multi` when cross-origin isolation allows it and falls back to `full` when it does not.
- **No module-scope work** — OCCT loads in `initialize()` and stays in kernel context, one instance per worker.

## Install

```bash
npm i @taucad/opencascade @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { opencascade } from '@taucad/opencascade';

const runtime = defineRuntime({ plugins: [opencascade()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export                  | Kind            | Use                                                                                                             |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `opencascade`           | toolkit factory | package-named authoring factory; presets select capabilities                                                    |
| `plugin`                | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key                                   |
| `opencascadeKernel`     | kernel factory  | direct `kernels` composition; reads `ts`, `js`                                                                  |
| `OpenCascadeOptions`    | type            | `{ wasm?: 'auto' \| 'full' \| 'multi' \| OpenCascadeWasmConfig, ocTracing?: 'off' \| 'summary' \| 'per-call' }` |
| `OpenCascadeWasmConfig` | type            | `{ wasmUrl, wasmBindingsUrl }` for a custom libcascade build                                                    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host                            | Supported          | Notes                                                                                         |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Browser worker, `wasm: 'full'`  | Yes                | single-threaded; no headers required                                                          |
| Browser worker, `wasm: 'multi'` | Yes, when isolated | needs `SharedArrayBuffer`, so the page must send `COOP: same-origin` and `COEP: require-corp` |
| Node.js                         | Yes                | `>=24`; `multi` works without headers                                                         |

`wasm: 'auto'` reads `crossOriginIsolated` and degrades to `'full'` rather than failing, so an
un-isolated page still renders — more slowly.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/opencascade)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/opencascade/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
