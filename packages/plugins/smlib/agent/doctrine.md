## Workflow

1. Author `main.ts` with ES module imports from `@classcad/smlibwasm`, exported `defaultParams`, and a default `main(params)` returning a body, a Tau `ShapeConfig`, an array of either, or a `Model` envelope. `main(smlib, params)` (two parameters) receives the library namespace instead.
2. smlibwasm is smlibpy's build123d-style **algebra** API in JavaScript: camelCase names (`parallelTo`, `massProperties`), Python keyword arguments as a trailing options object (`Rectangle(40, 20, { fillet: 2 })`, `sketch.extrude(10, { both: true })`), and methods for operators: `a.fuse(b)`, `a.cut(b)`, `a.intersect(b)` for `+`, `-`, `&`; `Pos(10, 0, 0).mul(shape)` and `GridLocations(20, 20, 3, 3).mul(shape)` for `*`. There is no builder mode (`BuildPart`, `BuildSketch`).
3. Prefer feature construction: a `Sketch` (`Rectangle`, `Circle`, `Polygon`, `Text`, their `fuse`/`cut`) extruded, revolved, lofted or swept, then `fillet`, `chamfer`, `shell` and holes on selected edges and faces. Select topology with chained `ShapeList` selectors such as `part.edges().parallelTo(Z)`, `part.faces().sortBy(Z).last` or `part.faces().top()`.
4. For appearance, materials, textures, mass or the drawing view, read `tau-authoring-reference.md` and import Tau types with `import type` from `@taucad/smlib/model`. Use physical `material` for glTF effects beyond the legacy color/opacity/metalness/roughness fields.
5. If parts move relative to one another, read `kinematics-reference.md`. Return separate named parts, export `mechanism` with joints and an animation for every independent motion, and verify the Kinematics pane plays them.
6. Verify the entry point and every renderable library file independently. Fix `ModelingError`/`KernelError` messages, material/resource and mechanism warnings even if some geometry renders.

For multiple files, import helpers with explicit ESM paths such as `./lib/widget.js`. Library files export geometry builders; `main.ts` assembles them. A standalone test target must export a default `main` returning geometry.

## Kernel rules

- Primitives (`Box`, `Cylinder`, `Sphere`, `Cone`, `Torus`) and sketches (`Rectangle`, `Circle`, …) are **centered on the origin** on every axis. Stand a part on XY with `{ align: ['center', 'center', 'min'] }` or `Pos(0, 0, h / 2).mul(...)`.
- Sketches are built on `Plane.XY`. Place one with `Pos(...).mul(sketch)`, `Plane.XZ.mul(sketch)`, `Plane.XY.offset(z).mul(sketch)` or `sketch.on(part.faces().top())`.
- `sketch.revolve()` turns about the sketch's **local Y axis**; a profile crossing that axis throws. For a Z-up turned part draw the half profile beside the axis on `Plane.XZ` and call `.revolve(Z)` (optional angle in degrees).
- Booleans take several operands at once: `base.cut(holeA, holeB)`, `base.fuse(GridLocations(...).mul(boss))`. A `Locations` product is a `ShapeList`; pass it straight to `fuse`/`cut`.
- Transforms return new shapes: `shape.translate(x, y, z)`, `shape.rotate(Z, degrees)`, `shape.mirror(Plane.YZ)`, `Rot(0, 0, 45).mul(shape)`. Angles are degrees, lengths millimetres.
- Name and color bodies with `.named('Lid')` and `.colored('#c78b52')`; a `ShapeConfig`'s own `name` and `color` win when present.
- Errors are specific: `ModelingError` explains the failed operation (a fillet larger than its faces allow, an axis crossing a revolve region), `KernelError` carries the kernel status, and a Python `ValueError` is a `RangeError`. Read the message and change the input rather than wrapping the call in `try`.

## Tessellation

SMLib meshes each B-rep face with a chordal and an angular tolerance, the same contract as Tau's OpenCascade kernels. Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the bounding-box diagonal D of every meshed shape: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint, so keep it out of model parameters. Results report the effective `tessellation` (requested form, tolerances, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances. STEP is exact B-rep and takes no tessellation. There is no tessellation instancing: every repeated copy is meshed again.

## Canonical pattern

```ts
import { Box, Cylinder, GridLocations, Z, type Part } from '@classcad/smlibwasm';

export const defaultParams = {
  width: 80,
  depth: 60,
  thickness: 10,
  cornerRadius: 8,
  holeRadius: 4,
};

export default function main(p = defaultParams): Part {
  let plate = Box(p.width, p.depth, p.thickness, {
    align: ['center', 'center', 'min'],
  });
  plate = plate.fillet(plate.edges().parallelTo(Z), p.cornerRadius);
  const holes = GridLocations(p.width - 20, p.depth - 20, 2, 2).mul(
    Cylinder(p.holeRadius, p.thickness, { align: ['center', 'center', 'min'] }),
  );
  return plate.cut(holes).named('Plate');
}
```

Check invalid dimensions, a revolve axis through the profile, coincident boolean faces and over-sized fillets first. `api-*` files cover upstream `@classcad/smlibwasm`; `tau-api-*` files cover Tau's returned model and material types from `@taucad/smlib/model`. Grep them before assuming an API is unavailable.

## Wrong / Correct

- Wrong: `Box(10, 10, 10) + Cylinder(3, 20)` or `Box(...) - hole`. Correct: `Box(10, 10, 10).fuse(Cylinder(3, 20))`, `body.cut(hole)`.
- Wrong: `Pos(10, 0, 0) * Box(1, 1, 1)` or `Rectangle(40, 20, fillet=2)`. Correct: `Pos(10, 0, 0).mul(Box(1, 1, 1))`, `Rectangle(40, 20, { fillet: 2 })`.
- Wrong: `part.edges().filter_by(Axis.Z)` or `group_by`. Correct: camelCase, `part.edges().filterBy(Z)`, `part.edges().parallelTo(Z)`, `part.faces().groupBy(Z)`.
- Wrong: `Rectangle(10, 30).revolve()` (the default local Y axis crosses the centered region). Correct: `Plane.XZ.mul(Polygon([10, 0], [20, 0], [20, 30], [10, 30])).revolve(Z)`.
- Wrong: `import { Material } from '@taucad/smlib/model'` as a value. Correct: `import type { Material, Model, ShapeConfig } from '@taucad/smlib/model'`.

## Known gaps

SMLib in Tau has no STEP interfaces or PMI annotations (Replicad's `@taucad/replicad/annotations` has no SMLib equivalent), STEP export keeps shape names and the legacy `color` but not `density` or physical materials, textured and anisotropic materials use box-projected UVs because SMLib exposes no surface parameterization, error stacks are mapped to your source but not into smlibwasm's own frames, and there is no OpenCascade-level tracing, tessellation instancing or reuse of unchanged geometry between evaluations. Node-only file helpers (`exportStep(shapes, path)`, `importStep(path)`, `show`) do not apply in Tau; return shapes and let Tau export them.
