---
name: cad-build123d
description: Guides native Build123d BRep authoring in main.py. Use for trusted Python CAD projects in Tau Desktop, or in the Tau plugin after prepare_kernel.
---

# Build123d authoring

## Contract

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have scalar or `Literal` annotations and defaults. Use bundled Build123D 0.13 native geometry and joints.
2. Define synchronous `main(params: Params)` returning a native `Shape`/`Compound`, list/tuple of shapes, or `None`/an empty sequence.
3. Author reusable models with native `Compound`, ordinary functions or domain classes. Models run with Build123D outside Tau. Do not import or recreate a Tau Assembly/Motion framework.
4. Use static project-relative Python imports. Declare non-Python assets in `__tau__ = {"dependencies": [...]}` using paths from the project root. Imported modules may declare resources; texture-only edits must invalidate the model.
5. Labels are display text; repeated instances need distinct native objects. Tau owns tessellation and exact BRep edges; UVs are native face-local charts, not a whole-part atlas.

## Tessellation

Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the shape's bounding-box diagonal D: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint yet, so keep it out of model parameters. Results report the effective `tessellation` (requested form, tolerances, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances.

## Reusable native mechanisms

```python
# Author call site: ordinary domain class using only native Build123D.
from dataclasses import dataclass
from build123d import Axis, Box, Compound, Location, RevoluteJoint, RigidJoint


@dataclass(frozen=True)
class Params:
    angle: float = 30


class Gearbox(Compound):
    def __init__(self, *, angle: float = 30):
        plate = Box(60, 40, 6)
        cover = Box(60, 40, 1).locate(Location((0, 0, 3.5)))
        # A native rigid compound owns passive geometry; the rotor is a separate body.
        housing = Compound(children=[plate, cover], label="Housing")
        driver = Box(20, 8, 4)
        follower = Box(16, 8, 4)
        RevoluteJoint("input", housing, axis=Axis.Z, angular_range=(-2000, 2000))
        RevoluteJoint("output", housing, axis=Axis((30, 0, 0), (0, 0, 1)),
                      angular_range=(-4000, 4000))
        RigidJoint("shaft", driver)
        RigidJoint("shaft", follower)
        RigidJoint("mount", housing)
        RigidJoint("tool", follower, Location((8, 0, 0)))
        housing.joints["input"].connect_to(driver.joints["shaft"], angle=angle)
        housing.joints["output"].connect_to(follower.joints["shaft"], angle=-2 * angle + 15)
        super().__init__(children=[housing, driver, follower], label="Gearbox")
        self.housing, self.driver, self.follower = housing, driver, follower
        self.input_angle = angle
        # Ordinary application data; no framework discovers this attribute implicitly.
        self.couplings = [{"driver": (housing.joints["input"], "angle"),
                           "follower": (housing.joints["output"], "angle"),
                           "ratio": -2, "offset": 15}]

    @property
    def mount(self):
        return self.housing.joints["mount"]

    @property
    def output(self):
        return self.follower.joints["tool"]


def main(params: Params):
    return Gearbox(angle=params.angle)


def motion(model):
    drive = (model.housing.joints["input"], "angle")
    return {"ground": model.housing, "couplings": model.couplings,
            "animations": [{"id": "turn", "duration": 4, "keyframes": [
                {"time": 0, "coordinates": {drive: model.input_angle}},
                {"time": 4, "coordinates": {drive: model.input_angle + 360}},
            ]}]}

```

## Mounting a reusable native compound

Place each fresh module before constructing its final parent compound. `relative_to` computes the native desired placement but records no connection. For an unparented gearbox with the safe `mount` property above:

```python
def mount_gearbox(module, source):
    target = module.mount
    target_in_module = module.global_location.inverse() * target.parent.global_location
    desired = source.parent.global_location * source.relative_to(target) * target_in_module.inverse()
    module.locate(desired)
    return (source, target)

left, right = Gearbox(angle=30), Gearbox(angle=-10)
# carrier has native RigidJoint("left", ...) and RigidJoint("right", ...).
mounts = [mount_gearbox(left, carrier.joints["left"]),
          mount_gearbox(right, carrier.joints["right"])]
model = Compound(children=[carrier, left, right])
# The root hook's connections list includes mounts AND every internal native pair.
# Compose ratios with [*left.couplings, *right.couplings], without rewriting them.
```

This is local domain code, not a required helper import. For an already-parented module, convert `desired` to parent coordinates with `module.parent.global_location.inverse() * desired` before `locate`. Existing ancestor aggregate BReps must then be rebuilt bottom-up while preserving each ancestor location; prefer finishing placement before parent aggregation. Calling `source.connect_to(module.mount)` alone moves only the target joint's parent and can split an articulated module.

Native `connect_to` is one-time placement, not a solver. Use `RigidJoint`, `RevoluteJoint`, `LinearJoint`, `CylindricalJoint` and `BallJoint` directly; native pair placement keywords are `angle`, `position` and `angles`. Connect final children before constructing their containing compound.

`Gearbox` above is ordinary project code, not a required base class or metadata protocol. Properties return actual descendant joints. Never assign a descendant joint into another `.joints` dictionary: assignment may transfer ownership. Keep each module's ratios in its local data. Root concatenates child data; it does not repeat their equations. Fresh factory instances are the default independent reuse recipe. For copies, rebind metadata to copied descendants and verify independence.

Group static/passive geometry under a native connected `Compound`, as the housing/cover above. Product containment alone does not choose a rigid body. A nested housing is not world-grounded; root `motion(model)["ground"]` chooses the fixed body. Native unambiguous retained connections are discovered from the returned geometry.

`motion(model)` returns plain data: `ground`, `couplings`, `animations`, and only when necessary explicit `connections` or `occurrence_ids`. Coordinate selectors are `(native_joint, "angle" | "distance" | "x" | "y" | "z")`; use `((source_joint, target_joint), coordinate)` when one joint participates in multiple edges. Ball x/y/z are its final composed intrinsic XYZ angles. Values are absolute native degrees/millimetres; the adapter lowers them once into canonical metre/degree deltas. A 30° → 390° authored clip becomes 0° → 360° wire deltas.

Native latest-target pointers can lose earlier edges. When needed, retain the actual pairs as ordinary local data and compose them into `connections`: `(source, target)` if final native state suffices, or `{"source": source, "target": target, "angle": 30}` (native `position`/`angles` for other pairs) when reference values cannot be recovered. When `connections` is supplied it is the complete connection list, including internal native pairs; it does not add to inferred pairs. Explicit data describes final geometry; it does not move it. The adapter checks reference placement using native `relative_to`; do not guess missing edge values. `occurrence_ids` maps stable strings to actual returned native shapes when structural paths are insufficient; labels are not identity.

Couplings declare `follower = ratio * driver + offset`. Initial native placement must satisfy that equation; retain the domain's authored input values for clips. Mixed-dimensional ratios carry native unit quotients. Unknown/stale endpoints, ambiguous coordinates, nonfinite values, invalid phases and competing/cyclic drivers are rejected. Valid unsupported physical graphs retain intent and diagnostics; they are not promised general closed-loop playback.

## Native materials

`Shape.material` uses native `bd_materials` finished materials. Built-in textured materials carry their packaged images. Use `Shape.color` for a simple color without a material. Engineering physical-property publication is separate from appearance.

For a custom image, use native `threejs_materials.PbrProperties`, `PbrValues`, `PbrMaps(color="finish.png")` with `maps_dir=Path(__file__).parent`, then `bd_materials.FinishedMaterial(metals.aluminum().material, pbr=pbr)`. Add `finish.png` to `__tau__.dependencies` (project-relative, even when the Python module lives in a subdirectory). Native image data URIs are also supported. Exported GLB embeds its images; remote URLs and paths outside the project are rejected.

## Native modeling

Prefer Build123d features and sketches. Builder mode (`with BuildPart() as part:` … `part.part`) and algebra mode (`Pos(x, y, z) * Box(...) - Cylinder(...)`) both work. Use native `Select.NEW` and `Select.LAST` for operation history; Tau recomputes operations whose native semantics cannot survive BRep cache restoration.

Wrong: `Cylinder(radius=4, height=10, base=(0, 0, 5))`. Correct: `Pos(0, 0, 5) * Cylinder(4, 10)`, or `Locations` in builder mode. Read the native API reference before assuming an OCP call or a method from another kernel.

## Verify

Test the model with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.py' })`, then `expectGeo(model)`. Inspect assembly hierarchy, exact edges, materials and joint playback in Tau. For sharing, export the Tau GLB so topology, interfaces, mechanism intent and embedded textures travel together. Current native STEP export carries geometry, hierarchy and supported native appearance; do not claim it embeds editable source or mechanism data.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### build_part

```python
# BuildPart
class BuildPart(Builder)
  BuildPart(*placements: Face | Plane | Location, mode: Mode = Mode.ADD)
  # Get the placed part
  part: Part | None
  # Get the part in the Builder's local construction coordinates
  part_local: Part | None
  # Return a wire representation of the pending edges
  pending_edges_as_wire: Wire
  # Builder's location
  location: Location

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
  BuildSketch(*placements: Face | Plane | Location, mode: Mode = Mode.ADD)
  # Get the builder's object
  sketch_local: Sketch | None
  # solids() not implemented
  solids(*args)
  # solid() not implemented
  solid(*args)
  # Unify pending edges into one or more Wires
  consolidate_edges() -> Wire | list[Wire]
  # … 1 more members in the API reference: sketch
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
class Hole(_BaseHole)
  Hole(radius: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)

# Part Operation
class CounterBoreHole(_BaseHole)
  CounterBoreHole(radius: float, counter_bore_radius: float, counter_bore_depth: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)
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
  # … 14 more members in the API reference: wrapped, position, direction, located, is_coaxial, is_normal, is_opposite, is_parallel, is_skew, angle_between, reverse, __neg__, __and__, intersect
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
  edges(select: Select = Select.ALL) -> ShapeList[Edge]
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
  # … 71 more members in the API reference: topo_parent, topo_owner, wrapped, area, material, convexity, geom_type, is_manifold, is_null, is_valid, global_location, matrix_of_inertia, orientation, position, principal_properties, shape_type, static_moments, register_shape_constructor, register_geometry_constructor, as_shape, cast, combined_center, get_shape_list, get_single_shape, and 47 more

# How much of a shape a selector returns
class Select(Enum)
  ALL
  LAST
  NEW
```

### three_d

```python
# A Solid in build123d represents a three-dimensional solid geometry
class Solid(Mixin3D)
  # Build a solid from an OCCT TopoDS_Shape/TopoDS_Solid
  Solid(obj: TopoDS_Solid | Shell | None = None, label: str = '', color: Color | None = None, material: FinishedMaterial | None = None, joints: dict[str, Joint] | None = None, parent: Compound | None = None)
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
  # … 14 more members in the API reference: volume, mass, touch, extrude_linear_with_rotation, extrude_taper, extrude_until, from_bounding_box, make_cone, make_sphere, make_torus, make_wedge, sweep_multi, thicken, draft

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
  # … 37 more members in the API reference: area_without_holes, axis_of_rotation, axes_of_symmetry, center_location, geometry, convexity, is_circular_convex, is_circular_concave, is_planar, radii, radius, seams, semi_angle, uv_face, volume, mass, make_bezier_surface, make_gordon_surface, make_rect, make_surface_from_array_of_points, make_surface_from_curves, make_surface_patch, sew_faces, chamfer_2d, and 13 more

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
  # … 25 more members in the API reference: arc_center, make_constrained_arcs, make_constrained_lines, make_parabola, make_hyperbola, make_helix, make_mid_way, make_bspline, make_spline_approx, make_tangent_arc, close, distribute_locations, find_intersection_points, find_tangent, geom_adaptor, geom_equal, param_at, param_at_point, project_to_shape, reversed, trim, trim_to_length, trim_to_other, and 2 more

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
  # edges - all the edges in this Shape, in connection order
  edges(select: Select = Select.ALL) -> ShapeList[Edge]
  # fillet_2d
  fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Wire
  # … 15 more members in the API reference: combine, make_convex_hull, make_rect, order_chamfer_edges, chamfer_2d, close, fix_degenerate_edges, geom_adaptor, order_edges, geom_equal, param_at, param_at_point, project_to_shape, stitch, trim
```

## API reference

To read any other signature, find its name in `api-index.md`, which lists all 1067 symbols by file with the lines that hold each, and read that range of the named file.

- 32 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
