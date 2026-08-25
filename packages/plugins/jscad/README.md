# @taucad/jscad

[![npm](https://img.shields.io/npm/v/@taucad/jscad)](https://www.npmjs.com/package/@taucad/jscad)
[![downloads](https://img.shields.io/npm/dm/@taucad/jscad)](https://www.npmjs.com/package/@taucad/jscad)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/jscad)](https://www.npmjs.com/package/@taucad/jscad)
[![license](https://img.shields.io/npm/l/@taucad/jscad)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

JSCAD kernel plugin for Tau

## Why @taucad/jscad?

- **`@jscad/modeling` as a kernel** — author `.ts`/`.js` models against the JSCAD API and export glTF.
- **No WASM** — pure JavaScript geometry, so the kernel is ready to work as soon as the worker starts.
- **Customizer parameters** — `getParameterDefinitions()` becomes a JSON schema the host can render.
- **Role factory** — `jscadKernel()` composes directly when ordering or options matter.

## Install

```bash
npm i @taucad/jscad @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers: the runtime parses this package's option schemas, so
one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { jscad } from '@taucad/jscad';

const runtime = defineRuntime({ plugins: [jscad()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export        | Kind            | Use                                                                           |
| ------------- | --------------- | ----------------------------------------------------------------------------- |
| `jscad`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`      | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `jscadKernel` | kernel factory  | direct `kernels` composition; reads `ts`, `js`, provides `@jscad/modeling`    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                                |
| -------------- | --------- | -------------------------------------------------------------------- |
| Browser worker | Yes       | no WASM, no cross-origin isolation, no Node built-ins in the payload |
| Node.js        | Yes       | `>=24`                                                               |

A bundler plugin such as [`@taucad/esbuild`](https://www.npmjs.com/package/@taucad/esbuild) turns a
TypeScript model into the module this kernel evaluates.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/jscad)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/jscad/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
