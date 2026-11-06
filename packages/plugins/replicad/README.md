# @taucad/replicad

[![npm](https://img.shields.io/npm/v/@taucad/replicad)](https://www.npmjs.com/package/@taucad/replicad)
[![downloads](https://img.shields.io/npm/dm/@taucad/replicad)](https://www.npmjs.com/package/@taucad/replicad)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/replicad)](https://www.npmjs.com/package/@taucad/replicad)
[![license](https://img.shields.io/npm/l/@taucad/replicad)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Replicad kernel plugin for Tau

## Why @taucad/replicad?

- **Replicad's BRep API as a kernel** — author `.ts`/`.js` models against `replicad` and export glTF, STEP, STL, and more.
- **`wasm: 'auto'`** — the pthread build where `SharedArrayBuffer` is available, the pthread-free build where it is not.
- **Named interfaces** — `@taucad/replicad/annotations` declares axes, faces, frames, and groups a host can reason about.
- **No module-scope work** — Replicad and OCCT load in `initialize()`, one instance per worker.

## Install

```bash
npm i @taucad/replicad @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/replicad';

const runtime = defineRuntime({ plugins: [replicad()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export               | Kind            | Use                                                                                  |
| -------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `replicad`           | toolkit factory | package-named factory; forwards `kernels.default` options to `replicadKernel`        |
| `plugin`             | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key        |
| `replicadKernel`     | kernel factory  | direct `kernels` composition; reads `ts`, `js`                                       |
| `ReplicadOptions`    | type            | `wasm`, `ocTracing`, `libraryTracing`, `tessellationInstancing`, `withSourceMapping` |
| `ReplicadWasmConfig` | type            | `{ wasmUrl, wasmBindingsUrl }` for a custom build                                    |

The `default` preset selects `kernels.default`. Configure that selected kernel through the toolkit,
for example `replicad({ kernels: { default: { wasm: 'single' } } })` for the pthread-free build.

| Subpath                        | Purpose                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `@taucad/replicad`             | the toolkit, alias, and kernel factory                                     |
| `@taucad/replicad/annotations` | interface declarations — `axis`, `face`, `frame`, `group`, and their types |

## Environment

| Host                             | Supported          | Notes                                                                                         |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Browser worker, `wasm: 'single'` | Yes                | pthread-free; no headers required                                                             |
| Browser worker, `wasm: 'multi'`  | Yes, when isolated | needs `SharedArrayBuffer`, so the page must send `COOP: same-origin` and `COEP: require-corp` |
| Node.js                          | Yes                | `>=24`; `multi` works without headers                                                         |

The default `wasm: 'auto'` reads `crossOriginIsolated` and degrades to `'single'` rather than
failing, so an un-isolated page still renders — more slowly.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/replicad)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/replicad/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
