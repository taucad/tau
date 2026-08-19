# Replicad Logo

Brandmark for [replicad](https://replicad.xyz), the browser CAD kernel this repository's `replicad` examples are built on. Two of replicad's own vases, side by side — the shape its documentation opens with, and the one the [`vase`](../vase/main.ts) example already builds.

The mark is the part, not a picture of the part. `main.ts` returns a real `Shape3D`: the meridian revolved, shelled from the top face, and filleted on both top edges. `generate-logo.ts` renders that same meridian to SVG.

## Part Census

| Region      | Count | Construction                                         |
| ----------- | ----: | ---------------------------------------------------- |
| Vase        |     2 | Revolved meridian, shelled `5mm`, top edges filleted |
| Meridian    |     3 | Cubic Bezier segments, plus the opening `hLine`      |
| Fillet edge |     2 | Both `XY` circles at `z = height` — rim and bore     |

Fused into one compound. There are no BRep interfaces or GeoSpec selectors.

## Construction Datums

| Datum       | Value                                          |
| ----------- | ---------------------------------------------- |
| Height      | `100`                                          |
| Base radius | `20`                                           |
| Belly       | `30` at `z = 25` (`1.5 × baseWidth`)           |
| Neck        | `15` at `z = 75` (`0.75 × baseWidth`)          |
| Rim         | `18` at `z = 100` (`0.9 × baseWidth`)          |
| Wall        | `5`, shelled from the top face                 |
| Fillet      | `5/3` — `wallThickness / 3`, on both top edges |
| Bore        | `13` — `rim − wall`                            |
| Spacing     | `2.3 × maxRadius`, centre to centre            |

`profilePoles` emits the meridian as explicit cubic Bezier poles rather than calling `smoothSplineTo`, because the render needs the same curve the solid is built from. The poles are exactly what `smoothSplineTo` computes for this configuration: control distance a quarter of the chord, the start pole continuing the previous tangent scaled by `startFactor`, the end pole pulled back along a vertical end tangent. The solid is unchanged by the substitution.

## Render

`generate-logo.ts` is an orthographic renderer, not a tracing. One path, seven ellipses, four gradients, two clips — about 6.5KB. Three things are worth knowing about it.

**The camera is the runtime's.** Examples are thumbnailed through the image transcoder, whose defaults are a 45° perspective camera at `phi = 60` — a polar angle from the up axis, so 30° of elevation — placed at `radius · 2·tan(30°) / tan(22.5°)` from the subject centre, where `radius` is the bounding sphere's. Those two numbers are the whole difference between a vase that reads as an egg and one that reads as flat-bottomed: at 30° the base circle opens up, and the perspective divide opens it further, because the base sits well below the camera axis. An orthographic camera at a shallower tilt flattens the base however the shading is tuned.

`theta` is not needed. A surface of revolution has the same silhouette from every azimuth — which is also what lets the mark be checked against a reference render made at the transcoder's default `theta`. Screen units are arbitrary, since the view box is fitted afterwards, so the projection carries no field of view: only distance over radius shapes it.

Under perspective a circle still projects to an ellipse, but no longer one centred on the projected centre — the near half is magnified more than the far half. Three points pin each one down: front and back give the centre and the semi-minor axis, and a third solves the semi-major from the ellipse equation. The camera sits in the plane `x = 0`, so the scene's mirror symmetry survives projection and every ellipse has its axes on the screen axes.

**The silhouette is an envelope, fitted as one smooth path.** The outline is the boundary of the union of those projected ellipses: at each screen row, the widest one crossing it. Mirroring the meridian instead corners where the wall meets the base disc — the meridian leaves the base edge horizontally, the base circle's projection leaves it vertically — and reads as a lip the solid does not have. The envelope hands over between neighbouring circles tangentially, so the base rounds off and the top fillet rolls over, both for the same reason.

The scan is dense (2000 rows) so the envelope is exact; the path is built from 40 vertices per side, resampled at even arc length, joined by cubic Beziers with Catmull-Rom tangents. Even arc length is what keeps the base smooth: the outline runs nearly horizontal there, so stepping in height would leave almost no vertices across the widest, most sharply turning part of the curve. The mirrored half supplies each apex its neighbours, so the loop is C1 everywhere.

Both vases are the same projection, placed twice. A true perspective render would distort the off-centre one; a brandmark should not.

**Every tone is a BRDF sample.** Cook-Torrance GGX — GGX distribution, Schlick-Smith geometry, Schlick Fresnel at a dielectric `F0` of `0.04`, roughness `0.38` — evaluated in world axes at the surface normal, then sRGB encoded. A revolve shades as a function of screen `x`, because `x / radius` is the sine of the azimuth, and that is exactly what one horizontal `linearGradient` carries.

Every azimuthal gradient spans the same user-space width, the belly's, so the neck and the rim inside it are shaded on one scale and meet without a seam. That reads the neck as turning away a little less than it does; a per-circle scale would be truer, but cannot be carried by a single fill without leaving exactly the seam this avoids.

**Both top fillets are radial roll-overs on top of the azimuthal shading.** A fillet has two variations at once — round the rim and across it — and one gradient can only carry one. Painting the fillet's tone with a radial gradient alone leaves a step at the sides, where its edge is lit for the front azimuth but meets a wall that is dark. So each fillet ellipse is filled first with the gradient of the surface it rolls away from (the wall, or the bore), and a `radialGradient` is overlaid that fades to transparent at that surface's edge. The fillet then inherits the correct tone at every azimuth where they meet, and the radial term only adds the roll-over. In bounding-box units on the fillet's own ellipse it is elliptical to match. The flat land between them is a single tone, which is not a simplification: its normal is the same everywhere.

The rim's circles each sit at their own height, so their projections are not concentric. That matters for the opening: the bore's front arc lands lower than the inner fillet's, where in reality it is hidden under the land. The bore is clipped to the inner fillet's ellipse, so what shows through the opening is the intersection of the inner circles. The whole mark is likewise clipped to its own outline, since the rim's ellipses are exact while the outline is a smooth fit to the envelope, and at the sides an ellipse edge can otherwise sit a hair outside the path.

The bore carries a `bounce` multiplier on its ambient term. A direct, single-bounce model leaves it black, because its walls face away from every light; in a real render the neck is filled almost entirely by light bouncing off the bright rim opposite.

## Verification

The silhouette is checked by subtraction, not by eye. Render the `vase` example through the runtime at the transcoder's default camera with a transparent background, mask both it and the mark by alpha, normalise each by its bounding box, and compare. The mark currently agrees with the runtime render to **99.7% IoU**, with a bounding-box aspect ratio within **0.11%** — the residual is a one-pixel antialiasing fringe that alternates sign around the boundary.

Regenerate the asset, then check that it has not drifted:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/replicad-logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/replicad-logo/generate-logo.ts --check
pnpm nx check-thumbnails tau-examples
```

The renderer writes two identical copies: the canonical `replicad.svg` here, and `apps/ui/app/components/icons/raw/replicad.svg`, so the UI's kernel icon cannot drift from the part it is a render of. After regenerating, rebuild the sprite:

```bash
pnpm nx run ui:generate-svg-sprite
```

## Benchmark Prompt

> Model replicad's logo: two identical vases standing side by side. Each vase is a solid of revolution — revolve a meridian that starts at a flat base, swells to a belly one and a half times the base radius a quarter of the way up, pulls in to a narrow neck three quarters up, and flares slightly to the rim. Use smooth splines with vertical tangents at each waypoint so the surface is tangent-continuous. Shell the solid from the top face to leave a 5mm wall, and round both circular edges at the opening. Space the two vases so they nearly touch.

## Render Packet

- `replicad.svg` - canonical generated vector render, shipped as the UI's `replicad` kernel icon.
- `thumbnail.webp` - preview rasterized from the runtime, verified by the thumbnail drift gate.
