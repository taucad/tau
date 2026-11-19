# @taucad/cadmpeg

[![npm](https://img.shields.io/npm/v/@taucad/cadmpeg)](https://www.npmjs.com/package/@taucad/cadmpeg)
[![downloads](https://img.shields.io/npm/dm/@taucad/cadmpeg)](https://www.npmjs.com/package/@taucad/cadmpeg)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/cadmpeg)](https://www.npmjs.com/package/@taucad/cadmpeg)
[![license](https://img.shields.io/npm/l/@taucad/cadmpeg)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

SOLIDWORKS, CATIA, Inventor, Fusion, FreeCAD and Rhino import for `@taucad/runtime`, powered by cadmpeg.

## Why @taucad/cadmpeg?

- **Native CAD in the browser** — opens SOLIDWORKS, CATIA, Inventor, Fusion, FreeCAD, Rhino, ACIS, Parasolid and Creo View files on the device; nothing is uploaded.
- **Same meshing as STEP** — [cadmpeg](https://github.com/cadmpeg/cadmpeg) (through [`cadmpeg-ts`](https://www.npmjs.com/package/cadmpeg-ts)) converts the file to STEP, and the OCCT backend of [`@taucad/brep`](https://www.npmjs.com/package/@taucad/brep) meshes it in the same worker.
- **Losses are visible** — everything cadmpeg could not carry over becomes a warning issue with its `namespace/code` in `details.cadmpegCode`.

## Install

```bash
npm i @taucad/cadmpeg @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers — one install must hold one runtime.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { cadmpeg } from '@taucad/cadmpeg';

const runtime = defineRuntime({ plugins: [cadmpeg()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## Engines

cadmpeg runs one WebAssembly engine per format, 13 to 37 MB each. This package imports only `cadmpeg-ts/core`, so a
bundler emits none of them; the host says where they are served, and each is fetched the first time a file of its
format is opened.

```typescript
// A browser worker: one gzip per opened format, from a write-once digest host.
cadmpeg({ kernels: { import: { engines: { baseUrl: 'https://dependencies.tau.new/', layout: 'digest' } } } });

// Same-origin, from the installed package's `dist/wasm` served under `/cadmpeg-ts/`.
cadmpeg({ kernels: { import: { engines: { baseUrl: '/cadmpeg-ts/', layout: 'package' } } } });
```

| Option            | Type                    | Meaning                                                                             |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `engines.baseUrl` | `string`                | An http(s) directory URL ending in `/`; a relative one resolves against the page    |
| `engines.layout`  | `'digest' \| 'package'` | `digest`: `blobs/sha256/<gzip sha256>`; `package`: `<module>_bg.wasm`, as installed |

The transcoder takes the same option (`transcoders: { export: { engines } }`). What each engine is comes from the
installed `cadmpeg-ts/digests`, never from the host. Every fetch uses `redirect: 'error'` and one origin. In the
`digest` layout the gzip bytes are checked for length and SHA-256, decompressed with `DecompressionStream`, and the
result is checked again against the module's digest; in the `package` layout the module itself is checked. Nothing
unverified is instantiated, and there is no fallback source.

Node.js hosts (desktop, the CLI) need no option and ignore it: the native addon runs, with the packaged WebAssembly on
disk as its fallback.

| Failure                             | Issue `code`                                           | `details`                                                       |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| No `engines` in a browser realm     | `KERNEL_NOT_PREPARED`                                  | `{ producer: 'cadmpeg', environment: 'browser' }`               |
| No response (offline, DNS, CORS)    | `KERNEL_BINDING_FAILED`, `TRANSCODER_EXECUTION_FAILED` | `engineFailure: 'unreachable'`                                  |
| A response other than 200           | as above                                               | `engineFailure: 'status'`, `status`                             |
| A redirect                          | as above                                               | `engineFailure: 'redirect'`                                     |
| Wrong length, digest or gzip stream | as above                                               | `engineFailure: 'integrity'`, `check`, `file: 'gzip' \| 'wasm'` |

Every delivery issue's `details` also carry `producer: 'cadmpeg'`, `format` (the module id, such as `sldprt`), `host`
and `url`. A failed load is not cached: opening the file again retries without a reload.

## Formats

The `cadmpeg` kernel opens these extensions and renders them as a `model/gltf-binary` model view, with a `glb` export:

| Extension    | Format                           |
| ------------ | -------------------------------- |
| `sldprt`     | SOLIDWORKS part                  |
| `catpart`    | CATIA V5 part                    |
| `ipt`, `iam` | Autodesk Inventor part, assembly |
| `f3d`, `f3z` | Autodesk Fusion design, archive  |
| `fcstd`      | FreeCAD document                 |
| `3dm`        | Rhino model                      |
| `sat`, `sab` | ACIS text, binary                |
| `smt`, `smb` | ACIS (ShapeManager) text, binary |
| `pvz`        | Creo View                        |

STEP, IGES and USD stay with their existing kernels. Assemblies import as their geometry; their structure is not kept yet.

## Native export (experimental)

The `export` preset adds the `cadmpeg` transcoder, with edges from `step` to `3dm`, `sldprt`, `f3d` and `fcstd` and a `strict` option that refuses any lossy write. It is off by default: with cadmpeg 0.6.12 these writers refuse a model read from STEP (Rhino, Fusion and SOLIDWORKS with `UNSUPPORTED_FORMAT`, FreeCAD with `REFUSED`), and the transcoder reports that as `TRANSCODER_EXECUTION_FAILED`.

```typescript
const runtime = defineRuntime({ plugins: [cadmpeg({ preset: 'all' })] });
```

## API

| Export                                                                             | Kind               | Use                                                                           |
| ---------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `cadmpeg`                                                                          | toolkit factory    | package-named authoring factory; presets select capabilities                  |
| `plugin`                                                                           | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key |
| `cadmpegKernel`                                                                    | kernel factory     | direct `kernels` composition                                                  |
| `cadmpegTranscoder`                                                                | transcoder factory | direct `transcoders` composition                                              |
| `CadmpegOptions`                                                                   | type               | kernel and transcoder options (`engines`)                                     |
| `CadmpegEngines`                                                                   | type               | `{ baseUrl, layout }`                                                         |
| `CadmpegEngineIssueDetails`, `CadmpegEngineFailure`, `CadmpegEngineIntegrityCheck` | types              | the `details` of an engine delivery issue                                     |

| Preset              | Selects                                |
| ------------------- | -------------------------------------- |
| `default`, `import` | `kernels.import`                       |
| `export`            | `transcoders.export`                   |
| `all`               | `kernels.import`, `transcoders.export` |

## Environment

| Host           | Supported | Notes                                                           |
| -------------- | --------- | --------------------------------------------------------------- |
| Browser worker | Yes       | needs `engines`; no Node built-ins and no engine in the payload |
| Node.js        | Yes       | `>=24`                                                          |

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

Apache-2.0 — see [LICENSE](./LICENSE). cadmpeg and `cadmpeg-ts` are Apache-2.0; OCCT, through `@taucad/brep`, is LGPL-2.1 with the OCCT exception.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/cadmpeg)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/cadmpeg/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
