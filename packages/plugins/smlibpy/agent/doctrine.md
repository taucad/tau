## Workflow

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have `bool`, `int`, `float`, `str` or `Literal` annotations and defaults, and a synchronous `main(params: Params)` that imports `smlibpy` and returns a body, a `ShapeConfig` dict, a list of either, a `Model` dict or `None`. A module that imports `smlibpy` runs on this kernel; one that imports `build123d` runs on Build123d.
2. smlibpy is the SMLib NURBS kernel's build123d-style **algebra** API in Python: operators `+`, `-`, `&` fuse, cut and intersect; `Pos(10, 0, 0) * shape` and `GridLocations(20, 20, 3, 3) * shape` place copies; keyword arguments are keyword-only (`Rectangle(40, 20, fillet=2)`, `sketch.extrude(10, both=True)`). There is no builder mode (`BuildPart`, `BuildSketch`) and no native joints.
3. Prefer feature construction: a `Sketch` (`Rectangle`, `Circle`, `Polygon`, `Text`, combined with `+`/`-`) extruded, revolved, lofted or swept, then `fillet`, `chamfer`, `shell` and holes on selected edges and faces. Select topology with chained `ShapeList` selectors such as `part.edges().parallel_to(Z)`, `part.edges().group_by(Z)[-1]` or `part.faces().top()`.
4. For appearance, materials, textures or images, read `tau-authoring-reference.md`. Use a physical `material` dict for glTF effects beyond the legacy `color`/`opacity`/`metalness`/`roughness` fields.
5. If parts move relative to one another, read `kinematics-reference.md`. Return separate named parts, define `mechanism(params)` with joints and an animation for every independent motion, and verify the Kinematics pane plays them.
6. Verify the entry point and every helper module. Fix `ModelingError`/`KernelError` messages, material/resource and mechanism warnings even if some geometry renders.

Use static project-relative Python imports for helper modules. Declare non-Python files the model reads in `__tau__ = {"dependencies": ["textures/finish.png"]}` with paths from the project root, so edits to them rebuild the model.

## Kernel rules

- Primitives (`Box`, `Cylinder`, `Sphere`, `Cone`, `Torus`) and sketches (`Rectangle`, `Circle`, …) are **centered on the origin** on every axis. Stand a part on XY with `align=(Align.CENTER, Align.CENTER, Align.MIN)` (strings such as `"min"` also work) or `Pos(0, 0, h / 2) * ...`.
- Sketches are built on `Plane.XY`. Place one with `Pos(...) * sketch`, `Plane.XZ * sketch`, `Plane.XY.offset(z) * sketch` or `sketch.on(part.faces().top()[0])`.
- `sketch.revolve()` turns about the sketch's **local Y axis**; a profile crossing that axis raises. For a Z-up turned part draw the half profile beside the axis on `Plane.XZ` and call `.revolve(Z)` (optional angle in degrees).
- `Locations * shape` is a `ShapeList`; subtract or add it directly: `plate - GridLocations(24, 24, 3, 2) * drill`.
- Transforms return new shapes: `shape.translate(x, y, z)`, `shape.rotate(Z, degrees)`, `shape.mirror(Plane.YZ)`, `Rot(0, 0, 45) * shape`. Angles are degrees, lengths millimetres.
- Name and color bodies with `.named("Lid")` and `.colored("#c78b52")`; a `ShapeConfig`'s own `name` and `color` win when present.
- Errors are specific: `ModelingError` explains the failed operation (a fillet larger than its faces allow, an axis crossing a revolve region), `KernelError` carries the kernel status, and `ValueError` reports an out-of-range argument. Read the message and change the input rather than wrapping the call in `try`.

## Tessellation

smlibpy meshes each B-rep face with a chordal and an angular tolerance, the same contract as Tau's OpenCascade kernels. Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the bounding-box diagonal D of every meshed shape: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint, so keep it out of `Params`. A view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances. STEP is exact B-rep and takes no tessellation.

## Canonical pattern

```python
from dataclasses import dataclass

from smlibpy import Align, Box, Cylinder, GridLocations, Z

STANDING = (Align.CENTER, Align.CENTER, Align.MIN)


@dataclass(frozen=True)
class Params:
    width: float = 80.0
    depth: float = 60.0
    thickness: float = 10.0
    corner_radius: float = 8.0
    hole_radius: float = 4.0


def main(p: Params):
    plate = Box(p.width, p.depth, p.thickness, align=STANDING)
    plate = plate.fillet(plate.edges().parallel_to(Z), p.corner_radius)
    holes = GridLocations(p.width - 20, p.depth - 20, 2, 2) * Cylinder(p.hole_radius, p.thickness, align=STANDING)
    return (plate - holes).named("Plate")
```

Check invalid dimensions, a revolve axis through the profile, coincident boolean faces and over-sized fillets first. `api-*` files cover the bundled `smlibpy` package. Grep them before assuming an API is unavailable.

## Wrong / Correct

- Wrong: `with BuildPart() as part:` or `from build123d import ...` in a smlibpy model. Correct: algebra expressions on `smlibpy` objects; Build123d is a different kernel.
- Wrong: `Rectangle(40, 20, 2)` for a fillet. Correct: `Rectangle(40, 20, fillet=2)`; options are keyword-only.
- Wrong: `part.edges().filter_by(Axis.Z)` when you mean edges along Z. Correct: `part.edges().parallel_to(Z)`; `group_by(Z)[-1]` is the highest group.
- Wrong: `Rectangle(10, 30).revolve()` (the default local Y axis crosses the centered region). Correct: `(Plane.XZ * Polygon((10, 0), (20, 0), (20, 30), (10, 30))).revolve(Z)`.
- Wrong: `export_step(part, "out.step")` or `show(part)` inside `main`. Correct: return the shapes; Tau exports them.

## Known gaps

smlibpy in Tau has no STEP interfaces or PMI annotations, STEP export keeps shape names and the legacy `color` but not physical materials, textured and anisotropic materials use box-projected UVs because the kernel exposes no surface parameterization for meshes, curves draw as lines in the model view (there is no Drawing view), and there is no tessellation instancing: every repeated copy is meshed again. `render`, `show`, USD and file import/export helpers do not apply inside a Tau model.
