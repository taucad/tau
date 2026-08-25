# @taucad/brep

[![npm](https://img.shields.io/npm/v/@taucad/brep)](https://www.npmjs.com/package/@taucad/brep)
[![downloads](https://img.shields.io/npm/dm/@taucad/brep)](https://www.npmjs.com/package/@taucad/brep)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/brep)](https://www.npmjs.com/package/@taucad/brep)
[![license](https://img.shields.io/npm/l/@taucad/brep)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

BRep format import toolkit for Tau

## Why @taucad/brep?

- **Five BRep extensions** — `step`, `stp`, `iges`, `igs`, `brep` read straight into the runtime's glTF geometry.
- **Import only** — a read path for exchange files, without pulling a full modelling kernel into the install.
- **Role factory** — `brepKernel()` composes directly when ordering or options matter.
- **No module-scope work** — the OCCT import backend loads in `initialize()`, one instance per worker.

## Install

```bash
npm i @taucad/brep @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { brep } from '@taucad/brep';

const runtime = defineRuntime({ plugins: [brep()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export       | Kind            | Use                                                                           |
| ------------ | --------------- | ----------------------------------------------------------------------------- |
| `brep`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`     | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `brepKernel` | kernel factory  | direct `kernels` composition; kernel id `brep`                                |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                                   |
| -------------- | --------- | ----------------------------------------------------------------------- |
| Browser worker | Yes       | single-threaded `occt-import-js` WASM; no cross-origin isolation needed |
| Node.js        | Yes       | `>=24`                                                                  |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/brep)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/brep/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
