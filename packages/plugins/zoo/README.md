# @taucad/zoo

[![npm](https://img.shields.io/npm/v/@taucad/zoo)](https://www.npmjs.com/package/@taucad/zoo)
[![downloads](https://img.shields.io/npm/dm/@taucad/zoo)](https://www.npmjs.com/package/@taucad/zoo)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/zoo)](https://www.npmjs.com/package/@taucad/zoo)
[![license](https://img.shields.io/npm/l/@taucad/zoo)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Zoo KCL kernel plugin for Tau

## Why @taucad/zoo?

- **KCL as a kernel** — `.kcl` models execute against Zoo's engine and return glTF with BRep topology attached.
- **Engine over WebSocket** — geometry is computed by Zoo's Design API; `zoo({ kernels: { default: { baseUrl, token } } })` points at your endpoint.
- **KCL diagnostics preserved** — engine and language errors map to runtime issues with source ranges.
- **No module-scope work** — the KCL WASM module and the connection load in `initialize()`, one per worker.

## Install

```bash
npm i @taucad/zoo @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { zoo } from '@taucad/zoo';

const runtime = defineRuntime({
  plugins: [zoo({ kernels: { default: { baseUrl: 'wss://api.example.com/v1/kernels/zoo' } } })],
});
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export       | Kind            | Use                                                                                  |
| ------------ | --------------- | ------------------------------------------------------------------------------------ |
| `zoo`        | toolkit factory | package-named factory; presets select capabilities and nested options configure them |
| `plugin`     | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key        |
| `zooKernel`  | kernel factory  | direct `kernels` composition; reads `kcl`                                            |
| `ZooOptions` | type            | `{ baseUrl?, token?, closeErrors? }`                                                 |

One preset, `default`, selecting `kernels.default`.

| Subpath                         | Purpose                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `@taucad/zoo`                   | the toolkit, alias, and kernel factory                                                 |
| `@taucad/zoo/engine-connection` | `EngineConnection` and `MockEngineConnection`, for hosts driving the socket themselves |

## Environment

| Host           | Supported | Notes                                                           |
| -------------- | --------- | --------------------------------------------------------------- |
| Browser worker | Yes       | uses the platform `WebSocket`; no cross-origin isolation needed |
| Node.js        | Yes       | `>=24`, where `WebSocket` is global                             |

A token embedded in a browser bundle is visible to the browser: proxy the engine, or mint
short-lived tokens, rather than shipping a long-lived one.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/zoo)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/zoo/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
