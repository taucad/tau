# Tau Logo

Parametric 2D reconstruction of the Tau brandmark. The default model returns one Replicad `Drawing`; `generate-logo.ts` exports that drawing to `logo.svg`, the logo-keychain asset, the UI favicon and React icon, and the email logo path module.

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
| Fill                    | `#008f7b`                         |

## Verification

Regenerate the SVG artifacts, then check that they have not drifted:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/logo/generate-logo.ts --check
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; the generated-asset check and runtime thumbnail drift gate cover this example instead.

## Benchmark Prompt

> Reconstruct the Tau brandmark as a parametric 2D Replicad drawing in a 512 by 512 coordinate system. Preserve the exact 14.477512-degree engineered slopes and bilateral symmetry. Keep the two top outer tips, upper shoulder tips, and inner bottom tips sharp; reproduce the remaining rounded corners with circular three-point arcs. Return only the green 2D drawing and export it as SVG.

## Render Packet

- `logo.svg` - canonical generated vector render.
- `thumbnail.webp` - 768 by 576 preview rasterized from the runtime's 2D SVG artifact and verified by the thumbnail drift gate.
- `docs/research/tau-logo-reconstruction.md` - source provenance and raster-comparison evidence.
