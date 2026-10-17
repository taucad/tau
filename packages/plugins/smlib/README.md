# @taucad/smlib

[![npm](https://img.shields.io/npm/v/@taucad/smlib)](https://www.npmjs.com/package/@taucad/smlib)
[![downloads](https://img.shields.io/npm/dm/@taucad/smlib)](https://www.npmjs.com/package/@taucad/smlib)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/smlib)](https://www.npmjs.com/package/@taucad/smlib)
[![license](https://img.shields.io/npm/l/@taucad/smlib)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

SMLib kernel plugin for Tau

## Why @taucad/smlib?

- **One call composes it** — `smlib()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `smlibKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/smlib @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an options
schema adds `zod` as a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { smlib } from '@taucad/smlib';

const runtime = defineRuntime({ plugins: [smlib()] });
```


Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.


## API

| Export | Kind | Use |
| --- | --- | --- |
| `smlib` | toolkit factory | package-named authoring factory; presets select capabilities |
| `plugin` | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `smlibKernel` | kernel factory | direct `kernels` composition, with options |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host | Supported | Notes |
| --- | --- | --- |
| Browser worker | Yes | no Node built-ins in the payload |
| Node.js | Yes | `>=24` |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/smlib)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/smlib/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
