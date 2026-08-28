# @taucad/rolldown

[![npm](https://img.shields.io/npm/v/@taucad/rolldown)](https://www.npmjs.com/package/@taucad/rolldown)
[![downloads](https://img.shields.io/npm/dm/@taucad/rolldown)](https://www.npmjs.com/package/@taucad/rolldown)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/rolldown)](https://www.npmjs.com/package/@taucad/rolldown)
[![license](https://img.shields.io/npm/l/@taucad/rolldown)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native Node and WASM browser Rolldown bundler plugin for Tau.

## Why @taucad/rolldown?

- **One authoring surface across hosts** — native Rolldown on Node and `@rolldown/browser` in isolated browsers.
- **TypeScript models without a build step** — bundles `.ts`, `.tsx`, `.js`, `.jsx`, JSON, and Tau asset imports inside the runtime worker.
- **Tau-compatible resolution** — uses `@taucad/bundler-core` for rooted project files, built-ins, package acquisition, assets, and automatic CAD exports.
- **Lazy initialization** — importing the package starts no native binding, WASM instance, or worker.

## Install

```bash
npm i @taucad/rolldown @taucad/runtime
```

On supported Node platforms, npm installs native `rolldown` as an optional dependency. Browser consumers use the included `@rolldown/browser` backend.

## Quick start

```ts
import { defineRuntime } from '@taucad/runtime/worker';
import { rolldown } from '@taucad/rolldown';

export const runtime = defineRuntime({ plugins: [rolldown()] });
```

The runtime definition is host-independent; there is no backend option or WASM URL to configure.

## API

| Export            | Kind            | Use                                               |
| ----------------- | --------------- | ------------------------------------------------- |
| `rolldown`        | toolkit factory | package-named authoring factory                   |
| `plugin`          | toolkit factory | the same binding under the mechanical loader name |
| `rolldownBundler` | bundler factory | direct bundler-role composition; id `rolldown`    |

One preset, `default`, selects `bundlers.default`.

## Environment

| Host                                    | Supported   | Backend and requirement                                                                         |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| Node.js                                 | Yes         | `>=24`; native `rolldown` optional package and its host binding                                 |
| Browser worker/page                     | Yes         | `@rolldown/browser`; cross-origin isolation, `SharedArrayBuffer`, and WebAssembly shared memory |
| Non-isolated browser                    | No          | initialization fails with `ROLLDOWN_SHARED_MEMORY_UNAVAILABLE`                                  |
| Node with optional dependencies omitted | No          | initialization fails with `ROLLDOWN_NATIVE_UNAVAILABLE` and reinstall guidance                  |
| Deno, Bun, edge isolate                 | Not claimed | not covered by this package's host contract                                                     |

The package never falls back to esbuild. A fallback would change compiler behavior and obscure performance and failure attribution.

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the fixed version group with `@taucad/runtime`, so the peer range matches a published runtime.

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and provenance. Verify a downloaded tree with `npm audit signatures`.

## License

Apache-2.0 — see [LICENSE](./LICENSE). Upstream Rolldown payloads retain their own licenses.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/rolldown)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/rolldown/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
