# @taucad/heif

[![npm](https://img.shields.io/npm/v/@taucad/heif)](https://www.npmjs.com/package/@taucad/heif)
[![downloads](https://img.shields.io/npm/dm/@taucad/heif)](https://www.npmjs.com/package/@taucad/heif)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/heif)](https://www.npmjs.com/package/@taucad/heif)
[![license](https://img.shields.io/npm/l/@taucad/heif)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

HEIC/HEIF image transcoder for `@taucad/runtime`. It converts HEIC and HEIF stills to JPEG, PNG or WebP through
`client.transcode`, with the same bytes in every host.

> **Licence and patents.** This package's code is Apache-2.0, but it depends on `libheif-js`, which is
> **LGPL-3.0** (libheif and libde265). HEIC images are HEVC-coded, and HEVC is covered by patents that pools
> license; no licence covers a software HEVC decoder you distribute to your users, and this package grants none.
> Register it only after you have decided that for your product. See [License](#license).

## Why @taucad/heif?

- **Opt-in** — a separate package, so the LGPL decoder and the HEVC question reach only hosts that register `heif()`.
- **Same output as `@taucad/image`** — libheif decodes to RGBA, and `encodeRasterImage` from `@taucad/image/raster`
  fits, mattes and encodes it with the raster transcoder's options and quality ladder.
- **Checked before decoding** — a source over 64 MiB, or whose header declares more than 50 megapixels, is refused
  before libheif loads.
- **Loaded on first use** — `libheif.wasm` (about 1.5 MB, 356 KB brotli) is a separate implementation asset with a
  pinned SHA-256, fetched and checked on the first HEIC image, never inlined.

## Install

```bash
npm i @taucad/heif @taucad/runtime
```

`@taucad/runtime` is a required peer. `@taucad/image` and `libheif-js` are installed as dependencies; the option
schemas come from `@taucad/image`, which brings its own `zod` peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { heif } from '@taucad/heif';

const runtime = defineRuntime({ plugins: [heif()] });
```

Hand the definition to a client, then convert:

```typescript
const result = await client.transcode({
  from: 'heic',
  to: 'jpeg',
  files: [{ name: 'photo.heic', bytes, mimeType: 'image/heic' }],
  options: { maxEdge: 1568, maxBytes: 1_048_576 },
});
```

See [`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export              | Kind               | Use                                                                           |
| ------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `heif`              | toolkit factory    | package-named authoring factory; presets select capabilities                  |
| `plugin`            | toolkit factory    | the same factory under its mechanical name, for loaders that read a fixed key |
| `heifTranscoder`    | transcoder factory | direct `transcoders` composition                                              |
| `heifSourceFormats` | constant           | `['heic', 'heif']`, the source names the transcoder accepts                   |

One preset, `default`, selecting `transcoders.default`.

The transcoder (id `heif`) has edges from `heic` and `heif` to `jpeg`, `png` and `webp`. Each edge takes the options
of `@taucad/image/raster` for its target: `maxEdge`, `maxBytes`, `maxPixels` (may lower the 50 MP limit, never
raise it), `quality` (JPEG and WebP) and `background` (JPEG, default `#FFFFFF`).

Behaviour:

- The primary image is decoded. Its rotation (`irot`), mirror (`imir`) and crop (`clap`) are applied, so a
  portrait photo comes out portrait.
- Auxiliary images (depth maps, gain maps) and the rest of an image sequence are ignored.
- 10-bit images are reduced to 8 bits.
- No colour management: ICC and NCLX profiles are ignored.
- A converted image carries no EXIF.

## Environment

| Host           | Supported | Notes                                                                                    |
| -------------- | --------- | ---------------------------------------------------------------------------------------- |
| Browser worker | Yes       | no Node built-ins in the payload; `libheif.wasm` is emitted by `@taucad/runtime/vite`    |
| Node.js        | Yes       | `>=24`                                                                                   |
| Electron       | Yes       | keep `libheif-*.wasm` outside the integrity-checked ASAR so users can replace it (below) |

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with `@taucad/runtime`, so the peer range always matches a published runtime.
See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

The transcoder's `version` changes whenever its output bytes change, including on a `libheif-js` release.

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and
[provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

The decoder parses untrusted files. `libheif-js` 1.23.5 compiles in libheif 1.23.5 and libde265 1.0.15, which lack
later upstream security releases. The decoder runs inside WebAssembly in a runtime worker, behind the 64 MiB and
50 MP header checks, and a host should discard its runtime client after a failed conversion and set a transcode
timeout. What remains is wrong pixels in the image being converted, or a crashed worker.

## License

`@taucad/heif` is Apache-2.0 — see [LICENSE](./LICENSE). It bundles no third-party code.

Its dependency [`libheif-js`](https://github.com/catdad-experiments/libheif-js) is **LGPL-3.0**. It contains
[libheif](https://github.com/strukturag/libheif) and [libde265](https://github.com/strukturag/libde265), each
LGPL-3.0-or-later, compiled to one WebAssembly file. The LGPL-3.0 and GPL-3.0 texts ship in the `libheif-js`
package. `libheif-js` 1.23.5 is built from:

- libheif 1.23.5 at commit [`413e2a87`](https://github.com/strukturag/libheif/tree/413e2a87);
- [libde265 1.0.15](https://github.com/strukturag/libde265/releases/download/v1.0.15/libde265-1.0.15.tar.gz);
- libheif's `scripts/build-emscripten.sh`, run with Emscripten 3.1.61 by
  [libheif-emscripten](https://github.com/catdad-experiments/libheif-emscripten).

If you ship an application that registers this package, the LGPL-3.0 applies to what you convey:

- Reproduce the LGPL-3.0 and GPL-3.0 texts in your notices.
- Name the sources above.
- Keep `libheif.wasm` a separate file the user can replace. This package loads it as its own asset and never
  inlines it, and it checks the file against a pinned SHA-256, so a user who replaces it rebuilds your app with the
  new digest. Your application's source, or a relinkable form of it, must allow that.

**HEVC patents.** HEIC stills are HEVC frames. Patent pools license HEVC, and their terms for software decoders
distributed to end users are not settled here. Neither this package nor the LGPL grants a patent licence. Browsers
other than Safari decline to ship a software HEVC decoder for this reason. Decide whether you need a licence before
you register `heif()` in a product.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/heif)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/heif/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
