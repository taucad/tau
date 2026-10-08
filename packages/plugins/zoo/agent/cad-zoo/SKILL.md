---
name: cad-zoo
description: Guides Zoo KCL modeling in main.kcl with constrained sketch blocks, regions and extrusions. Use when creating or editing KCL models.
---

# Zoo KCL authoring

## Workflow

1. Author the assembly in `main.kcl`, beginning with `@settings(defaultLengthUnit = mm, kclVersion = 2.0)`.
2. Write dimensions with unit suffixes (`10mm`, `90deg`); bare numbers take the default unit.
3. Draw each profile in a `sketch(on = XY) { … }` block (or `XZ`, `YZ`, `offsetPlane(XY, offset = 5mm)`, `faceOf(…)`): name every segment, then constrain it.
4. Make a face with `region(segments = [s.first, s.second])` (two consecutive counter-clockwise segments, or one circle); inner loops become holes. Then `extrude`, `revolve`, `sweep` or `loft` it.
5. Chain operations with `|>`; the piped value fills the `@` argument. Tag faces with `$name` (`tagEnd = $top`); a region's side faces are `region.tags.<segment>`.
6. `hide(sketch)` once used; leave top-level geometry so each file renders standalone.

KCL uses an assembly-only layout: keep library modules flat and import them from `main.kcl` (`import widget from "widget.kcl"`); a library renders alone only with its own top-level `widget()` call.

## Sketch blocks

- Segments: `line(start, end)`, `arc(start, end, center)`, `circle(start, center)`; add `construction = true` for guides.
- Seed coordinates with literal `var` guesses (`[var 40mm, var 0mm]`); they only start the solver. Parameters go in constraints.
- Constraints: `coincident([a.end, b.start])`, `horizontal(a)`, `vertical(a)`, `parallel`, `perpendicular`, `tangent`, `equalLength`. Dimensions are equations: `distance([p, q]) == 20mm`, `horizontalDistance([ORIGIN, c.center]) == width / 2`, `radius(c) == r`, `diameter(c) == d`.
- "Sketch is over-constrained": remove a conflicting constraint.

## Canonical pattern

```kcl
@settings(defaultLengthUnit = mm, kclVersion = 2.0)

width = 60mm
depth = 40mm
thickness = 8mm
holeDiameter = 10mm

profile = sketch(on = XY) {
  bottom = line(start = [var 0mm, var 0mm], end = [var 60mm, var 0mm])
  right = line(start = [var 60mm, var 0mm], end = [var 60mm, var 40mm])
  top = line(start = [var 60mm, var 40mm], end = [var 0mm, var 40mm])
  left = line(start = [var 0mm, var 40mm], end = [var 0mm, var 0mm])
  coincident([bottom.end, right.start])
  coincident([right.end, top.start])
  coincident([top.end, left.start])
  coincident([left.end, bottom.start])
  coincident([bottom.start, ORIGIN])
  horizontal(bottom)
  vertical(right)
  horizontal(top)
  vertical(left)
  horizontalDistance([bottom.start, bottom.end]) == width
  verticalDistance([right.start, right.end]) == depth

  hole = circle(start = [var 35mm, var 20mm], center = [var 30mm, var 20mm])
  horizontalDistance([ORIGIN, hole.center]) == width / 2
  verticalDistance([ORIGIN, hole.center]) == depth / 2
  diameter(hole) == holeDiameter
}

base = region(segments = [profile.bottom, profile.right])
plate = extrude(base, length = thickness, tagEnd = $topFace)
  |> fillet(radius = 1mm, tags = [getCommonEdge(faces = [base.tags.right, topFace])])
  |> appearance(color = "#1f9896")
hide(profile)
```

## Wrong / Correct

- `startSketchOn(XY) |> startProfile(…)` (deprecated in KCL 2.0) → a `sketch(on = XY) { … }` block plus `region()`.
- `extrude(profile, …)` → `extrude(region(segments = [profile.a, profile.b]), …)`.
- `var width` (parse error) → `var 60mm` plus a constraint using `width`.
- `circle(center, radius)` in a block → `circle(start, center)` plus `radius(c) == r`.

A TypeScript `main.geospec.ts` can test the model: `const model = await loadModel({ file: 'main.kcl' })`, then `expectGeo(model).toHaveBoundingBox({ size: { x: 60, y: 40, z: 8 }, tolerance: 0.1 })`.

Check unclosed loops, undefined names and solver warnings first.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### std.solver

```kcl
// Create a straight line segment in a sketch
solver::line(
  start: Point2d,
  end: Point2d,
  construction?: bool,
): Segment

// A point in two dimensional space
type Point2d = [number(Length); 2]

// Create a circular arc
solver::arc(
  start: Point2d,
  end: Point2d,
  center: Point2d,
  direction?: string,
  construction?: bool,
): Segment

// Create a circle in a sketch
solver::circle(
  start: Point2d,
  center: Point2d,
  construction?: bool,
): Segment

// Constrain points, or a point and a segment to be coincident
solver::coincident(@points: [Segment | Point2d; 2+])

// Constrain the distance between two sketch entities
solver::distance(
  @points: [Segment | Point2d; 2],
  labelPosition?: Point2d,
)

// Constrain a line, or a list of points, to be horizontal
solver::horizontal(@input: Segment | [Segment | Point2d; 2+])

// Constrain a line, or a list of points, to be vertical
solver::vertical(@input: Segment | [Segment | Point2d; 2+])

// Constrain lines to be parallel
solver::parallel(@input: [Segment; 2+])

// Constrain lines to be perpendicular
solver::perpendicular(@input: [Segment; 2+])

// Constrain the radius of an arc or circle segment
solver::radius(
  @points: Segment,
  labelPosition?: Point2d,
)
```

### std.sketch

```kcl
// Create a region from closed segments
region(
  point?: Point2d | Segment,
  segments?: [Segment; 1+],
  intersectionIndex?: number(_),
  direction?: string,
  sketch?: any,
): Sketch

// Extend a 2-dimensional sketch or individual segment of a sketch through a third dimension…
extrude(
  @sketches: [Sketch | Face | TaggedFace | TaggedEdge | Edge | Segment | any; 1+],
  length?: number(Length),
  to?: Point3d | Axis3d | Plane | Edge | Face | Sketch | Solid | TaggedEdge | TaggedFace | any,
  symmetric?: bool,
  direction?: Point3d | Edge | TaggedEdge | Segment | any,
  bidirectionalLength?: number(Length),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
  draftAngle?: number(Angle),
  twistAngle?: number(Angle),
  twistAngleStep?: number(Angle),
  twistCenter?: Point2d,
  method?: string,
  hideSeams?: bool,
  bodyType?: string,
): [Solid; 1+]

// A point in three dimensional space
type Point3d = [number(Length); 3]

// Create a 3D surface or solid by sweeping a sketch along a path
sweep(
  @sketches: [Sketch | Face | TaggedFace | Segment; 1+],
  path: Sketch | Helix | [Segment; 1+],
  sectional?: bool,
  tolerance?: number(Length),
  relativeTo?: string,
  translateProfileToPath?: bool,
  orientProfilePerpendicular?: bool,
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
  bodyType?: string,
  version?: number(_),
): [Solid; 1+]
```

### std.types

```kcl
type mm = number(mm)
```

### std.transform

```kcl
// Move a solid, a sketch, or a helix
translate(
  @objects: [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry,
  x?: number(Length),
  y?: number(Length),
  z?: number(Length),
  global?: bool,
  xyz?: [number(Length); 3],
): [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry

// Hide solids, planes, sketches, helices, or imported objects
hide(@objects: [Solid; 1+] | [Plane; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry | [GdtAnnotation; 1+]): [Solid; 1+] | [Plane; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry | [GdtAnnotation; 1+]

// Rotate a solid, a sketch, or a helix
rotate(
  @objects: [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry,
  roll?: number(Angle),
  pitch?: number(Angle),
  yaw?: number(Angle),
  axis?: Axis3d | Point3d,
  angle?: number(Angle),
  global?: bool,
): [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry
```

### std

```kcl
// An abstract 3d plane aligned with the X and Y axes
XY: Plane

// Clone a sketch or solid
clone(@geometries: [Sketch | Solid | ImportedGeometry; 1+]): [Sketch | Solid | ImportedGeometry; 1+]

// Create a helix
helix(
  revolutions: number(_),
  angleStart: number(Angle),
  ccw?: bool,
  radius?: number(Length),
  axis?: Axis3d | Edge | Segment | any,
  length?: number(Length),
  cylinder?: Solid,
): Helix

// Offset a plane by a distance along its normal
offsetPlane(
  @plane: Plane,
  offset: number(Length),
): Plane

// The X-axis (can be used in both 2d and 3d contexts)
X: Axis3d

// An abstract 3d plane aligned with the X and Z axes
XZ: Plane

// An abstract 3d plane aligned with the Y and Z axes
YZ: Plane

// The 3D Z-axis
Z: Axis3d

// Check a value meets some expected conditions at runtime
assert(
  @actual: number,
  isGreaterThan?: number,
  isLessThan?: number,
  isGreaterThanOrEqual?: number,
  isLessThanOrEqual?: number,
  isEqualTo?: number,
  isNotEqualTo?: number,
  tolerance?: number,
  error?: string,
)

// Asserts that a value is the boolean value true
assertIs(
  @actual: bool,
  error?: string,
)

// Counterclockwise circular direction, currently used by `region()`
CCW: string

// Clockwise circular direction, currently used by `region()`
CW: string

// Given an edge index, find its ID
edgeId(
  @body: Solid,
  index?: number(_),
  closestTo?: Point3d,
): Edge

// Identifies the ending face of an extrusion
END: TaggedFace

// Given a face index, find its ID
faceId(
  @body: Solid,
  index: number(_),
): TaggedFace

// Stop KCL evaluation with a user-defined error
fail(@msg: string): never

// Specifies that the extrusion will be pulled into or pushed out of the existing…
MERGE: string

// Specifies that a new object is created during extrusion
NEW: string
```

### std.solid

```kcl
// Set the appearance of a solid, imported geometry, or plane
appearance(
  @solids: [Solid; 1+] | ImportedGeometry | Plane,
  color: string,
  metalness?: number(_),
  roughness?: number(_),
  opacity?: number(_),
): [Solid; 1+] | ImportedGeometry | Plane

// Subtract removes tool solids from base solids, leaving the remaining material
subtract(
  @solids: [Solid; 1+],
  tools: [Solid],
  tolerance?: number(Length),
  legacyMethod?: bool,
): [Solid]
```

### std.array

```kcl
// Flatten an array by one level
flatten(@array: [any]): [any]

// Combine two arrays into one by concatenating them
concat(
  @array: [any],
  items: [any],
): [any]

// Find the number of elements in an array
count(@array: [any]): number

// Apply a function to every element of a list
map(
  @array: [any],
  f: fn(any): any,
): [any]

// Remove the last element from an array
pop(@array: [any; 1+]): [any]

// Append an element to the end of an array
push(
  @array: [any],
  item: any,
): [any; 1+]

// Take a starting value
reduce(
  @array: [any],
  initial: any,
  f: fn(any, accum: any): any,
): any

// Get a subarray from `start` (inclusive) to `end` (exclusive)
slice(
  @array: [any],
  start?: number(_),
  end?: number(_),
): [any]
```

### std.math

```kcl
// Compute the four quadrant arctangent of Y and X
atan2(
  y: number(Length),
  x: number(Length),
): number(rad)

type rad = number(rad)

// Compute the cosine of a number
cos(@num: number(Angle)): number

// Compute the sine of a number
sin(@num: number(Angle)): number

// Compute the square root of a number
sqrt(@input: number): number

// Compute the absolute value of a number
abs(@input: number): number

// Compute the arccosine of a number
acos(@num: number(_)): number(rad)

// Compute the arcsine of a number
asin(@num: number(_)): number(rad)

// Compute the arctangent of a number
atan(@num: number(_)): number(rad)

// Compute the smallest integer greater than or equal to a number
ceil(@input: number): number

// The value of Euler’s number `e`
E: number

// Compute the largest integer less than or equal to a number
floor(@input: number): number

// Compute the angle of the given leg for x
legAngX(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)

type deg = number(deg)

// Compute the angle of the given leg for y
legAngY(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)

// Compute the length of the given leg
legLen(
  hypotenuse: number(Length),
  leg: number(Length),
): number(Length)

// Compute the natural logarithm of the number
ln(@input: number): number

// Compute the logarithm of the number with respect to an arbitrary base
log(
  @input: number,
  base: number(_),
): number

// Compute the base 10 logarithm of the number
log10(@input: number): number

// Compute the base 2 logarithm of the number
log2(@input: number): number

// Compute the maximum of the given arguments
max(@input: [number; 1+]): number

// Compute the minimum of the given arguments
min(@input: [number; 1+]): number

// The value of `pi`, Archimedes’ constant (π)
PI: number(_?)

// Convert polar (angle, distance) coordinates to cartesian (x/y grid) coordinates
polar(
  angle: number(rad),
  length: number(Length),
): Point2d

// Compute the number to a power
pow(
  @input: number,
  exp: number(_),
): number

// Compute the remainder after dividing `num` by `div`
rem(
  @num: number,
  divisor: number,
): number

// Round a number to the nearest integer
round(@input: number): number

// Compute the tangent of a number
tan(@num: number(Angle)): number

// The value of `tau`, the full circle constant (τ)
TAU: number
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 284 symbols by file.

- 20 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
