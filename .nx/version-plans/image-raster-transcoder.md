---
image: minor
---

Add `rasterTranscoder` (id `raster`). It converts JPEG, PNG, WebP, GIF, AVIF, BMP and TIFF to JPEG, PNG or WebP with the same portable codecs in every host. MozJPEG, libwebp, libavif and the Squoosh PNG and resize builds ship as SHA-256-pinned implementation assets. Each one is fetched, checked against its digest and compiled on the first image that needs it, so a JPEG conversion loads only the JPEG codecs. CMYK JPEG is read with jpeg-js, GIF with omggif (first frame), TIFF with utif2 (first image) and BMP with this package's own reader. Each request is checked from the image header before anything is decoded. Inputs over 64 MiB or 50 megapixels are refused; `maxPixels` can lower the pixel limit but not raise it. A source whose bytes are not the declared format is refused, and so is an animated WebP, with a message that says why. Options: `maxEdge`, `maxBytes` (lossy targets walk a quality ladder, then fall back to 800 px), `quality` and a JPEG `background` matte. `@taucad/image/raster` exports `encodeRasterImage` and the option schemas, and the `default` preset now registers `transcoders.raster`.

Breaking:

- `imageTranscoder` is renamed `renderTranscoder`, with id `render` and name `RenderTranscoder`. Its plugin slot is `transcoders.render`.
- The SVG transcoder id `svg-image` is now `svg` (name `SvgTranscoder`); its slot is `transcoders.svg`.
- Export caches and telemetry series keyed on `image` or `svg-image` are recomputed once under the new ids.
