# kcl-std — std.solver

25 top-level symbols. Signatures are verbatim kcl.

// Category: std.solver
// Create a point in a sketch
// std.solver.solver::point (function)
solver::point(at: Point2d): Segment
//   at: The point's position in the sketch's local 2D coordinate system
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 3mm])
//     edge3 = line(start = [var 4mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     inside = point(at = [var 1mm, var 1mm])
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Create a straight line segment in a sketch
// std.solver.solver::line (function)
solver::line(
  start: Point2d,
  end: Point2d,
  construction?: bool,
): Segment
//   start: The segment's start point in sketch coordinates
//   end: The segment's end point in sketch coordinates
//   construction: Whether this segment is construction geometry rather than part of the modeled profile
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 5mm, var 0mm])
//     edge2 = line(start = [var 5mm, var 0mm], end = [var 5mm, var 3mm])
//     edge3 = line(start = [var 5mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Create a circular arc
// Remarks: Use `direction = CW` to sweep the other way around the circle without swapping the start and end points. This is the same shape as the first example, but the arc travels from the base line's start to its end.
// std.solver.solver::arc (function)
solver::arc(
  start: Point2d,
  end: Point2d,
  center: Point2d,
  direction?: string,
  construction?: bool,
): Segment
//   start: The point where the arc begins
//   end: The point where the arc ends
//   center: The center of the circle the arc lies on
//   direction: The direction that the arc sweeps from start to end
//   construction: Whether this segment is construction geometry rather than part of the modeled profile
// Example:
//   profile = sketch(on = XY) {
//     base = line(start = [var -5mm, var 0mm], end = [var 5mm, var 0mm])
//     top = arc(start = [var 5mm, var 0mm], end = [var -5mm, var 0mm], center = [var 0mm, var 5mm])
//     coincident([base.end, top.start])
//     coincident([base.start, top.end])
//   }
//   
//   solid = extrude(region(segments = [profile.base, profile.top]), length = 2)

// Category: std.solver
// Create a circle in a sketch
// Remarks: The starting point is currently free to float around the circumference of the circle. So if you want to fully constrain the circle, you'll need to fix the start point to somewhere along the circumference. We suggest adding `vertical([myCircle.start, myCircle.center])` or `horizontal([myCircle.start, myCircle.center])`.
// std.solver.solver::circle (function)
solver::circle(
  start: Point2d,
  center: Point2d,
  construction?: bool,
): Segment
//   start: A point on the circle that sets where the circle starts
//   center: The center of the circle
//   construction: Whether this segment is construction geometry rather than part of the modeled profile
// Example:
//   profile = sketch(on = XY) {
//     circle1 = circle(start = [var 2mm, var 0mm], center = [var 0mm, var 0mm], construction = true)
//     edge1 = line(start = [var -3mm, var -2mm], end = [var 3mm, var -2mm])
//     edge2 = line(start = [var 3mm, var -2mm], end = [var 3mm, var 2mm])
//     edge3 = line(start = [var 3mm, var 2mm], end = [var -3mm, var 2mm])
//     edge4 = line(start = [var -3mm, var 2mm], end = [var -3mm, var -2mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//   }
//   
//   solid = extrude(region(segments = [profile.circle1, profile.edge1]), length = 2)

// Category: std.solver
// Create a control-point spline in a sketch
// Remarks: The spline is defined by a control polygon. The curve generally passes through the first and last control points and is shaped by the interior control points. The minimum input is three control points. The current degree policy is: - 3 control points -> degree 2 - 4 or more control points -> degree 3
// EXPERIMENTAL
// std.solver.solver::controlPointSpline (function)
solver::controlPointSpline(
  points: [Point2d; 3+],
  construction?: bool,
): Segment
//   points: The ordered control points of the spline's control polygon
//   construction: Whether this segment is construction geometry rather than part of the modeled profile
// Example:
//   @settings(experimentalFeatures = allow)
//   
//   profile = sketch(on = XY) {
//     spline1 = controlPointSpline(points = [
//       [var 0mm, var 0mm],
//       [var 20mm, var 30mm],
//       [var 40mm, var 0mm],
//       [var 60mm, var 20mm],
//     ])
//   }

// Category: std.solver
// Constrain points, or a point and a segment to be coincident
// Remarks: Supports two points, or one point and one segment (line/arc). A single `Point2d` (e.g. `[1mm, 2.5mm]`) can be used to pin a point to a fixed position.
// std.solver.solver::coincident (function)
solver::coincident(@points: [Segment | Point2d; 2+])
//   @points: Two or more sketch entities that should be coincident
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 3mm])
//     edge3 = line(start = [var 4mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Constrain the distance between two sketch entities
// Remarks: The distance is always non-negative, and the order of the two entities does not matter: `distance([a, b]) == 5mm` and `distance([b, a]) == 5mm` are the same constraint. This differs from `horizontalDistance` and `verticalDistance`, which are signed and order-sensitive. Supported entity pairs (in either order): - Two points: the straight-line distance between them. - Point and line: the perpendicular distance from the point to the infinite line through the line segment. - Two lines: constrains the lines to be parallel and separated by the given perpendicular distance. - Point and circle: the gap between the point and the nearest point on the circle's perimeter, with the point kept outside the circle. - Line and circle: the gap between the circle's perimeter and the infinite line through the line segment, with the circle kept to one side of the line. - Two circles: the gap between the two perimeters, with each circle kept outside the other. A point may be `ORIGIN`, and arcs are treated as the full circle through them.
// std.solver.solver::distance (function)
solver::distance(
  @points: [Segment | Point2d; 2],
  labelPosition?: Point2d,
)
//   @points: Two sketch entities, or one sketch entity and `ORIGIN`, whose separation should match the value set with `==`
//   labelPosition: Optional position for the displayed constraint label in the sketch's local 2D coordinate system
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 3mm])
//     edge3 = line(start = [var 4mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     distance([edge1.start, edge2.end]) == 5mm
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Constrain the radius of an arc or circle segment
// std.solver.solver::radius (function)
solver::radius(
  @points: Segment,
  labelPosition?: Point2d,
)
//   @points: The arc or circle segment whose radius should match the value set with `==`
//   labelPosition: Optional position for the displayed constraint label in the sketch's local 2D coordinate system
// Example:
//   profile = sketch(on = XY) {
//     base = line(start = [var -4mm, var 0mm], end = [var 4mm, var 0mm])
//     arch = arc(start = [var 4mm, var 0mm], end = [var -4mm, var 0mm], center = [var 0mm, var 0mm])
//     coincident([base.end, arch.start])
//     coincident([base.start, arch.end])
//     radius(arch) == 4mm
//   }
//   
//   solid = extrude(region(segments = [profile.base, profile.arch]), length = 2)

// Category: std.solver
// Constrain the diameter of an arc or circle segment
// std.solver.solver::diameter (function)
solver::diameter(
  @points: Segment,
  labelPosition?: Point2d,
)
//   @points: The arc or circle segment whose diameter should match the value set with `==`
//   labelPosition: Optional position for the displayed constraint label in the sketch's local 2D coordinate system
// Example:
//   profile = sketch(on = XY) {
//     guide = circle(start = [var 2mm, var 0mm], center = [var 0mm, var 0mm], construction = true)
//     diameter(guide) == 4mm
//     edge1 = line(start = [var -3mm, var -2mm], end = [var 3mm, var -2mm])
//     edge2 = line(start = [var 3mm, var -2mm], end = [var 3mm, var 2mm])
//     edge3 = line(start = [var 3mm, var 2mm], end = [var -3mm, var 2mm])
//     edge4 = line(start = [var -3mm, var 2mm], end = [var -3mm, var -2mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//   }
//   
//   solid = extrude(region(segments = [profile.guide, profile.edge1]), length = 2)

// Category: std.solver
// Constrain the horizontal distance between two points
// Remarks: The distance is signed, so the order of the points matters: the value set with `==` equals the second point's X coordinate minus the first point's X coordinate. A positive value places the second point at a greater X than the first, and swapping the points negates the sign. For example, `horizontalDistance([ORIGIN, point]) == 5mm` places `point` at X = 5mm, while `horizontalDistance([point, ORIGIN]) == 5mm` places it at X = -5mm. Negative values are valid: if the second point is left of the first, use a negative value (or swap the points and use the corresponding positive value).
// std.solver.solver::horizontalDistance (function)
solver::horizontalDistance(
  @points: [Segment | Point2d; 2],
  labelPosition?: Point2d,
)
//   @points: Two sketch points, or one sketch point and `ORIGIN`
//   labelPosition: Optional position for the displayed constraint label in the sketch's local 2D coordinate system
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     edge2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     edge3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     edge4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontalDistance([edge4.start, edge2.start]) == 6mm
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Constrain the vertical distance between two points
// Remarks: The distance is signed, so the order of the points matters: the value set with `==` equals the second point's Y coordinate minus the first point's Y coordinate. A positive value places the second point at a greater Y than the first, and swapping the points negates the sign. For example, `verticalDistance([ORIGIN, point]) == 5mm` places `point` at Y = 5mm, while `verticalDistance([point, ORIGIN]) == 5mm` places it at Y = -5mm. Negative values are valid: if the second point is below the first, use a negative value (or swap the points and use the corresponding positive value).
// std.solver.solver::verticalDistance (function)
solver::verticalDistance(
  @points: [Segment | Point2d; 2],
  labelPosition?: Point2d,
)
//   @points: Two sketch points, or one sketch point and `ORIGIN`
//   labelPosition: Optional position for the displayed constraint label in the sketch's local 2D coordinate system
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 5mm])
//     edge3 = line(start = [var 4mm, var 5mm], end = [var 0mm, var 5mm])
//     edge4 = line(start = [var 0mm, var 5mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     verticalDistance([edge1.start, edge4.start]) == 5mm
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Constrain lines to have equal length
// std.solver.solver::equalLength (function)
solver::equalLength(@lines: [Segment; 2+])
//   @lines: Two or more line segments that should all share the same length
// Example:
//   profile = sketch(on = XY) {
//     base = line(start = [var -3mm, var 0mm], end = [var 3mm, var 0mm])
//     side1 = line(start = [var 3mm, var 0mm], end = [var 0mm, var 4mm])
//     side2 = line(start = [var 0mm, var 4mm], end = [var -3mm, var 0mm])
//     coincident([base.end, side1.start])
//     coincident([side1.end, side2.start])
//     coincident([side2.end, base.start])
//     horizontal(base)
//     equalLength([side1, side2])
//   }
//   
//   solid = extrude(region(segments = [profile.base, profile.side1]), length = 2)

// Category: std.solver
// Constrain circular segments to have equal radius
// std.solver.solver::equalRadius (function)
solver::equalRadius(@input: [Segment; 2+])
//   @input: Two or more arc or circle segments that should share the same radius
// Example:
//   @settings(kclVersion = 2.0)
//   
//   sketch1 = sketch(on = XY) {
//     circle1 = circle(start = [var -2mm, var 0mm], center = [var -6mm, var 0mm])
//     circle2 = circle(start = [var 10mm, var 0mm], center = [var 6mm, var 0mm])
//     equalRadius([circle1, circle2])
//   }
//   
//   solid1 = extrude(region(segments = [sketch1.circle1]), length = 2)
//   solid2 = extrude(region(segments = [sketch1.circle2]), length = 2)

// Category: std.solver
// Constrain lines to be parallel
// std.solver.solver::parallel (function)
solver::parallel(@input: [Segment; 2+])
//   @input: The line segments that should remain parallel
// Example:
//   profile = sketch(on = XY) {
//     base = line(start = [var 0mm, var 0mm], end = [var 5mm, var 0mm])
//     right = line(start = [var 5mm, var 0mm], end = [var 4mm, var 3mm])
//     top = line(start = [var 4mm, var 3mm], end = [var 1mm, var 3mm])
//     left = line(start = [var 1mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([base.end, right.start])
//     coincident([right.end, top.start])
//     coincident([top.end, left.start])
//     coincident([left.end, base.start])
//     parallel([base, top])
//   }
//   
//   solid = extrude(region(segments = [profile.base, profile.right]), length = 2)

// Category: std.solver
// Constrain lines to be perpendicular
// Remarks: Currently limited to two lines.
// std.solver.solver::perpendicular (function)
solver::perpendicular(@input: [Segment; 2+])
//   @input: The line segments that should remain perpendicular
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 3mm])
//     edge3 = line(start = [var 4mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     perpendicular([edge1, edge2])
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Constrain lines to meet at a given angle
// Remarks: Deprecated as of KCL 2.0. Use `angleDimension` for new angle constraints. The angle is measured counterclockwise from the first line to the second line, modulo 180 degrees, so the order of the lines matters: `angle([a, b]) == 30deg` is equivalent to `angle([b, a]) == 150deg`. Because the angle is measured modulo 180 degrees, it does not matter which end of each line segment is its start or end.
// DEPRECATED: Deprecated in KCL 2.0.
// std.solver.solver::angle (function)
solver::angle(
  @input: [Segment; 2],
  labelPosition?: Point2d,
)
//   @input: The two line segments whose relative angle should match the value set with `==`, measured counterclockwise from the first line to the second, modulo 180 degrees
//   labelPosition: The desired position of the constraint label
// Example:
//   profile = sketch(on = XY) {
//     line1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     line2 = line(start = [var 0mm, var 0mm], end = [var 2mm, var 3.464mm])
//     line3 = line(start = [var 2mm, var 3.464mm], end = [var 4mm, var 0mm])
//     coincident([line1.start, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line1.end])
//     angle([line1, line2]) == 60deg
//   }
//   
//   solid = extrude(region(segments = [profile.line1, profile.line2]), length = 2)

// Category: std.solver
// Constrain the angle in the selected sector between two lines
// std.solver.solver::angleDimension (function)
solver::angleDimension(
  lines: [Segment; 2],
  sector: number(_),
  inverse?: bool,
  labelPosition?: Point2d,
)
//   lines: The ordered pair of line segments whose selected angle sector should match the value set with `==`
//   sector: Which counterclockwise sweep about the line intersection to constrain
//   inverse: Use the counterclockwise sweep from the selected sector's end direction to its start direction
//   labelPosition: The desired position of the constraint label
// Example:
//   normalProfile = sketch(on = XY) {
//     line1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     line2 = line(start = [var 0mm, var 0mm], end = [var 2mm, var 3.464mm])
//     line3 = line(start = [var 2mm, var 3.464mm], end = [var 4mm, var 0mm])
//     coincident([line1.start, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line1.end])
//     angleDimension(lines = [line1, line2], sector = 1, inverse = false) == 60deg
//   }
//   
//   inverseProfile = sketch(on = XY) {
//     line1 = line(start = [var 7mm, var 0mm], end = [var 11mm, var 0mm])
//     line2 = line(start = [var 7mm, var 0mm], end = [var 9mm, var 3.464mm])
//     line3 = line(start = [var 9mm, var 3.464mm], end = [var 11mm, var 0mm])
//     coincident([line1.start, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line1.end])
//     angleDimension(lines = [line1, line2], sector = 1, inverse = true) == 300deg
//   }
//   
//   normalSolid = extrude(region(segments = [normalProfile.line1, normalProfile.line2]), length = 2)
//   inverseSolid = extrude(region(segments = [inverseProfile.line1, inverseProfile.line2]), length = 2)

// Category: std.solver
// Constrain two segments to be tangent
// Remarks: Supported input type pairs (unordered): - `Line` / `Circle` - `Line` / `CircularArc` - `Circle` / `Circle` - `Circle` / `CircularArc` - `CircularArc` / `CircularArc`
// std.solver.solver::tangent (function)
solver::tangent(@input: [Segment; 2])
//   @input: Two supported line/arc/circle segments that should touch without crossing
// Example:
//   profile = sketch(on = XY) {
//     guideArc = arc(start = [var 0mm, var 2mm], end = [var 2mm, var 0mm], center = [var 2mm, var 2mm])
//     tangentLine = line(start = [var 0mm, var 2mm], end = [var 0mm, var 4mm])
//     tangent([tangentLine, guideArc])
//     coincident([tangentLine.start, guideArc.start])
//     line1 = line(start = [var 0mm, var 4mm], end = [var 2mm, var 0mm])
//     coincident([guideArc.end, line1.end])
//     coincident([tangentLine.end, line1.start])
//   }
//   
//   solid = extrude(region(segments = [profile.guideArc, profile.tangentLine]), length = 2)

// Category: std.solver
// Constrain a point to lie at the midpoint of a line segment or circular arc
// std.solver.solver::midpoint (function)
solver::midpoint(
  @input: Segment,
  point: Segment | Point2d,
)
//   @input: The line or circular arc whose midpoint is constrained
//   point: The point to place at the midpoint
// Example:
//   profile = sketch(on = XY) {
//     line1 = line(start = [var 0mm, var 0mm], end = [var 5mm, var 3mm])
//     coincident([line1.start, ORIGIN])
//   
//     arc1 = arc(start = [var 2mm, var 1mm], end = [var -3mm, var -2mm], center = [var 0mm, var 0mm])
//     radius(arc1) == 3mm
//     coincident([arc1.center, line1.start])
//     coincident([arc1.start, line1])
//     midpoint(line1, point = arc1.start)
//   
//     line2 = line(start = [var -1mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([line2.start, arc1])
//     coincident([line2.end, arc1.center])
//     midpoint(arc1, point = line2.start)
//   }
//   solid = extrude(region(segments = [profile.line1, profile.arc1]), length = 5)

// Category: std.solver
// Constrain two points, lines, arcs, or circles to be symmetric across an axis line
// Remarks: Supported homogeneous input pairs: - `Point` / `Point` - `Line` / `Line` - `CircularArc` / `CircularArc` - `Circle` / `Circle` Symmetric `Line`s are at opposite angles (reflected across the axis). Symmetric `CircularArc`s have equal diameters and centers. Note that the `Symmetric` constraint does _not_ affect the position (i.e. the start and end points) of Lines or Arcs. To make their positions symmetric too, add another Symmetric constraint on their start and endpoints.
// std.solver.solver::symmetric (function)
solver::symmetric(
  @input: [Segment; 2],
  axis: Segment,
)
//   @input: Exactly two points, lines, arcs, or circles of the same kind
//   axis: The line to mirror across
// Example:
//   profile = sketch(on = XY) {
//     left = line(start = [var 0mm, var 0mm], end = [var 0mm, var 4mm])
//     right = line(start = [var 4mm, var 0mm], end = [var 4mm, var 4mm])
//     axis = line(start = [var 2.26mm, var -1mm], end = [var 2.26mm, var 4.25mm], construction = true)
//     symmetric([left, right], axis = axis)
//     coincident([left.end, axis.end])
//     coincident([right.end, axis.end])
//     line1 = line(start = [var 4.35mm, var 0mm], end = [var 0.43mm, var 0mm])
//     coincident([line1.start, right.start])
//     coincident([line1.end, left.start])
//     coincident([axis.start, ORIGIN])
//   }
//   
//   solid = extrude(region(segments = [profile.left, profile.right]), length = 2)

// Category: std.solver
// Constrain a point to be fixed to a position
// Remarks: `fixed()` is an alias for `coincident()`. By convention, `fixed()` is used when one of the points is a known location, not solved with constraints and not another point in the sketch. Calling `fixed()` with one segment, such as `fixed(edge)`, is invalid and produces an argument error. `fixed()` requires an array of at least two points or segments. To anchor a point to a fixed position, pass both values, for example `fixed([edge.start, ORIGIN])`. See [coincident()](/docs/kcl-std/functions/std-solver-coincident) for more info.
// std.solver.solver::fixed (function)
solver::fixed(@points: [Segment | Point2d; 2+])
//   @points: Two or more sketch entities that should be coincident
// Example:
//   profile = sketch(on = XY) {
//     edge = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     fixed([edge.start, ORIGIN])
//     horizontal(edge)
//     horizontalDistance([edge.start, edge.end]) == 10mm
//   }

// Category: std.solver
// Constrain a line, or a list of points, to be horizontal
// std.solver.solver::horizontal (function)
solver::horizontal(@input: Segment | [Segment | Point2d; 2+])
//   @input: Either - A single line segment that should remain horizontal
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 3mm])
//     edge3 = line(start = [var 4mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// Constrain a line, or a list of points, to be vertical
// std.solver.solver::vertical (function)
solver::vertical(@input: Segment | [Segment | Point2d; 2+])
//   @input: Either - A single line segment that should remain vertical
// Example:
//   profile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 4mm, var 0mm])
//     edge2 = line(start = [var 4mm, var 0mm], end = [var 4mm, var 3mm])
//     edge3 = line(start = [var 4mm, var 3mm], end = [var 0mm, var 3mm])
//     edge4 = line(start = [var 0mm, var 3mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     vertical(edge2)
//   }
//   
//   solid = extrude(region(segments = [profile.edge1, profile.edge2]), length = 2)

// Category: std.solver
// The origin point in a sketch
solver::ORIGIN: Point2d

// Category: std.solver
// Functions for sketch-solve using constraints
// Remarks: ```kcl,inline,sketchSolve triangle = sketch(on = XY) { line1 = line(start = [var -0.05mm, var -0.01mm], end = [var 3.88mm, var 0.81mm]) line2 = line(start = [var 3.88mm, var 0.81mm], end = [var 0.92mm, var 4.67mm]) coincident([line1.end, line2.start]) line3 = line(start = [var 0.92mm, var 4.67mm], end = [var -0.03mm, var -0.04mm]) coincident([line2.end, line3.start]) coincident([line1.start, line3.end]) horizontal(line1) equalLength([line2, line3]) } triangleRegion = region(segments = [triangle.line1, triangle.line2]) extrude(triangleRegion, length = 5) ``` In the above example, the `sketch(on = XY) { ... }` is called the sketch block. Inside the curly braces, all the functions and constants in this module are in scope and available. Values introduced with `var` are only initial guesses for the solver. They are starting positions or starting sizes, not locked values, and the solver is free to change them in the final solved sketch. For that reason, initial guesses should always be literals. Do not use identifiers, constant references, or computed expressions as initial guesses. For example, use `var 0mm` or `var 10mm`, not `var width`, `var baseRadius`, or `var (plateWidth / 2)`. If a value must stay fixed, put that value in the constraint itself. Constants and expressions belong in `distance`, `radius`, `diameter`, `horizontalDistance`, `verticalDistance`, and similar constraint functions, because those are what actually constrain the solved result.
solver
