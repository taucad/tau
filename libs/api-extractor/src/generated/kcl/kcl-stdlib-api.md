# KCL Standard Library API Reference

Total entries: 191

---

## Functions

### std

#### assert

Check a value meets some expected conditions at runtime. Program terminates with an error if conditions aren't met. If you provide multiple conditions, they will all be checked and all must be met.

```kcl
assert(
  @actual: number,
  isGreaterThan?: number,
  isLessThan?: number,
  isGreaterThanOrEqual?: number,
  isLessThanOrEqual?: number,
  isEqualTo?: number,
  tolerance?: number,
  error?: string,
)
```

**Arguments:**
- `actual`: number (required) - Value to check. If this is the boolean value true, assert passes. Otherwise it fails..
- `isGreaterThan`: number (optional) - Comparison argument. If given, checks the `actual` value is greater than this.
- `isLessThan`: number (optional) - Comparison argument. If given, checks the `actual` value is less than this.
- `isGreaterThanOrEqual`: number (optional) - Comparison argument. If given, checks the `actual` value is greater than or equal to this.
- `isLessThanOrEqual`: number (optional) - Comparison argument. If given, checks the `actual` value is less than or equal to this.
- `isEqualTo`: number (optional) - Comparison argument. If given, checks the `actual` value is less than or equal to this.
- `tolerance`: number (optional) - If `isEqualTo` is used, this is the tolerance to allow for the comparison. This tolerance is used because KCL's number system has some floating-point imprecision when used with very large decimal places.
- `error`: string (optional) - If the value was false, the program will terminate with this error message

---

#### assertIs

Asserts that a value is the boolean value true.

```kcl
assertIs(
  @actual: bool,
  error?: string,
)
```

**Arguments:**
- `actual`: bool (required) - Value to check. If this is the boolean value true, assert passes. Otherwise it fails..
- `error`: string (optional) - If the value was false, the program will terminate with this error message

---

#### clone

Clone a sketch or solid.

```kcl
clone(@geometry: Sketch | Solid | ImportedGeometry): Sketch | Solid | ImportedGeometry
```

**Arguments:**
- `geometry`: Sketch | Solid | ImportedGeometry (required) - The sketch, solid, or imported geometry to be cloned.

**Returns:** Sketch | Solid | ImportedGeometry

---

#### helix

Create a helix.

```kcl
helix(
  revolutions: number(_),
  angleStart: number(Angle),
  ccw?: bool,
  radius?: number(Length),
  axis?: Axis3d | Edge,
  length?: number(Length),
  cylinder?: Solid,
): Helix
```

**Arguments:**
- `revolutions`: number(_) (required) - Number of revolutions.
- `angleStart`: number(Angle) (required) - Start angle.
- `ccw`: bool (optional) - Is the helix rotation counter clockwise? The default is `false`.
- `radius`: number(Length) (optional) - Radius of the helix.
- `axis`: Axis3d | Edge (optional) - Axis to use for the helix. The center of the helix's base will be at this axis's origin point.
- `length`: number(Length) (optional) - Length of the helix. This is not necessary if the helix is created around an edge. If not given the length of the edge is used.
- `cylinder`: Solid (optional) - Cylinder to create the helix on.

**Returns:** Helix

---

#### offsetPlane

Offset a plane by a distance along its normal.

```kcl
offsetPlane(
  @plane: Plane,
  offset: number(Length),
): Plane
```

**Arguments:**
- `plane`: Plane (required) - The plane (e.g. `XY`) which this new plane is created from.
- `offset`: number(Length) (required) - Distance from the standard plane this new plane will be created at.

**Returns:** Plane

---

### std::appearance

#### appearance::hexString

Build a color from its red, green and blue components. These must be between 0 and 255.

```kcl
appearance::hexString(@rgb: [number(_); 3]): string
```

**Arguments:**
- `rgb`: [number(_); 3] (required) - The red, blue and green components of the color. Must be between 0 and 255.

**Returns:** string

---

### std::array

#### concat

Combine two arrays into one by concatenating them.

```kcl
concat(
  @array: [any],
  items: [any],
): [any]
```

**Arguments:**
- `array`: [any] (required) - The array of starting elements.
- `items`: [any] (required) - The array of ending elements.

**Returns:** [any]

---

#### count

Find the number of elements in an array.

```kcl
count(@array: [any]): number
```

**Arguments:**
- `array`: [any] (required) - The array whose length will be returned.

**Returns:** number

---

#### map

Apply a function to every element of a list.

```kcl
map(
  @array: [any],
  f: fn(any): any,
): [any]
```

**Arguments:**
- `array`: [any] (required) - Input array. The output array is this input array, but every element has had the function `f` run on it.
- `f`: fn(any): any (required) - A function. The output array is just the input array, but `f` has been run on every item.

**Returns:** [any]

---

#### pop

Remove the last element from an array.

```kcl
pop(@array: [any; 1+]): [any]
```

**Arguments:**
- `array`: [any; 1+] (required) - The array to pop from. Must not be empty.

**Returns:** [any]

---

#### push

Append an element to the end of an array.

```kcl
push(
  @array: [any],
  item: any,
): [any; 1+]
```

**Arguments:**
- `array`: [any] (required) - The array which you're adding a new item to.
- `item`: any (required) - The new item to add to the array

**Returns:** [any; 1+]

---

#### reduce

Take a starting value. Then, for each element of an array, calculate the next value, using the previous value and the element.

```kcl
reduce(
  @array: [any],
  initial: any,
  f: fn(any, accum: any): any,
): any
```

**Arguments:**
- `array`: [any] (required) - Each element of this array gets run through the function `f`, combined with the previous output from `f`, and then used for the next run.
- `initial`: any (required) - The first time `f` is run, it will be called with the first item of `array` and this initial starting value.
- `f`: fn(any, accum: any): any (required) - Run once per item in the input `array`. This function takes an item from the array, and the previous output from `f` (or `initial` on the very first run). The final time `f` is run, its output is returned as the final output from `reduce`.

**Returns:** any

---

### std::gdt

#### gdt::datum

GD&T datum feature.

```kcl
gdt::datum(
  face: TaggedFace,
  name: string,
  framePosition?: Point2d,
  framePlane?: Plane,
  fontPointSize?: number(_),
  fontScale?: number(_),
): GdtAnnotation
```

**Arguments:**
- `face`: TaggedFace (required) - The face to be annotated.
- `name`: string (required) - The name of the datum.
- `framePosition`: Point2d (optional) - The position of the feature control frame relative to the leader arrow. The default is `[100mm, 100mm]`.
- `framePlane`: Plane (optional) - The plane in which to display the feature control frame. The default is `XY`. Other standard planes like `XZ` and `YZ` can also be used. The frame may be displayed in a plane parallel to the given plane.
- `fontPointSize`: number(_) (optional) - The font point size to use for the annotation text rendering. The default is `36`.
- `fontScale`: number(_) (optional) - Scale to use for the annotation text after rendering with the point size. The default is `1.0`. Must be greater than `0`.

**Returns:** GdtAnnotation

---

#### gdt::flatness

GD&T annotation specifying how flat faces should be.

```kcl
gdt::flatness(
  faces: [TaggedFace; 1+],
  tolerance: number(Length),
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  fontPointSize?: number(_),
  fontScale?: number(_),
): [GdtAnnotation; 1+]
```

**Arguments:**
- `faces`: [TaggedFace; 1+] (required) - The faces to be annotated.
- `tolerance`: number(Length) (required) - The amount of deviation from a perfect plane that is acceptable.
- `precision`: number(_) (optional) - The number of decimal places to display. The default is `3`. Must be greater than or equal to `0` and less than or equal to `9`.
- `framePosition`: Point2d (optional) - The position of the feature control frame relative to the leader arrow. The default is `[100mm, 100mm]`.
- `framePlane`: Plane (optional) - The plane in which to display the feature control frame. The default is `XY`. Other standard planes like `XZ` and `YZ` can also be used. The frame may be displayed in a plane parallel to the given plane.
- `fontPointSize`: number(_) (optional) - The font point size to use for the annotation text rendering. The default is `36`.
- `fontScale`: number(_) (optional) - Scale to use for the annotation text after rendering with the point size. The default is `1.0`. Must be greater than `0`.

**Returns:** [GdtAnnotation; 1+]

---

### std::hole

#### hole::blind

The hole has the given blind depth.

```kcl
hole::blind(
  depth: number(Length),
  diameter: number(Length),
)
```

**Arguments:**
- `depth`: number(Length) (required) - A number.
- `diameter`: number(Length) (required) - A number.

---

#### hole::counterbore

Cut a straight vertical counterbore at the top of the hole. Typically used when a fastener (e.g. the head cap on a screw) needs to sit flush with the solid's surface.

```kcl
hole::counterbore(
  diameter: number(Length),
  depth: number(Length),
)
```

**Arguments:**
- `diameter`: number(Length) (required) - A number.
- `depth`: number(Length) (required) - A number.

---

#### hole::countersink

Cut an angled countersink at the top of the hole. Typically used when a conical screw head has to sit flush with the surface being cut into.

```kcl
hole::countersink(
  diameter: number(Length),
  angle: number(Angle),
)
```

**Arguments:**
- `diameter`: number(Length) (required) - A number.
- `angle`: number(Angle) (required) - A number.

---

#### hole::drill

End the hole in an angle, like the end of a drill.

```kcl
hole::drill(pointAngle: number(Angle))
```

**Arguments:**
- `pointAngle`: number(Angle) (required) - A number.

---

#### hole::flat

End the hole flat.

```kcl
hole::flat()
```

---

#### hole::hole

From the hole's parts (bottom, middle, top), cut the hole into the given solid, at the given 2D position on the given face.

```kcl
hole::hole(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutAt: [number(Length); 2],
)
```

**Arguments:**
- `solid`: Solid (required) - Which solid to add a hole to.
- `face`: TaggedFace (required) - Which face of the solid to add the hole to. Controls the orientation of the hole.
- `holeBottom`:  (required) - Define bottom feature of the hole. E.g. drilled or flat.
- `holeBody`:  (required) - Define the main length of the hole. E.g. a blind distance.
- `holeType`:  (required) - Define the top feature of the hole. E.g. countersink, counterbore, simple.
- `cutAt`: [number(Length); 2] (required) - Where to place the cut on the given face of the solid. Given as absolute coordinates in the global scene.

---

#### hole::holes

From the hole's parts (bottom, middle, top), cut the hole into the given solid, at each of the given 2D positions on the given face. Basically like function `hole` but it takes multiple 2D positions in `cutsAt`.

```kcl
hole::holes(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutsAt: [[number(Length); 2]],
)
```

**Arguments:**
- `solid`: Solid (required) - Which solid to add a hole to.
- `face`: TaggedFace (required) - Which face of the solid to add the hole to. Controls the orientation of the hole.
- `holeBottom`:  (required) - Define bottom feature of the hole. E.g. drilled or flat.
- `holeBody`:  (required) - Define the main length of the hole. E.g. a blind distance.
- `holeType`:  (required) - Define the top feature of the hole. E.g. countersink, counterbore, simple.
- `cutsAt`: [[number(Length); 2]] (required) - Where to place the holes, given as absolute coordinates in the global scene.

---

#### hole::holesLinear

Place the given holes in a line. Basically like function `hole` but cuts multiple holes in a line. Works like linear patterns.

```kcl
hole::holesLinear(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutAt: [number(Length); 2],
  instances: number(_),
  distance,
  axis: Axis2d | Point2d,
)
```

**Arguments:**
- `solid`: Solid (required) - Which solid to add a hole to.
- `face`: TaggedFace (required) - Which face of the solid to add the hole to. Controls the orientation of the hole.
- `holeBottom`:  (required) - Define bottom feature of the hole. E.g. drilled or flat.
- `holeBody`:  (required) - Define the main length of the hole. E.g. a blind distance.
- `holeType`:  (required) - Define the top feature of the hole. E.g. countersink, counterbore, simple.
- `cutAt`: [number(Length); 2] (required) - Where to place the first cut in the linear pattern, given as absolute coordinates in the global scene.
- `instances`: number(_) (required) - How many holes to cut.
- `distance`:  (required) - How far between each hole
- `axis`: Axis2d | Point2d (required) - Along which axis should the holes be cut?

---

#### hole::simple

A hole top with no decoration.

```kcl
hole::simple()
```

---

### std::math

#### abs

Compute the absolute value of a number.

```kcl
abs(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### acos

Compute the arccosine of a number.

```kcl
acos(@num: number(_)): number(rad)
```

**Arguments:**
- `num`: number(_) (required) - A number.

**Returns:** number(rad)

---

#### asin

Compute the arcsine of a number.

```kcl
asin(@num: number(_)): number(rad)
```

**Arguments:**
- `num`: number(_) (required) - A number.

**Returns:** number(rad)

---

#### atan

Compute the arctangent of a number.

```kcl
atan(@num: number(_)): number(rad)
```

**Arguments:**
- `num`: number(_) (required) - A number.

**Returns:** number(rad)

---

#### atan2

Compute the four quadrant arctangent of Y and X.

```kcl
atan2(
  y: number(Length),
  x: number(Length),
): number(rad)
```

**Arguments:**
- `y`: number(Length) (required) - A number.
- `x`: number(Length) (required) - A number.

**Returns:** number(rad)

---

#### ceil

Compute the smallest integer greater than or equal to a number.

```kcl
ceil(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### cos

Compute the cosine of a number.

```kcl
cos(@num: number(Angle)): number
```

**Arguments:**
- `num`: number(Angle) (required) - A number.

**Returns:** number

---

#### floor

Compute the largest integer less than or equal to a number.

```kcl
floor(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### legAngX

Compute the angle of the given leg for x.

```kcl
legAngX(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)
```

**Arguments:**
- `hypotenuse`: number(Length) (required) - The length of the triangle's hypotenuse.
- `leg`: number(Length) (required) - The length of one of the triangle's legs (i.e. non-hypotenuse side).

**Returns:** number(deg)

---

#### legAngY

Compute the angle of the given leg for y.

```kcl
legAngY(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)
```

**Arguments:**
- `hypotenuse`: number(Length) (required) - The length of the triangle's hypotenuse.
- `leg`: number(Length) (required) - The length of one of the triangle's legs (i.e. non-hypotenuse side).

**Returns:** number(deg)

---

#### legLen

Compute the length of the given leg.

```kcl
legLen(
  hypotenuse: number(Length),
  leg: number(Length),
): number(Length)
```

**Arguments:**
- `hypotenuse`: number(Length) (required) - The length of the triangle's hypotenuse.
- `leg`: number(Length) (required) - The length of one of the triangle's legs (i.e. non-hypotenuse side).

**Returns:** number(Length)

---

#### ln

Compute the natural logarithm of the number.

```kcl
ln(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### log

Compute the logarithm of the number with respect to an arbitrary base.

```kcl
log(
  @input: number,
  base: number(_),
): number
```

**Arguments:**
- `input`: number (required) - The number to compute the logarithm of.
- `base`: number(_) (required) - The base of the logarithm.

**Returns:** number

---

#### log10

Compute the base 10 logarithm of the number.

```kcl
log10(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### log2

Compute the base 2 logarithm of the number.

```kcl
log2(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### max

Compute the maximum of the given arguments.

```kcl
max(@input: [number; 1+]): number
```

**Arguments:**
- `input`: [number; 1+] (required) - An array of numbers to compute the maximum of.

**Returns:** number

---

#### min

Compute the minimum of the given arguments.

```kcl
min(@input: [number; 1+]): number
```

**Arguments:**
- `input`: [number; 1+] (required) - An array of numbers to compute the minimum of.

**Returns:** number

---

#### polar

Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid) coordinates.

```kcl
polar(
  angle: number(rad),
  length: number(Length),
): Point2d
```

**Arguments:**
- `angle`: number(rad) (required) - A number.
- `length`: number(Length) (required) - A number.

**Returns:** Point2d

---

#### pow

Compute the number to a power.

```kcl
pow(
  @input: number,
  exp: number(_),
): number
```

**Arguments:**
- `input`: number (required) - The number to raise.
- `exp`: number(_) (required) - The power to raise to.

**Returns:** number

---

#### rem

Compute the remainder after dividing `num` by `div`. If `num` is negative, the result will be too.

```kcl
rem(
  @num: number,
  divisor: number,
): number
```

**Arguments:**
- `num`: number (required) - The number which will be divided by `divisor`.
- `divisor`: number (required) - The number which will divide `num`.

**Returns:** number

---

#### round

Round a number to the nearest integer.

```kcl
round(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### sin

Compute the sine of a number.

```kcl
sin(@num: number(Angle)): number
```

**Arguments:**
- `num`: number(Angle) (required) - A number.

**Returns:** number

---

#### sqrt

Compute the square root of a number.

```kcl
sqrt(@input: number): number
```

**Arguments:**
- `input`: number (required) - A number.

**Returns:** number

---

#### tan

Compute the tangent of a number.

```kcl
tan(@num: number(Angle)): number
```

**Arguments:**
- `num`: number(Angle) (required) - A number.

**Returns:** number

---

### std::sketch

#### angledLine

Draw a line segment relative to the current origin using the polar measure of some angle and distance.

```kcl
angledLine(
  @sketch: Sketch,
  angle: number(Angle),
  length?: number(Length),
  lengthX?: number(Length),
  lengthY?: number(Length),
  endAbsoluteX?: number(Length),
  endAbsoluteY?: number(Length),
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `angle`: number(Angle) (required) - Which angle should the line be drawn at?
- `length`: number(Length) (optional) - Draw the line this distance along the given angle. Only one of `length`, `lengthX`, `lengthY`, `endAbsoluteX`, `endAbsoluteY` can be given.
- `lengthX`: number(Length) (optional) - Draw the line this distance along the X axis. Only one of `length`, `lengthX`, `lengthY`, `endAbsoluteX`, `endAbsoluteY` can be given.
- `lengthY`: number(Length) (optional) - Draw the line this distance along the Y axis. Only one of `length`, `lengthX`, `lengthY`, `endAbsoluteX`, `endAbsoluteY` can be given.
- `endAbsoluteX`: number(Length) (optional) - Draw the line along the given angle until it reaches this point along the X axis. Only one of `length`, `lengthX`, `lengthY`, `endAbsoluteX`, `endAbsoluteY` can be given.
- `endAbsoluteY`: number(Length) (optional) - Draw the line along the given angle until it reaches this point along the Y axis. Only one of `length`, `lengthX`, `lengthY`, `endAbsoluteX`, `endAbsoluteY` can be given.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### angledLineThatIntersects

Draw an angled line from the current origin, constructing a line segment such that the newly created line intersects the desired target line segment.

```kcl
angledLineThatIntersects(
  @sketch: Sketch,
  angle: number(Angle),
  intersectTag: TaggedEdge,
  offset?: number(Length),
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `angle`: number(Angle) (required) - Which angle should the line be drawn at?
- `intersectTag`: TaggedEdge (required) - The tag of the line to intersect with.
- `offset`: number(Length) (optional) - The offset from the intersecting line.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### arc

Draw a curved line segment along an imaginary circle.

```kcl
arc(
  @sketch: Sketch,
  angleStart?: number(Angle),
  angleEnd?: number(Angle),
  radius?: number(Length),
  diameter?: number(Length),
  interiorAbsolute?: Point2d,
  endAbsolute?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `angleStart`: number(Angle) (optional) - Where along the circle should this arc start?
- `angleEnd`: number(Angle) (optional) - Where along the circle should this arc end?
- `radius`: number(Length) (optional) - How large should the circle be? Incompatible with `diameter`.
- `diameter`: number(Length) (optional) - How large should the circle be? Incompatible with `radius`.
- `interiorAbsolute`: Point2d (optional) - Any point between the arc's start and end? Requires `endAbsolute`. Incompatible with `angleStart` or `angleEnd`.
- `endAbsolute`: Point2d (optional) - Where should this arc end? Requires `interiorAbsolute`. Incompatible with `angleStart` or `angleEnd`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this arc.

**Returns:** Sketch

---

#### bezierCurve

Draw a smooth, continuous, curved line segment from the current origin to the desired (x, y), using a number of control points to shape the curve's shape.

```kcl
bezierCurve(
  @sketch: Sketch,
  control1?: Point2d,
  control2?: Point2d,
  end?: Point2d,
  control1Absolute?: Point2d,
  control2Absolute?: Point2d,
  endAbsolute?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `control1`: Point2d (optional) - First control point for the cubic.
- `control2`: Point2d (optional) - Second control point for the cubic.
- `end`: Point2d (optional) - How far away (along the X and Y axes) should this line go?
- `control1Absolute`: Point2d (optional) - First control point for the cubic. Absolute point.
- `control2Absolute`: Point2d (optional) - Second control point for the cubic. Absolute point.
- `endAbsolute`: Point2d (optional) - Coordinate on the plane at which this line should end.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### circle

Construct a 2-dimensional circle, of the specified radius, centered at the provided (x, y) origin point.

```kcl
circle(
  @sketchOrSurface: Sketch | Plane | Face,
  center?: Point2d,
  radius?: number(Length),
  diameter?: number(Length),
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketchOrSurface`: Sketch | Plane | Face (required) - Sketch to extend, or plane or surface to sketch on.
- `center`: Point2d (optional) - The center of the circle. If not given, defaults to `[0, 0]`.
- `radius`: number(Length) (optional) - The radius of the circle. Incompatible with `diameter`.
- `diameter`: number(Length) (optional) - The diameter of the circle. Incompatible with `radius`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this circle.

**Returns:** Sketch

---

#### circleThreePoint

Construct a circle derived from 3 points.

```kcl
circleThreePoint(
  @sketchOrSurface: Sketch | Plane | Face,
  p1: Point2d,
  p2: Point2d,
  p3: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketchOrSurface`: Sketch | Plane | Face (required) - Plane or surface to sketch on.
- `p1`: Point2d (required) - 1st point to derive the circle.
- `p2`: Point2d (required) - 2nd point to derive the circle.
- `p3`: Point2d (required) - 3rd point to derive the circle.
- `tag`: TagDecl (optional) - Identifier for the circle to reference elsewhere.

**Returns:** Sketch

---

#### close

Construct a line segment from the current origin back to the profile's origin, ensuring the resulting 2-dimensional sketch is not open-ended.

```kcl
close(
  @sketch: Sketch,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - The sketch you want to close.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### conic

Add a conic section to an existing sketch.

```kcl
conic(
  @sketch: Sketch,
  interiorAbsolute?: Point2d,
  endAbsolute?: Point2d,
  interior?: Point2d,
  end?: Point2d,
  coefficients?: [number; 6],
  startTangent?: Point2d,
  endTangent?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `interiorAbsolute`: Point2d (optional) - Any point between the segment's start and end. Requires `endAbsolute`. Incompatible with `interior` or `end`.
- `endAbsolute`: Point2d (optional) - Where should this segment end? Requires `interiorAbsolute`. Incompatible with `interior` or `end`.
- `interior`: Point2d (optional) - Any point between the segment's start and end. This point is relative to the start point. Requires `end`. Incompatible with `interiorAbsolute` or `endAbsolute`.
- `end`: Point2d (optional) - Where should this segment end? This point is relative to the start point. Requires `interior`. Incompatible with `interiorAbsolute` or `endAbsolute`.
- `coefficients`: [number; 6] (optional) - The coefficients [a, b, c, d, e, f] of the generic conic equation ax^2 + by^2 + cxy + dx + ey + f = 0. If provided the start and end tangents will be calculated using this equation. Incompatible with `startTangent` and `endTangent`.
- `startTangent`: Point2d (optional) - The tangent of the conic section at the start. If not provided the tangent of the previous path segment is used. Incompatible with `coefficients`.
- `endTangent`: Point2d (optional) - The tangent of the conic section at the end. Incompatible with `coefficients`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this segment.

**Returns:** Sketch

---

#### ellipse

Construct a 2-dimensional ellipse, of the specified major/minor radius, centered at the provided (x, y) point.

```kcl
ellipse(
  @sketchOrSurface: Sketch | Plane | Face,
  center: Point2d,
  minorRadius: number(Length),
  majorRadius?: number(Length),
  majorAxis?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketchOrSurface`: Sketch | Plane | Face (required) - Sketch to extend, or plane or surface to sketch on.
- `center`: Point2d (required) - The center of the ellipse.
- `minorRadius`: number(Length) (required) - The minor radius of the ellipse.
- `majorRadius`: number(Length) (optional) - The major radius of the ellipse. Equivalent to majorAxis = [majorRadius, 0].
- `majorAxis`: Point2d (optional) - The major axis of the ellipse.
- `tag`: TagDecl (optional) - Create a new tag which refers to this ellipse.

**Returns:** Sketch

---

#### elliptic

Add an elliptic section to an existing sketch.

```kcl
elliptic(
  @sketch: Sketch,
  center: Point2d,
  angleStart: number(Angle),
  angleEnd: number(Angle),
  minorRadius: number(Length),
  majorRadius?: number(Length),
  majorAxis?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `center`: Point2d (required) - The center of the ellipse.
- `angleStart`: number(Angle) (required) - Where along the ellptic should this segment start?
- `angleEnd`: number(Angle) (required) - Where along the ellptic should this segment end?
- `minorRadius`: number(Length) (required) - The minor radius, b, of the elliptic equation x^2 / a^2 + y^2 / b^2 = 1.
- `majorRadius`: number(Length) (optional) - The major radius, a, of the elliptic equation x^2 / a^2 + y^2 / b^2 = 1. Equivalent to majorAxis = [majorRadius, 0].
- `majorAxis`: Point2d (optional) - The major axis of the elliptic.
- `tag`: TagDecl (optional) - Create a new tag which refers to this arc.

**Returns:** Sketch

---

#### ellipticPoint

Calculate the point (x, y) on an ellipse given x or y and the center and major/minor radii of the ellipse.

```kcl
ellipticPoint(
  majorRadius: number,
  minorRadius: number,
  x?: number(Length),
  y?: number(Length),
): Point2d
```

**Arguments:**
- `majorRadius`: number (required) - The major radius, a, of the elliptic equation x^2 / a ^ 2 + y^2 / b^2 = 1.
- `minorRadius`: number (required) - The minor radius, b, of the hyperbolic equation x^2 / a ^ 2 + y^2 / b^2 = 1.
- `x`: number(Length) (optional) - The x value. Calculates y and returns (x, y). Incompatible with `y`.
- `y`: number(Length) (optional) - The y value. Calculates x and returns (x, y). Incompatible with `x`.

**Returns:** Point2d

---

#### extrude

Extend a 2-dimensional sketch through a third dimension in order to create new 3-dimensional volume, or if extruded into an existing volume, cut into an existing solid.

```kcl
extrude(
  @sketches: [Sketch; 1+],
  length?: number(Length),
  to?: Point3d | Axis3d | Plane | Edge | Face | Sketch | Solid | TaggedEdge | TaggedFace,
  symmetric?: bool,
  bidirectionalLength?: number(Length),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
  twistAngle?: number(Angle),
  twistAngleStep?: number(Angle),
  twistCenter?: Point2d,
  method?: string,
): [Solid; 1+]
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - Which sketch or sketches should be extruded.
- `length`: number(Length) (optional) - How far to extrude the given sketches. Incompatible with `to`.
- `to`: Point3d | Axis3d | Plane | Edge | Face | Sketch | Solid | TaggedEdge | TaggedFace (optional) - Reference to extrude to. Incompatible with `length` and `twistAngle`.
- `symmetric`: bool (optional) - If true, the extrusion will happen symmetrically around the sketch. Otherwise, the extrusion will happen on only one side of the sketch.
- `bidirectionalLength`: number(Length) (optional) - If specified, will also extrude in the opposite direction to 'distance' to the specified distance. If 'symmetric' is true, this value is ignored.
- `tagStart`: TagDecl (optional) - A named tag for the face at the start of the extrusion, i.e. the original sketch.
- `tagEnd`: TagDecl (optional) - A named tag for the face at the end of the extrusion, i.e. the new face created by extruding the original sketch.
- `twistAngle`: number(Angle) (optional) - If given, the sketch will be twisted around this angle while being extruded. Incompatible with `to`.
- `twistAngleStep`: number(Angle) (optional) - The size of each intermediate angle as the sketch twists around. Must be between 4 and 90 degrees. Only used if `twistAngle` is given, defaults to 15 degrees.
- `twistCenter`: Point2d (optional) - The center around which the sketch will be twisted. Relative to the sketch's center. Only used if `twistAngle` is given, defaults to [0, 0] i.e. sketch's center.
- `method`: string (optional) - The method used during extrusion, either `NEW` or `MERGE`. `NEW` creates a new object. `MERGE` merges the extruded objects together. The default is `MERGE`.

**Returns:** [Solid; 1+]

---

#### getCommonEdge

Get the shared edge between two faces.

```kcl
getCommonEdge(faces: [TaggedFace; 2]): Edge
```

**Arguments:**
- `faces`: [TaggedFace; 2] (required) - The tags of the faces you want to find the common edge between.

**Returns:** Edge

---

#### getNextAdjacentEdge

Get the next adjacent edge to the edge given.

```kcl
getNextAdjacentEdge(@edge: TaggedEdge): Edge
```

**Arguments:**
- `edge`: TaggedEdge (required) - The tag of the edge you want to find the next adjacent edge of.

**Returns:** Edge

---

#### getOppositeEdge

Get the opposite edge to the edge given.

```kcl
getOppositeEdge(@edge: TaggedEdge): Edge
```

**Arguments:**
- `edge`: TaggedEdge (required) - The tag of the edge you want to find the opposite edge of.

**Returns:** Edge

---

#### getPreviousAdjacentEdge

Get the previous adjacent edge to the edge given.

```kcl
getPreviousAdjacentEdge(@edge: TaggedEdge): Edge
```

**Arguments:**
- `edge`: TaggedEdge (required) - The tag of the edge you want to find the previous adjacent edge of.

**Returns:** Edge

---

#### hyperbolic

Add a hyperbolic section to an existing sketch.

```kcl
hyperbolic(
  @sketch: Sketch,
  semiMajor: number(Length),
  semiMinor: number(Length),
  interiorAbsolute?: Point2d,
  endAbsolute?: Point2d,
  interior?: Point2d,
  end?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `semiMajor`: number(Length) (required) - The semi major value, a, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1.
- `semiMinor`: number(Length) (required) - The semi minor value, b, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1.
- `interiorAbsolute`: Point2d (optional) - Any point between the segment's start and end. Requires `endAbsolute`. Incompatible with `interior` or `end`.
- `endAbsolute`: Point2d (optional) - Where should this segment end? Requires `interiorAbsolute`. Incompatible with `interior` or `end`.
- `interior`: Point2d (optional) - Any point between the segment's start and end. This point is relative to the start point. Requires `end`. Incompatible with `interiorAbsolute` or `endAbsolute`.
- `end`: Point2d (optional) - Where should this segment end? This point is relative to the start point. Requires `interior`. Incompatible with `interiorAbsolute` or `endAbsolute`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this arc.

**Returns:** Sketch

---

#### hyperbolicPoint

Calculate the point (x, y) on a hyperbola given x or y and the semi major/minor values of the hyperbolic.

```kcl
hyperbolicPoint(
  semiMajor: number,
  semiMinor: number,
  x?: number(Length),
  y?: number(Length),
): Point2d
```

**Arguments:**
- `semiMajor`: number (required) - The semi major value, a, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1.
- `semiMinor`: number (required) - The semi minor value, b, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1.
- `x`: number(Length) (optional) - The x value. Calculates y and returns (x, y). Incompatible with `y`.
- `y`: number(Length) (optional) - The y value. Calculates x and returns (x, y). Incompatible with `x`.

**Returns:** Point2d

---

#### involuteCircular

Extend the current sketch with a new involute circular curve.

```kcl
involuteCircular(
  @sketch: Sketch,
  angle: number(Angle),
  startRadius?: number(Length),
  endRadius?: number(Length),
  startDiameter?: number(Length),
  endDiameter?: number(Length),
  reverse?: bool,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `angle`: number(Angle) (required) - The angle to rotate the involute by. A value of zero will produce a curve with a tangent along the x-axis at the start point of the curve.
- `startRadius`: number(Length) (optional) - The involute is described between two circles, startRadius is the radius of the inner circle. Either `startRadius` or `startDiameter` must be given (but not both).
- `endRadius`: number(Length) (optional) - The involute is described between two circles, endRadius is the radius of the outer circle. Either `endRadius` or `endDiameter` must be given (but not both).
- `startDiameter`: number(Length) (optional) - The involute is described between two circles, startDiameter describes the inner circle. Either `startRadius` or `startDiameter` must be given (but not both).
- `endDiameter`: number(Length) (optional) - The involute is described between two circles, endDiameter describes the outer circle. Either `endRadius` or `endDiameter` must be given (but not both).
- `reverse`: bool (optional) - If reverse is true, the segment will start from the end of the involute, otherwise it will start from that start.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### lastSegX

Extract the 'x' axis value of the last line segment in the provided 2-d sketch.

```kcl
lastSegX(@sketch: Sketch): number(Length)
```

**Arguments:**
- `sketch`: Sketch (required) - The sketch whose line segment is being queried.

**Returns:** number(Length)

---

#### lastSegY

Extract the 'y' axis value of the last line segment in the provided 2-d sketch.

```kcl
lastSegY(@sketch: Sketch): number(Length)
```

**Arguments:**
- `sketch`: Sketch (required) - The sketch whose line segment is being queried.

**Returns:** number(Length)

---

#### line

Extend the current sketch with a new straight line.

```kcl
line(
  @sketch: Sketch,
  endAbsolute?: Point2d,
  end?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `endAbsolute`: Point2d (optional) - Which absolute point should this line go to? Incompatible with `end`.
- `end`: Point2d (optional) - How far away (along the X and Y axes) should this line go? Incompatible with `endAbsolute`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### loft

Create a 3D surface or solid by interpolating between two or more sketches.

```kcl
loft(
  @sketches: [Sketch; 2+],
  vDegree?: number(_),
  bezApproximateRational?: bool,
  baseCurveIndex?: number(_),
  tolerance?: number(Length),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): Solid
```

**Arguments:**
- `sketches`: [Sketch; 2+] (required) - Which sketches to loft. Must include at least 2 sketches.
- `vDegree`: number(_) (optional) - Degree of the interpolation. Must be greater than zero. For example, use 2 for quadratic, or 3 for cubic interpolation in the V direction.
- `bezApproximateRational`: bool (optional) - Attempt to approximate rational curves (such as arcs) using a bezier. This will remove banding around interpolations between arcs and non-arcs. It may produce errors in other scenarios. Over time, this field won't be necessary.
- `baseCurveIndex`: number(_) (optional) - This can be set to override the automatically determined topological base curve, which is usually the first section encountered.
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.
- `tagStart`: TagDecl (optional) - A named tag for the face at the start of the loft, i.e. the original sketch.
- `tagEnd`: TagDecl (optional) - A named tag for the face at the end of the loft.

**Returns:** Solid

---

#### parabolic

Add a parabolic segment to an existing sketch.

```kcl
parabolic(
  @sketch: Sketch,
  end: Point2d,
  endAbsolute?: Point2d,
  coefficients?: [number; 3],
  interior?: Point2d,
  interiorAbsolute?: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `end`: Point2d (required) - Where should the path end? Relative to the start point. Incompatible with `interiorAbsolute` or `endAbsolute`.
- `endAbsolute`: Point2d (optional) - Where should this segment end? Requires `interiorAbsolute`. Incompatible with `interior` or `end`.
- `coefficients`: [number; 3] (optional) - The coefficients [a, b, c] of the parabolic equation y = ax^2 + bx + c. Incompatible with `interior`.
- `interior`: Point2d (optional) - A point between the segment's start and end that lies on the parabola. Incompatible with `coefficients` or `interiorAbsolute` or `endAbsolute`.
- `interiorAbsolute`: Point2d (optional) - Any point between the segment's start and end. Requires `endAbsolute`. Incompatible with `coefficients` or `interior` or `end`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this segment.

**Returns:** Sketch

---

#### parabolicPoint

Calculate the point (x, y) on a parabola given x or y and the coefficients [a, b, c] of the parabola.

```kcl
parabolicPoint(
  coefficients: [number; 3],
  x?: number(Length),
  y?: number(Length),
): Point2d
```

**Arguments:**
- `coefficients`: [number; 3] (required) - The coefficients [a, b, c] of the parabolic equation y = ax^2 + bx + c.
- `x`: number(Length) (optional) - The x value. Calculates y and returns (x, y). Incompatible with `y`.
- `y`: number(Length) (optional) - The y value. Calculates x and returns (x, y). Incompatible with `x`.

**Returns:** Point2d

---

#### patternCircular2d

Repeat a 2-dimensional sketch some number of times along a partial or complete circle some specified number of times. Each object may additionally be rotated along the circle, ensuring orientation of the solid with respect to the center of the circle is maintained.

```kcl
patternCircular2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  center: Point2d,
  arcDegrees?: number(Angle),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Sketch; 1+]
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - The sketch(es) to duplicate.
- `instances`: number(_) (required) - The number of total instances. Must be greater than or equal to 1. This includes the original entity. For example, if instances is 2, there will be two copies -- the original, and one new copy. If instances is 1, this has no effect.
- `center`: Point2d (required) - The center about which to make the pattern. This is a 2D vector.
- `arcDegrees`: number(Angle) (optional) - The arc angle (in degrees) to place the repetitions. Must be greater than 0.
- `rotateDuplicates`: bool (optional) - Whether or not to rotate the duplicates as they are copied.
- `useOriginal`: bool (optional) - If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid.

**Returns:** [Sketch; 1+]

---

#### patternLinear2d

Repeat a 2-dimensional sketch along some dimension, with a dynamic amount of distance between each repetition, some specified number of times.

```kcl
patternLinear2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  distance: number(Length),
  axis: Axis2d | Point2d,
  useOriginal?: bool,
): [Sketch; 1+]
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - The sketch(es) to duplicate.
- `instances`: number(_) (required) - The number of total instances. Must be greater than or equal to 1. This includes the original entity. For example, if instances is 2, there will be two copies -- the original, and one new copy. If instances is 1, this has no effect.
- `distance`: number(Length) (required) - Distance between each repetition. Also known as 'spacing'.
- `axis`: Axis2d | Point2d (required) - The axis of the pattern. A 2D vector.
- `useOriginal`: bool (optional) - If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid.

**Returns:** [Sketch; 1+]

---

#### patternTransform2d

Just like `patternTransform`, but works on 2D sketches not 3D solids.

```kcl
patternTransform2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: boolean,
): [Sketch; 1+]
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - The sketch(es) to duplicate.
- `instances`: number(_) (required) - The number of total instances. Must be greater than or equal to 1. This includes the original entity. For example, if instances is 2, there will be two copies -- the original, and one new copy. If instances is 1, this has no effect.
- `transform`: fn(number(_)): { } (required) - How each replica should be transformed. The transform function takes a single parameter: an integer representing which number replication the transform is for. E.g. the first replica to be transformed will be passed the argument `1`. This simplifies your math: the transform function can rely on id `0` being the original instance passed into the `patternTransform`. See the examples.
- `useOriginal`: boolean (optional) - If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid.

**Returns:** [Sketch; 1+]

---

#### planeOf

Find the plane a face lies on. Returns an error if the face doesn't lie on any plane (for example, the curved face of a cylinder)

```kcl
planeOf(
  @solid: Solid,
  face: TaggedFace,
): Plane
```

**Arguments:**
- `solid`: Solid (required) - The solid whose face is being queried.
- `face`: TaggedFace (required) - Find the plane which this face lies on.

**Returns:** Plane

---

#### polygon

Create a regular polygon with the specified number of sides that is either inscribed or circumscribed around a circle of the specified radius.

```kcl
polygon(
  @sketchOrSurface: Sketch | Plane | Face,
  radius: number(Length),
  numSides: number(_),
  center: Point2d,
  inscribed?: bool,
): Sketch
```

**Arguments:**
- `sketchOrSurface`: Sketch | Plane | Face (required) - Plane or surface to sketch on.
- `radius`: number(Length) (required) - The radius of the polygon.
- `numSides`: number(_) (required) - The number of sides in the polygon.
- `center`: Point2d (required) - The center point of the polygon.
- `inscribed`: bool (optional) - Whether the polygon is inscribed (true, the default) or circumscribed (false) about a circle with the specified radius.

**Returns:** Sketch

---

#### profileStart

Extract the provided 2-dimensional sketch's profile's origin value.

```kcl
profileStart(@profile: Sketch): Point2d
```

**Arguments:**
- `profile`: Sketch (required) - Profile whose start is being used.

**Returns:** Point2d

---

#### profileStartX

Extract the provided 2-dimensional sketch's profile's origin's 'x' value.

```kcl
profileStartX(@profile: Sketch): number(Length)
```

**Arguments:**
- `profile`: Sketch (required) - Profile whose start is being used.

**Returns:** number(Length)

---

#### profileStartY

Extract the provided 2-dimensional sketch's profile's origin's 'y' value.

```kcl
profileStartY(@profile: Sketch): number(Length)
```

**Arguments:**
- `profile`: Sketch (required) - Profile whose start is being used.

**Returns:** number(Length)

---

#### rectangle

Sketch a rectangle.

```kcl
rectangle(
  @sketchOrSurface: Sketch | Plane | Face,
  width: number(Length),
  height: number(Length),
  center?: Point2d,
  corner?: Point2d,
): Sketch
```

**Arguments:**
- `sketchOrSurface`: Sketch | Plane | Face (required) - Sketch to extend, or plane or surface to sketch on.
- `width`: number(Length) (required) - Rectangle's width along X axis.
- `height`: number(Length) (required) - Rectangle's height along Y axis.
- `center`: Point2d (optional) - The center of the rectangle. Either `corner` or `center` is required, but not both.
- `corner`: Point2d (optional) - The corner of the rectangle. Either `corner` or `center` is required, but not both. This will be the corner which is most negative on both X and Y axes.

**Returns:** Sketch

---

#### revolve

Rotate a sketch around some provided axis, creating a solid from its extent.

```kcl
revolve(
  @sketches: [Sketch; 1+],
  axis: Axis2d | Edge,
  angle?: number(Angle),
  tolerance?: number(Length),
  symmetric?: bool,
  bidirectionalAngle?: number(Angle),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): [Solid; 1+]
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - The sketch or set of sketches that should be revolved
- `axis`: Axis2d | Edge (required) - Axis of revolution.
- `angle`: number(Angle) (optional) - Angle to revolve (in degrees). Default is 360.
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.
- `symmetric`: bool (optional) - If true, the extrusion will happen symmetrically around the sketch. Otherwise, the extrusion will happen on only one side of the sketch.
- `bidirectionalAngle`: number(Angle) (optional) - If specified, will also revolve in the opposite direction to 'angle' to the specified angle. If 'symmetric' is true, this value is ignored.
- `tagStart`: TagDecl (optional) - A named tag for the face at the start of the revolve, i.e. the original sketch.
- `tagEnd`: TagDecl (optional) - A named tag for the face at the end of the revolve.

**Returns:** [Solid; 1+]

---

#### segAng

Compute the angle (in degrees) of the provided line segment.

```kcl
segAng(@tag: TaggedEdge): number(Angle)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Angle)

---

#### segEnd

Compute the ending point of the provided line segment.

```kcl
segEnd(@tag: TaggedEdge): Point2d
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** Point2d

---

#### segEndX

Compute the ending point of the provided line segment along the 'x' axis.

```kcl
segEndX(@tag: TaggedEdge): number(Length)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Length)

---

#### segEndY

Compute the ending point of the provided line segment along the 'y' axis.

```kcl
segEndY(@tag: TaggedEdge): number(Length)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Length)

---

#### segLen

Compute the length of the provided line segment.

```kcl
segLen(@tag: TaggedEdge): number(Length)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Length)

---

#### segStart

Compute the starting point of the provided line segment.

```kcl
segStart(@tag: TaggedEdge): Point2d
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** Point2d

---

#### segStartX

Compute the starting point of the provided line segment along the 'x' axis.

```kcl
segStartX(@tag: TaggedEdge): number(Length)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Length)

---

#### segStartY

Compute the starting point of the provided line segment along the 'y' axis.

```kcl
segStartY(@tag: TaggedEdge): number(Length)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Length)

---

#### startProfile

Start a new profile at a given point.

```kcl
startProfile(
  @startProfileOn: Plane | Face,
  at: Point2d,
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `startProfileOn`: Plane | Face (required) - What to start the profile on.
- `at`: Point2d (required) - Where to start the profile. An absolute point.
- `tag`: TagDecl (optional) - Tag this first starting point.

**Returns:** Sketch

---

#### startSketchOn

Start a new 2-dimensional sketch on a specific plane or face.

```kcl
startSketchOn(
  @planeOrSolid: Solid | Plane,
  face?: TaggedFace,
  normalToFace?: TaggedFace,
  alignAxis?: Axis2d,
  normalOffset?: number(Length),
): Plane | Face
```

**Arguments:**
- `planeOrSolid`: Solid | Plane (required) - Profile whose start is being used.
- `face`: TaggedFace (optional) - Identify a face of a solid if a solid is specified as the input argument (`planeOrSolid`). Incompatible with `normalToFace`.
- `normalToFace`: TaggedFace (optional) - Identify a face of a solid if a solid is specified as the input argument. Starts a sketch on the plane orthogonal to this specified face. Incompatible with `face`, requires `alignAxis`.
- `alignAxis`: Axis2d (optional) - If sketching normal to face, this axis will be the new local x axis of the sketch plane. The selected face's normal will be the local y axis. Incompatible with `face`, requires `normalToFace`.
- `normalOffset`: number(Length) (optional) - Offset the sketch plane along its normal by the given amount. Incompatible with `face`, requires `normalToFace`.

**Returns:** Plane | Face

---

#### subtract2d

Use a 2-dimensional sketch to cut a hole in another 2-dimensional sketch.

```kcl
subtract2d(
  @sketch: Sketch,
  tool: [Sketch; 1+],
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `tool`: [Sketch; 1+] (required) - The shape(s) which should be cut out of the sketch.

**Returns:** Sketch

---

#### sweep

Extrude a sketch along a path.

```kcl
sweep(
  @sketches: [Sketch; 1+],
  path: Sketch | Helix,
  sectional?: bool,
  tolerance?: number(Length),
  relativeTo?: string,
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): [Solid; 1+]
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - The sketch or set of sketches that should be swept in space.
- `path`: Sketch | Helix (required) - The path to sweep the sketch along.
- `sectional`: bool (optional) - If true, the sweep will be broken up into sub-sweeps (extrusions, revolves, sweeps) based on the trajectory path components.
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.
- `relativeTo`: string (optional) - What is the sweep relative to? Can be either 'sketchPlane' or 'trajectoryCurve'.
- `tagStart`: TagDecl (optional) - A named tag for the face at the start of the sweep, i.e. the original sketch.
- `tagEnd`: TagDecl (optional) - A named tag for the face at the end of the sweep.

**Returns:** [Solid; 1+]

---

#### tangentialArc

Starting at the current sketch's origin, draw a curved line segment along some part of an imaginary circle until it reaches the desired (x, y) coordinates.

```kcl
tangentialArc(
  @sketch: Sketch,
  endAbsolute?: Point2d,
  end?: Point2d,
  radius?: number(Length),
  diameter?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `endAbsolute`: Point2d (optional) - Which absolute point should this arc go to? Incompatible with `end`, `radius`, and `offset`.
- `end`: Point2d (optional) - How far away (along the X and Y axes) should this arc go? Incompatible with `endAbsolute`, `radius`, and `offset`.
- `radius`: number(Length) (optional) - Radius of the imaginary circle. `angle` must be given. Incompatible with `end` and `endAbsolute` and `diameter`.
- `diameter`: number(Length) (optional) - Diameter of the imaginary circle. `angle` must be given. Incompatible with `end` and `endAbsolute` and `radius`.
- `angle`: number(Angle) (optional) - Offset of the arc. `radius` must be given. Incompatible with `end` and `endAbsolute`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this arc.

**Returns:** Sketch

---

#### tangentToEnd

Returns the angle coming out of the end of the segment in degrees.

```kcl
tangentToEnd(@tag: TaggedEdge): number(Angle)
```

**Arguments:**
- `tag`: TaggedEdge (required) - The line segment being queried by its tag.

**Returns:** number(Angle)

---

#### xLine

Draw a line relative to the current origin to a specified distance away from the current position along the 'x' axis.

```kcl
xLine(
  @sketch: Sketch,
  length?: number(Length),
  endAbsolute?: number(Length),
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `length`: number(Length) (optional) - How far away along the X axis should this line go? Incompatible with `endAbsolute`.
- `endAbsolute`: number(Length) (optional) - Which absolute X value should this line go to? Incompatible with `length`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

#### yLine

Draw a line relative to the current origin to a specified distance away from the current position along the 'y' axis.

```kcl
yLine(
  @sketch: Sketch,
  length?: number(Length),
  endAbsolute?: number(Length),
  tag?: TagDecl,
): Sketch
```

**Arguments:**
- `sketch`: Sketch (required) - Which sketch should this path be added to?
- `length`: number(Length) (optional) - How far away along the Y axis should this line go? Incompatible with `endAbsolute`.
- `endAbsolute`: number(Length) (optional) - Which absolute Y value should this line go to? Incompatible with `length`.
- `tag`: TagDecl (optional) - Create a new tag which refers to this line.

**Returns:** Sketch

---

### std::solid

#### appearance

Set the appearance of a solid. This only works on solids, not sketches or individual paths.

```kcl
appearance(
  @solids: [Solid; 1+] | ImportedGeometry,
  color: string,
  metalness?: number(_),
  roughness?: number(_),
): [Solid; 1+] | ImportedGeometry
```

**Arguments:**
- `solids`: [Solid; 1+] | ImportedGeometry (required) - The The solid(s) whose appearance is being set.
- `color`: string (required) - Color of the new material, a hex string like '#ff0000'.
- `metalness`: number(_) (optional) - Metalness of the new material, a percentage like 95.7.
- `roughness`: number(_) (optional) - Roughness of the new material, a percentage like 95.7.

**Returns:** [Solid; 1+] | ImportedGeometry

---

#### chamfer

Cut a straight transitional edge along a tagged path.

```kcl
chamfer(
  @solid: Solid,
  length: number(Length),
  tags: [Edge; 1+],
  secondLength?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
): Solid
```

**Arguments:**
- `solid`: Solid (required) - The solid whose edges should be chamfered
- `length`: number(Length) (required) - Chamfering cuts away two faces to create a third face. This is the length to chamfer away from each face. The larger this length to chamfer away, the larger the new face will be.
- `tags`: [Edge; 1+] (required) - The paths you want to chamfer
- `secondLength`: number(Length) (optional) - Chamfering cuts away two faces to create a third face. If this argument isn't given, the lengths chamfered away from both the first and second face are both given by `length`. If this argument _is_ given, it determines how much is cut away from the second face. Incompatible with `angle`.
- `angle`: number(Angle) (optional) - Chamfering cuts away two faces to create a third face. This argument determines the angle between the two cut edges. Requires `length`, incompatible with `secondLength`. The valid range is 0deg < angle < 90deg.
- `tag`: TagDecl (optional) - Create a new tag which refers to this chamfer

**Returns:** Solid

---

#### fillet

Blend a transitional edge along a tagged path, smoothing the sharp edge.

```kcl
fillet(
  @solid: Solid,
  radius: number(Length),
  tags: [Edge; 1+],
  tolerance?: number(Length),
  tag?: TagDecl,
): Solid
```

**Arguments:**
- `solid`: Solid (required) - The solid whose edges should be filletted
- `radius`: number(Length) (required) - The radius of the fillet
- `tags`: [Edge; 1+] (required) - The paths you want to fillet
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.
- `tag`: TagDecl (optional) - Create a new tag which refers to this fillet

**Returns:** Solid

---

#### hollow

Make the inside of a 3D object hollow.

```kcl
hollow(
  @solid: Solid,
  thickness: number(Length),
): Solid
```

**Arguments:**
- `solid`: Solid (required) - Which solid to hollow out
- `thickness`: number(Length) (required) - The thickness of the remaining shell

**Returns:** Solid

---

#### intersect

Intersect returns the shared volume between multiple solids, preserving only overlapping regions.

```kcl
intersect(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
): [Solid; 1+]
```

**Arguments:**
- `solids`: [Solid; 2+] (required) - The solids to intersect.
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.

**Returns:** [Solid; 1+]

---

#### patternCircular3d

Repeat a 3-dimensional solid some number of times along a partial or complete circle some specified number of times. Each object may additionally be rotated along the circle, ensuring orientation of the solid with respect to the center of the circle is maintained.

```kcl
patternCircular3d(
  @solids: [Solid; 1+],
  instances: number(_),
  axis: Axis3d | Point3d,
  center: Point3d,
  arcDegrees?: number(deg),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Solid; 1+]
```

**Arguments:**
- `solids`: [Solid; 1+] (required) - The solid(s) to pattern.
- `instances`: number(_) (required) - The number of total instances. Must be greater than or equal to 1. This includes the original entity. For example, if instances is 2, there will be two copies -- the original, and one new copy. If instances is 1, this has no effect.
- `axis`: Axis3d | Point3d (required) - The axis of the pattern. A 3D vector.
- `center`: Point3d (required) - The center about which to make the pattern. This is a 3D vector.
- `arcDegrees`: number(deg) (optional) - "The arc angle to place the repetitions. Must be greater than 0.
- `rotateDuplicates`: bool (optional) - Whether or not to rotate the duplicates as they are copied.
- `useOriginal`: bool (optional) - If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid.

**Returns:** [Solid; 1+]

---

#### patternLinear3d

Repeat a 3-dimensional solid along a linear path, with a dynamic amount of distance between each repetition, some specified number of times.

```kcl
patternLinear3d(
  @solids: [Solid; 1+],
  instances: number(_),
  distance: number(Length),
  axis: Axis3d | Point3d,
  useOriginal?: bool,
): [Solid; 1+]
```

**Arguments:**
- `solids`: [Solid; 1+] (required) - The solid(s) to duplicate.
- `instances`: number(_) (required) - The number of total instances. Must be greater than or equal to 1. This includes the original entity. For example, if instances is 2, there will be two copies -- the original, and one new copy. If instances is 1, this has no effect.
- `distance`: number(Length) (required) - Distance between each repetition. Also known as 'spacing'.
- `axis`: Axis3d | Point3d (required) - The axis of the pattern. A 3D vector.
- `useOriginal`: bool (optional) - If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid.

**Returns:** [Solid; 1+]

---

#### patternTransform

Repeat a 3-dimensional solid, changing it each time.

```kcl
patternTransform(
  @solids: [Solid; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: bool,
): [Solid; 1+]
```

**Arguments:**
- `solids`: [Solid; 1+] (required) - The solid(s) to duplicate.
- `instances`: number(_) (required) - The number of total instances. Must be greater than or equal to 1. This includes the original entity. For example, if instances is 2, there will be two copies -- the original, and one new copy. If instances is 1, this has no effect.
- `transform`: fn(number(_)): { } (required) - How each replica should be transformed. The transform function takes a single parameter: an integer representing which number replication the transform is for. E.g. the first replica to be transformed will be passed the argument `1`. This simplifies your math: the transform function can rely on id `0` being the original instance passed into the `patternTransform`. See the examples.
- `useOriginal`: bool (optional) - If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid.

**Returns:** [Solid; 1+]

---

#### shell

Remove volume from a 3-dimensional shape such that a wall of the provided thickness remains, taking volume starting at the provided face, leaving it open in that direction.

```kcl
shell(
  @solids: [Solid; 1+],
  thickness: number(Length),
  faces: [TaggedFace; 1+],
): [Solid]
```

**Arguments:**
- `solids`: [Solid; 1+] (required) - Which solid (or solids) to shell out
- `thickness`: number(Length) (required) - The thickness of the shell
- `faces`: [TaggedFace; 1+] (required) - The faces you want removed

**Returns:** [Solid]

---

#### subtract

Subtract removes tool solids from base solids, leaving the remaining material.

```kcl
subtract(
  @solids: [Solid; 1+],
  tools: [Solid],
  tolerance?: number(Length),
): [Solid; 1+]
```

**Arguments:**
- `solids`: [Solid; 1+] (required) - The solids to use as the base to subtract from.
- `tools`: [Solid] (required) - The solids to subtract.
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.

**Returns:** [Solid; 1+]

---

#### union

Union two or more solids into a single solid.

```kcl
union(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
): [Solid; 1+]
```

**Arguments:**
- `solids`: [Solid; 2+] (required) - The solids to union.
- `tolerance`: number(Length) (optional) - Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar. For most use cases, it should not be changed from its default value of 10^-7 millimeters.

**Returns:** [Solid; 1+]

---

### std::transform

#### mirror2d

Mirror a sketch.

```kcl
mirror2d(
  @sketches: [Sketch; 1+],
  axis: Axis2d | Edge,
): Sketch
```

**Arguments:**
- `sketches`: [Sketch; 1+] (required) - The sketch or sketches to be reflected.
- `axis`: Axis2d | Edge (required) - The axis to reflect around.

**Returns:** Sketch

---

#### rotate

Rotate a solid or a sketch.

```kcl
rotate(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  roll?: number(Angle),
  pitch?: number(Angle),
  yaw?: number(Angle),
  axis?: Axis3d | Point3d,
  angle?: number(Angle),
  global?: bool,
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry
```

**Arguments:**
- `objects`: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry (required) - The solid, sketch, or set of solids or sketches to rotate.
- `roll`: number(Angle) (optional) - The roll angle. Must be between -360deg and 360deg.
- `pitch`: number(Angle) (optional) - The pitch angle. Must be between -360deg and 360deg.
- `yaw`: number(Angle) (optional) - The yaw angle. Must be between -360deg and 360deg.
- `axis`: Axis3d | Point3d (optional) - The axis to rotate around. Must be used with `angle`.
- `angle`: number(Angle) (optional) - The angle to rotate. Must be used with `axis`. Must be between -360deg and 360deg.
- `global`: bool (optional) - If true, the transform is applied in global space. The origin of the model will move. By default, the transform is applied in local sketch axis, therefore the origin will not move.

**Returns:** [Solid; 1+] | [Sketch; 1+] | ImportedGeometry

---

#### scale

Scale a solid or a sketch.

```kcl
scale(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  x?: number(_),
  y?: number(_),
  z?: number(_),
  global?: bool,
  factor?: number(_),
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry
```

**Arguments:**
- `objects`: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry (required) - The solid, sketch, or set of solids or sketches to scale.
- `x`: number(_) (optional) - The scale factor for the x axis.
- `y`: number(_) (optional) - The scale factor for the y axis.
- `z`: number(_) (optional) - The scale factor for the z axis.
- `global`: bool (optional) - If true, the transform is applied in global space. The origin of the model will move. By default, the transform is applied in local sketch axis, therefore the origin will not move.
- `factor`: number(_) (optional) - If given, scale the solid by this much. Equivalent to setting `x`, `y` and `z` all to this number. Incompatible with `x`, `y` or `z`.

**Returns:** [Solid; 1+] | [Sketch; 1+] | ImportedGeometry

---

#### translate

Move a solid or a sketch.

```kcl
translate(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  x?: number(Length),
  y?: number(Length),
  z?: number(Length),
  global?: bool,
  xyz?: [number(Length); 3],
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry
```

**Arguments:**
- `objects`: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry (required) - The solid, sketch, or set of solids or sketches to move.
- `x`: number(Length) (optional) - The amount to move the solid or sketch along the x axis.
- `y`: number(Length) (optional) - The amount to move the solid or sketch along the y axis.
- `z`: number(Length) (optional) - The amount to move the solid or sketch along the z axis.
- `global`: bool (optional) - If true, the transform is applied in global space. The origin of the model will move. By default, the transform is applied in local sketch axis, therefore the origin will not move.
- `xyz`: [number(Length); 3] (optional) - If given, interpret this point as 3 distances, along each of [X, Y, Z] and translate by each of them.

**Returns:** [Solid; 1+] | [Sketch; 1+] | ImportedGeometry

---

### std::units

#### units::toCentimeters

Convert a number to centimeters from its current units.

```kcl
units::toCentimeters(@num: number(Length)): number(cm)
```

**Arguments:**
- `num`: number(Length) (required) - A number.

**Returns:** number(cm)

---

#### units::toDegrees

Converts a number to degrees from its current units.

```kcl
units::toDegrees(@num: number(Angle)): number(deg)
```

**Arguments:**
- `num`: number(Angle) (required) - A number.

**Returns:** number(deg)

---

#### units::toFeet

Convert a number to feet from its current units.

```kcl
units::toFeet(@num: number(Length)): number(ft)
```

**Arguments:**
- `num`: number(Length) (required) - A number.

**Returns:** number(ft)

---

#### units::toInches

Convert a number to inches from its current units.

```kcl
units::toInches(@num: number(Length)): number(in)
```

**Arguments:**
- `num`: number(Length) (required) - A number.

**Returns:** number(in)

---

#### units::toMeters

Convert a number to meters from its current units.

```kcl
units::toMeters(@num: number(Length)): number(m)
```

**Arguments:**
- `num`: number(Length) (required) - A number.

**Returns:** number(m)

---

#### units::toMillimeters

Convert a number to millimeters from its current units.

```kcl
units::toMillimeters(@num: number(Length)): number(mm)
```

**Arguments:**
- `num`: number(Length) (required) - A number.

**Returns:** number(mm)

---

#### units::toRadians

Converts a number to radians from its current units.

```kcl
units::toRadians(@num: number(Angle)): number(rad)
```

**Arguments:**
- `num`: number(Angle) (required) - A number.

**Returns:** number(rad)

---

#### units::toYards

Converts a number to yards from its current units.

```kcl
units::toYards(@num: number(Length)): number(yd)
```

**Arguments:**
- `num`: number(Length) (required) - A number.

**Returns:** number(yd)

---

### std::vector

#### vector::add

Adds every element of u to its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise addition.

```kcl
vector::add(
  @u: [number],
  v: [number],
): [number]
```

**Arguments:**
- `u`: [number] (required) - 
- `v`: [number] (required) - 

**Returns:** [number]

---

#### vector::cross

Find the cross product of two 3D points or vectors.

```kcl
vector::cross(
  @u: Point3d,
  v: Point3d,
)
```

**Arguments:**
- `u`: Point3d (required) - A point in three dimensional space.
- `v`: Point3d (required) - A point in three dimensional space.

---

#### vector::div

Divides every element of u by its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise division.

```kcl
vector::div(
  @u: [number],
  v: [number],
): [number]
```

**Arguments:**
- `u`: [number] (required) - 
- `v`: [number] (required) - 

**Returns:** [number]

---

#### vector::dot

Find the dot product of two points or vectors of any dimension.

```kcl
vector::dot(
  @u: [number],
  v: [number],
): number
```

**Arguments:**
- `u`: [number] (required) - 
- `v`: [number] (required) - 

**Returns:** number

---

#### vector::magnitude

Find the Euclidean distance of a vector.

```kcl
vector::magnitude(@v: [number]): number
```

**Arguments:**
- `v`: [number] (required) - 

**Returns:** number

---

#### vector::mul

Multiplies every element of u by its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise multiplication.

```kcl
vector::mul(
  @u: [number],
  v: [number],
): [number]
```

**Arguments:**
- `u`: [number] (required) - 
- `v`: [number] (required) - 

**Returns:** [number]

---

#### vector::normalize

Normalize a vector (with any number of dimensions)

```kcl
vector::normalize(@v: [number]): [number]
```

**Arguments:**
- `v`: [number] (required) - 

**Returns:** [number]

---

#### vector::sub

Subtracts from every element of u its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise subtraction.

```kcl
vector::sub(
  @u: [number],
  v: [number],
): [number]
```

**Arguments:**
- `u`: [number] (required) - 
- `v`: [number] (required) - 

**Returns:** [number]

---

## Types

### any

The `any` type is the type of all possible values in KCL. I.e., if a function accepts an argument with type `any`, then it can accept any value.

---

### Axis2d

An abstract and infinite line in 2d space.

---

### Axis3d

An abstract and infinite line in 3d space.

---

### bool

A boolean value.

`true` or `false`.

---

### cm

---

### deg

---

### Edge

An edge of a solid.

---

### Face

A face of a solid.

---

### fn

The type of any function in KCL.

---

### ft

---

### GdtAnnotation

A GD&T annotation.

---

### Helix

A helix; created by the `helix` function.

---

### ImportedGeometry

Represents geometry which is defined using some other CAD system and imported into KCL.

---

### in

---

### m

---

### mm

---

### none

The type of the none (aka null) value.

Note that this is not the empty type, i.e., a type which represents no values.

---

### number

A number.

May be signed or unsigned, an integer or decimal value.

KCL numbers always include units, e.g., the number `42` is always '42 mm' or '42 degrees', etc.
it is never just '42'. The `number` type may or may not include units, if none are specified, then
it is the type of any number. E.g.,

- `number`: the type of any numbers,
- `number(mm)`: the type of numbers in millimeters,
- `number(in)`: the type of numbers in inches,
- `number(Length)`: the type of numbers in any length unit,
- `number(deg)`...

---

### Plane

An abstract plane.

A plane has a position and orientation in space defined by its origin and axes. A plane is abstract
in the sense that it is not part of the objects being drawn. A plane can be used to sketch on.

A plane can be created in several ways:
- you can use one of the default planes, e.g., `XY`.
- you can use `offsetPlane` to create a new plane offset from an existing one, e.g., `offsetPlane(XY, offset = 150)`.
- you can use negation to create a plane from an existing one which is identical but has an o...

---

### Point2d

A point in two dimensional space.

`Point2d` is an alias for a two-element array of [number](/docs/kcl-std/types/std-types-number)s. To write a value
with type `Point2d`, use an array, e.g., `[0, 0]` or `[5.0, 3.14]`.

---

### Point3d

A point in three dimensional space.

`Point3d` is an alias for a three-element array of [number](/docs/kcl-std/types/std-types-number)s. To write a value
with type `Point3d`, use an array, e.g., `[0, 0, 0]` or `[5.0, 3.14, 6.8]`.

---

### rad

---

### Sketch

A sketch is a collection of paths.

When you define a sketch to a variable like:

```js
mySketch = startSketchOn(XY)
    |> startProfile(at = [-12, 12])
    |> line(end = [24, 0])
    |> line(end = [0, -24])
    |> line(end = [-24, 0])
    |> close()
```

The `mySketch` variable will be an executed `Sketch` object. Executed being past
tense, because the engine has already executed the commands to create the sketch.

The previous sketch commands will never be executed again, in this case.

If you would like to encapsulate the comma...

---

### Solid

A solid is a collection of extruded surfaces.

When you define a solid to a variable like:

```js
myPart = startSketchOn(XY)
    |> startProfile(at = [-12, 12])
    |> line(end = [24, 0])
    |> line(end = [0, -24])
    |> line(end = [-24, 0])
    |> close()
    |> extrude(length = 6)
```

The `myPart` variable will be an executed `Solid` object. Executed being past
tense, because the engine has already executed the commands to create the solid.

The previous solid commands will never be executed again, in this case.

If you would like to en...

---

### string

A sequence of characters

Strings may be delimited using either single or double quotes.

---

### TagDecl

Tags are used to give a name (tag) to a specific path.

### Tag Declaration

The syntax for declaring a tag is `$myTag`. You would use it in the following
way:

```js
startSketchOn(XZ)
  |> startProfile(at = origin)
  |> angledLine(angle = 0, length = 191.26, tag = $rectangleSegmentA001)
  |> angledLine(
       angle = segAng(rectangleSegmentA001) - 90deg,
       length = 196.99,
       tag = $rectangleSegmentB001,
     )
  |> angledLine(
       angle = segAng(rectangleSegmentA001),
       length = -segLen(rectangleSegmentA001),
       tag = $rectang...

---

### TaggedEdge

A tag which references a line, arc, or other edge in a sketch or an edge of a solid.

Created by using a tag declarator (see the docs for `TagDecl`). Can be used where an `Edge` is
required.

If a line in a sketch is tagged and then the sketch is extruded, the tag is a `TaggedEdge` before
extrusion and a `TaggedFace` after extrusion.

---

### TaggedFace

A tag which references a face of a solid, including the distinguished tags `START` and `END`.

Created by using a tag declarator (see the docs for `TagDecl`).

If a line in a sketch is tagged and then the sketch is extruded, the tag is a `TaggedEdge` before
extrusion and a `TaggedFace` after extrusion.

---

### yd

---

## Constants

### END

Identifies the ending face of an extrusion. I.e., the new face created by an extrusion.

```kcl
END
```

**Type:** TaggedFace

---

### MERGE

Specifies that the extrusion will be pulled into or pushed out of the existing object, modifying it without creating a new object.

```kcl
MERGE
```

**Type:** string

---

### NEW

Specifies that a new object is created during extrusion.

```kcl
NEW
```

**Type:** string

---

### START

Identifies the starting face of an extrusion. I.e., the face which is extruded.

```kcl
START
```

**Type:** TaggedFace

---

### X

The X-axis (can be used in both 2d and 3d contexts).

```kcl
X
```

**Type:** Axis3d

---

### XY

An abstract 3d plane aligned with the X and Y axes. Its normal is the positive Z axis.

```kcl
XY
```

**Type:** Plane

---

### XZ

An abstract 3d plane aligned with the X and Z axes. Its normal is the negative Y axis.

```kcl
XZ
```

**Type:** Plane

---

### Y

The Y-axis (can be used in both 2d and 3d contexts).

```kcl
Y
```

**Type:** Axis3d

---

### YZ

An abstract 3d plane aligned with the Y and Z axes. Its normal is the positive X axis.

```kcl
YZ
```

**Type:** Plane

---

### Z

The 3D Z-axis.

```kcl
Z
```

**Type:** Axis3d

---

### E

The value of Euler’s number `e`.

```kcl
E = 2.71828182845904523536028747135266250_
```

**Type:** number

---

### PI

The value of `pi`, Archimedes’ constant (π).

```kcl
PI = 3.14159265358979323846264338327950288_?
```

**Type:** number(_?)

---

### TAU

The value of `tau`, the full circle constant (τ). Equal to 2π.

```kcl
TAU = 6.28318530717958647692528676655900577_
```

**Type:** number

---

### sweep::SKETCH_PLANE

Local/relative to a position centered within the plane being sketched on

```kcl
sweep::SKETCH_PLANE = 'sketchPlane'
```

**Type:** string

---

### sweep::TRAJECTORY

Local/relative to the trajectory curve

```kcl
sweep::TRAJECTORY = 'trajectoryCurve'
```

**Type:** string

---

### turns::HALF_TURN

A half turn, 180 degrees or π radians.

```kcl
turns::HALF_TURN = 180deg
```

**Type:** number(deg)

---

### turns::QUARTER_TURN

A quarter turn, 90 degrees or π/2 radians.

```kcl
turns::QUARTER_TURN = 90deg
```

**Type:** number(deg)

---

### turns::THREE_QUARTER_TURN

Three quarters of a turn, 270 degrees or 1.5*π radians.

```kcl
turns::THREE_QUARTER_TURN = 270deg
```

**Type:** number(deg)

---

### turns::ZERO

No turn, zero degrees/radians.

```kcl
turns::ZERO
```

**Type:** number(Angle)

---

