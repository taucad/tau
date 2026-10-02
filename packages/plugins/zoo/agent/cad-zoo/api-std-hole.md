# kcl-std — std.hole

10 top-level symbols. Signatures are verbatim kcl.

// Category: std.hole
// A hole top with no decoration
// EXPERIMENTAL
// std.hole.hole::simple (function)
hole::simple()

// Category: std.hole
// Cut a straight vertical counterbore at the top of the hole
// EXPERIMENTAL
// std.hole.hole::counterbore (function)
hole::counterbore(
  diameter: number(Length),
  depth: number(Length),
)
//   diameter: A number
//   depth: A number

// Category: std.hole
// Cut an angled countersink at the top of the hole
// EXPERIMENTAL
// std.hole.hole::countersink (function)
hole::countersink(
  diameter: number(Length),
  angle: number(Angle),
)
//   diameter: A number
//   angle: A number

// Category: std.hole
// The hole has the given blind depth
// EXPERIMENTAL
// std.hole.hole::blind (function)
hole::blind(
  depth: number(Length),
  diameter: number(Length),
)
//   depth: A number
//   diameter: A number

// Category: std.hole
// End the hole in an angle, like the end of a drill
// EXPERIMENTAL
// std.hole.hole::drill (function)
hole::drill(pointAngle: number(Angle))
//   pointAngle: A number

// Category: std.hole
// End the hole flat
// EXPERIMENTAL
// std.hole.hole::flat (function)
hole::flat()

// Category: std.hole
// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at the given 2D position on the given face
// EXPERIMENTAL
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

// Category: std.hole
// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at each of the given 2D positions on the given face
// EXPERIMENTAL
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

// Category: std.hole
// Place the given holes in a line
// EXPERIMENTAL
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
// Definitions of standard holes that could be drilled or cut into solids
hole
