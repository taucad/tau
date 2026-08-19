# Manifold Logo

Brandmark for [Manifold](https://github.com/elalish/manifold), the mesh boolean library behind this repository's `manifold` kernel. The mark is Manifold's own `MengerSponge` sample — the model its README, its editor icon and its favicon all carry — and `main.ts` follows that sample as written, in `samples/src/menger_sponge.cpp` and again in the wasm bindings' `menger-sponge.mjs`.

The sample exists to make a point about robustness: every hole is cut by a box whose sides are _exactly_ coplanar with its neighbours', and the result is still watertight. That is the property the library is named for, so the mark is a correctness demonstration rather than an illustration.

## Part Census

| Region | Count | Construction                                           |
| ------ | ----: | ------------------------------------------------------ |
| Cube   |     1 | `Manifold.cube([1, 1, 1], true)`                       |
| Holes  |   585 | `1 + 8 + 64` boxes per axis, unioned, cut on all three |
| Faces  |     6 | Each a Sierpinski carpet, depth 3                      |

Nothing places a hole individually: one recursion emits them all, and the same recursion drives the vector render.

## Construction Datums

| Datum      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| Depth      | `3` — the published mark; depth 4 is ~400,000 triangles   |
| Cell grid  | `27 × 27 × 27`                                            |
| Holes/face | `1 + 8 + 64 = 73`                                         |
| Colour law | `(1 - pos) / 2` per channel, `pos` normalised to `-1 … 1` |
| Camera     | Perspective, fitted to the published mark — see Render    |

## Two Things the Kernel Needed

**Normals must be asked for.** Manifold meshes carry none, and the GLTF exporter will not invent them, so `calculateNormals(0, 60)` writes them into the first three properties — 60° keeps every face of a box-cut solid flat. The material then has to name them (`attributes: ['NORMAL']`), or the exporter writes properties it cannot label and the mesh reads as `TRIANGLES primitive missing NORMAL`.

**Vertex colour does not survive.** The sample colours the sponge through `setProperties(3, …)` and declares the result `COLOR_0`. Tau's image transcoder rejects that outright — `unsupported vertex attribute Colors(0)` — so the solid is returned uncoloured for rendering and the colour law is exported from `main.ts` instead, for the vector render to evaluate. One source either way, but it does mean the thumbnail is monochrome while the icon is not.

## Render

`generate-logo.ts` is a renderer, not a tracing — but unlike the other brandmarks here, both its camera and its lighting are _measured_ from the published icon rather than chosen.

**The camera is fitted.** The published silhouette is a hexagon that is neither regular nor symmetric, so it is no isometric and no parallel projection at all: opposite edges of a cube stay equal under one, and these do not. Six silhouette corners were extracted from `mengerSponge512.png` by fitting lines to its convex hull — corner pixels are eroded by antialiasing, so intersecting fitted edges beats reading extremes — and then azimuth, elevation, roll and distance were solved to project a cube onto them, with focal length and centre eliminated by least squares since they enter linearly.

| Parameter | Fitted                     |
| --------- | -------------------------- |
| Azimuth   | 308.037°                   |
| Elevation | 51.561°                    |
| Roll      | 58.603°                    |
| Distance  | 4.774 half-edges           |
| Residual  | **0.79px** on a 512px mark |

The roll matters as much as the angles. A cube's silhouette is invariant under its 24 rotations, so shape alone cannot say which face is which — the orientation was chosen by fitting colour.

**The holes show the tunnels behind them.** Every hole is the mouth of a tunnel through the whole cube, and from this camera no tunnel can be seen through — the eye sits more than three widths off every axis — so what a hole shows is exactly two of its four walls: the far ones along each of the face's axes. They meet along the tunnel's far corner, whose projection splits the hole between them, so each wall is its full projected rectangle clipped to the hole (Sutherland–Hodgman, convex against convex) and the pair neither overlaps nor gaps. A wall lies in a grid plane, so it carries the carpet of the face parallel to it, restricted to its strip — the tunnels crossing this one — and where a bigger tunnel crosses, the intersection is void for the strip's whole width, which is also correct. Walls are drawn for the two largest hole levels; third-level tunnels are a pixel wide at icon sizes and are left to a measured shadow tone.

**The shading is a reflection, so it is fitted, not derived.** The sample's own `mengerSponge3.glb` carries vertex colours and a roughness of 0.2 under glTF's default metalness of 1 — the mark is a metallic render, and what each face shows is the environment reflected in it, tinted by the colour law. That is not something a gradient can be derived from, so it is fitted per face, in the one family SVG paints exactly:

```
channel = a + b·x + c·y                one linear gradient each, screened together
colour  = channel + s·(1 − channel)    one radial gradient screened on top
```

Screen is exact addition for layers that share no channel, which is why the three channel gradients sum without error, and the highlight `s` — an elliptical radial profile with a colour at each of seven radii — is composited the way `screen` composites, so what was fitted is what is painted. The profile is free rather than Gaussian because the reflection's fall-off is not Gaussian: on the largest face a Gaussian leaves an rms of 0.138, the free profile 0.093, against 0.074 for an unconstrained quartic. Channels are constrained non-negative over the face, since a negative channel cannot be painted and an unconstrained fit uses one to cancel the highlight's tint. First-level tunnel walls take the same affine family as gradients; second-level walls a quadratic per channel, drawn flat at each wall's centre, since a quadratic reaches the rms of a measured mean per wall and an affine does not.

Coefficients are per hundred projected units, which keeps them to four decimals; the fitted constants live in `fitted` in `generate-logo.ts`.

### What is not modelled

**The bright halos around the holes.** The GLB carries no normals, so the viewer that rendered the mark computed smooth ones — averaging faces that meet at right angles — and the reflection bends around every hole edge. Against a smooth field the left face has an rms floor near 0.11 whichever model is used; the other two sit near 0.06.

**Third-level tunnel walls,** and the walls' own smallest holes: a flat measured tone each.

## Verification

Deterministic, by subtraction against `mengerSponge512.png`: the SVG is rasterised so its silhouette bounding box matches the mark's, then compared where both are opaque.

| Measure                  |     Value |
| ------------------------ | --------: |
| Silhouette IoU           |     98.9% |
| Colour rms, whole mark   |     0.153 |
| Colour rms, largest face |     0.094 |
| Colour rms, left face    |     0.124 |
| Colour rms, bottom face  |     0.075 |
| First-level walls        | 0.06–0.12 |

The whole-mark figure includes hole and wall edges, where a pixel of misalignment costs a full contrast step; the per-region figures are what the shading fit controls.

```bash
pnpm exec tsx libs/tau-examples/src/kernels/manifold/manifold-logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/manifold/manifold-logo/generate-logo.ts --check
pnpm nx check-thumbnails tau-examples
```

The renderer writes two identical copies: the canonical `manifold.svg` here, and `apps/ui/app/components/icons/raw/manifold.svg`, so the UI's kernel icon cannot drift from the part it is a render of. After regenerating, rebuild the sprite:

```bash
pnpm nx run ui:generate-svg-sprite
```

## Benchmark Prompt

> Model a Menger sponge three levels deep. Start from a unit cube and cut a square bar through the centre of each cell, then recurse into the eight cells surrounding it, dividing the width by three each level. Union all the bars, then subtract that union three times — once along each axis. Colour it by position, each channel `(1 - pos) / 2` over the cube, and return the solid.

## Render Packet

- `manifold.svg` - canonical generated vector render, shipped as the UI's `manifold` kernel icon.
- `thumbnail.webp` - preview rasterized from the runtime, verified by the thumbnail drift gate.
