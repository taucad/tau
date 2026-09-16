# kcl-std — std.sketch

52 top-level symbols. Signatures are verbatim kcl.

// Start a new 2-dimensional sketch on a specific plane or face
startSketchOn(
  @planeOrSolid: Solid | Plane,
  face?: TaggedFace,
  normalToFace?: TaggedFace,
  alignAxis?: Axis2d,
  normalOffset?: number(Length),
): Plane | Face
//   @planeOrSolid: Profile whose start is being used
//   face: Identify a face of a solid if a solid is specified as the input argument (`planeOrSolid`)
//   normalToFace: Identify a face of a solid if a solid is specified as the input argument
//   alignAxis: If sketching normal to face, this axis will be the new local x axis of the sketch plane
//   normalOffset: Offset the sketch plane along its normal by the given amount

// Start a new profile at a given point
startProfile(
  @startProfileOn: Plane | Face,
  at: Point2d,
  tag?: TagDecl,
): Sketch
//   @startProfileOn: What to start the profile on
//   at: Where to start the profile
//   tag: Tag this first starting point

// Sketch a rectangle
rectangle(
  @sketchOrSurface: Sketch | Plane | Face,
  width: number(Length),
  height: number(Length),
  center?: Point2d,
  corner?: Point2d,
): Sketch
//   @sketchOrSurface: Sketch to extend, or plane or surface to sketch on
//   width: Rectangle's width along X axis
//   height: Rectangle's height along Y axis
//   center: The center of the rectangle
//   corner: The corner of the rectangle

// Construct a 2-dimensional circle, of the specified radius, centered at the provided (x, y) origin point
circle(
  @sketchOrSurface: Sketch | Plane | Face,
  center?: Point2d,
  radius?: number(Length),
  diameter?: number(Length),
  tag?: TagDecl,
): Sketch
//   @sketchOrSurface: Sketch to extend, or plane or surface to sketch on
//   center: The center of the circle
//   radius: The radius of the circle
//   diameter: The diameter of the circle
//   tag: Create a new tag which refers to this circle

// Construct a 2-dimensional ellipse, of the specified major/minor radius, centered at the provided (x, y) point
// EXPERIMENTAL
ellipse(
  @sketchOrSurface: Sketch | Plane | Face,
  center: Point2d,
  minorRadius: number(Length),
  majorRadius?: number(Length),
  majorAxis?: Point2d,
  tag?: TagDecl,
): Sketch
//   @sketchOrSurface: Sketch to extend, or plane or surface to sketch on
//   center: The center of the ellipse
//   minorRadius: The minor radius of the ellipse
//   majorRadius: The major radius of the ellipse
//   majorAxis: The major axis of the ellipse
//   tag: Create a new tag which refers to this ellipse

// Extend a 2-dimensional sketch through a third dimension in order to create new 3-dimensional volume, or if extruded into an existing volume, cut into an existing solid
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
//   @sketches: Which sketch or sketches should be extruded
//   length: How far to extrude the given sketches
//   to: Reference to extrude to
//   symmetric: If true, the extrusion will happen symmetrically around the sketch
//   bidirectionalLength: If specified, will also extrude in the opposite direction to 'distance' to the specified distance
//   tagStart: A named tag for the face at the start of the extrusion, i.e
//   tagEnd: A named tag for the face at the end of the extrusion, i.e
//   twistAngle: If given, the sketch will be twisted around this angle while being extruded
//   twistAngleStep: The size of each intermediate angle as the sketch twists around
//   twistCenter: The center around which the sketch will be twisted
//   method: The method used during extrusion, either `NEW` or `MERGE`

// Rotate a sketch around some provided axis, creating a solid from its extent
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
//   @sketches: The sketch or set of sketches that should be revolved
//   axis: Axis of revolution
//   angle: Angle to revolve (in degrees)
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   symmetric: If true, the extrusion will happen symmetrically around the sketch
//   bidirectionalAngle: If specified, will also revolve in the opposite direction to 'angle' to the specified angle
//   tagStart: A named tag for the face at the start of the revolve, i.e
//   tagEnd: A named tag for the face at the end of the revolve

// Just like `patternTransform`, but works on 2D sketches not 3D solids
patternTransform2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: boolean,
): [Sketch; 1+]
//   @sketches: The sketch(es) to duplicate
//   instances: The number of total instances
//   transform: How each replica should be transformed
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Get the opposite edge to the edge given
getOppositeEdge(@edge: TaggedEdge): Edge
//   @edge: The tag of the edge you want to find the opposite edge of

// Get the next adjacent edge to the edge given
getNextAdjacentEdge(@edge: TaggedEdge): Edge
//   @edge: The tag of the edge you want to find the next adjacent edge of

// Get the previous adjacent edge to the edge given
getPreviousAdjacentEdge(@edge: TaggedEdge): Edge
//   @edge: The tag of the edge you want to find the previous adjacent edge of

// Get the shared edge between two faces
getCommonEdge(faces: [TaggedFace; 2]): Edge
//   faces: The tags of the faces you want to find the common edge between

// Construct a circle derived from 3 points
circleThreePoint(
  @sketchOrSurface: Sketch | Plane | Face,
  p1: Point2d,
  p2: Point2d,
  p3: Point2d,
  tag?: TagDecl,
): Sketch
//   @sketchOrSurface: Plane or surface to sketch on
//   p1: 1st point to derive the circle
//   p2: 2nd point to derive the circle
//   p3: 3rd point to derive the circle
//   tag: Identifier for the circle to reference elsewhere

// Create a regular polygon with the specified number of sides that is either inscribed or circumscribed around a circle of the specified radius
polygon(
  @sketchOrSurface: Sketch | Plane | Face,
  radius: number(Length),
  numSides: number(_),
  center: Point2d,
  inscribed?: bool,
): Sketch
//   @sketchOrSurface: Plane or surface to sketch on
//   radius: The radius of the polygon
//   numSides: The number of sides in the polygon
//   center: The center point of the polygon
//   inscribed: Whether the polygon is inscribed (true, the default) or circumscribed (false) about a circle with the specified radius

// Extrude a sketch along a path
sweep(
  @sketches: [Sketch; 1+],
  path: Sketch | Helix,
  sectional?: bool,
  tolerance?: number(Length),
  relativeTo?: string,
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): [Solid; 1+]
//   @sketches: The sketch or set of sketches that should be swept in space
//   path: The path to sweep the sketch along
//   sectional: If true, the sweep will be broken up into sub-sweeps (extrusions, revolves, sweeps) based on the trajectory path components
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   relativeTo: What is the sweep relative to? Can be either 'sketchPlane' or 'trajectoryCurve'
//   tagStart: A named tag for the face at the start of the sweep, i.e
//   tagEnd: A named tag for the face at the end of the sweep

// Create a 3D surface or solid by interpolating between two or more sketches
loft(
  @sketches: [Sketch; 2+],
  vDegree?: number(_),
  bezApproximateRational?: bool,
  baseCurveIndex?: number(_),
  tolerance?: number(Length),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
): Solid
//   @sketches: Which sketches to loft
//   vDegree: Degree of the interpolation
//   bezApproximateRational: Attempt to approximate rational curves (such as arcs) using a bezier
//   baseCurveIndex: This can be set to override the automatically determined topological base curve, which is usually the first section encountered
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   tagStart: A named tag for the face at the start of the loft, i.e
//   tagEnd: A named tag for the face at the end of the loft

// Repeat a 2-dimensional sketch along some dimension, with a dynamic amount of distance between each repetition, some specified number of times
patternLinear2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  distance: number(Length),
  axis: Axis2d | Point2d,
  useOriginal?: bool,
): [Sketch; 1+]
//   @sketches: The sketch(es) to duplicate
//   instances: The number of total instances
//   distance: Distance between each repetition
//   axis: The axis of the pattern
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Repeat a 2-dimensional sketch some number of times along a partial or complete circle some specified number of times
patternCircular2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  center: Point2d,
  arcDegrees?: number(Angle),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Sketch; 1+]
//   @sketches: The sketch(es) to duplicate
//   instances: The number of total instances
//   center: The center about which to make the pattern
//   arcDegrees: The arc angle (in degrees) to place the repetitions
//   rotateDuplicates: Whether or not to rotate the duplicates as they are copied
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Compute the ending point of the provided line segment
segEnd(@tag: TaggedEdge): Point2d
//   @tag: The line segment being queried by its tag

// Compute the ending point of the provided line segment along the 'x' axis
segEndX(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag

// Compute the ending point of the provided line segment along the 'y' axis
segEndY(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag

// Compute the starting point of the provided line segment
segStart(@tag: TaggedEdge): Point2d
//   @tag: The line segment being queried by its tag

// Compute the starting point of the provided line segment along the 'x' axis
segStartX(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag

// Compute the starting point of the provided line segment along the 'y' axis
segStartY(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag

// Extract the 'x' axis value of the last line segment in the provided 2-d sketch
lastSegX(@sketch: Sketch): number(Length)
//   @sketch: The sketch whose line segment is being queried

// Extract the 'y' axis value of the last line segment in the provided 2-d sketch
lastSegY(@sketch: Sketch): number(Length)
//   @sketch: The sketch whose line segment is being queried

// Compute the length of the provided line segment
segLen(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag

// Compute the angle (in degrees) of the provided line segment
segAng(@tag: TaggedEdge): number(Angle)
//   @tag: The line segment being queried by its tag

// Returns the angle coming out of the end of the segment in degrees
tangentToEnd(@tag: TaggedEdge): number(Angle)
//   @tag: The line segment being queried by its tag

// Extract the provided 2-dimensional sketch's profile's origin value
profileStart(@profile: Sketch): Point2d
//   @profile: Profile whose start is being used

// Extract the provided 2-dimensional sketch's profile's origin's 'x' value
profileStartX(@profile: Sketch): number(Length)
//   @profile: Profile whose start is being used

// Extract the provided 2-dimensional sketch's profile's origin's 'y' value
profileStartY(@profile: Sketch): number(Length)
//   @profile: Profile whose start is being used

// Extend the current sketch with a new involute circular curve
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
//   @sketch: Which sketch should this path be added to?
//   angle: The angle to rotate the involute by
//   startRadius: The involute is described between two circles, startRadius is the radius of the inner circle
//   endRadius: The involute is described between two circles, endRadius is the radius of the outer circle
//   startDiameter: The involute is described between two circles, startDiameter describes the inner circle
//   endDiameter: The involute is described between two circles, endDiameter describes the outer circle
//   reverse: If reverse is true, the segment will start from the end of the involute, otherwise it will start from that start
//   tag: Create a new tag which refers to this line

// Extend the current sketch with a new straight line
line(
  @sketch: Sketch,
  endAbsolute?: Point2d,
  end?: Point2d,
  tag?: TagDecl,
): Sketch
//   @sketch: Which sketch should this path be added to?
//   endAbsolute: Which absolute point should this line go to? Incompatible with `end`
//   end: How far away (along the X and Y axes) should this line go? Incompatible with `endAbsolute`
//   tag: Create a new tag which refers to this line

// Draw a line relative to the current origin to a specified distance away from the current position along the 'x' axis
xLine(
  @sketch: Sketch,
  length?: number(Length),
  endAbsolute?: number(Length),
  tag?: TagDecl,
): Sketch
//   @sketch: Which sketch should this path be added to?
//   length: How far away along the X axis should this line go? Incompatible with `endAbsolute`
//   endAbsolute: Which absolute X value should this line go to? Incompatible with `length`
//   tag: Create a new tag which refers to this line

// Draw a line relative to the current origin to a specified distance away from the current position along the 'y' axis
yLine(
  @sketch: Sketch,
  length?: number(Length),
  endAbsolute?: number(Length),
  tag?: TagDecl,
): Sketch
//   @sketch: Which sketch should this path be added to?
//   length: How far away along the Y axis should this line go? Incompatible with `endAbsolute`
//   endAbsolute: Which absolute Y value should this line go to? Incompatible with `length`
//   tag: Create a new tag which refers to this line

// Draw a line segment relative to the current origin using the polar measure of some angle and distance
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
//   @sketch: Which sketch should this path be added to?
//   angle: Which angle should the line be drawn at?
//   length: Draw the line this distance along the given angle
//   lengthX: Draw the line this distance along the X axis
//   lengthY: Draw the line this distance along the Y axis
//   endAbsoluteX: Draw the line along the given angle until it reaches this point along the X axis
//   endAbsoluteY: Draw the line along the given angle until it reaches this point along the Y axis
//   tag: Create a new tag which refers to this line

// Draw an angled line from the current origin, constructing a line segment such that the newly created line intersects the desired target line segment
angledLineThatIntersects(
  @sketch: Sketch,
  angle: number(Angle),
  intersectTag: TaggedEdge,
  offset?: number(Length),
  tag?: TagDecl,
): Sketch
//   @sketch: Which sketch should this path be added to?
//   angle: Which angle should the line be drawn at?
//   intersectTag: The tag of the line to intersect with
//   offset: The offset from the intersecting line
//   tag: Create a new tag which refers to this line

// Construct a line segment from the current origin back to the profile's origin, ensuring the resulting 2-dimensional sketch is not open-ended
close(
  @sketch: Sketch,
  tag?: TagDecl,
): Sketch
//   @sketch: The sketch you want to close
//   tag: Create a new tag which refers to this line

// Draw a curved line segment along an imaginary circle
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
//   @sketch: Which sketch should this path be added to?
//   angleStart: Where along the circle should this arc start?
//   angleEnd: Where along the circle should this arc end?
//   radius: How large should the circle be? Incompatible with `diameter`
//   diameter: How large should the circle be? Incompatible with `radius`
//   interiorAbsolute: Any point between the arc's start and end? Requires `endAbsolute`
//   endAbsolute: Where should this arc end? Requires `interiorAbsolute`
//   tag: Create a new tag which refers to this arc

// Starting at the current sketch's origin, draw a curved line segment along some part of an imaginary circle until it reaches the desired (x, y) coordinates
tangentialArc(
  @sketch: Sketch,
  endAbsolute?: Point2d,
  end?: Point2d,
  radius?: number(Length),
  diameter?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
): Sketch
//   @sketch: Which sketch should this path be added to?
//   endAbsolute: Which absolute point should this arc go to? Incompatible with `end`, `radius`, and `offset`
//   end: How far away (along the X and Y axes) should this arc go? Incompatible with `endAbsolute`, `radius`, and `offset`
//   radius: Radius of the imaginary circle
//   diameter: Diameter of the imaginary circle
//   angle: Offset of the arc
//   tag: Create a new tag which refers to this arc

// Draw a smooth, continuous, curved line segment from the current origin to the desired (x, y), using a number of control points to shape the curve's shape
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
//   @sketch: Which sketch should this path be added to?
//   control1: First control point for the cubic
//   control2: Second control point for the cubic
//   end: How far away (along the X and Y axes) should this line go?
//   control1Absolute: First control point for the cubic
//   control2Absolute: Second control point for the cubic
//   endAbsolute: Coordinate on the plane at which this line should end
//   tag: Create a new tag which refers to this line

// Use a 2-dimensional sketch to cut a hole in another 2-dimensional sketch
subtract2d(
  @sketch: Sketch,
  tool: [Sketch; 1+],
): Sketch
//   @sketch: Which sketch should this path be added to?
//   tool: The shape(s) which should be cut out of the sketch

// Add a conic section to an existing sketch
// EXPERIMENTAL
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
//   @sketch: Which sketch should this path be added to?
//   interiorAbsolute: Any point between the segment's start and end
//   endAbsolute: Where should this segment end? Requires `interiorAbsolute`
//   interior: Any point between the segment's start and end
//   end: Where should this segment end? This point is relative to the start point
//   coefficients: The coefficients [a, b, c, d, e, f] of the generic conic equation ax^2 + by^2 + cxy + dx + ey + f = 0
//   startTangent: The tangent of the conic section at the start
//   endTangent: The tangent of the conic section at the end
//   tag: Create a new tag which refers to this segment

// Add a parabolic segment to an existing sketch
// EXPERIMENTAL
parabolic(
  @sketch: Sketch,
  end: Point2d,
  endAbsolute?: Point2d,
  coefficients?: [number; 3],
  interior?: Point2d,
  interiorAbsolute?: Point2d,
  tag?: TagDecl,
): Sketch
//   @sketch: Which sketch should this path be added to?
//   end: Where should the path end? Relative to the start point
//   endAbsolute: Where should this segment end? Requires `interiorAbsolute`
//   coefficients: The coefficients [a, b, c] of the parabolic equation y = ax^2 + bx + c
//   interior: A point between the segment's start and end that lies on the parabola
//   interiorAbsolute: Any point between the segment's start and end
//   tag: Create a new tag which refers to this segment

// Calculate the point (x, y) on a parabola given x or y and the coefficients [a, b, c] of the parabola
parabolicPoint(
  coefficients: [number; 3],
  x?: number(Length),
  y?: number(Length),
): Point2d
//   coefficients: The coefficients [a, b, c] of the parabolic equation y = ax^2 + bx + c
//   x: The x value
//   y: The y value

// Add a hyperbolic section to an existing sketch
// EXPERIMENTAL
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
//   @sketch: Which sketch should this path be added to?
//   semiMajor: The semi major value, a, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1
//   semiMinor: The semi minor value, b, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1
//   interiorAbsolute: Any point between the segment's start and end
//   endAbsolute: Where should this segment end? Requires `interiorAbsolute`
//   interior: Any point between the segment's start and end
//   end: Where should this segment end? This point is relative to the start point
//   tag: Create a new tag which refers to this arc

// Calculate the point (x, y) on a hyperbola given x or y and the semi major/minor values of the hyperbolic
hyperbolicPoint(
  semiMajor: number,
  semiMinor: number,
  x?: number(Length),
  y?: number(Length),
): Point2d
//   semiMajor: The semi major value, a, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1
//   semiMinor: The semi minor value, b, of the hyperbolic equation x^2 / a ^ 2 - y^2 / b^2 = 1
//   x: The x value
//   y: The y value

// Add an elliptic section to an existing sketch
// EXPERIMENTAL
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
//   @sketch: Which sketch should this path be added to?
//   center: The center of the ellipse
//   angleStart: Where along the ellptic should this segment start?
//   angleEnd: Where along the ellptic should this segment end?
//   minorRadius: The minor radius, b, of the elliptic equation x^2 / a^2 + y^2 / b^2 = 1
//   majorRadius: The major radius, a, of the elliptic equation x^2 / a^2 + y^2 / b^2 = 1
//   majorAxis: The major axis of the elliptic
//   tag: Create a new tag which refers to this arc

// Calculate the point (x, y) on an ellipse given x or y and the center and major/minor radii of the ellipse
ellipticPoint(
  majorRadius: number,
  minorRadius: number,
  x?: number(Length),
  y?: number(Length),
): Point2d
//   majorRadius: The major radius, a, of the elliptic equation x^2 / a ^ 2 + y^2 / b^2 = 1
//   minorRadius: The minor radius, b, of the hyperbolic equation x^2 / a ^ 2 + y^2 / b^2 = 1
//   x: The x value
//   y: The y value

// Find the plane a face lies on
planeOf(
  @solid: Solid,
  face: TaggedFace,
): Plane
//   @solid: The solid whose face is being queried
//   face: Find the plane which this face lies on

// Sketching is the foundational activity for most KCL programs
sketch
