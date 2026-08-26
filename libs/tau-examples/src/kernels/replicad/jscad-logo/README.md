# JSCAD Logo

Brandmark for [JSCAD](https://openjscad.xyz), the JavaScript CSG modeller behind this repository's `jscad` examples. The mark is not a drawing of a model — it _is_ a model, and a two-line one, shipped in JSCAD's own repository as `jscad.example.js`:

```javascript
const outer = subtract(cube({ size: 10 }), sphere({ radius: 6.8 }));
const inner = intersect(sphere({ radius: 4 }), cube({ size: 7 }));
```

`main.ts` rebuilds exactly that as BRep. It is what constructive solid geometry looks like with both operations on show at once: a difference that opens the cube, and an intersection that shapes what sits inside it.

## Part Census

| Region | Count | Construction                                    |
| ------ | ----: | ----------------------------------------------- |
| Shell  |     1 | Cube `10`, spherical cavity `6.8` cut from it   |
| Ball   |     1 | Sphere `4` intersected with a cube `7`          |
| Window |     6 | Where the cavity breaches a face — not modelled |
| Facet  |     6 | Where the cube flats off a pole — not modelled  |

The windows and facets are consequences, not features: nothing places them.

## Construction Datums

| Datum         | Value                                               |
| ------------- | --------------------------------------------------- |
| Cube          | `10`, so a half-edge of `5`                         |
| Cavity        | `6.8`                                               |
| Window radius | `√(6.8² − 5²) = 4.6087`                             |
| Corner reach  | `5√3 = 8.6603` — beyond the cavity, so corners hold |
| Ball          | `4`                                                 |
| Facet cube    | `7`, so a half-edge of `3.5`                        |
| Facet radius  | `√(4² − 3.5²) = 1.9365`                             |

The cavity radius is the whole design. Larger than the half-edge, it breaks out through all six faces and leaves a round window in each; smaller than the half-diagonal, it leaves the eight corners intact so the cube still reads as a cube. Both inequalities have to hold or there is no mark.

`makeBaseBox` centres in X and Y but extrudes upward from `z = 0`, unlike JSCAD's `cube`, which is centred on all three axes. Both solids are cut against a sphere at the origin, so that difference is not cosmetic: left uncentred, the cavity breaches only the bottom of the cube.

## Render

`generate-logo.ts` is a renderer, not a tracing. One path per face, four ellipses, one clip, one mask — about 2.4KB.

**The camera is measured, not chosen.** The published mark is not isometric: its silhouette is a hexagon, but not a regular one. Its upper corners sit `217px` from the axis and its lower corners only `185px`, and no parallel projection can do that — under one, opposite edges of a cube stay the same length. The mark has perspective.

So the camera is fitted. Taking the six silhouette corners of `icon_512.png` and solving for the elevation and distance that project a cube onto them — with focal length and centre eliminated by least squares, since they enter linearly — gives **25.218° of elevation at 6.319 half-edges**, to a residual of 2.6px on a 512px mark. The azimuth is not fitted: the mark is mirror-symmetric to within half a pixel, which puts the camera exactly on the cube's diagonal.

**Every boundary is still solved.** The mark is planes and spheres only, so each boundary is a straight line or a conic. Perspective breaks the closed form a parallel projection allowed — the near side of a circle is magnified more than the far side, so its ellipse is no longer centred on the projected centre and its axes align with nothing nameable. A projected circle is still exactly a conic, though, so the ellipse is recovered by projecting points of the circle and fitting `Ax² + Bxy + Cy² + Dx + Ey + F = 0` under `A + C = 1`, which is a linear least squares in five unknowns. Centre, axes and rotation drop out of the fit.

The ball needs the same care: under perspective a sphere's outline is not its central circle. The tangent lines from the eye touch it around a smaller circle, pulled toward the camera by `r²/d` and shrunk to `r·√(1 − r²/d²)`, which is then projected like any other circle. Ignoring this draws the ball slightly too small.

**Occlusion is three facts, not a depth buffer.** Each window circle is smaller than its face's half-edge, so it lies wholly inside that face and `evenodd` punches it out with no clipping and no boolean geometry. A screen point is one ray under perspective just as under a parallel projection, so it escapes through the far side exactly where it falls inside a far window's ellipse — the see-through stays a mask rather than a calculation. And the ball, convex and centred inside a convex cavity, is visible precisely where a window is, so it is clipped to their union.

**The light is solved too.** The published mark is flat-shaded in three tones per material, in the ratio `231 : 164 : 97` — top, right, left — on a mid tone that is the albedo itself. Fixing ambient at `0.3` and solving `ambient + diffuse · (normal · light)` for those three targets gives exactly one light direction and one diffuse weight, and reproduces all three tones to the byte. The cavity takes `76/164`, which is the bounce a concave cavity gets and a direct model does not. The ball's radial gradient is clamped to the ends of that same ladder, so the mark introduces no colour the published one lacks.

`main.ts` carries the published palette rather than `jscad.example.js`'s `colorize` calls, which are a slightly more violet purple. The mark should match the brand, not one script's arguments.

### The published icon is not this script

The fitted camera reproduces the published silhouette to 2.6px, but the interiors still differ: the published windows are smaller than `cavity = 6.8` gives.

That measurement is unusually trustworthy, because the window-to-silhouette width ratio is **independent of camera distance**. The window's horizontal diameter and the silhouette's widest corners both lie in the `z = +half` plane, so they share a depth and their perspective scaling cancels exactly. It is a pure shape invariant: `0.652` for this model against `0.628` measured on `icon_512.png`, implying a cavity of about `6.63` rather than `6.8`.

This example keeps `6.8`. `jscad.example.js` is JSCAD's own source for the mark, checked into JSCAD's own repository; the PNG is a render of something, of unknown vintage and segment count. Fitting radii to a raster is exactly the reverse-engineering this file avoids everywhere else. The discrepancy is recorded here rather than absorbed silently.

## Verification

The mark is checked by subtraction, not by eye. Render `main.ts` through the runtime, classify both it and the SVG into shell, ball and see-through by hue, normalise each by its bounding box, and compare per class. This checks the visible-surface model, not just the outline.

The renderer is verified at a camera the runtime can reproduce — its own perspective default, `phi = 60°` at `radius · 2·tan(30°)/tan(22.5°)`, which is 30° of elevation at 4.8284 half-edges — since the transcoder cannot be pointed at an arbitrary distance:

| Class       | Parallel, isometric | Perspective, runtime default |
| ----------- | ------------------: | ---------------------------: |
| see-through |              99.28% |                       99.12% |
| shell       |              98.68% |                       98.46% |
| ball        |              99.21% |                       98.50% |
| all pixels  |              99.54% |                       99.41% |

The residual in both is a one-pixel antialiasing fringe. The shipped mark then uses the camera fitted to the published icon, which differs only in elevation and distance — every code path is the one verified above.

Classify on blue, not red. Both materials are near-neutral in red and green — the ball's albedo has `r == g` exactly — so a `r > g` split misreads a plainly olive `rgb(131,129,29)` as magenta and reports a false 64% on the ball. Blue separates them by 164 against 0.

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/jscad-logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/jscad-logo/generate-logo.ts --check
pnpm nx check-thumbnails tau-examples
```

The renderer writes two identical copies: the canonical `jscad.svg` here, and `apps/ui/app/components/icons/raw/jscad.svg`, so the UI's kernel icon cannot drift from the part it is a render of. After regenerating, rebuild the sprite:

```bash
pnpm nx run ui:generate-svg-sprite
```

## Benchmark Prompt

> Model the JSCAD logo. Take a cube of edge 10 and subtract a sphere of radius 6.8 centred on it, so the sphere breaks out through all six faces and leaves a round window in each while the eight corners survive. Inside it, place a sphere of radius 4 intersected with a cube of edge 7, so the ball is flattened to a circular facet at each pole. Colour the outer solid magenta and the inner one olive, and return both.

## Render Packet

- `jscad.svg` - canonical generated vector render, shipped as the UI's `jscad` kernel icon.
- `thumbnail.webp` - preview rasterized from the runtime, verified by the thumbnail drift gate.
