# Tau Wordmark

Parametric 2D construction of the Tau wordmark: the canonical Tau symbol followed by custom lowercase `tau` letters. The letters are drawn, not set in a font, from one grid of stems, bars and squared bowls, so every surface that shows the wordmark renders the same outlines.

## Construction

| Region | Construction                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Symbol | The canonical rounded Tau symbol (`r0/r24/r60` corners), scaled to the letters' height and standing on the baseline               |
| t      | Stem with its top cut on the symbol's axis, asymmetric bar on the x-height, squared foot turning into a tail cut on the same axis |
| a      | Single-storey: squared bowl ring closed by a straight right stem                                                                  |
| u      | The a's bowl opened at the top, with the same right stem                                                                          |

Bowls are four cubic quadrants with handle factor `0.6` (a circle is `0.5523`), which squares them slightly. Bars are thinner than stems so horizontals and verticals read with the same weight. All regions are fused into one 2D drawing; the counters are cut, so the exported SVG uses the even-odd fill rule.

## Grid

| Datum            | Value                             |
| ---------------- | --------------------------------- |
| x-height         | `520`                             |
| Stem / bar       | `100` / `88`                      |
| Overshoot        | `10`                              |
| t and symbol top | `700`                             |
| Bowl width       | `476`                             |
| Axis             | `atan(1 / sqrt(15)) = 14.477512°` |
| Symbol → t gap   | `210`                             |
| Fill             | `#00987c`                         |

## Verification

Regenerate the SVG, PNG and consumers, then check for drift:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/tau-wordmark/generate-wordmark.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/tau-wordmark/generate-wordmark.ts --check
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; generated-asset and thumbnail drift checks cover this example instead.

## Benchmark Prompt

> Draw the Tau wordmark as one parametric 2D Replicad drawing: the canonical rounded Tau symbol, then custom lowercase "tau" letters on a 520 x-height grid with 100-unit stems and 88-unit bars. Use a single-storey a and a u that share the same squared bowl and straight right stem, and a t whose top and tail are cut on the symbol's 14.477512-degree axis. Return only the green 2D drawing and export it as SVG.

## Render Packet

- `wordmark.svg` - canonical generated vector render.
- `apps/ui/public/wordmark.svg` - public vector asset.
- `apps/ui/public/wordmark.png` - public raster asset at 512 pixels high, used by email.
- `thumbnail.webp` - runtime-rendered 768 by 576 preview.
- `apps/ui/app/components/icons/tau-wordmark.tsx` and `apps/docs/app/components/tau-wordmark.tsx` - generated React consumers using `currentColor`.
- `apps/www/src/wordmark.mjs` - generated symbol and letter paths for the marketing site, coloured separately.
