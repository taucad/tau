# PicoVoxel Logo

Parametric 2D brandmark for [picovoxel](https://github.com/taucad/picovoxel), the TypeScript/WASM voxel kernel. One cube seen down the isometric axis, subdivided as an octree that only ever refines the octant nearest the camera: the three visible sides are tiled coarse at the silhouette and `pico` at the core, where the three refinements meet at the near corner. Resolution is spent where the eye lands — the sparse hierarchy a voxel kernel actually stores, drawn as the mark itself.

Every tile is derived, not drawn. The `levels` palette table is also the octree depth, and `channel` sets the width of the cut between neighbouring voxels.

## Part Census

| Region     | Count | Construction                                          |
| ---------- | ----: | ----------------------------------------------------- |
| Top face   |    10 | `+z` sides of exposed leaves — 3 × 4u, 3 × 2u, 4 × 1u |
| Left face  |    10 | `+y` sides of the same leaf set                       |
| Right face |    10 | `+x` sides of the same leaf set                       |

30 parallelograms, fused into 9 drawings — one per face and octree level, each carrying its own fill. Interior leaves (including the far corner cube, which no camera ray reaches) contribute nothing. There are no BRep parts, interfaces, or GeoSpec selectors.

## Construction Datums

| Datum                   | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| Brand coordinate system | `512 × 512` SVG view box, shared with the Tau logo               |
| Projection              | `u = (x − y)·cos 30°`, `v = z − (x + y)/2`                       |
| Root cube               | `8 × 8 × 8` voxel units (`2 ** levels.length`), fitted to height |
| Octree depth            | `3` — leaf edges of `4u`, `2u`, `1u`                             |
| Refinement rule         | Recurse into the `(1, 1, 1)` octant only                         |
| Channel                 | `0.2u`, halved onto each side that meets another voxel           |
| Silhouette              | Flush — sides lying on the cube's boundary are never trimmed     |

Because the channel is a constant width taken off shared sides only, voxels of any two sizes stay aligned on the grid line between them, and the outline stays an unbroken hexagon at every scale.

## Palette

PicoGK is "a nod to the peacocks that roam the streets of Dubai" ([leap71/PicoGK](https://github.com/leap71/PicoGK)), so the mark wears them: deep neck blue out at the silhouette, iridescent teal mid-scale, and the gold of the tail feather's eye at the pico core. One HSL row per octree level, offset by a per-face lightness. This is picovoxel's own mark, not LEAP 71's — it borrows the bird, not the branding.

| Level    | Voxel | HSL         | Top       | Right     | Left      |
| -------- | ----- | ----------- | --------- | --------- | --------- |
| 1        | `4u`  | `205°, 85%` | `#1286d9` | `#0d63a0` | `#09436d` |
| 2        | `2u`  | `186°, 95%` | `#06e0f9` | `#05abbd` | `#037986` |
| 3 (core) | `1u`  | `41°, 92%`  | `#f6b528` | `#d79609` | `#a27107` |

Face lightness runs top `46%`, right `34%`, left `23%`, plus the level's own lift.

## Verification

Regenerate the SVG artifact, then check that it has not drifted:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/picovoxel-logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/picovoxel-logo/generate-logo.ts --check
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; the generated-asset check and runtime thumbnail drift gate cover this example instead.

## Benchmark Prompt

> Draw an isometric cube as a parametric 2D Replicad drawing in a 512 by 512 coordinate system. Model it as a voxel octree that recurses only into the octant nearest the camera, three levels deep, and emit one parallelogram per exposed leaf side — the three camera-facing box sides only. Cut a constant-width channel between neighbouring voxels but leave every side that lies on the cube's own boundary flush, so tiles of different sizes stay aligned and the silhouette is an unbroken hexagon. Shade by side and by octree level: deep blue at the coarsest, iridescent teal next, gold at the finest. Return only the 2D drawing and export it as SVG.

## Render Packet

- `picovoxel.svg` - canonical generated vector render, one filled path per face and level.
- `thumbnail.webp` - 768 by 576 preview rasterized from the runtime's 2D SVG artifact, which strokes drawings rather than filling them, and verified by the thumbnail drift gate.
