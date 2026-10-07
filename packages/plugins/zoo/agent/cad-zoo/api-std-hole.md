# kcl-std — std.hole

11 top-level symbols. Signatures are verbatim kcl.

// Category: std.hole
// A hole top with no decoration
// std.hole.hole::simple (function)
hole::simple()

// Category: std.hole
// Cut a straight vertical counterbore at the top of the hole
// std.hole.hole::counterbore (function)
hole::counterbore(
  diameter: number(Length),
  depth: number(Length),
)
//   diameter: A number
//   depth: A number
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Model a cube
//   cubeLen = 20
//   bigCube = startSketchOn(XY)
//     |> startProfile(at = [-cubeLen / 2, -cubeLen / 2 + 10])
//     |> line(end = [cubeLen, 0], tag = $a)
//     |> line(end = [0, cubeLen], tag = $b)
//     |> line(end = [-cubeLen, 0], tag = $c)
//     |> line(end = [0, -cubeLen], tag = $d)
//     |> close()
//     |> extrude(length = cubeLen, symmetric = true)
//     |> translate(x = 5)
//   
//   // Add a hole to the cube.
//   // It'll have a drilled end, and a counterbore (vertical hole that emerges from a larger hole)
//   bigCube
//     |> hole::hole(
//          face = a,
//          cutAt = [0, 5],
//          holeBottom = hole::drill(pointAngle = 110deg),
//          holeBody = hole::blind(depth = 5, diameter = 8),
//          holeType = hole::counterbore(diameter = 12, depth = 3.5),
//        )

// Category: std.hole
// Cut an angled countersink at the top of the hole
// std.hole.hole::countersink (function)
hole::countersink(
  diameter: number(Length),
  angle: number(Angle),
  headClearance?: number(Length),
)
//   diameter: A number
//   angle: A number
//   headClearance: A number
// Example:
//   // Model a cube.
//   cubeProfile = sketch(on = XY) {
//     line1 = line(start = [var -1.5mm, var -1.5mm], end = [var 1.5mm, var -1.5mm])
//     line2 = line(start = [var 1.5mm, var -1.5mm], end = [var 1.5mm, var 1.5mm])
//     line3 = line(start = [var 1.5mm, var 1.5mm], end = [var -1.5mm, var 1.5mm])
//     line4 = line(start = [var -1.5mm, var 1.5mm], end = [var -1.5mm, var -1.5mm])
//     coincident([line1.end, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line4.start])
//     coincident([line4.end, line1.start])
//     parallel([line2, line4])
//     parallel([line3, line1])
//     perpendicular([line1, line2])
//     horizontal(line3)
//     equalLength([line2, line3])
//     distance([line2.start, line2.end]) == 3mm
//   }
//   cubeRegion = region(segments = [cubeProfile.line1, cubeProfile.line2])
//   cube1 = extrude(cubeRegion, length = 3mm)
//   
//   // Add a hole to the cube.
//   // It'll have a drilled end and a countersink (angled tip at the start).
//   cube1
//     |> hole::hole(
//          face = cubeRegion.tags.line1,
//          cutAt = [1.5, 0],
//          holeBottom = hole::drill(pointAngle = 110deg),
//          holeBody = hole::blind(depth = 2mm, diameter = 1mm),
//          holeType = hole::countersink(diameter = 2mm, angle = 100deg),
//        )

// Category: std.hole
// The hole has the given blind depth
// std.hole.hole::blind (function)
hole::blind(
  depth: number(Length),
  diameter: number(Length),
)
//   depth: A number
//   diameter: A number

// Category: std.hole
// End the hole in an angle, like the end of a drill
// std.hole.hole::drill (function)
hole::drill(pointAngle: number(Angle))
//   pointAngle: A number
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Sketch a cube, so we have something to drill into.
//   cubeLen = 20
//   bigCube = startSketchOn(XY)
//     |> startProfile(at = [-cubeLen / 2, -cubeLen / 2 + 10])
//     |> line(end = [cubeLen, 0], tag = $a)
//     |> line(end = [0, cubeLen], tag = $b)
//     |> line(end = [-cubeLen, 0], tag = $c)
//     |> line(end = [0, -cubeLen], tag = $d)
//     |> close()
//     |> extrude(length = cubeLen, symmetric = true)
//   
//   // Add a hole with a very pointy drilled bottom.
//   bigCube
//     |> hole::hole(
//          face = a,
//          cutAt = [0, 0],
//          holeBottom = hole::drill(pointAngle = 25deg),
//          holeBody = hole::blind(depth = 1, diameter = 8),
//          holeType = hole::simple(),
//        )

// Category: std.hole
// End the hole flat
// std.hole.hole::flat (function)
hole::flat()
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Sketch a cube, so we have something to drill into.
//   cubeLen = 20
//   bigCube = startSketchOn(XY)
//     |> startProfile(at = [-cubeLen / 2, -cubeLen / 2 + 10])
//     |> line(end = [cubeLen, 0], tag = $a)
//     |> line(end = [0, cubeLen], tag = $b)
//     |> line(end = [-cubeLen, 0], tag = $c)
//     |> line(end = [0, -cubeLen], tag = $d)
//     |> close()
//     |> extrude(length = cubeLen, symmetric = true)
//   
//   // Add a hole with a flat bottom.
//   bigCube
//     |> hole::hole(
//          face = a,
//          cutAt = [0, 0],
//          holeBottom = hole::flat(),
//          holeBody = hole::blind(depth = 2, diameter = 8),
//          holeType = hole::simple(),
//        )

// Category: std.hole
// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at the given 2D position on the given face
// std.hole.hole::hole (function)
hole::hole(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutAt: [number(Length); 2],
)
//   @solid: Which solid to add a hole to
//   face: Which face of the solid to add the hole to
//   holeBottom: Define bottom feature of the hole
//   holeBody: Define the main length of the hole
//   holeType: Define the top feature of the hole
//   cutAt: Where to place the cut on the given face of the solid
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 8mm, var 0mm])
//     edge2 = line(start = [var 8mm, var 0mm], end = [var 8mm, var 6mm])
//     edge3 = line(start = [var 8mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 6mm, tagEnd = $top)
//   drilledBlock = hole::hole(
//     block,
//     face = top,
//     cutAt = [4mm, 3mm],
//     holeBottom = hole::flat(),
//     holeBody = hole::blind(depth = 4mm, diameter = 2mm),
//     holeType = hole::simple(),
//   )

// Category: std.hole
// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at each of the given 2D positions on the given face
// std.hole.hole::holes (function)
hole::holes(
  @solid: Solid,
  face: TaggedFace,
  holeBottom,
  holeBody,
  holeType,
  cutsAt: [[number(Length); 2]],
)
//   @solid: Which solid to add a hole to
//   face: Which face of the solid to add the hole to
//   holeBottom: Define bottom feature of the hole
//   holeBody: Define the main length of the hole
//   holeType: Define the top feature of the hole
//   cutsAt: Where to place the holes, given as absolute coordinates in the global scene
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 10mm, var 0mm])
//     edge2 = line(start = [var 10mm, var 0mm], end = [var 10mm, var 6mm])
//     edge3 = line(start = [var 10mm, var 6mm], end = [var 0mm, var 6mm])
//     edge4 = line(start = [var 0mm, var 6mm], end = [var 0mm, var 0mm])
//     coincident([edge1.end, edge2.start])
//     coincident([edge2.end, edge3.start])
//     coincident([edge3.end, edge4.start])
//     coincident([edge4.end, edge1.start])
//     horizontal(edge1)
//     vertical(edge2)
//     horizontal(edge3)
//     vertical(edge4)
//   }
//   
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 6mm, tagEnd = $top)
//   drilledBlock = hole::holes(
//     block,
//     face = top,
//     cutsAt = [[2mm, 2mm], [5mm, 3mm], [8mm, 4mm]],
//     holeBottom = hole::drill(pointAngle = 90deg),
//     holeBody = hole::blind(depth = 3mm, diameter = 1.5mm),
//     holeType = hole::simple(),
//   )

// Category: std.hole
// Place the given holes in a line
// std.hole.hole::holesLinear (function)
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
//   @solid: Which solid to add a hole to
//   face: Which face of the solid to add the hole to
//   holeBottom: Define bottom feature of the hole
//   holeBody: Define the main length of the hole
//   holeType: Define the top feature of the hole
//   cutAt: Where to place the first cut in the linear pattern, given as absolute coordinates in the global scene
//   instances: How many holes to cut
//   distance: How far between each hole
//   axis: Along which axis should the holes be cut?

// Category: std.hole
// From the hole's parts (bottom, middle, top), cut the hole into the given solid, using the custom plane
// std.hole.hole::holeAt (function)
hole::holeAt(
  @solids: [Solid; 1+],
  plane: Plane,
  holeBottom,
  holeBody,
  holeType,
)
//   @solids: Which solid to add a hole to
//   plane: The plane's origin determines the hole's center
//   holeBottom: Define bottom feature of the hole
//   holeBody: Define the main length of the hole
//   holeType: Define the top feature of the hole
// Example:
//   // Model a cube.
//   cubeProfile = sketch(on = XY) {
//     line1 = line(start = [var -1.5mm, var -1.5mm], end = [var 1.5mm, var -1.5mm])
//     line2 = line(start = [var 1.5mm, var -1.5mm], end = [var 1.5mm, var 1.5mm])
//     line3 = line(start = [var 1.5mm, var 1.5mm], end = [var -1.5mm, var 1.5mm])
//     line4 = line(start = [var -1.5mm, var 1.5mm], end = [var -1.5mm, var -1.5mm])
//     coincident([line1.end, line2.start])
//     coincident([line2.end, line3.start])
//     coincident([line3.end, line4.start])
//     coincident([line4.end, line1.start])
//     parallel([line2, line4])
//     parallel([line3, line1])
//     perpendicular([line1, line2])
//     horizontal(line3)
//     equalLength([line2, line3])
//     distance([line2.start, line2.end]) == 3mm
//   }
//   
//   cube1 = extrude(region(segments = [cubeProfile.line1, cubeProfile.line2]), length = 3mm)
//   
//   // Define a custom plane, into which a hole will be cut.
//   customPlane = {
//     origin = { x = 1.5, y = -1.5, z = 3 },
//     xAxis = { x = -0.5, y = -0.5, z = 0 },
//     yAxis = { x = 0, y = 0.5, z = 0.5 }
//   }
//   
//   // Cut the hole through the cube, into the plane.
//   hole::holeAt(
//     [cube1],
//     plane = customPlane,
//     holeBottom = hole::flat(),
//     holeBody = hole::blind(depth = 2, diameter = 1),
//     holeType = hole::counterbore(diameter = 1.4, depth = 1),
//   )

// Category: std.hole
// Definitions of standard holes that could be drilled or cut into solids
hole
