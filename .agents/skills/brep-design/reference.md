# Replicad API Catalog (verified)

Every signature below is verified against the pinned build
(`node_modules/replicad/dist/replicad.d.ts`, `@taulabs/replicad`). If an
operation is not in this file, do not assume it exists — see the
[not-present list](#not-present-plan-around-these) for workarounds.

## 2D profiles

Pen drawing (preferred): `draw(initialPoint?: Point2D): DrawingPen`, then
chain and finish with `.done()` (open path for spines) / `.close()` /
`.closeWithMirror()` / `.closeWithCustomCorner(radius, mode?)`.

Pen segments (also on `Sketcher`/`FaceSketcher`): `movePointerTo`, `lineTo`,
`line`, `hLine`, `vLine`, `hLineTo`, `vLineTo`, `polarLine(distance, angle)`,
`polarLineTo([r, theta])`, `tangentLine(distance)`,
`threePointsArcTo(end, mid)`, `threePointsArc(dx, dy, viaX, viaY)`,
`sagittaArcTo(end, sagitta)`, `sagittaArc`/`vSagittaArc`/`hSagittaArc`,
`bulgeArcTo(end, bulge)` (+ `v`/`h` variants), `tangentArcTo(end)`,
`tangentArc(dx, dy)` (G1 with the previous segment — use for sweep spines),
`ellipseTo`/`ellipse`, `halfEllipseTo`/`halfEllipse`,
`bezierCurveTo(end, ctrlPts)`, `quadraticBezierCurveTo`,
`cubicBezierCurveTo`, `smoothSplineTo(end, config?)`, `smoothSpline`,
`customCorner(radius, mode?: "fillet" | "chamfer" | "dogbone")`.

Canned drawings: `drawCircle(r)`, `drawEllipse(major, minor)`,
`drawRoundedRectangle(w, h, r?)` (= `drawRectangle`),
`drawPolysides(radius, sides, sagitta?)`,
`drawParametricFunction(fn, opts?, approx?)`,
`drawPointsInterpolation(points, approx?)`, `drawFaceOutline(face)`,
`drawText(text, opts?)` (+ `loadFont`).

`Drawing` modifiers (2D feature prep): `.cut(other)`, `.fuse(other)`,
`.intersect(other)`, `.offset(distance, { lineJoinType? })`,
`.fillet(radius, cornerFinder?)`, `.chamfer(radius, cornerFinder?)`,
`.mirror(centerOrDirection, origin?, mode?: "center" | "plane")`,
`.translate`, `.rotate`, `.scale`, `.stretch`. Use `.cut` to put holes in a
profile (gasket blanks, flanges, windowed webs) before sketching.

## Placing profiles on datums

- `makePlane(plane?: PlaneName, origin?: Point | number): Plane` — `origin`
  as a number offsets along the normal. `PlaneName = "XY" | "YZ" | "ZX" |
"XZ" | "YX" | "ZY" | "front" | "back" | "left" | "right" | "top" | "bottom"`.
- `Plane` methods for derived datums: `translate(x, y, z)`, `translateX/Y/Z`,
  `translateTo(point)`, `pivot(angle, direction?)`, `rotate2DAxes(angle)`.
- `makePlaneFromFace(face, originOnSurface?)` — datum from existing geometry.
- `drawing.sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number)`
  → `SketchInterface | Sketches`. Returns the union type; when a strictly
  typed `Sketch` is needed (for `sweepSketch`), use `new Sketcher(...)` or a
  canned `sketch*` helper instead.
- `drawing.sketchOnFace(face, scaleMode: "original" | "bounds" | "native")` —
  sketch directly on an existing (even curved) face; `FaceSketcher` for pen
  drawing in UV space.
- Canned sketches (return `Sketch` directly, take
  `{ plane?: PlaneName | Plane, origin?: Point | number }`): `sketchCircle`,
  `sketchEllipse`, `sketchRectangle`, `sketchRoundedRectangle`,
  `sketchPolysides`, `sketchFaceOffset(face, offset)`,
  `sketchParametricFunction`, `sketchText`.
- `new Sketcher(plane?: PlaneName, origin?: Point | number)` — pen directly
  in 3D plane, `.done()`/`.close()` return `Sketch`.

## The five form-makers

| Operation | Signature                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extrude   | `sketch.extrude(distance, { extrusionDirection?, extrusionProfile?: { profile?: "s-curve" \| "linear", endFactor? }, twistAngle?, origin? }): Shape3D`                                                                                                                                                                                                                                                                      |
| Revolve   | `sketch.revolve(revolutionAxis?: Point, { origin?, angle? }): Shape3D` — default axis Z; partial `angle` (e.g. 180) produces planar parting end-faces                                                                                                                                                                                                                                                                       |
| Sweep     | `spine.sweepSketch((plane, origin) => Sketch, sweepConfig?): Shape3D` — the SPINE is the sketch you call it on; the profile is built by the callback at the spine start. Low-level: `genericSweep(profileWire, spineWire, config, shellMode?)` with `GenericSweepConfig = { frenet?, auxiliarySpine?, law?, transitionMode?: "right" \| "transformed" \| "round", withContact?, support?, forceProfileSpineOthogonality? }` |
| Loft      | `sketch.loftWith(otherSketches, { ruled?, startPoint?, endPoint? }, returnShell?): Shape3D` — `startPoint`/`endPoint` close the loft to a point (bellmouths, domes). Low-level: `loft(wires, config?, returnShell?)`. `CompoundSketch.loftWith` lofts profiles with holes                                                                                                                                                   |
| Shell     | `shape.shell(thickness, (f) => faceFinder, tolerance?)` or `shape.shell({ thickness, filter })` — the found faces are removed (openings). Thicken a face into a solid: `makeOffset(face, offset, tolerance?): Shape3D`                                                                                                                                                                                                      |

Extrude variants: `twistExtrude(wire, angleDeg, center, normal, profile?)`,
`complexExtrude(wire, center, normal, profile?)`,
`supportExtrude(wire, center, normal, support)`,
`basicFaceExtrusion(face, vec)`.

Sketch-consumption warning: all Sketch operations DELETE the sketch. Rebuild
via a factory function or `.clone()` when a spine/profile is used twice.

## Path wires for sweeps (3D)

`makeLine(p1, p2)`, `makeCircle(r, center?, normal?)`,
`makeEllipse`/`makeEllipseArc`, `makeThreePointArc(v1, v2, v3)`,
`makeTangentArc(start, tangent, end)`, `makeBezierCurve(points)`,
`makeBSplineApproximation(points, config?)`,
`makeHelix(pitch, height, radius, center?, dir?, lefthand?): Wire`,
`sketchHelix(...same): Sketch` (directly sweepable — springs, modeled
threads), `assembleWire(edgesOrWires)` to join segments into one spine.

## Edge treatment

- `shape.fillet(radiusConfig, (e) => edgeFinder?): Shape3D`
- `shape.chamfer(radiusConfig, (e) => edgeFinder?): Shape3D`
- `RadiusConfig<R> = R | ((e: Edge) => R | null) | { filter: EdgeFinder, radius: R, keep? }`
- `FilletRadius = number | [number, number]` — variable start/end radius.
- `ChamferRadius = number | { distances: [d1, d2], selectedFace } |
{ distance, angle, selectedFace }` — asymmetric distance+angle chamfer
  covers countersink-style entries directly.
- `shape.draft(angle, (f) => faceFinder, neutralPlane?: Plane | PlaneName)` —
  casting draft from a declared parting plane.
- 2D equivalents on `Drawing` (`fillet`/`chamfer` with `CornerFinder`) — put
  constant corner treatment in the profile when the whole extrusion needs it.

## Finders (feature selection)

`EdgeFinder`: `inDirection(dir)`, `ofLength(n | fn)`,
`ofCurveType("LINE" | "CIRCLE" | "ELLIPSE" | "BEZIER_CURVE" |
"BSPLINE_CURVE" | ...)`, `parallelTo(plane | face)`,
`inPlane(planeName | plane, origin?)`.

`FaceFinder`: `parallelTo(plane | face)`, `ofSurfaceType("PLANE" |
"CYLINDRE" | "CONE" | "SPHERE" | "TORUS" | "REVOLUTION_SURFACE" | ...)`,
`inPlane(plane, origin?)`.

Both inherit: `atAngleWith(direction?, angle?)`, `atDistance(d, point?)`,
`withinDistance(d, point?)`, `containsPoint(p)`, `inBox(c1, c2)`,
`inShape(shape)`, `inList(elements)`, `when(fn)`, `not(fn)`,
`either([fns])`, `and(...)`; execute with
`.find(shape, { unique: true })`. `combineFinderFilters` builds per-region
radius maps for one fillet pass.

## Booleans, transforms, assembly

- `fuse(other, opts?)`, `cut(tool, opts?)`, `intersect(tool)`; batch:
  `fuseAll(shapes[])`, `cutAll(tools[])`, `intersectAll(tools[])` (pinned
  fork; prefer for many-feature passes). Options:
  `{ optimisation?: "none" | "commonFace" | "sameFace" }`.
- `translate(x, y, z)`/`translate(vec)`, `translateX/Y/Z`,
  `rotate(angleDeg, position?, direction?)`,
  `mirror(plane?: Plane | PlaneName | Point, origin?)`,
  `scale(factor, center?)`, `.clone()`.
- Holes: `drawing.punchHole(shape, faceFinder, { height?, origin?,
draftAngle? })` — drafted pocket/hole from a profile onto a face.
  `addHolesInFace(face, holeWires)`, `makeFace(wire, holes?)`.
- From-scratch topology: `makeSolid(facesOrShells[])`, `makePolygon(points)`,
  `makeNonPlanarFace(wire)`, `makeNewFaceWithinFace`, `makeCompound(shapes)`.
- Primitives (tool bodies / fallback only): `makeBaseBox(x, y, z)` (centred
  X/Y, z from 0), `makeBox(c1, c2)`, `makeCylinder(r, h, location?, dir?)`,
  `makeSphere(r)`, `makeEllipsoid(a, b, c)`.
- Validation/measure: `measureVolume(shape)`, `measureArea(face | shape)`,
  `measureLength`, `measureDistanceBetween(s1, s2)`,
  `measureShapeVolumeProperties(shape)` → `.centerOfMass` (mass/balance
  checks), `measureShapeSurfaceProperties`.
- Export: `exportSTEP(shapes?: ShapeConfig[], { unit? })` with per-shape
  `{ shape, name?, color?, ... }` for assembly product structure;
  `shape.blobSTEP()`, `shape.blobSTL()`; `importSTEP`, `importSTL`.

## Not present — plan around these

| Missing                                             | Sanctioned workaround                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Thread feature                                      | Callout metadata bound to the hole feature (`M10x1.5`, class, engagement length) in the params module; modeled helix sweep (`sketchHelix` + `sweepSketch`) only where the thread itself is under proof |
| Counterbore / countersink / spotface hole primitive | One revolved tool profile per stack type, cut at each position (`cutAll`); countersink entry via `{ distance, angle, selectedFace }` chamfer                                                           |
| Pattern/array feature (linear, circular)            | Parametric loops over placement functions: `positions.map((p) => tool.clone().translate(p))`, `angles.map((a) => part.clone().rotate(a, center, axis))`                                                |
| Gear/sprocket/spline generators                     | Author the tooth profile as a 2D drawing (arcs/involute approximation) and extrude; pitch radii must honour the centre distance                                                                        |
| Local BRepFeat-style pocket/boss on a face          | Sketch on the face (`sketchOnFace`) or `punchHole`; otherwise batched boolean cuts of tool solids                                                                                                      |
| In-place solid offset / thicken-solid               | `shell` for hollowing; `makeOffset(face, t)` to thicken a single face; 2D `drawing.offset(d)` for wall profiles                                                                                        |
