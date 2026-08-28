# @taucad/esbuild

[![npm](https://img.shields.io/npm/v/@taucad/esbuild)](https://www.npmjs.com/package/@taucad/esbuild)
[![downloads](https://img.shields.io/npm/dm/@taucad/esbuild)](https://www.npmjs.com/package/@taucad/esbuild)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/esbuild)](https://www.npmjs.com/package/@taucad/esbuild)
[![license](https://img.shields.io/npm/l/@taucad/esbuild)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native Node and WASM browser esbuild bundler plugin for Tau

## Why @taucad/esbuild?

- **TypeScript models, no build step** — bundles a model's `.ts`/`.js` sources inside the worker before a kernel sees them.
- **One authoring surface across hosts** — native esbuild on Node, `esbuild-wasm` in browsers, and no host branch in your code.
- **Bare specifiers resolve** — imports are fetched through a CDN resolver and executed in this package's own module VM.
- **No module-scope work** — the esbuild backend loads in `initialize()`, one instance per worker.

## Install

```bash
npm i @taucad/esbuild @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';

const runtime = defineRuntime({ plugins: [esbuild()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export                 | Kind            | Use                                                                           |
| ---------------------- | --------------- | ----------------------------------------------------------------------------- |
| `esbuild`              | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`               | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `esbuildBundler`       | bundler factory | direct `bundlers` composition; bundler id `esbuild`                           |
| `esbuildOptionsSchema` | zod schema      | the bundler's options (`extensions`)                                          |
| `EsbuildOptions`       | type            | `z.input` of that schema                                                      |

One preset, `default`, selecting `bundlers.default`.

| Subpath              | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `@taucad/esbuild`    | the toolkit, alias, and bundler factory                 |
| `@taucad/esbuild/vm` | the package-owned ESM module VM the bundler executes on |

## Environment

| Host           | Supported | Notes                                                            |
| -------------- | --------- | ---------------------------------------------------------------- |
| Browser worker | Yes       | `esbuild-wasm`; no cross-origin isolation needed                 |
| Node.js        | Yes       | `>=24`; native binary selected through esbuild optional packages |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/esbuild)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/esbuild/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
