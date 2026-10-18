---
name: cad-smlibpy
description: Guides SMLib NURBS BRep modeling in main.py with smlibpy, Tau materials, textures and kinematics. Use for Python models that import smlibpy.
---

# SMLibPy authoring

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

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### align

```python
# How a new shape sits relative to the origin along an axis
class Align(Enum)
  # … 3 more members in the API reference: MIN, CENTER, MAX
```

### parts

```python
# A box of ``length`` (X) by ``width`` (Y) by ``height`` (Z)
Box(length: float, width: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# A cylinder along Z
Cylinder(radius: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# A sphere
Sphere(radius: float, *, align: AlignLike = Align.CENTER) -> Part

# A drilling tool
Hole(radius: float, depth: float) -> Part

# A drilling tool with a counterbore at the top
CounterBoreHole(radius: float, counter_bore_radius: float, counter_bore_depth: float, depth: float) -> Part
```

### sketches

```python
# A ``width`` (X) by ``height`` (Y) rectangle
Rectangle(width: float, height: float, *, fillet: float = 0.0, chamfer: float = 0.0, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# A disk of ``radius``
Circle(radius: float, *, align: AlignLike = Align.CENTER) -> Sketch

# The polygon through the points (closed automatically)
Polygon(*points: VectorLike, fillet: float = 0.0, chamfer: float = 0.0, align: AlignLike = None) -> Sketch
```

### geometry

```python
# A translation
Pos(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> Location

# A rotation in degrees about the world X, then Y, then Z axis
Rot(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Location

# A coordinate system
class Plane
  # This plane moved ``distance`` along its normal
  offset(distance: float) -> Plane
  # … 19 more members in the API reference: __init__, origin, x_dir, y_dir, z_dir, normal, location, shifted, flipped, rotated, moved, at, to_local, from_local, contains, distance_to, project, is_coplanar, __mul__

# An immutable 3D vector or point
class Vector
  length: float
  # … 24 more members in the API reference: __init__, x, y, z, to_tuple, __getitem__, __add__, __radd__, __sub__, __mul__, __rmul__, __truediv__, __neg__, dot, cross, normalized, distance_to, angle_to, is_close, is_parallel, is_perpendicular, rotate, project_to, any_perpendicular

# An axis-aligned bounding box
class BoundBox
  BoundBox(min: VectorLike, max: VectorLike)
  of_points(points: Iterable[VectorLike]) -> BoundBox
  size: Vector
  center: Vector
  diagonal: float
  union(other: BoundBox) -> BoundBox
  contains(point: VectorLike, tol: float = TOLERANCE) -> bool
```

### locations

```python
# A rectangular grid in the XY plane, centered on the origin unless ``centered=False``
GridLocations(x_spacing: float, y_spacing: float, x_count: int, y_count: int, *, centered: bool = True) -> Locations

# ``count`` locations on a circle of ``radius`` in the XY plane
PolarLocations(radius: float, count: int, *, start_angle: float = 0.0, angular_range: float = 360.0, rotate: bool = True) -> Locations
```

### shapes

```python
# A solid
class Part(_Body)
  # Round edges
  fillet(edges: Any, radius: float | tuple[float, float] | Sequence[float], *, continuity: int | str | None = None, fullness: float = 1.0) -> Part
  # Bevel edges
  chamfer(edges: Any, length: float) -> Part
  # Hollow the part out to walls of ``thickness``, removing the ``openings`` faces
  shell(thickness: float, openings: Any = None, *, outward: bool = False) -> Part
  # … 32 more members in the API reference: volume, area, center, mass_properties, is_valid, solids, merge, cells, fuse, cut, intersect, __add__, __radd__, __sub__, __and__, offset, split, section, twist, taper, bend, deform, remove_fillets, remove_faces, draft_analysis, parting_line, draft, fold, flange, bends, unfold, flat_pattern

# A planar region (with holes, possibly several pieces) on a plane
class Sketch(Shell)
  # Round corners of the region with tangent arcs of ``radius``
  fillet(radius: float, vertices: Iterable[VectorLike | Vertex] | None = None) -> Sketch
  # Extrude the region into a solid
  extrude(amount: float, *, both: bool = False, taper: float = 0.0, direction: Axis | VectorLike | None = None) -> Part
  # Revolve the region about an axis in its plane
  revolve(axis: Axis | None = None, angle: float = 360.0) -> Part
  # Sweep the region along a path
  sweep(path: Edge | Wire, *, sharp_corners: bool | None = None) -> Part
  # … 11 more members in the API reference: plane, __add__, __radd__, __sub__, __and__, __xor__, center, perimeter, offset, chamfer, mirror

# A list of shapes with selection helpers
class ShapeList(list)
  # Sort by position along an axis, by ``"length"``/``"area"``/``"volume"``/``"radius"``,
  sort_by(key: SortKey = Z, reverse: bool = False) -> ShapeList[T]
  # ``parallel_to(axis)``, ``of_type(name)`` or ``filter(predicate)``, depending on the
  filter_by(criterion: Axis | str | Callable[[T], bool]) -> ShapeList[T]
  # Group shapes with equal key (within ``tol``), groups in ascending key order
  group_by(key: SortKey = Z, tol: float = 0.0001) -> list[ShapeList[T]]
  # Highest shapes (largest Z)
  top() -> ShapeList[T]
  # Straight edges along ``axis``, or planar faces whose normal is along ``axis``
  parallel_to(axis: Axis | VectorLike) -> ShapeList[T]
  edges() -> ShapeList[Edge]
  faces() -> ShapeList[Face]
  # … 47 more members in the API reference: one, first, last, __gt__, __lt__, __rshift__, __lshift__, sort_by_distance, max_by, min_by, bottom, right, left, back, front, largest, smallest, nearest, filter, of_type, lines, circles, planar, cylinders, perpendicular_to, facing, convex, concave, smooth, fillets, hit_by, within, at, __add__, __or__, __sub__, __and__, __getitem__, vertices, wires, center, and 6 more

Z: Axis.Z

# Base class of all shapes
class Shape
  # All edges of this shape
  edges() -> ShapeList[Edge]
  # All faces of this shape
  faces() -> ShapeList[Face]
  # A copy moved by ``(x, y, z)``
  translate(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> S
  # A copy rotated by ``angle`` degrees about ``axis``
  rotate(axis: Axis = Z, angle: float = 0.0) -> S
  # A mirrored copy (reflection in ``plane``, a plane or a planar face
  mirror(plane: Plane | Face = Plane.XZ) -> S
  # … 11 more members in the API reference: vertices, wires, moved, scale, on, __rmul__, bbox, center, mesh, show, export

# A bounded curve
class Edge(Shape)
  length: float
  # All edges of this shape
  edges() -> ShapeList[Edge]
  # All faces of this shape
  faces() -> ShapeList[Face]
  # … 23 more members in the API reference: __init__, geom_type, start, end, is_closed, is_seam, convexity, is_convex, direction, radius, arc_center, normal, point_at, tangent_at, center, bbox, distance_to, intersections, vertices, reversed, nurbs, remove_knots, __add__

# A chain of edges, open or closed
class Wire(Shape)
  # All edges of this shape
  edges() -> ShapeList[Edge]
  length: float
  # … 17 more members in the API reference: __init__, vertices, wires, is_closed, start, end, center, bbox, point_at, tangent_at, distance_to, close, reversed, __add__, plane, fillet, to_sketch

# A shape backed by one kernel Brep
class _Body(Shape)
  # All faces of this shape
  faces() -> ShapeList[Face]
  # All edges
  edges(seams: bool = False) -> ShapeList[Edge]
  # … 16 more members in the API reference: __init__, named, colored, vertices, wires, bbox, distance_to, closest_point, raycast, intersection_curves, silhouette, project, outline, to_nurbs, heal, info

# A bounded piece of a surface, belonging to a body (a part, shell or…
class Face(Shape)
  # The face's edges (seam edges only with ``seams=True``)
  edges(seams: bool = False) -> ShapeList[Edge]
  # All faces of this shape
  faces() -> ShapeList[Face]
  # … 22 more members in the API reference: __init__, owner, geom_type, area, center, interior_point, normal_at, is_planar, plane, radius, axis, bbox, distance_to, raycast, outer_wire, inner_wires, wires, vertices, neighbors, to_sketch, to_shell, extrude

# A point
class Vertex(Shape)
  Vertex(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0)
  point: Vector
  x: float
  y: float
  z: float
  # Center of mass (centroid) of the shape
  center() -> Vector
  # Tight axis-aligned bounding box
  bbox() -> BoundBox
  # All vertices of this shape
  vertices() -> ShapeList[Vertex]
  # All edges of this shape
  edges() -> ShapeList[Edge]
  # All faces of this shape
  faces() -> ShapeList[Face]
  distance_to(other: VectorLike | Shape) -> float
  # For a corner of a sketch
  convexity: str
```

### operations

```python
# A solid through a sequence of cross sections, or a surface through open curves
loft(sections: Sequence[Sketch | Face | Wire | Edge], *, ruled: bool = False, smooth: bool = True) -> Part | Shell

# Sweep a profile along a path
sweep(profile: Sketch | Face | Wire, path: Edge | Wire, *, orient: bool = True, translational: bool = False, sharp_corners: bool | None = None) -> Part
```

### curves

```python
# Straight segments through the points
Polyline(*points: VectorLike, close: bool = False) -> Wire

# A smooth cubic curve through the points
Spline(*points: VectorLike, tangents: tuple[VectorLike | None, VectorLike | None] | None = None, closed: bool = False) -> Edge
```

### text

```python
# Lettering as a sketch in the XY plane, with the exact outlines of the…
Text(text: str, size: float, *, font: str | os.PathLike[str] | None = None, align: AlignLike = Align.CENTER, spacing: float = 0.0, line_spacing: float = 1.6, kerning: bool = True, path: Edge | Wire | None = None) -> Sketch
```

### sheetmetal

```python
# The unfolded part, laid on the XY plane
class FlatPattern
  # The bend lines (middle of each bend's strip), at z = 0
  bend_lines: ShapeList[Edge]
  # Size of the blank
  size: Vector
  FlatPattern(part: Part, outline: Sketch, bends: list[Bend], thickness: float, k_factor: float) -> NoneType
```

## API reference

To read any other signature, find its name in `api-index.md`, which lists all 479 symbols by file with the lines that hold each, and read that range of the named file.

- 23 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
