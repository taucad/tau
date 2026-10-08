---
name: cad-build123d
description: Guides native Build123d BRep authoring in main.py. Use when creating or editing trusted Python CAD projects in Tau Desktop.
---

# Build123d authoring

## Contract

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have scalar or `Literal` annotations and defaults.
2. Define `main(params: Params)` returning one `build123d.Shape` or a finite non-empty list or tuple of shapes.
3. Set each root shape's `label` and `color`; labels must be unique. Tau preserves them in the viewer topology and STEP export.
4. Use static project-relative Python imports. Declare non-Python assets in `__tau__ = {"dependencies": [...]}`.
5. Keep render tessellation out of `Params`; Tau owns display tolerance.

## Canonical pattern

```python
from dataclasses import dataclass
from typing import Literal
from build123d import Box, Color, Shape

@dataclass(frozen=True)
class Params:
    width: float = 80.0
    depth: float = 40.0
    height: float = 12.0
    finish: Literal["blue", "orange"] = "blue"

__tau__ = {
    "parameters": {
        "width": {"minimum": 1.0, "description": "Body width in millimeters"}
    }
}

def main(params: Params) -> Shape:
    body = Box(params.width, params.depth, params.height)
    body.label = "Body"
    body.color = Color(params.finish)
    return body
```

Prefer Build123d features, sketches, joints, and assemblies over primitive-buttings. Diagnose invalid shapes, duplicate labels, coincident booleans, and zero dimensions first.

Both build123d styles work: builder mode (`with BuildPart() as part:` … `part.part`, objects combine by `mode=Mode.ADD`/`Mode.SUBTRACT`) and algebra mode (`Pos(x, y, z) * Box(…) - Cylinder(…)`). Pick one per model.

## Wrong / Correct

- Wrong: `Cylinder(radius=4, height=10, base=(0, 0, 5))`. Correct: primitives take no position: `Pos(0, 0, 5) * Cylinder(4, 10)`, or place them with `Locations` in builder mode.
- Wrong: assuming an OCP/OCCT call. Correct: use build123d objects and operations; the reference lists build123d's public API only.

## Verify

Test the model with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.py' })`, then `expectGeo(model)`.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### build_part

```python
# BuildPart
class BuildPart(Builder)
  BuildPart(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  # Get the current part
  part: Part | None
  # Return a wire representation of the pending edges
  pending_edges_as_wire: Wire
  # Builder's location
  location: Location | None

# Combination Mode
class Mode(Enum)
  ADD
  SUBTRACT
  INTERSECT
  REPLACE
  PRIVATE
```

### build_sketch

```python
# BuildSketch
class BuildSketch(Builder)
  BuildSketch(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  # Get the builder's object
  sketch_local: Sketch | None
  # solids() not implemented
  solids(*args)
  # solid() not implemented
  solid(*args)
  # Unify pending edges into one or more Wires
  consolidate_edges() -> Wire | list[Wire]
  # … 1 more members in the API reference
```

### objects_part

```python
# Part Object
class Box(BasePartObject)
  Box(length: float, width: float, height: float, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)

RotationLike: build123d.geometry.Rotation | tuple[float, float, float]

# Align object about Axis
class Align(Enum)
  MIN
  CENTER
  MAX
  NONE

# Part Object
class Cylinder(BasePartObject)
  Cylinder(radius: float, height: float, arc_size: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)

# Part Operation
class Hole(BasePartObject)
  Hole(radius: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)

# Part Operation
class CounterBoreHole(BasePartObject)
  CounterBoreHole(radius: float, counter_bore_radius: float, counter_bore_depth: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)

# Part Object
class Sphere(BasePartObject)
  Sphere(radius: float, arc_size1: float = -90, arc_size2: float = 90, arc_size3: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)

# Part Object
class Torus(BasePartObject)
  Torus(major_radius: float, minor_radius: float, minor_start_angle: float = 0, minor_end_angle: float = 360, major_angle: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
```

### objects_sketch

```python
# Sketch Object
class Rectangle(BaseSketchObject)
  Rectangle(width: float, height: float, rotation: float = 0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)

# Sketch Object
class Circle(BaseSketchObject)
  Circle(radius: float, arc_size: float = 360.0, align: Align | tuple[Align, Align] | None = (Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
```

### geometry

```python
# A position only sub-class of Location
class Pos(Location)
  Pos(v: VectorLike)
  Pos(v: Iterable)
  Pos(X: float = 0, Y: float = 0, Z: float = 0)

VectorLike: build123d.geometry.Vector | tuple[float, float] | tuple[float, float, float] | collections.abc.Sequence[float]

# Axis
class Axis
  # X Axis
  X: Axis
  # Y Axis
  Y: Axis
  # Z Axis
  Z: Axis
  Axis(gp_ax1: gp_Ax1) -> None
  Axis(location: Location) -> None
  Axis(origin: VectorLike, direction: VectorLike) -> None
  Axis(origin: VectorLike, *, end_point: VectorLike) -> None
  Axis(edge: Edge) -> None
  # Return self as Location
  location: Location
  # … 15 more members in the API reference

# Color object based on OCCT Quantity_ColorRGBA
class Color
  Color(color_like: ColorLike)
  Color(name: str, alpha: float = 1.0)
  Color(red: float, green: float, blue: float, alpha: float = 1.0)
  Color(color_code: int, alpha: int = 255)
  # Generate a palette of evenly spaced colors
  categorical_set(color_count: int, starting_hue: ColorLike | float = 0.0, alpha: float | Iterable[float] = 1.0) -> list[Color]

# Plane
class Plane
  # XY Plane
  XY: Plane
  # Create a plane from either an OCCT gp_pln, Face, Location, or coordinates
  Plane(gp_pln: gp_Pln) -> None
  Plane(points: Iterable[VectorLike]) -> None
  Plane(origin: VectorLike, x_dir: VectorLike | None = None, z_dir: VectorLike = (0, 0, 1)) -> None
  Plane(origin: VectorLike, x_dir: VectorLike, *, y_dir: VectorLike) -> None
  Plane(face: Face, x_dir: VectorLike | None = None) -> None
  Plane(location: Location) -> None
  Plane(axis: Axis, x_dir: VectorLike | None = None) -> None
  # Move the Plane by amount in the direction of z_dir
  offset(amount: float) -> Plane
  # Change the position & orientation of self by applying a relative location
  move(loc: Location | Plane) -> Plane
  # Return Location representing the origin and z direction
  location: Location
  # … 35 more members in the API reference

# Create a 3-dimensional vector
class Vector
  Vector(X: float, Y: float, Z: float)
  Vector(X: float, Y: float)
  Vector(v: Vector)
  Vector(v: Sequence[float])
  Vector(v: gp_Vec | gp_Pnt | gp_Dir | gp_XYZ)
  Vector()
  # Get x value
  X: float
  # Get z value
  Z: float
  # Vector length
  length: float
  # center
  center() -> Vector
  # Rotate about axis
  rotate(axis: Axis, angle: float) -> Vector
  # … 28 more members in the API reference

# Location in 3D space
class Location
  Location() -> None
  Location(location: Location) -> None
  Location(position: VectorLike, angle: float = 0) -> None
  Location(position: VectorLike, orientation: RotationLike | None = None) -> None
  Location(position: VectorLike, orientation: RotationLike, ordering: Extrinsic | Intrinsic) -> None
  Location(plane: Plane) -> None
  Location(plane: Plane, plane_offset: VectorLike) -> None
  Location(top_loc: TopLoc_Location) -> None
  Location(gp_trsf: gp_Trsf) -> None
  Location(position: VectorLike, direction: VectorLike, angle: float) -> None
  # Return center of the location - useful for sorting
  center() -> Vector
  # … 15 more members in the API reference

# Order to apply extrinsic rotations by axis
class Extrinsic(Enum)
  XYZ
  XZY
  YZX
  YXZ
  ZXY
  ZYX
  XYX
  XZX
  YZY
  YXY
  ZXZ
  ZYZ

# Order to apply intrinsic rotations by axis
class Intrinsic(Enum)
  XYZ
  XZY
  YZX
  YXZ
  ZXY
  ZYX
  XYX
  XZX
  YZY
  YXY
  ZXZ
  ZYZ
```

### build_common

```python
# Location Context
class Locations(LocationList)
  Locations(*pts: VectorLike | Vertex | Location | Face | Plane | Axis | Iterable[VectorLike | Vertex | Location | Face | Plane | Axis])

# Return Edges
edges(select: Select = Select.ALL) -> ShapeList[Edge]
```

### operations_part

```python
# Part Operation
extrude(to_extrude: Face | Sketch | None = None, amount: float | None = None, dir: VectorLike | None = None, until: Until | None = None, target: Compound | Solid | None = None, both: bool = False, taper: float = 0.0, clean: bool = True, mode: Mode = Mode.ADD) -> Part

# Extrude limit
class Until(Enum)
  NEXT
  LAST
  PREVIOUS
  FIRST
```

### operations_generic

```python
# Generic Operation
fillet(objects: ChamferFilletType | Iterable[ChamferFilletType], radius: float) -> Sketch | Part | Curve

# Generic Operation
chamfer(objects: ChamferFilletType | Iterable[ChamferFilletType], length: float, length2: float | None = None, angle: float | None = None, reference: Edge | Face | None = None) -> Sketch | Part
```

### shape_core

```python
# Shape
class Shape(NodeMixin, Generic)
  Shape(obj: TopoDS_Shape | None = None, label: str = '', color: ColorLike | None = None, parent: Compound | None = None)
  # Get the shape's color
  color: None | Color
  # Get this Shape's Location
  location: Location
  # extrude
  extrude(obj: Shape, direction: VectorLike) -> Edge | Face | Shell | Solid | Compound
  # Create a bounding box for this Shape
  bounding_box(tolerance: float | None = None, optimal: bool = True) -> BoundBox
  # Remove the positional arguments from this Shape
  cut(*to_cut: Shape) -> Self | Compound
  # edges - all the edges in this Shape - subclasses may override
  edges() -> ShapeList[Edge]
  # fuse
  fuse(*to_fuse: Shape, glue: bool = False, tol: float | None = None) -> Self | Compound
  # located
  located(loc: Location) -> Self
  # Apply a location in relative sense (i.e
  move(loc: Location) -> Self
  # rotate a copy
  rotate(axis: Axis, angle: float, transform: bool = False) -> Self
  # Scale this shape about a point
  scale(factor: float | tuple[float, float, float], about: VectorLike | None = None) -> Self
  # Return the Shell
  shell() -> Shell
  # Apply affine transform
  transform_geometry(t_matrix: Matrix) -> Self
  # Apply affine transform without changing type
  transform_shape(t_matrix: Matrix) -> Self
  # Translates this shape through a transformation
  translate(vector: VectorLike, transform: bool = False) -> Self
  # Return the Wire
  wire() -> Wire
  # … 65 more members in the API reference

# Subclass of list with custom filter and sort methods appropriate to CAD
class ShapeList(list)
  # The average of the center of objects within the ShapeList
  center() -> Vector
  # edges - all the edges in this ShapeList
  edges() -> ShapeList[Edge]
  # filter by
  filter_by(filter_by: Callable[[T], bool] | Axis | Plane | GeomType | property, reverse: bool = False, tolerance: float = 1e-05) -> ShapeList[T]
  # Return the Shell
  shell() -> Shell
  # solids - all the solids in this ShapeList
  solids() -> ShapeList[Solid]
  # vertices - all the vertices in this ShapeList
  vertices() -> ShapeList[Vertex]
  # … 27 more members in the API reference
```

### three_d

```python
# A Solid in build123d represents a three-dimensional solid geometry
class Solid(Mixin3D)
  # Build a solid from an OCCT TopoDS_Shape/TopoDS_Solid
  Solid(obj: TopoDS_Solid | Shell | None = None, label: str = '', color: Color | None = None, material: str = '', joints: dict[str, Joint] | None = None, parent: Compound | None = None)
  # extrude
  extrude(obj: Face, direction: VectorLike) -> Solid
  # make box
  make_box(length: float, width: float, height: float, plane: Plane = Plane.XY) -> Solid
  # make cylinder
  make_cylinder(radius: float, height: float, plane: Plane = Plane.XY, angle: float = 360) -> Solid
  # make loft
  make_loft(objs: Iterable[Vertex | Wire], ruled: bool = False) -> Solid
  # Revolve
  revolve(section: Face | Wire, angle: float, axis: Axis, inner_wires: list[Wire] | None = None) -> Solid
  # Sweep
  sweep(section: Face | Wire, path: Wire | Edge, inner_wires: list[Wire] | None = None, make_solid: bool = True, is_frenet: bool = False, mode: Vector | Wire | Edge | None = None, transition: Transition = Transition.TRANSFORMED) -> Solid
  # … 13 more members in the API reference

# Sweep discontinuity handling option
class Transition(Enum)
  RIGHT
  ROUND
  TRANSFORMED
```

### two_d

```python
# A Face in build123d represents a 3D bounded surface within the topological data
class Face(Mixin2D)
  Face(obj: TopoDS_Face | Plane, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Face(outer_wire: Wire, inner_wires: Iterable[Wire] | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
  # length of planar face
  length: None | float
  # width of planar face
  width: None | float
  # extrude
  extrude(obj: Edge, direction: VectorLike) -> Face
  # Create Non-Planar Face
  make_surface(exterior: Wire | Iterable[Edge], surface_points: Iterable[VectorLike] | None = None, interior_wires: Iterable[Wire] | None = None) -> Face
  # sweep
  revolve(profile: Edge, angle: float, axis: Axis) -> Face
  # sweep
  sweep(profile: Curve | Edge | Wire, path: Curve | Edge | Wire, transition = Transition.TRANSFORMED) -> Face
  # Center of Face
  center(center_of: CenterOf = CenterOf.GEOMETRY) -> Vector
  # Apply 2D fillet to a face
  fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Face
  # Return the outerwire, generate a warning if inner_wires present
  wire() -> Wire
  # … 37 more members in the API reference

# Center Options
class CenterOf(Enum)
  GEOMETRY
  MASS
  BOUNDING_BOX
```

### one_d

```python
# An Edge in build123d is a fundamental element in the topological data structure
class Edge(Mixin1D)
  # Build an Edge from an OCCT TopoDS_Shape/TopoDS_Edge
  Edge(obj: TopoDS_Edge | Axis | None | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
  # extrude
  extrude(obj: Vertex, direction: VectorLike) -> Edge
  # make_bezier
  make_bezier(*cntl_pnts: VectorLike, weights: list[float] | None = None) -> Edge
  # make circle
  make_circle(radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
  # make ellipse
  make_ellipse(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
  # Create a line between two points
  make_line(point1: VectorLike, point2: VectorLike) -> Edge
  # Spline
  make_spline(points: list[VectorLike], tangents: list[VectorLike] | None = None, periodic: bool = False, parameters: list[float] | None = None, scale: bool = True, tol: float = 1e-06) -> Edge
  # Three Point Arc
  make_three_point_arc(point1: VectorLike, point2: VectorLike, point3: VectorLike) -> Edge
  # … 27 more members in the API reference

# Angular rotation direction
class AngularDirection(Enum)
  CLOCKWISE
  COUNTER_CLOCKWISE

# A Wire in build123d is a topological entity representing a connected sequence
class Wire(Mixin1D)
  Wire(obj: TopoDS_Wire, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(edge: Edge, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(wire: Wire, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(wire: Curve, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(edges: Iterable[Edge], sequenced: bool = False, label: str = '', color: Color | None = None, parent: Compound | None = None)
  # extrude - invalid operation for Wire
  extrude(obj: Shape, direction: VectorLike) -> Wire
  # make_circle
  make_circle(radius: float, plane: Plane = Plane.XY) -> Wire
  # make ellipse
  make_ellipse(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE, closed: bool = True) -> Wire
  # make_polygon
  make_polygon(vertices: Iterable[VectorLike], close: bool = True) -> Wire
  # edges - all the edges in this Shape
  edges() -> ShapeList[Edge]
  # fillet_2d
  fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Wire
  # … 16 more members in the API reference
```

### composite

```python
# A Compound in build123d is a topological entity representing a collection of
class Compound(Mixin3D)
  # Build a Compound from Shapes
  Compound(obj: TopoDS_Compound | Iterable[Shape] | None = None, label: str = '', color: Color | None = None, material: str = '', joints: dict[str, Joint] | None = None, parent: Compound | None = None, children: Sequence[Shape] | None = None)
  # extrude
  extrude(obj: Shell, direction: VectorLike) -> Compound
  # Return center of object
  center(center_of: CenterOf = CenterOf.MASS) -> Vector
  # … 14 more members in the API reference
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 1046 symbols by file.

- 30 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
