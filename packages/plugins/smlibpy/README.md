# @taucad/smlibpy

[![npm](https://img.shields.io/npm/v/@taucad/smlibpy)](https://www.npmjs.com/package/@taucad/smlibpy)
[![downloads](https://img.shields.io/npm/dm/@taucad/smlibpy)](https://www.npmjs.com/package/@taucad/smlibpy)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/smlibpy)](https://www.npmjs.com/package/@taucad/smlibpy)
[![license](https://img.shields.io/npm/l/@taucad/smlibpy)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native SMLibPy kernel for Tau

## Why @taucad/smlibpy?

- **One call composes it** — `smlibpy()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `smlibpyKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/smlibpy @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. This toolkit's
generated configuration schemas make `zod` a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { smlibpy } from '@taucad/smlibpy';

const runtime = defineRuntime({ plugins: [smlibpy()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export                                         | Kind                     | Use                                                                                           |
| ---------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `smlibpy`                                      | toolkit factory          | package-named authoring factory; presets select capabilities                                  |
| `plugin`                                       | toolkit factory          | the same factory under its mechanical name, for loaders that read a fixed key                 |
| `smlibpyKernel`                                | kernel factory           | direct `kernels` composition, with options                                                    |
| `smlibpyOptionsSchema`, `smlibpyClosureSchema` | options schemas          | an optional explicit closure and the host's bounds; the files a sealed closure maps to        |
| `smlibpyNative` (`@taucad/smlibpy/native`)     | native kernel deployment | how a host prepares the closure, carried by every kernel registration; imports no kernel code |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                          |
| -------------- | --------- | -------------------------------------------------------------- |
| Browser worker | No        | `taucad.hostTarget: python` — this package is not browser-safe |
| Node.js        | Yes       | `>=24`                                                         |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/smlibpy)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/smlibpy/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
