---
heif: minor
cli: minor
---

New package `@taucad/heif`: a HEIC/HEIF transcoder for `@taucad/runtime`. `heif()` registers transcoder `heif`, which converts `heic` and `heif` stills to `jpeg`, `png` and `webp` through `client.transcode`, with the options of `@taucad/image/raster` and the same encoder, so every host produces the same bytes.

- The header is checked before decoding: a source over 64 MiB, or whose `ispe` declares more than 50 megapixels (or a lower `maxPixels`), is refused before libheif loads.
- The container's rotation and mirror are applied; the primary image is decoded and auxiliary images are ignored.
- `libheif.wasm` is a separate implementation asset with a pinned SHA-256, fetched on the first HEIC image.
- `libheif-js` 1.23.5 (libheif 1.23.5, libde265 1.0.15) is an LGPL-3.0 dependency, never bundled. HEIC is HEVC-coded; the package grants no patent licence. See its README.

`tau` (CLI) registers `heif()` among its built-in plugins, so `client.transcode` converts HEIC in the CLI runtime.
