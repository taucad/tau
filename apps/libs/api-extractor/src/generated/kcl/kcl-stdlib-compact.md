# KCL Standard Library Reference

## Functions

// Compute the absolute value of a number.
abs(@input: number): number

// Compute the arccosine of a number.
acos(@num: number(_)): number(rad)

// Draw a line segment relative to the current origin using the polar measure of some angle and distance.
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

// Draw an angled line from the current origin, constructing a line segment such that the newly created line intersects the desired target line segment.
angledLineThatIntersects(
  @sketch: Sketch,
  angle: number(Angle),
  intersectTag: TaggedEdge,
  offset?: number(Length),
  tag?: TagDecl,
): Sketch

// Set the appearance of a solid. This only works on solids, not sketches or individual paths.
appearance(
  @solids: [Solid; 1+] | ImportedGeometry,
  color: string,
  metalness?: number(_),
  roughness?: number(_),
): [Solid; 1+] | ImportedGeometry

// Build a color from its red, green and blue components. These must be between 0 and 255.
appearance::hexString(@rgb: [number(_); 3]): string

// Draw a curved line segment along an imaginary circle.
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

// Compute the arcsine of a number.
asin(@num: number(_)): number(rad)

// Check a value meets some expected conditions at runtime. Program terminates with an error if conditions aren't met. If you provide multiple conditions, they will all be checked and all must be met.
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

// Asserts that a value is the boolean value true.
assertIs(
  @actual: bool,
  error?: string,
)

// Compute the arctangent of a number.
atan(@num: number(_)): number(rad)

// Compute the four quadrant arctangent of Y and X.
atan2(
  y: number(Length),
  x: number(Length),
): number(rad)

// Draw a smooth, continuous, curved line segment from the current origin to the desired (x, y), using a number of control points to shape the curve's shape.
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

// Compute the smallest integer greater than or equal to a number.
ceil(@input: number): number

// Cut a straight transitional edge along a tagged path.
chamfer(
  @solid: Solid,
  length: number(Length),
  tags: [Edge; 1+],
  secondLength?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
): Solid

// Construct a 2-dimensional circle, of the specified radius, centered at the provided (x, y) origin point.
circle(
  @sketchOrSurface: Sketch | Plane | Face,
  center?: Point2d,
  radius?: number(Length),
  diameter?: number(Length),
  tag?: TagDecl,
): Sketch

// Construct a circle derived from 3 points.
circleThreePoint(
  @sketchOrSurface: Sketch | Plane | Face,
  p1: Point2d,
  p2: Point2d,
  p3: Point2d,
  tag?: TagDecl,
): Sketch

// Clone a sketch or solid.
clone(@geometry: Sketch | Solid | ImportedGeometry): Sketch | Solid | ImportedGeometry

// Construct a line segment from the current origin back to the profile's origin, ensuring the resulting 2-dimensional sketch is not open-ended.
close(
  @sketch: Sketch,
  tag?: TagDecl,
): Sketch

// Combine two arrays into one by concatenating them.
concat(
  @array: [any],
  items: [any],
): [any]

// Add a conic section to an existing sketch.
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

// Compute the cosine of a number.
cos(@num: number(Angle)): number

// Find the number of elements in an array.
count(@array: [any]): number

// Construct a 2-dimensional ellipse, of the specified major/minor radius, centered at the provided (x, y) point.
ellipse(
  @sketchOrSurface: Sketch | Plane | Face,
  center: Point2d,
  minorRadius: number(Length),
  majorRadius?: number(Length),
  majorAxis?: Point2d,
  tag?: TagDecl,
): Sketch

// Add an elliptic section to an existing sketch.
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

// Calculate the point (x, y) on an ellipse given x or y and the center and major/minor radii of the ellipse.
ellipticPoint(
  majorRadius: number,
  minorRadius: number,
  x?: number(Length),
  y?: number(Length),
): Point2d

// Extend a 2-dimensional sketch through a third dimension in order to create new 3-dimensional volume, or if extruded into an existing volume, cut into an existing solid.
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

// Blend a transitional edge along a tagged path, smoothing the sharp edge.
fillet(
  @solid: Solid,
  radius: number(Length),
  tags: [Edge; 1+],
  tolerance?: number(Length),
  tag?: TagDecl,
): Solid

// Compute the largest integer less than or equal to a number.
floor(@input: number): number

// GD&T datum feature.
gdt::datum(
  face: TaggedFace,
  name: string,
  framePosition?: Point2d,
  framePlane?: Plane,
  fontPointSize?: number(_),
  fontScale?: number(_),
): GdtAnnotation

// GD&T annotation specifying how flat faces should be.
gdt::flatness(
  faces: [TaggedFace; 1+],
  tolerance: number(Length),
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  fontPointSize?: number(_),
  fontScale?: number(_),
): [GdtAnnotation; 1+]

// Get the shared edge between two faces.
getCommonEdge(faces: [TaggedFace; 2]): Edge

// Get the next adjacent edge to the edge given.
getNextAdjacentEdge(@edge: TaggedEdge): Edge

// Get the opposite edge to the edge given.
getOppositeEdge(@edge: TaggedEdge): Edge

// Get the previous adjacent edge to the edge given.
getPreviousAdjacentEdge(@edge: TaggedEdge): Edge

// Create a helix.
helix(
  revolutions: number(_),
  angleStart: number(Angle),
  ccw?: bool,
  radius?: number(Length),
  axis?: Axis3d | Edge,
  length?: number(Length),
  cylinder?: Solid,
): Helix

// The hole has the given blind depth.
hole::blind(
  depth: number(Length),
  diameter: number(Length),
)

// Cut a straight vertical counterbore at the top of the hole. Typically used when a fastener (e.g. the head cap on a screw) needs to sit flush with the solid's surface.
hole::counterbore(
  diameter: number(Length),
  depth: number(Length),
)

// Cut an angled countersink at the top of the hole. Typically used when a conical screw head has to sit flush with the surface being cut into.
hole::countersink(
  diameter: number(Length),
  angle: number(Angle),
)

// End the hole in an angle, like the end of a drill.
hole::drill(pointAngle: number(Angle))

// End the hole flat.
hole::flat()

// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at the given 2D position on the given face.
hole::hole(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutAt: [number(Length); 2],
)

// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at each of the given 2D positions on the given face. Basically like function `hole` but it takes multiple 2D positions in `cutsAt`.
hole::holes(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutsAt: [[number(Length); 2]],
)

// Place the given holes in a line. Basically like function `hole` but cuts multiple holes in a line. Works like linear patterns.
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

// A hole top with no decoration.
hole::simple()

// Make the inside of a 3D object hollow.
hollow(
  @solid: Solid,
  thickness: number(Length),
): Solid

// Add a hyperbolic section to an existing sketch.
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

// Calculate the point (x, y) on a hyperbola given x or y and the semi major/minor values of the hyperbolic.
hyperbolicPoint(
  semiMajor: number,
  semiMinor: number,
  x?: number(Length),
  y?: number(Length),
): Point2d

// Intersect returns the shared volume between multiple solids, preserving only overlapping regions.
intersect(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
): [Solid; 1+]

// Extend the current sketch with a new involute circular curve.
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

// Extract the 'x' axis value of the last line segment in the provided 2-d sketch.
lastSegX(@sketch: Sketch): number(Length)

// Extract the 'y' axis value of the last line segment in the provided 2-d sketch.
lastSegY(@sketch: Sketch): number(Length)

// Compute the angle of the given leg for x.
legAngX(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)

// Compute the angle of the given leg for y.
legAngY(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)

// Compute the length of the given leg.
legLen(
  hypotenuse: number(Length),
  leg: number(Length),
): number(Length)

// Extend the current sketch with a new straight line.
line(
  @sketch: Sketch,
  endAbsolute?: Point2d,
  end?: Point2d,
  tag?: TagDecl,
): Sketch

// Compute the natural logarithm of the number.
ln(@input: number): number

// Create a 3D surface or solid by interpolating between two or more sketches.
loft(
  @sketches: [Sketch; 2+],
  vDegree?: number(_),
  bezApproximateRational?: bool,
  baseCurveIndex?: number(_),
  tolerance?: number(Length),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): Solid

// Compute the logarithm of the number with respect to an arbitrary base.
log(
  @input: number,
  base: number(_),
): number

// Compute the base 10 logarithm of the number.
log10(@input: number): number

// Compute the base 2 logarithm of the number.
log2(@input: number): number

// Apply a function to every element of a list.
map(
  @array: [any],
  f: fn(any): any,
): [any]

// Compute the maximum of the given arguments.
max(@input: [number; 1+]): number

// Compute the minimum of the given arguments.
min(@input: [number; 1+]): number

// Mirror a sketch.
mirror2d(
  @sketches: [Sketch; 1+],
  axis: Axis2d | Edge,
): Sketch

// Offset a plane by a distance along its normal.
offsetPlane(
  @plane: Plane,
  offset: number(Length),
): Plane

// Add a parabolic segment to an existing sketch.
parabolic(
  @sketch: Sketch,
  end: Point2d,
  endAbsolute?: Point2d,
  coefficients?: [number; 3],
  interior?: Point2d,
  interiorAbsolute?: Point2d,
  tag?: TagDecl,
): Sketch

// Calculate the point (x, y) on a parabola given x or y and the coefficients [a, b, c] of the parabola.
parabolicPoint(
  coefficients: [number; 3],
  x?: number(Length),
  y?: number(Length),
): Point2d

// Repeat a 2-dimensional sketch some number of times along a partial or complete circle some specified number of times. Each object may additionally be rotated along the circle, ensuring orientation of the solid with respect to the center of the circle is maintained.
patternCircular2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  center: Point2d,
  arcDegrees?: number(Angle),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Sketch; 1+]

// Repeat a 3-dimensional solid some number of times along a partial or complete circle some specified number of times. Each object may additionally be rotated along the circle, ensuring orientation of the solid with respect to the center of the circle is maintained.
patternCircular3d(
  @solids: [Solid; 1+],
  instances: number(_),
  axis: Axis3d | Point3d,
  center: Point3d,
  arcDegrees?: number(deg),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Solid; 1+]

// Repeat a 2-dimensional sketch along some dimension, with a dynamic amount of distance between each repetition, some specified number of times.
patternLinear2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  distance: number(Length),
  axis: Axis2d | Point2d,
  useOriginal?: bool,
): [Sketch; 1+]

// Repeat a 3-dimensional solid along a linear path, with a dynamic amount of distance between each repetition, some specified number of times.
patternLinear3d(
  @solids: [Solid; 1+],
  instances: number(_),
  distance: number(Length),
  axis: Axis3d | Point3d,
  useOriginal?: bool,
): [Solid; 1+]

// Repeat a 3-dimensional solid, changing it each time.
patternTransform(
  @solids: [Solid; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: bool,
): [Solid; 1+]

// Just like `patternTransform`, but works on 2D sketches not 3D solids.
patternTransform2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: boolean,
): [Sketch; 1+]

// Find the plane a face lies on. Returns an error if the face doesn't lie on any plane (for example, the curved face of a cylinder)
planeOf(
  @solid: Solid,
  face: TaggedFace,
): Plane

// Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid) coordinates.
polar(
  angle: number(rad),
  length: number(Length),
): Point2d

// Create a regular polygon with the specified number of sides that is either inscribed or circumscribed around a circle of the specified radius.
polygon(
  @sketchOrSurface: Sketch | Plane | Face,
  radius: number(Length),
  numSides: number(_),
  center: Point2d,
  inscribed?: bool,
): Sketch

// Remove the last element from an array.
pop(@array: [any; 1+]): [any]

// Compute the number to a power.
pow(
  @input: number,
  exp: number(_),
): number

// Extract the provided 2-dimensional sketch's profile's origin value.
profileStart(@profile: Sketch): Point2d

// Extract the provided 2-dimensional sketch's profile's origin's 'x' value.
profileStartX(@profile: Sketch): number(Length)

// Extract the provided 2-dimensional sketch's profile's origin's 'y' value.
profileStartY(@profile: Sketch): number(Length)

// Append an element to the end of an array.
push(
  @array: [any],
  item: any,
): [any; 1+]

// Sketch a rectangle.
rectangle(
  @sketchOrSurface: Sketch | Plane | Face,
  width: number(Length),
  height: number(Length),
  center?: Point2d,
  corner?: Point2d,
): Sketch

// Take a starting value. Then, for each element of an array, calculate the next value, using the previous value and the element.
reduce(
  @array: [any],
  initial: any,
  f: fn(any, accum: any): any,
): any

// Compute the remainder after dividing `num` by `div`. If `num` is negative, the result will be too.
rem(
  @num: number,
  divisor: number,
): number

// Rotate a sketch around some provided axis, creating a solid from its extent.
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

// Rotate a solid or a sketch.
rotate(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  roll?: number(Angle),
  pitch?: number(Angle),
  yaw?: number(Angle),
  axis?: Axis3d | Point3d,
  angle?: number(Angle),
  global?: bool,
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry

// Round a number to the nearest integer.
round(@input: number): number

// Scale a solid or a sketch.
scale(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  x?: number(_),
  y?: number(_),
  z?: number(_),
  global?: bool,
  factor?: number(_),
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry

// Compute the angle (in degrees) of the provided line segment.
segAng(@tag: TaggedEdge): number(Angle)

// Compute the ending point of the provided line segment.
segEnd(@tag: TaggedEdge): Point2d

// Compute the ending point of the provided line segment along the 'x' axis.
segEndX(@tag: TaggedEdge): number(Length)

// Compute the ending point of the provided line segment along the 'y' axis.
segEndY(@tag: TaggedEdge): number(Length)

// Compute the length of the provided line segment.
segLen(@tag: TaggedEdge): number(Length)

// Compute the starting point of the provided line segment.
segStart(@tag: TaggedEdge): Point2d

// Compute the starting point of the provided line segment along the 'x' axis.
segStartX(@tag: TaggedEdge): number(Length)

// Compute the starting point of the provided line segment along the 'y' axis.
segStartY(@tag: TaggedEdge): number(Length)

// Remove volume from a 3-dimensional shape such that a wall of the provided thickness remains, taking volume starting at the provided face, leaving it open in that direction.
shell(
  @solids: [Solid; 1+],
  thickness: number(Length),
  faces: [TaggedFace; 1+],
): [Solid]

// Compute the sine of a number.
sin(@num: number(Angle)): number

// Compute the square root of a number.
sqrt(@input: number): number

// Start a new profile at a given point.
startProfile(
  @startProfileOn: Plane | Face,
  at: Point2d,
  tag?: TagDecl,
): Sketch

// Start a new 2-dimensional sketch on a specific plane or face.
startSketchOn(
  @planeOrSolid: Solid | Plane,
  face?: TaggedFace,
  normalToFace?: TaggedFace,
  alignAxis?: Axis2d,
  normalOffset?: number(Length),
): Plane | Face

// Subtract removes tool solids from base solids, leaving the remaining material.
subtract(
  @solids: [Solid; 1+],
  tools: [Solid],
  tolerance?: number(Length),
): [Solid; 1+]

// Use a 2-dimensional sketch to cut a hole in another 2-dimensional sketch.
subtract2d(
  @sketch: Sketch,
  tool: [Sketch; 1+],
): Sketch

// Extrude a sketch along a path.
sweep(
  @sketches: [Sketch; 1+],
  path: Sketch | Helix,
  sectional?: bool,
  tolerance?: number(Length),
  relativeTo?: string,
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): [Solid; 1+]

// Compute the tangent of a number.
tan(@num: number(Angle)): number

// Starting at the current sketch's origin, draw a curved line segment along some part of an imaginary circle until it reaches the desired (x, y) coordinates.
tangentialArc(
  @sketch: Sketch,
  endAbsolute?: Point2d,
  end?: Point2d,
  radius?: number(Length),
  diameter?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
): Sketch

// Returns the angle coming out of the end of the segment in degrees.
tangentToEnd(@tag: TaggedEdge): number(Angle)

// Move a solid or a sketch.
translate(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  x?: number(Length),
  y?: number(Length),
  z?: number(Length),
  global?: bool,
  xyz?: [number(Length); 3],
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry

// Union two or more solids into a single solid.
union(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
): [Solid; 1+]

// Convert a number to centimeters from its current units.
units::toCentimeters(@num: number(Length)): number(cm)

// Converts a number to degrees from its current units.
units::toDegrees(@num: number(Angle)): number(deg)

// Convert a number to feet from its current units.
units::toFeet(@num: number(Length)): number(ft)

// Convert a number to inches from its current units.
units::toInches(@num: number(Length)): number(in)

// Convert a number to meters from its current units.
units::toMeters(@num: number(Length)): number(m)

// Convert a number to millimeters from its current units.
units::toMillimeters(@num: number(Length)): number(mm)

// Converts a number to radians from its current units.
units::toRadians(@num: number(Angle)): number(rad)

// Converts a number to yards from its current units.
units::toYards(@num: number(Length)): number(yd)

// Adds every element of u to its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise addition.
vector::add(
  @u: [number],
  v: [number],
): [number]

// Find the cross product of two 3D points or vectors.
vector::cross(
  @u: Point3d,
  v: Point3d,
)

// Divides every element of u by its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise division.
vector::div(
  @u: [number],
  v: [number],
): [number]

// Find the dot product of two points or vectors of any dimension.
vector::dot(
  @u: [number],
  v: [number],
): number

// Find the Euclidean distance of a vector.
vector::magnitude(@v: [number]): number

// Multiplies every element of u by its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise multiplication.
vector::mul(
  @u: [number],
  v: [number],
): [number]

// Normalize a vector (with any number of dimensions)
vector::normalize(@v: [number]): [number]

// Subtracts from every element of u its corresponding element in v. Both vectors must have the same length. Returns a new vector of the same length. In other words, component-wise subtraction.
vector::sub(
  @u: [number],
  v: [number],
): [number]

// Draw a line relative to the current origin to a specified distance away from the current position along the 'x' axis.
xLine(
  @sketch: Sketch,
  length?: number(Length),
  endAbsolute?: number(Length),
  tag?: TagDecl,
): Sketch

// Draw a line relative to the current origin to a specified distance away from the current position along the 'y' axis.
yLine(
  @sketch: Sketch,
  length?: number(Length),
  endAbsolute?: number(Length),
  tag?: TagDecl,
): Sketch

## Types

- any - The `any` type is the type of all possible values in KCL. I.e., if a function accepts an argument with type `any`, then it can accept any value.
- Axis2d - An abstract and infinite line in 2d space.
- Axis3d - An abstract and infinite line in 3d space.
- bool - A boolean value.
- cm
- deg
- Edge - An edge of a solid.
- Face - A face of a solid.
- fn - The type of any function in KCL.
- ft
- GdtAnnotation - A GD&T annotation.
- Helix - A helix; created by the `helix` function.
- ImportedGeometry - Represents geometry which is defined using some other CAD system and imported into KCL.
- in
- m
- mm
- none - The type of the none (aka null) value.
- number - A number.
- Plane - An abstract plane.
- Point2d - A point in two dimensional space.
- Point3d - A point in three dimensional space.
- rad
- Sketch - A sketch is a collection of paths.
- Solid - A solid is a collection of extruded surfaces.
- string - A sequence of characters
- TagDecl - Tags are used to give a name (tag) to a specific path.
- TaggedEdge - A tag which references a line, arc, or other edge in a sketch or an edge of a solid.
- TaggedFace - A tag which references a face of a solid, including the distinguished tags `START` and `END`.
- yd

## Constants

// The value of Euler’s number `e`.
E = 2.71828182845904523536028747135266250_
// Identifies the ending face of an extrusion. I.e., the new face created by an extrusion.
END
// Specifies that the extrusion will be pulled into or pushed out of the existing object, modifying it without creating a new object.
MERGE
// Specifies that a new object is created during extrusion.
NEW
// The value of `pi`, Archimedes’ constant (π).
PI = 3.14159265358979323846264338327950288_?
// Identifies the starting face of an extrusion. I.e., the face which is extruded.
START
// Local/relative to a position centered within the plane being sketched on
sweep::SKETCH_PLANE = 'sketchPlane'
// Local/relative to the trajectory curve
sweep::TRAJECTORY = 'trajectoryCurve'
// The value of `tau`, the full circle constant (τ). Equal to 2π.
TAU = 6.28318530717958647692528676655900577_
// A half turn, 180 degrees or π radians.
turns::HALF_TURN = 180deg
// A quarter turn, 90 degrees or π/2 radians.
turns::QUARTER_TURN = 90deg
// Three quarters of a turn, 270 degrees or 1.5*π radians.
turns::THREE_QUARTER_TURN = 270deg
// No turn, zero degrees/radians.
turns::ZERO
// The X-axis (can be used in both 2d and 3d contexts).
X
// An abstract 3d plane aligned with the X and Y axes. Its normal is the positive Z axis.
XY
// An abstract 3d plane aligned with the X and Z axes. Its normal is the negative Y axis.
XZ
// The Y-axis (can be used in both 2d and 3d contexts).
Y
// An abstract 3d plane aligned with the Y and Z axes. Its normal is the positive X axis.
YZ
// The 3D Z-axis.
Z
