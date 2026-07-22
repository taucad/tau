# Tau Wordmark

Parametric 2D reconstruction of the complete Tau wordmark. The T, A, and U preserve the Illustrator master's engineered shallow isometric axis, while every rounded corner is a circular Replicad `threePointsArcTo` segment.

## Part Census

| Region     | Count | Construction                                         |
| ---------- | ----: | ---------------------------------------------------- |
| T chevron  |     1 | Closed drawing with circular three-point corner arcs |
| T branches |     2 | Mirrored-coordinate closed drawings                  |
| A          |     1 | Rounded outer drawing cut by a rounded counter       |
| U          |     1 | Closed drawing with circular three-point corner arcs |

The five regions are fused into one disconnected 2D drawing. There are no BRep parts or GeoSpec selectors.

## Construction Datums

| Datum                   | Value                                      |
| ----------------------- | ------------------------------------------ |
| Brand coordinate system | `3160 × 1187.71` SVG view box              |
| Sloped-axis angle       | `atan(1 / sqrt(15)) = 14.477512°`          |
| T source scale          | `1200 / 512` from the canonical Tau symbol |
| A/U stroke width        | `160`                                      |
| Base-logo radius family | `r0 / r24 / r60`                           |
| Wordmark radius family  | `0 / 56.25 / 140.625`                      |
| Fill                    | `#008f7b`                                  |

The A and U points come from the SVG exported from the PDF-compatible Illustrator master. Their 400-unit runs rise by 103.24 units, the Illustrator-rounded form of the same `1 / sqrt(15)` axis used by the T. Every glyph uses the canonical symbol's three-radius profile, scaled by `1200 / 512`, with true circular Replicad arcs.

## Corner Profile

| Glyph | `r0`                                     | `r24`                   | `r60`              |
| ----- | ---------------------------------------- | ----------------------- | ------------------ |
| T     | Chevron ×2, branch gap ×2, stem split ×2 | T1, T7, T11             | T2–T6, T8–T10, T12 |
| A     | A3, A9                                   | A1, A2, A4, A8, A10–A14 | A5–A7              |
| U     | U4, U9                                   | U3, U5–U8               | U1, U2, U10        |

## Verification

Regenerate the SVG and UI component, then check for drift:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/tau-wordmark/generate-wordmark.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/tau-wordmark/generate-wordmark.ts --check
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; generated-asset and thumbnail drift checks cover this example instead.

## Raster Evidence

The sharp Replicad reconstruction was rasterized against the Illustrator SVG at 3160 by 1188 pixels before rounding.

| Comparison                        | Silhouette Dice | Silhouette IoU | Mismatched pixels |
| --------------------------------- | --------------: | -------------: | ----------------: |
| Sharp Replicad vs Illustrator SVG |      99.999927% |     99.999854% |                 2 |

## Benchmark Prompt

> Reconstruct the complete Tau T/A/U wordmark as one parametric 2D Replicad drawing in a 3160 by 1187.71 coordinate system. Preserve the exact 14.477512-degree engineered shallow isometric axes, the canonical rounded Tau symbol, the 160-unit A/U stroke, and the established glyph spacing. Apply the symbol's `r0/r24/r60` corner profile at `1200 / 512` scale using circular three-point arcs. Return only the green 2D drawing and export it as SVG.

## Render Packet

- `wordmark.svg` - canonical generated vector render.
- `thumbnail.webp` - runtime-rendered 768 by 576 preview.
- `apps/ui/app/components/icons/tau-wordmark.tsx` - generated UI consumer using `currentColor`.
