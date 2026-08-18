# Tau Logo

Parametric 2D reconstruction of the Tau brandmark. Set `avatar` to inset the mark within a transparent safe area and use `avatarScale` to target the crop shape. `generate-logo.ts` exports the canonical logo assets, explicit circle-safe and square-optimized avatar files, and the UI sprite badge (white mark on the brand-coloured rounded rectangle).

## Part Census

| Region       | Count | Construction                                         |
| ------------ | ----: | ---------------------------------------------------- |
| Top chevron  |     1 | Closed drawing with circular three-point corner arcs |
| Left branch  |     1 | Closed drawing with circular three-point corner arcs |
| Right branch |     1 | Mirrored-coordinate closed drawing                   |

The three regions are fused into one disconnected 2D drawing. There are no BRep parts, interfaces, or GeoSpec selectors.

## Construction Datums

| Datum                   | Value                             |
| ----------------------- | --------------------------------- |
| Brand coordinate system | `512 × 512` SVG view box          |
| Symmetry axis           | `x = 256`                         |
| Sloped-axis angle       | `atan(1 / sqrt(15)) = 14.477512°` |
| Fill                    | `#00987c`                         |
| Circle avatar scale     | `0.64` about `(256, 256)`         |
| Square avatar scale     | `0.8` about `(256, 256)`          |
| Sprite badge corner     | `rx 111` (`0.2167` of the side)   |

## Verification

Regenerate the SVG artifacts, then check that they have not drifted:

```bash
pnpm nx generate-logo tau-examples
pnpm nx check-logo tau-examples
pnpm nx check-thumbnails tau-examples
```

Regenerating the badge changes `apps/ui/app/components/icons/raw/tau.svg`, so follow it with `pnpm nx run ui:generate-svg-sprite`.

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; the generated-asset check and runtime thumbnail drift gate cover this example instead.

## Benchmark Prompt

> Reconstruct the Tau brandmark as a parametric 2D Replicad drawing in a 512 by 512 coordinate system. Preserve the exact 14.477512-degree engineered slopes and bilateral symmetry. Keep the two top outer tips, upper shoulder tips, and inner bottom tips sharp; reproduce the remaining rounded corners with circular three-point arcs. Return only the green 2D drawing and export it as SVG.

## Render Packet

- `logo.svg` - canonical generated vector render.
- `apps/ui/public/avatar-circle.svg` - circle-safe avatar vector.
- `apps/ui/public/avatar-circle.png` - circle-safe transparent 512 by 512 avatar raster.
- `apps/ui/public/avatar-square.svg` - square-optimized avatar vector.
- `apps/ui/public/avatar-square.png` - square-optimized transparent 512 by 512 avatar raster.
- `thumbnail.webp` - 768 by 576 preview rasterized from the runtime's 2D SVG artifact and verified by the thumbnail drift gate.
- `docs/research/tau-logo-reconstruction.md` - source provenance and raster-comparison evidence.
