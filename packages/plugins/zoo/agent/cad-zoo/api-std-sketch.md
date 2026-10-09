# kcl-std — std.sketch

55 top-level symbols. Signatures are verbatim kcl.

// Category: std.sketch
// Start a new 2-dimensional sketch on a specific plane or face
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). ### Sketch on Face Behavior There are some important behaviors to understand when sketching on a face: The resulting sketch will _include_ the face and thus Solid that was sketched on. So say you were to export the resulting Sketch / Solid from a sketch on a face, you would get both the artifact of the sketch on the face and the parent face / Solid itself. This is important to understand because if you were to then sketch on the resulting Solid, it would again include the face and parent Solid that was sketched on. This could go on indefinitely. The point is if you want to export the result of a sketch on a face, you only need to export the final Solid that was created from the sketch on the face, since it will include all the parent faces and Solids. See [sketch on face](/docs/kcl-lang/sketch-on-face) for more details. ### Multiple Profiles When creating multiple profiles in a sketch, each profile must be made separately and assigned to a variable. Using one pipeline to create multiple profiles, where one profile is piped into the next, is not currently supported. ```js // This does NOT work. twoSquares = startSketchOn(XY) |> startProfile(at = [0, 0]) |> line(end = [10, 0]) |> line(end = [0, 10]) |> line(end = [-10, 0]) |> close() |> startProfile(at = [20, 0]) |> line(end = [10, 0]) |> line(end = [0, 10]) |> line(end = [-10, 0]) |> close() twoCubes = extrude(twoSquares, length = 10) ``` Instead, use separate pipelines, and extrude an array of them all. ```js sketch1 = startSketchOn(XY) squareProfile1 = startProfile(sketch1, at = [0, 0]) |> line(end = [10, 0]) |> line(end = [0, 10]) |> line(end = [-10, 0]) |> close() squareProfile2 = startProfile(sketch1, at = [20, 0]) |> line(end = [10, 0]) |> line(end = [0, 10]) |> line(end = [-10, 0]) |> close() twoCubes = extrude([squareProfile1, squareProfile2], length = 10) ```
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.startSketchOn (function)
startSketchOn(
  @planeOrSolid: Solid | Plane,
  face?: TaggedFace | Segment,
  normalToFace?: TaggedFace | Segment,
  alignAxis?: Axis2d,
  normalOffset?: number(Length),
): Plane | Face
//   @planeOrSolid: Profile whose start is being used
//   face: Identify a face of a solid if a solid is specified as the input argument (`planeOrSolid`)
//   normalToFace: Identify a face of a solid if a solid is specified as the input argument
//   alignAxis: If sketching normal to face, this axis will be the new local x axis of the sketch plane
//   normalOffset: Offset the sketch plane along its normal by the given amount
// Example:
//   baseProfile = sketch(on = XY) {
//     line1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     line2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     line3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     line4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
//     coincident([line1.end, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line4.start])
//     coincident([line4.end, line1.start])
//     horizontal(line1)
//     vertical(line2)
//     horizontal(line3)
//     vertical(line4)
//   }
//   
//   baseRegion = region(segments = [baseProfile.line1, baseProfile.line2])
//   block = extrude(baseRegion, length = 4mm, tagEnd = $top)
//   
//   sideSketch = startSketchOn(block, face = top)
//     |> startProfile(at = [0.5mm, 0.5mm])
//     |> line(end = [2mm, 0mm])
//     |> line(end = [0mm, 1mm])
//     |> line(end = [-2mm, 0mm])
//     |> close()
//   
//   tower = extrude(sideSketch, length = 1mm)

// Category: std.sketch
// Start a new profile at a given point
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.startProfile (function)
startProfile(
  @startProfileOn: Plane | Face,
  at: Point2d,
  tag?: TagDecl,
): Sketch
//   @startProfileOn: What to start the profile on
//   at: Where to start the profile
//   tag: Tag this first starting point
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [10, 0])
//     |> line(end = [0, 10])
//     |> line(end = [-10, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Sketch a rectangle
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). A rectangle can be defined by its width, height, and location. Either the center or corner must be provided, but not both, to specify its location.
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.rectangle (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(-XZ)
//     |> rectangle(center = [0, 0], width = 10, height = 5)

// Category: std.sketch
// Construct a 2-dimensional circle, of the specified radius, centered at the provided (x, y) origin point
// Remarks: This is part of sketch v1 and is deprecated. In KCL 2, create a [`solver::circle`](/docs/kcl-std/functions/std-solver-circle) inside a [`sketch` block](/docs/kcl-lang/sketches), then select the closed profile with [`region`](/docs/kcl-std/functions/std-sketch-region). **Legacy KCL 1 example:** The next example uses deprecated `subtract2d`.
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.circle (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(-XZ)
//     |> circle(center = [0, 0], radius = 10)
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Construct a 2-dimensional ellipse, of the specified major/minor radius, centered at the provided (x, y) point
// Remarks: This is part of sketch v1 and is soft deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The sketch-solve version of ellipse is still under development.
// EXPERIMENTAL
// std.sketch.ellipse (function)
ellipse(
  @sketchOrSurface: Sketch | Plane | Face,
  minorRadius: number(Length),
  center?: Point2d,
  majorRadius?: number(Length),
  majorAxis?: Point2d,
  tag?: TagDecl,
): Sketch
//   @sketchOrSurface: Sketch to extend, or plane or surface to sketch on
//   minorRadius: The minor radius of the ellipse
//   center: The center of the ellipse
//   majorRadius: The major radius of the ellipse
//   majorAxis: The major axis of the ellipse
//   tag: Create a new tag which refers to this ellipse
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(experimentalFeatures = allow)
//   
//   exampleSketch = startSketchOn(XY)
//     |> ellipse(center = [0, 0], majorRadius = 50, minorRadius = 20)

// Category: std.sketch
// Extend a 2-dimensional sketch or individual segment of a sketch through a third dimension to create a new 3-dimensional volume or surface, or if extruded into an existing volume, cut into an existing solid
// Remarks: You can provide more than one sketch to extrude, and they will all be extruded in the same direction. When you sketch on a face of a solid, extruding extends or cuts into the existing solid, meaning you don't need to union or subtract the volumes. You can change this behavior by using the `method` parameter. See [sketch on face](/docs/kcl-lang/sketch-on-face) for more details.
// std.sketch.extrude (function)
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
//   @sketches: Which sketch or sketches should be extruded
//   length: How far to extrude the given sketches
//   to: Reference to extrude to
//   symmetric: If true, the extrusion will happen symmetrically around the sketch
//   direction: If specified, will extrude in this direction instead of the sketch plane normal
//   bidirectionalLength: How far to extrude opposite the primary extrusion direction
//   tagStart: A named tag for the face at the start of the extrusion, i.e
//   tagEnd: A named tag for the face at the end of the extrusion, i.e
//   draftAngle: Positive draft angle means the sketch gets smaller while extruding, i.e
//   twistAngle: If given, the sketch will be twisted around this angle while being extruded
//   twistAngleStep: The size of each intermediate angle as the sketch twists around
//   twistCenter: The center around which the sketch will be twisted
//   method: The method used during extrusion, either `NEW` or `MERGE`
//   hideSeams: Whether or not to hide the seams between the original and resulting object
//   bodyType: What type of body to produce (solid or surface)
// Example:
//   // Examples showing extrude with a positive/negative draft.
//   @settings(experimentalFeatures = allow, kclVersion = 2.0)
//   
//   sketch001 = sketch(on = XY) {
//     line1 = line(start = [var -3.39mm, var 2.51mm], end = [var -4.52mm, var 0.96mm])
//     line2 = line(start = [var -4.52mm, var 0.96mm], end = [var -2.45mm, var 0.96mm])
//     coincident([line1.end, line2.start])
//     line3 = line(start = [var -2.45mm, var 0.96mm], end = [var -3.39mm, var 2.51mm])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line1.start])
//     line4 = line(start = [var 1.62mm, var 2.61mm], end = [var 0.65mm, var 0.91mm])
//     line5 = line(start = [var 0.65mm, var 0.91mm], end = [var 2.64mm, var 0.91mm])
//     coincident([line4.end, line5.start])
//     line6 = line(start = [var 2.64mm, var 0.91mm], end = [var 1.62mm, var 2.61mm])
//     coincident([line5.end, line6.start])
//     coincident([line6.end, line4.start])
//     line7 = line(start = [var -1.2mm, var 2.56mm], end = [var -1.89mm, var 0.85mm])
//     line8 = line(start = [var -1.89mm, var 0.85mm], end = [var -0.33mm, var 0.85mm])
//     coincident([line7.end, line8.start])
//     line9 = line(start = [var -0.33mm, var 0.85mm], end = [var -1.2mm, var 2.56mm])
//     coincident([line8.end, line9.start])
//     coincident([line9.end, line7.start])
//   }
//   
//   // Three triangular regions
//   region001 = region(segments = [sketch001.line1, sketch001.line2])
//   region002 = region(segments = [sketch001.line4, sketch001.line5])
//   region003 = region(segments = [sketch001.line7, sketch001.line8])
//   hidden001 = hide(sketch001)
//   
//   // Extrude the regions, with a positive draft, negative draft, and no draft at all.
//   // Positive draft means the sketch gets _smaller_ as it gets extruded.
//   positiveDraft = extrude(region001, length = 2, draftAngle = 30deg)
//   // Negative draft means the sketch gets _bigger_ as it gets extruded.
//   negativeDraft = extrude(region002, length = 2, draftAngle = -30deg)
//   // No draft means the sketch stays the exact same size as it gets extruded.
//   zeroDraft = extrude(region003, length = 2)

// Category: std.sketch
// Rotate a sketch around some provided axis, creating a solid from its extent
// Remarks: This, like extrude, is able to create a 3-dimensional solid from a 2-dimensional sketch. However, unlike extrude, this creates a solid by using the extent of the sketch as its revolved around an axis rather than using the extent of the sketch linearly translated through a third dimension. Revolve occurs around a local sketch axis rather than a global axis. You can provide more than one sketch to revolve, and they will all be revolved around the same axis. **NOTE:** Currently,, revolved bodies don't support being scaled in a non-uniform way (i.e. scaled differently along each axis).
// std.sketch.revolve (function)
revolve(
  @sketches: [Sketch | Segment; 1+],
  axis: Axis2d | Edge | Segment | any,
  angle?: number(Angle),
  tolerance?: number(Length),
  symmetric?: bool,
  bidirectionalAngle?: number(Angle),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
  bodyType?: string,
): [Solid; 1+]
//   @sketches: The sketch or set of sketches that should be revolved, or solved sketch segments for a surface revolve
//   axis: Axis of revolution
//   angle: Angle to revolve (in degrees)
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   symmetric: If true, the extrusion will happen symmetrically around the sketch
//   bidirectionalAngle: If specified, will also revolve in the opposite direction to 'angle' to the specified angle
//   tagStart: A named tag for the face at the start of the revolve, i.e
//   tagEnd: A named tag for the face at the end of the revolve
//   bodyType: What type of body to produce (solid or surface)
// Example:
//   shellProfile = sketch(on = XY) {
//     outerWall = line(start = [var 10mm, var 0mm], end = [var 10mm, var 5mm])
//     connector = line(start = [var 10mm, var 5mm], end = [var 12mm, var 7mm])
//     innerWall = line(start = [var 12mm, var 7mm], end = [var 15mm, var 6mm])
//     coincident([outerWall.end, connector.start])
//     coincident([connector.end, innerWall.start])
//   }
//   
//   halfShell = revolve([shellProfile.outerWall, shellProfile.innerWall], axis = Y, bodyType = SURFACE, angle = 180deg)
//   closedShell = revolve([shellProfile.outerWall, shellProfile.innerWall], axis = Y, bodyType = SURFACE)
//       |> translate(z = 30)

// Category: std.sketch
// Just like `patternTransform`, but works on 2D sketches not 3D solids
// std.sketch.patternTransform2d (function)
patternTransform2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: bool,
): [Sketch; 1+]
//   @sketches: The sketch(es) to duplicate
//   instances: The number of total instances
//   transform: How each replica should be transformed
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Each instance will be shifted along the X axis.
//   fn transform(@id) {
//     return { translate = [4 * id, 0] }
//   }
//   
//   // Sketch 4 circles.
//   sketch001 = startSketchOn(XZ)
//     |> circle(center = [0, 0], radius = 2)
//     |> patternTransform2d(instances = 4, transform = transform)

// Category: std.sketch
// Get the opposite edge to the edge given
// std.sketch.getOppositeEdge (function)
getOppositeEdge(@edge: TaggedEdge): Edge
//   @edge: The tag of the edge you want to find the opposite edge of
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [10, 0])
//     |> angledLine(
//          angle = 60deg,
//          length = 10,
//        )
//     |> angledLine(
//          angle = 120deg,
//          length = 10,
//        )
//     |> line(end = [-10, 0])
//     |> angledLine(
//          angle = 240deg,
//          length = 10,
//          tag = $referenceEdge,
//        )
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)
//     |> fillet(
//       radius = 3,
//       tags = [getOppositeEdge(referenceEdge)],
//     )

// Category: std.sketch
// Get the next adjacent edge to the edge given
// std.sketch.getNextAdjacentEdge (function)
getNextAdjacentEdge(@edge: TaggedEdge): Edge
//   @edge: The tag of the edge you want to find the next adjacent edge of
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [10, 0])
//     |> angledLine(
//          angle = 60deg,
//          length = 10,
//        )
//     |> angledLine(
//          angle = 120deg,
//          length = 10,
//        )
//     |> line(end = [-10, 0])
//     |> angledLine(
//          angle = 240deg,
//          length = 10,
//          tag = $referenceEdge,
//        )
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)
//     |> fillet(
//       radius = 3,
//       tags = [getNextAdjacentEdge(referenceEdge)],
//     )

// Category: std.sketch
// Get the previous adjacent edge to the edge given
// std.sketch.getPreviousAdjacentEdge (function)
getPreviousAdjacentEdge(@edge: TaggedEdge): Edge
//   @edge: The tag of the edge you want to find the previous adjacent edge of
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [10, 0])
//     |> angledLine(
//          angle = 60deg,
//          length = 10,
//        )
//     |> angledLine(
//          angle = 120deg,
//          length = 10,
//        )
//     |> line(end = [-10, 0])
//     |> angledLine(
//          angle = 240deg,
//          length = 10,
//          tag = $referenceEdge,
//        )
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)
//     |> fillet(
//       radius = 3,
//       tags = [getPreviousAdjacentEdge(referenceEdge)],
//     )

// Category: std.sketch
// Get the shared edge between two faces
// std.sketch.getCommonEdge (function)
getCommonEdge(faces: [TaggedFace; 2]): Edge
//   faces: The tags of the faces you want to find the common edge between
// Example:
//   @settings(defaultLengthUnit = mm, kclVersion = 2.0)
//   
//   scale = 20mm
//   partSketch = sketch(on = XY) {
//     left = line(start = [var 0mm, var 0mm], end = [var 0mm, var 20mm])
//     top = line(start = [var 0mm, var 20mm], end = [var 20mm, var 20mm])
//     right = line(start = [var 20mm, var 20mm], end = [var 20mm, var 0mm])
//     line0 = line(start = [var 20mm, var 0mm], end = [var 0mm, var 0mm])
//     coincident([left.end, top.start])
//     coincident([top.end, right.start])
//     coincident([right.end, line0.start])
//     coincident([line0.end, left.start])
//   }
//   partRegion = region(segments = [partSketch.left, partSketch.top])
//   part001 = extrude(partRegion, length = scale, tagEnd = $end0)
//     |> chamfer(
//          length = 10mm,
//          tags = [getOppositeEdge(partRegion.tags.line0)],
//          tag = $chamfer0,
//        )
//   
//   // Select the edge shared by the chamfer and the extrusion's end face.
//   commonEdge = getCommonEdge(faces = [
//     part001.faces.chamfer0,
//     part001.faces.end0,
//   ])

// Category: std.sketch
// Get a bounded edge of a surface used for the [blend](/docs/kcl-std/functions/std-solid-blend) operation
// std.sketch.getBoundedEdge (function)
getBoundedEdge(
  @solid: Solid,
  edge: Edge | any,
  lowerBound?: number(_),
  upperBound?: number(_),
): BoundedEdge
//   @solid: The solid that the edge belongs to
//   edge: The edge to bound
//   lowerBound: A lower percentage bound of the edge, must be between 0 and 1 inclusive
//   upperBound: A upper percentage bound of the edge, must be between 0 and 1 inclusive
// Example:
//   sketch001 = sketch(on = YZ) {
//     line1 = line(start = [var 4.1mm, var -0.1mm], end = [var 5.5mm, var 0mm])
//     line2 = line(start = [var 5.5mm, var 0mm], end = [var 5.5mm, var 3mm])
//     line3 = line(start = [var 5.5mm, var 3mm], end = [var 3.9mm, var 2.8mm])
//     line4 = line(start = [var 4.1mm, var 3mm], end = [var 4.5mm, var -0.2mm])
//     coincident([line1.end, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line4.start])
//     coincident([line4.end, line1.start])
//   }
//   
//   sketch002 = sketch(on = -XZ) {
//     line5 = line(start = [var -5.3mm, var -0.1mm], end = [var -3.5mm, var -0.1mm])
//     line6 = line(start = [var -3.5mm, var -0.1mm], end = [var -3.5mm, var 3.1mm])
//     line7 = line(start = [var -3.5mm, var 4.5mm], end = [var -5.4mm, var 4.5mm])
//     line8 = line(start = [var -5.3mm, var 3.1mm], end = [var -5.3mm, var -0.1mm])
//     coincident([line5.end, line6.start])
//     coincident([line6.end, line7.start])
//     coincident([line7.end, line8.start])
//     coincident([line8.end, line5.start])
//   }
//   
//   region001 = region(segments = [sketch002.line5, sketch002.line6])
//   extrude001 = extrude(region001, length = -2mm, bodyType = SURFACE)
//   region002 = region(segments = [sketch001.line1, sketch001.line2])
//   extrude002 = extrude(region002, length = -2mm, bodyType = SURFACE)
//   
//   boundedEdge1 = getBoundedEdge(extrude001, edge = extrude001.sketch.tags.line7, lowerBound = 0.1, upperBound = 0.9)
//   boundedEdge2 = getBoundedEdge(extrude002, edge = extrude002.sketch.tags.line3, lowerBound = 0.4, upperBound = 0.6)
//   
//   blend([boundedEdge1, boundedEdge2])

// Category: std.sketch
// Construct a circle derived from 3 points
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.circleThreePoint (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XY)
//     |> circleThreePoint(p1 = [10,10], p2 = [20,8], p3 = [15,5])
//     |> extrude(length = 5)

// Category: std.sketch
// Create a regular polygon with the specified number of sides that is either inscribed or circumscribed around a circle of the specified radius
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.polygon (function)
polygon(
  @sketchOrSurface: Sketch | Plane | Face,
  radius: number(Length),
  numSides: number(_),
  center?: Point2d,
  inscribed?: bool,
): Sketch
//   @sketchOrSurface: Plane or surface to sketch on
//   radius: The radius of the polygon
//   numSides: The number of sides in the polygon
//   center: The center point of the polygon
//   inscribed: Whether the polygon is inscribed (true, the default) or circumscribed (false) about a circle with the specified radius
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Create a regular hexagon inscribed in a circle of radius 10
//   hex = startSketchOn(XY)
//     |> polygon(
//       radius = 10,
//       numSides = 6,
//       center = [0, 0],
//       inscribed = true,
//     )
//   
//   example = extrude(hex, length = 5)

// Category: std.sketch
// Create a 3D surface or solid by sweeping a sketch along a path
// Remarks: This, like extrude, is able to create a 3-dimensional surface or solid from a 2-dimensional sketch. However, unlike extrude, this creates a body by using the extent of the sketch as its path. This is useful for creating more complex shapes that can't be created with a simple extrusion. You can provide more than one sketch to sweep, and they will all be swept along the same path.
// std.sketch.sweep (function)
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
//   @sketches: The sketch or set of sketches that should be swept in space
//   path: The path to sweep the sketch along
//   sectional: If true, the sweep will be broken up into sub-sweeps (extrusions, revolves, sweeps) based on the trajectory path components
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   relativeTo: Use 'translateProfileToPath' and 'orientProfilePerpendicular' instead
//   translateProfileToPath: If true, the profile being swept will be moved to the path being swept along, before the sweep starts
//   orientProfilePerpendicular: If true, before the sweep starts, the profile will be re-oriented so that it is perpendicular to the path being swept along
//   tagStart: A named tag for the face at the start of the sweep, i.e
//   tagEnd: A named tag for the face at the end of the sweep
//   bodyType: What type of body to produce (solid or surface)
//   version: What version of the sweeping algorithm to use
// Example:
//   @settings(defaultLengthUnit = mm, kclVersion = 2.0)
//   
//   sweepPath = sketch(on = XZ) {
//     line1 = line(start = [var 0.05mm, var 0.05mm], end = [var 0.05mm, var 7.05mm])
//     arc2 = arc(start = [var 0.05mm, var 7.05mm], end = [var -4.95mm, var 12.05mm], center = [var -4.95mm, var 7.05mm])
//     coincident([line1.end, arc2.start])
//     line3 = line(start = [var -4.95mm, var 12.05mm], end = [var -7.95mm, var 12.05mm])
//     coincident([arc2.end, line3.start])
//     arc4 = arc(start = [var -12.95mm, var 17.05mm], end = [var -7.95mm, var 12.05mm], center = [var -7.95mm, var 17.05mm])
//     coincident([line3.end, arc4.end])
//     line5 = line(start = [var -12.95mm, var 17.05mm], end = [var -12.95mm, var 24.05mm])
//     coincident([arc4.start, line5.start])
//   }
//   
//   pipeProfile = sketch(on = XY) {
//     outerCircle = circle(start = [var 2mm, var 0mm], center = [var 0mm, var 0mm])
//     innerCircle = circle(start = [var 1.5mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   pipeRegion = region(segments = [pipeProfile.outerCircle])
//   sweepSketch = sweep(pipeRegion, path = sweepPath)

// Category: std.sketch
// Create a 3D surface or solid by interpolating between two or more sketches
// std.sketch.loft (function)
loft(
  @sketches: [Sketch | [Segment; 1+]; 2+],
  vDegree?: number(_),
  bezApproximateRational?: bool,
  baseCurveIndex?: number(_),
  tolerance?: number(Length),
  tagStart?: TagDecl,
  tagEnd?: TagDecl,
  bodyType?: string,
): Solid
//   @sketches: Which sketches to loft (or segments, for surface lofts)
//   vDegree: Degree of the interpolation
//   bezApproximateRational: Attempt to approximate rational curves (such as arcs) using a bezier
//   baseCurveIndex: This can be set to override the automatically determined topological base curve, which is usually the first section encountered
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   tagStart: A named tag for the face at the start of the loft, i.e
//   tagEnd: A named tag for the face at the end of the loft
//   bodyType: What type of body to produce (solid or surface)
// Example:
//   lowerProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     edge2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     edge3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     edge4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//   }
//   
//   upperProfile = sketch(on = offsetPlane(XY, offset = 8mm)) {
//     edge5 = line(start = [var 1.6mm, var 1mm], end = [var 4.4mm, var 1mm])
//     edge6 = line(start = [var 4.4mm, var 1mm], end = [var 3.2mm, var 2.6mm])
//     edge7 = line(start = [var 3.2mm, var 2.6mm], end = [var 2.8mm, var 2.6mm])
//     edge8 = line(start = [var 2.8mm, var 2.6mm], end = [var 1.6mm, var 1mm])
//     coincident([edge5.end, edge6.start])
//     coincident([edge6.end, edge7.start])
//     coincident([edge7.end, edge8.start])
//     coincident([edge8.end, edge5.start])
//   }
//   
//   lowerRegion = region(segments = [lowerProfile.edge1, lowerProfile.edge2])
//   upperRegion = region(segments = [upperProfile.edge5, upperProfile.edge6])
//   
//   lofted = loft([lowerRegion, upperRegion])

// Category: std.sketch
// Repeat a 2-dimensional sketch along some dimension, with a dynamic amount of distance between each repetition, some specified number of times
// Remarks: Currently, KCL's type system limitations make the type signature here misleading. This function works with Regions from the new sketch blocks (that use constraint solvers), or the old, deprecated, imperative sketch/profile syntax from older versions of KCL. It does _not_ work as expected with sketch blocks, only with the regions that can be created from sketch blocks. In the following examples, a region is passed into the pattern function, which creates new regions in a pattern. You should _not_ pass a sketch block in.
// std.sketch.patternLinear2d (function)
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
// Example:
//   // Example of pattern using a named axis.
//   
//   @settings(kclVersion = 2.0)
//   
//   exampleSketch = sketch(on = XZ) {
//     circle1 = circle(start = [var 1mm, var 0mm], center = [var 0mm, var 0mm])
//     fixed([circle1.center, ORIGIN])
//     radius(circle1) == 1mm
//   }
//   
//   exampleProfiles = region(segments = [exampleSketch.circle1])
//     |> patternLinear2d(
//          axis = X,
//          instances = 7,
//          distance = 4mm
//        )
//   
//   example = extrude(exampleProfiles, length = 1mm)
//   hide(exampleSketch)

// Category: std.sketch
// Repeat a 2-dimensional sketch some number of times along a partial or complete circle some specified number of times
// std.sketch.patternCircular2d (function)
patternCircular2d(
  @sketches: [Sketch; 1+],
  instances: number(_),
  center?: Point2d,
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [.5, 25])
//     |> line(end = [0, 5])
//     |> line(end = [-1, 0])
//     |> line(end = [0, -5])
//     |> close()
//     |> patternCircular2d(
//          center = [0, 0],
//          instances = 13,
//          arcDegrees = 360,
//          rotateDuplicates = true
//        )
//   
//   example = extrude(exampleSketch, length = 1)

// Category: std.sketch
// Compute the ending point of the provided line segment
// std.sketch.segEnd (function)
segEnd(@tag: TaggedEdge): Point2d
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   w = 15
//   cube = startSketchOn(XY)
//     |> startProfile(at = [0, 0])
//     |> line(end = [w, 0], tag = $line1)
//     |> line(end = [0, w], tag = $line2)
//     |> line(end = [-w, 0], tag = $line3)
//     |> line(end = [0, -w], tag = $line4)
//     |> close()
//     |> extrude(length = 5)
//   
//   fn cylinder(radius, tag) {
//     return startSketchOn(XY)
//     |> startProfile(at = [0, 0])
//     |> circle(radius = radius, center = segEnd(tag) )
//     |> extrude(length = radius)
//   }
//   
//   cylinder(radius = 1, tag = line1)
//   cylinder(radius = 2, tag = line2)
//   cylinder(radius = 3, tag = line3)
//   cylinder(radius = 4, tag = line4)

// Category: std.sketch
// Compute the ending point of the provided line segment along the 'x' axis
// std.sketch.segEndX (function)
segEndX(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [20, 0], tag = $thing)
//     |> line(end = [0, 5])
//     |> line(end = [segEndX(thing), 0])
//     |> line(end = [-20, 10])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Compute the ending point of the provided line segment along the 'y' axis
// std.sketch.segEndY (function)
segEndY(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [20, 0])
//     |> line(end = [0, 3], tag = $thing)
//     |> line(end = [-10, 0])
//     |> line(end = [0, segEndY(thing)])
//     |> line(end = [-10, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Compute the starting point of the provided line segment
// std.sketch.segStart (function)
segStart(@tag: TaggedEdge): Point2d
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   w = 15
//   cube = startSketchOn(XY)
//     |> startProfile(at = [0, 0])
//     |> line(end = [w, 0], tag = $line1)
//     |> line(end = [0, w], tag = $line2)
//     |> line(end = [-w, 0], tag = $line3)
//     |> line(end = [0, -w], tag = $line4)
//     |> close()
//     |> extrude(length = 5)
//   
//   fn cylinder(radius, tag) {
//     return startSketchOn(XY)
//     |> startProfile(at = [0, 0])
//     |> circle( radius = radius, center = segStart(tag) )
//     |> extrude(length = radius)
//   }
//   
//   cylinder(radius = 1, tag = line1)
//   cylinder(radius = 2, tag = line2)
//   cylinder(radius = 3, tag = line3)
//   cylinder(radius = 4, tag = line4)

// Category: std.sketch
// Compute the starting point of the provided line segment along the 'x' axis
// std.sketch.segStartX (function)
segStartX(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [20, 0], tag = $thing)
//     |> line(end = [0, 5])
//     |> line(end = [20 - segStartX(thing), 0])
//     |> line(end = [-20, 10])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Compute the starting point of the provided line segment along the 'y' axis
// std.sketch.segStartY (function)
segStartY(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [20, 0])
//     |> line(end = [0, 3], tag = $thing)
//     |> line(end = [-10, 0])
//     |> line(end = [0, 20-segStartY(thing)])
//     |> line(end = [-10, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Extract the 'x' axis value of the last line segment in the provided 2-d sketch
// std.sketch.lastSegX (function)
lastSegX(@sketch: Sketch): number(Length)
//   @sketch: The sketch whose line segment is being queried
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [5, 0])
//     |> line(end = [20, 5])
//     |> line(end = [lastSegX(%), 0])
//     |> line(end = [-15, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Extract the 'y' axis value of the last line segment in the provided 2-d sketch
// std.sketch.lastSegY (function)
lastSegY(@sketch: Sketch): number(Length)
//   @sketch: The sketch whose line segment is being queried
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [5, 0])
//     |> line(end = [20, 5])
//     |> line(end = [0, lastSegY(%)])
//     |> line(end = [-15, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Compute the length of the provided line segment
// std.sketch.segLen (function)
segLen(@tag: TaggedEdge): number(Length)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> angledLine(
//       angle = 60deg,
//       length = 10,
//       tag = $thing,
//     )
//     |> tangentialArc(angle = -120deg, radius = 5)
//     |> angledLine(
//       angle = -60deg,
//       length = segLen(thing),
//     )
//     |> close()
//   
//   example = extrude(exampleSketch, length = 5)

// Category: std.sketch
// Compute the angle (in degrees) of the provided line segment
// std.sketch.segAng (function)
segAng(@tag: TaggedEdge): number(Angle)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [10, 0])
//     |> line(end = [5, 10], tag = $seg01)
//     |> line(end = [-10, 0])
//     |> angledLine(angle = segAng(seg01), length = 10)
//     |> line(end = [-10, 0])
//     |> angledLine(angle = segAng(seg01), length = -15)
//     |> close()
//   
//   example = extrude(exampleSketch, length = 4)

// Category: std.sketch
// Returns the angle coming out of the end of the segment in degrees
// std.sketch.tangentToEnd (function)
tangentToEnd(@tag: TaggedEdge): number(Angle)
//   @tag: The line segment being queried by its tag
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Horizontal pill.
//   pillSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [20, 0])
//     |> tangentialArc(end = [0, 10], tag = $arc1)
//     |> angledLine(
//       angle = tangentToEnd(arc1),
//       length = 20,
//     )
//     |> tangentialArc(end = [0, -10])
//     |> close()
//   
//   pillExtrude = extrude(pillSketch, length = 10)

// Category: std.sketch
// Extract the provided 2-dimensional sketch's profile origin as an array containing its X and Y values
// std.sketch.profileStart (function)
profileStart(@profile: Sketch): Point2d
//   @profile: Profile whose start is being used
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   sketch001 = startSketchOn(XY)
//    |> startProfile(at = [5, 2])
//    |> angledLine(angle = 120deg, length = 50 , tag = $seg01)
//    |> angledLine(angle = segAng(seg01) + 120deg, length = 50 )
//    |> line(end = profileStart(%))
//    |> close()
//    |> extrude(length = 20)

// Category: std.sketch
// Extract the provided 2-dimensional sketch's profile's origin's 'x' value
// std.sketch.profileStartX (function)
profileStartX(@profile: Sketch): number(Length)
//   @profile: Profile whose start is being used
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   sketch001 = startSketchOn(XY)
//    |> startProfile(at = [5, 2])
//    |> angledLine(angle = -26.6deg, length = 50)
//    |> angledLine(angle = 90deg, length = 50)
//    |> angledLine(angle = 30deg, endAbsoluteX = profileStartX(%))

// Category: std.sketch
// Extract the provided 2-dimensional sketch's profile's origin's 'y' value
// std.sketch.profileStartY (function)
profileStartY(@profile: Sketch): number(Length)
//   @profile: Profile whose start is being used
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   sketch001 = startSketchOn(XY)
//    |> startProfile(at = [5, 2])
//    |> angledLine(angle = -60deg, length = 14 )
//    |> angledLine(angle = 30deg, endAbsoluteY =  profileStartY(%))

// Category: std.sketch
// Extend the current sketch with a new involute circular curve
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver) and the [gear module](/docs/kcl-std/modules/std-gear).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.involuteCircular (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   a = 10
//   b = 14
//   startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> involuteCircular(startRadius = a, endRadius = b, angle = 60deg)
//     |> involuteCircular(startRadius = a, endRadius = b, angle = 60deg, reverse = true)

// Category: std.sketch
// Extend the current sketch with a new straight line
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.line (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   triangle = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     // The END argument means it ends at exactly [10, 0].
//     // This is an absolute measurement, it is NOT relative to
//     // the start of the sketch.
//     |> line(endAbsolute = [10, 0])
//     |> line(endAbsolute = [0, 10])
//     |> line(endAbsolute = [-10, 0], tag = $thirdLineOfTriangle)
//     |> close()
//     |> extrude(length = 5)
//   
//   box = startSketchOn(XZ)
//     |> startProfile(at = [10, 10])
//     // The 'to' argument means move the pen this much.
//     // So, [10, 0] is a relative distance away from the current point.
//     |> line(end = [10, 0])
//     |> line(end = [0, 10])
//     |> line(end = [-10, 0], tag = $thirdLineOfBox)
//     |> close()
//     |> extrude(length = 5)

// Category: std.sketch
// Draw a line relative to the current origin to a specified distance away from the current position along the 'x' axis
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.xLine (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> xLine(length = 15)
//     |> angledLine(
//       angle = 80deg,
//       length = 15,
//     )
//     |> line(end = [8, -10])
//     |> xLine(length = 10)
//     |> angledLine(
//       angle = 120deg,
//       length = 30,
//     )
//     |> xLine(length = -15)
//     |> close()
//   
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Draw a line relative to the current origin to a specified distance away from the current position along the 'y' axis
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.yLine (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> yLine(length = 15)
//     |> angledLine(
//       angle = 30deg,
//       length = 15,
//     )
//     |> line(end = [8, -10])
//     |> yLine(length = -5)
//     |> close()
//   
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Draw a line segment relative to the current origin using the polar measure of some angle and distance
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.angledLine (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> yLine(endAbsolute = 15)
//     |> angledLine(
//       angle = 30deg,
//       length = 15,
//     )
//     |> line(end = [8, -10])
//     |> yLine(endAbsolute = 0)
//     |> close()
//   
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Draw an angled line from the current origin, constructing a line segment such that the newly created line intersects the desired target line segment
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.angledLineThatIntersects (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(endAbsolute = [5, 10])
//     |> line(endAbsolute = [-10, 10], tag = $lineToIntersect)
//     |> line(endAbsolute = [0, 20])
//     |> angledLineThatIntersects(
//          angle = 80deg,
//          intersectTag = lineToIntersect,
//          offset = 10,
//        )
//     |> close()
//   
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Construct a line segment from the current origin back to the profile's origin, ensuring the resulting 2-dimensional sketch is not open-ended
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). If you want to perform some 3-dimensional operation on a sketch, like extrude or sweep, you must `close` it first. `close` must be called even if the end point of the last segment is coincident with the sketch starting point.
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.close (function)
close(
  @sketch: Sketch,
  tag?: TagDecl,
): Sketch
//   @sketch: The sketch you want to close
//   tag: Create a new tag which refers to this line
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   startSketchOn(XZ)
//      |> startProfile(at = [0, 0])
//      |> line(end = [10, 10])
//      |> line(end = [10, 0])
//      |> close()
//      |> extrude(length = 10)

// Category: std.sketch
// Draw a curved line segment along an imaginary circle
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The arc is constructed such that the current position of the sketch is placed along an imaginary circle of the specified radius, at angleStart degrees. The resulting arc is the segment of the imaginary circle from that origin point to angleEnd, radius away from the center of the imaginary circle. Unless this makes a lot of sense and feels like what you're looking for to construct your shape, you're likely looking for tangentialArc.
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.arc (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [10, 0])
//     |> arc(
//          angleStart = 0,
//          angleEnd = 280deg,
//          radius = 16
//        )
//     |> close()
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Starting at the current sketch's origin, draw a curved line segment along some part of an imaginary circle until it reaches the desired (x, y) coordinates
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). When using radius and angle, draw a curved line segment along part of an imaginary circle. The arc is constructed such that the last line segment is placed tangent to the imaginary circle of the specified radius. The resulting arc is the segment of the imaginary circle from that tangent point for 'angle' degrees along the imaginary circle.
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.tangentialArc (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> angledLine(
//       angle = 45deg,
//       length = 10,
//     )
//     |> tangentialArc(end = [0, -10])
//     |> line(end = [-10, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Draw a smooth, continuous, curved line segment from the current origin to the desired (x, y), using a number of control points to shape the curve's shape
// Remarks: This is part of sketch v1 and is deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The sketch-solve version of bezier curve is still under development.
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.bezierCurve (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Example using relative control points.
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [0, 10])
//     |> bezierCurve(
//          control1 = [5, 0],
//          control2 = [5, 10],
//          end = [10, 10],
//        )
//     |> line(endAbsolute = [10, 0])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Use a 2-dimensional sketch to cut a hole in another 2-dimensional sketch
// Remarks: This is part of sketch v1 and is deprecated. In KCL 2, construct the outer boundary and hole as segments inside a [`sketch` block](/docs/kcl-lang/sketches), then select the required bounded face with [`region`](/docs/kcl-std/functions/std-sketch-region).
// DEPRECATED: Deprecated in KCL 2.0.
// std.sketch.subtract2d (function)
subtract2d(
  @sketch: Sketch,
  tool: [Sketch; 1+],
): Sketch
//   @sketch: Which sketch should this path be added to?
//   tool: The shape(s) which should be cut out of the sketch
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(kclVersion = 1.0)
//   
//   exampleSketch = startSketchOn(XY)
//     |> startProfile(at = [0, 0])
//     |> line(end = [0, 5])
//     |> line(end = [5, 0])
//     |> line(end = [0, -5])
//     |> close()
//     |> subtract2d(tool =circle( center = [1, 1], radius = .25 ))
//     |> subtract2d(tool =circle( center = [1, 4], radius = .25 ))
//   
//   example = extrude(exampleSketch, length = 1)

// Category: std.sketch
// Add a conic section to an existing sketch
// Remarks: This is part of sketch v1 and is soft deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The sketch-solve version of conic is still under development.
// EXPERIMENTAL
// std.sketch.conic (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(experimentalFeatures = allow)
//   
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> conic(
//           end = [20,0],
//           endTangent = [1,1],
//           interior = [5,5],
//           startTangent = [0, -1],
//        )
//     |> close()
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Add a parabolic segment to an existing sketch
// Remarks: This is part of sketch v1 and is soft deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The sketch-solve version of parabolic is still under development.
// EXPERIMENTAL
// std.sketch.parabolic (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(experimentalFeatures = allow)
//   
//   exampleSketch = startSketchOn(XY)
//     |> startProfile(at = [0,0])
//     |> parabolic(
//           end = [10,0],
//           coefficients = [2, 0, 0],
//     )
//     |>close()

// Category: std.sketch
// Calculate the point (x, y) on a parabola given x or y and the coefficients [a, b, c] of the parabola
// std.sketch.parabolicPoint (function)
parabolicPoint(
  coefficients: [number; 3],
  x?: number(Length),
  y?: number(Length),
): Point2d
//   coefficients: The coefficients [a, b, c] of the parabolic equation y = ax^2 + bx + c
//   x: The x value
//   y: The y value
// Example:
//   point001 = parabolicPoint(x = 5, coefficients = [0.1, 0, 0])
//   point002 = parabolicPoint(y = 2.5, coefficients = [0.1, 0, 0])
//   assert(point001[0], isEqualTo = point002[0])
//   assert(point001[1], isEqualTo = point002[1])

// Category: std.sketch
// Add a hyperbolic section to an existing sketch
// Remarks: This is part of sketch v1 and is soft deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The sketch-solve version of hyperbolic is still under development.
// EXPERIMENTAL
// std.sketch.hyperbolic (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(experimentalFeatures = allow)
//   
//   exampleSketch = startSketchOn(XY)
//     |> startProfile(at = [0,0])
//     |> hyperbolic(
//           end = [10,0],
//           semiMajor = 2,
//           semiMinor = 1,
//           interior = [0,0]
//     )
//     |>close()

// Category: std.sketch
// Calculate the point (x, y) on a hyperbola given x or y and the semi major/minor values of the hyperbolic
// std.sketch.hyperbolicPoint (function)
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
// Example:
//   point = hyperbolicPoint(x = 5, semiMajor = 2, semiMinor = 1)

// Category: std.sketch
// Add an elliptic section to an existing sketch
// Remarks: This is part of sketch v1 and is soft deprecated in favor of [sketch-solve](/docs/kcl-std/modules/std-solver). The sketch-solve version of elliptic is still under development.
// EXPERIMENTAL
// std.sketch.elliptic (function)
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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(experimentalFeatures = allow)
//   
//   majorRadius = 2
//   minorRadius = 1
//   ellip = ellipticPoint(majorRadius, minorRadius, x = 2)
//   
//   exampleSketch = startSketchOn(XY)
//      |> startProfile(at = ellip, tag = $start)
//      |> elliptic(center = [0, 0], angleStart = segAng(start), angleEnd = 160deg, majorRadius, minorRadius)
//      |> close()
//   example = extrude(exampleSketch, length = 10)

// Category: std.sketch
// Calculate the point (x, y) on an ellipse given x or y and the center and major/minor radii of the ellipse
// std.sketch.ellipticPoint (function)
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
// Example:
//   point001 = ellipticPoint(x = 2, majorRadius = 2, minorRadius = 1)
//   point002 = ellipticPoint(y = 0, majorRadius = 2, minorRadius = 1)
//   assert(point001[0], isEqualTo = point002[0])
//   assert(point001[1], isEqualTo = point002[1])

// Category: std.sketch
// Find the plane a face lies on
// std.sketch.planeOf (function)
planeOf(
  @solid: Solid,
  face: TaggedFace | Segment,
): Plane
//   @solid: The solid whose face is being queried
//   face: Find the plane which this face lies on
// Example:
//   baseProfile = sketch(on = XY) {
//     line1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     line2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     line3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     line4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
//     coincident([line1.end, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line4.start])
//     coincident([line4.end, line1.start])
//     horizontal(line1)
//     vertical(line2)
//     horizontal(line3)
//     vertical(line4)
//   }
//   
//   baseRegion = region(segments = [baseProfile.line1, baseProfile.line2])
//   block = extrude(baseRegion, length = 4mm, tagEnd = $top)
//   sidePlane = planeOf(block, face = top)
//   
//   rib = startSketchOn(offsetPlane(sidePlane, offset = 1mm))
//     |> startProfile(at = [0mm, 0mm])
//     |> line(end = [2mm, 0mm])
//     |> line(end = [0mm, 1mm])
//     |> line(end = [-2mm, 0mm])
//     |> close()
//     |> extrude(length = 1mm)

// Category: std.sketch
// Get the face of a solid
// std.sketch.faceOf (function)
faceOf(
  @solid: Solid,
  face: TaggedFace | Segment,
): Face
//   @solid: The solid that has the face
//   face: Which face of the solid
// Example:
//   triangle = startSketchOn(XY)
//     |> startProfile(at = [0, 0])
//     |> line(end = [2, 0])
//     |> line(end = [0, 2], tag = $side)
//     |> line(end = [-2, -2])
//     |> close()
//     |> extrude(length = 2)
//   
//   // Get the face of the triangle's side face.
//   sideFace = faceOf(triangle, face = side)
//   
//   // Create a new sketch, on the triangle's side face.
//   //sketch(on = sideFace) {}

// Category: std.sketch
// Create a region from closed segments
// Remarks: Prefer the `segments` parameter. It forms a region by tracing the first segment from its start point to the intersection with the second segment, then turning at each intersection using `direction` until returning to the first segment. For a single closed segment such as a circle, pass only that segment. `intersectionIndex` and `direction` are unnecessary for one loop; use them to disambiguate a boundary traced from multiple segments. As a fallback, use the `point` parameter to select the closed boundary that contains a given point. When using a 2D point rather than a point from the sketch, provide the `sketch` parameter to specify which sketch the region is from. To make a fallback point move with a parametric sketch, consider creating a construction point in the sketch and constraining it into place. You can then refer to that point to create the region. Operations such as `extrude`, `revolve`, and `sweep` consume the region passed to them. Each region can be used by only one consuming operation. To reuse the same profile, call `region(...)` again with the original sketch segments instead of cloning the sketch. For example, create `firstRegion = region(segments = [profile.circle])` and `secondRegion = region(segments = [profile.circle])`, then pass each region to a different consuming operation.
// std.sketch.region (function)
region(
  point?: Point2d | Segment,
  segments?: [Segment; 1+],
  intersectionIndex?: number(_),
  direction?: string,
  sketch?: any,
): Sketch
//   point: A fallback point that is within the region's boundary
//   segments: The first two segments that form the region's boundary
//   intersectionIndex: Index of the intersection of the first segment with the second segment to use as the region's boundary
//   direction: `CCW` for counterclockwise, `CW` for clockwise
//   sketch: The sketch that the region is from
// Example:
//   @settings(kclVersion = 2.0)
//   
//   // `region` traces counterclockwise by default.
//   triangle = sketch(on = XY) {
//     line1 = line(start = [var -0.05mm, var -0.01mm], end = [var 3.88mm, var 0.81mm])
//     line2 = line(start = [var 3.88mm, var 0.81mm], end = [var 0.92mm, var 4.67mm])
//     coincident([line1.end, line2.start])
//     line3 = line(start = [var 0.92mm, var 4.67mm], end = [var -0.03mm, var -0.04mm])
//     coincident([line2.end, line3.start])
//     coincident([line1.start, line3.end])
//     horizontal(line1)
//     equalLength([line2, line3])
//   }
//   
//   r = region(segments = [triangle.line1, triangle.line2])
//   extrude(r, length = 5)

// Category: std.sketch
// Sketching is the foundational activity for most KCL programs
// Remarks: This module contains functions for creating and manipulating sketches, and making them into solids.
sketch
