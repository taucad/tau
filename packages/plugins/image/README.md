# @taucad/image

[![npm](https://img.shields.io/npm/v/@taucad/image)](https://www.npmjs.com/package/@taucad/image)
[![downloads](https://img.shields.io/npm/dm/@taucad/image)](https://www.npmjs.com/package/@taucad/image)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/image)](https://www.npmjs.com/package/@taucad/image)
[![license](https://img.shields.io/npm/l/@taucad/image)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Image import and export toolkit for `@taucad/runtime`.

## Why @taucad/image?

- **GLB to PNG, WebP, or JPEG** — fitted thumbnails, exact camera captures, and ordered view batches.
- **SVG to PNG** — deterministic rasterization through resvg.
- **Any image to JPEG, PNG, or WebP** — JPEG, PNG, WebP, GIF, AVIF, BMP and TIFF through portable WASM and JavaScript codecs, byte-identical in every host, with size limits checked from the header before decoding.
- **Contained failures** — a malformed GLB, a missing adapter, or a lost device returns a structured issue, never a throw.
- **Warm renderer** — one GPU device per process, reused by every render after the first.
- **No module-scope work** — the renderer loads in `initialize()` and stays in transcoder context; each raster codec loads on the first image of its format.

## Install

```bash
npm i @taucad/camera @taucad/image @taucad/runtime zod
```

`@taucad/camera`, `@taucad/runtime`, and `zod` are required peers. The runtime parses this package's option schemas, so one install must hold one runtime and one zod.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { image } from '@taucad/image';

const runtime = defineRuntime({ plugins: [image()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export               | Kind               | Use                                                                                      |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `image`              | toolkit factory    | package-named authoring factory; presets select capabilities                             |
| `plugin`             | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key            |
| `renderTranscoder`   | transcoder factory | id `render`; edges `glb → png`, `glb → webp`, `glb → jpeg`                               |
| `svgTranscoder`      | transcoder factory | id `svg`; edges `svg → png`, `svg → webp`                                                |
| `rasterTranscoder`   | transcoder factory | id `raster`; `jpeg`, `png`, `webp`, `gif`, `avif`, `bmp`, `tiff` → `jpeg`, `png`, `webp` |
| `imageEdgeSchemas`   | zod schemas        | size, background, camera, annotations, line width, and single or batch views             |
| `toNanorasterCamera` | camera adapter     | map a renderer-neutral `CameraState` to the image renderer's fixed camera                |

One preset, `default`, selecting `transcoders.render`, `transcoders.svg` and `transcoders.raster`.

The `@taucad/image/raster` subpath exports the raster option schemas and `encodeRasterImage`, the resize, matte
and encode half of a conversion, so another transcoder that decodes to RGBA (such as a HEIF decoder) produces
the same bytes. `@taucad/image/svg` exports the direct SVG renderers.

WebP defaults to `quality: 1`, which is lossless. Set a value below `1` for lossy output, for example
`exportOptions: { quality: 0.9 }`. PNG does not accept quality; JPEG defaults to `0.92`.

## Convert an image

```ts
const result = await client.transcode({
  from: 'png',
  to: 'jpeg',
  files: [{ name: 'photo.png', bytes, mimeType: 'image/png' }],
  options: { maxEdge: 1568, maxBytes: 1_048_576 },
});
```

| Option       | Targets        | Default    | Effect                                                                                |
| ------------ | -------------- | ---------- | ------------------------------------------------------------------------------------- |
| `maxEdge`    | all            | none       | Fit inside this many pixels on the longer side; never enlarge                         |
| `maxBytes`   | all            | none       | JPEG and WebP step quality 0.85, 0.7, 0.5, 0.3, then 800 px at 0.3; PNG over it fails |
| `maxPixels`  | all            | 50 000 000 | Refuse a larger source from its header; may lower the limit, never raise it           |
| `quality`    | `jpeg`, `webp` | 0.85       | First step of the quality ladder                                                      |
| `background` | `jpeg`         | `#FFFFFF`  | Colour transparent pixels are composited on                                           |

Inputs over 64 MiB are refused. EXIF orientation is applied for JPEG only. GIF gives its first frame and TIFF its
first page; animated WebP is refused by name. CMYK JPEG is decoded without its ICC profile, 16-bit input is reduced
to 8-bit, and no colour management is applied. The output carries no metadata.

## Fit the model

Omit `camera` for Nanoraster's tight fitted three-quarter view, or provide a fitted direction. Use
`framing: 'bounds'` when the image must share a conservative scene-AABB composition with a viewer.

```ts
const result = await client.export('webp', {
  source: { path: 'main.ts' },
  content: { includeEdges: true },
  exportOptions: {
    width: 1600,
    height: 1600,
    lineWidth: 3,
    quality: 1,
    background: '#242424',
    axes: true,
    scaleBar: true,
    label: 'Three-quarter view',
    camera: {
      framing: 'bounds',
      direction: [1, -1, 0.7],
      up: [0, 0, 1],
      margin: 0.1,
      projection: { kind: 'perspective', verticalFieldOfView: 45 },
    },
  },
});
```

`fit` remains available for tight exact-geometry and presentation-filtered captures. `bounds` resolves a complete
camera in the image worker and sends it to the renderer as fixed state.

## Reproduce a viewer camera

Copy native renderer state into `CameraState`, then declare that camera's world beside it. The image dimensions must use the same aspect as the copied state.

```ts
import { readThreeCameraState } from '@taucad/three/camera';
import { toNanorasterCamera } from '@taucad/image/camera';

const cameraState = readThreeCameraState({ camera, target: controls.target });
const width = 2400;
const height = Math.round(width / cameraState.aspect);

const result = await client.export('webp', {
  source: { path: 'main.ts' },
  content: { includeEdges: true },
  exportOptions: {
    width,
    height,
    lineWidth: 3,
    quality: 1,
    background: '#242424',
    axes: true,
    scaleBar: true,
    world: { up: '+z', forward: '-y', unit: 'meter' },
    camera: toNanorasterCamera({ cameraState }),
  },
});
```

See [Capture camera views](https://tau.new/docs/runtime/guides/headless-camera-capture) for mixed preset batches, projection semantics, and RPC use.

If the selected graphics driver cannot encode the requested image, the runtime returns a structured
render issue with code `driver-unsupported`.

## Environment

| Host           | Supported | Notes                                                                          |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| Browser worker | Yes       | needs a WebGPU adapter; a missing adapter is reported as an issue, not a crash |
| Node.js        | Yes       | `>=24`; `nanoraster` picks its own native or WASM backend                      |

The raster codecs need no GPU and run identically in a browser worker, an Electron utility process and Node.
They load as ES modules, so a browser host must run them in a module worker.

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

Every runtime dependency is permissively licensed; nothing here is copyleft. HEIC support lives in the separate,
opt-in `@taucad/heif` package because its decoder is LGPL-3.0.

| Dependency                                                          | Licence                                                                            | Role                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| `@jsquash/jpeg` (MozJPEG)                                           | Apache-2.0; MozJPEG IJG, BSD-3-Clause, zlib                                        | JPEG decode (applies EXIF orientation) and encode |
| `@jsquash/png`, `@jsquash/webp`, `@jsquash/avif`, `@jsquash/resize` | Apache-2.0; libwebp BSD-3-Clause, libavif BSD-2-Clause, Rust crates MIT/Apache-2.0 | PNG, WebP, AVIF codecs; Lanczos resize            |
| `jpeg-js`                                                           | BSD-3-Clause                                                                       | CMYK and YCCK JPEG decode                         |
| `omggif`                                                            | MIT                                                                                | GIF first frame                                   |
| `utif2` (with `pako`)                                               | MIT (pako (MIT AND Zlib))                                                          | TIFF first page                                   |
| `@resvg/resvg-wasm`                                                 | MPL-2.0                                                                            | SVG rasterization                                 |
| `nanoraster`                                                        | Apache-2.0                                                                         | GLB rendering                                     |

BMP is read by this package's own decoder.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/image)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/image/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
