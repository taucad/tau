# kcl-std — std.hole

10 top-level symbols. Signatures are verbatim kcl.

// A hole top with no decoration
// EXPERIMENTAL
hole::simple()

// Cut a straight vertical counterbore at the top of the hole
// EXPERIMENTAL
hole::counterbore(
  diameter: number(Length),
  depth: number(Length),
)
//   diameter: A number
//   depth: A number

// Cut an angled countersink at the top of the hole
// EXPERIMENTAL
hole::countersink(
  diameter: number(Length),
  angle: number(Angle),
)
//   diameter: A number
//   angle: A number

// The hole has the given blind depth
// EXPERIMENTAL
hole::blind(
  depth: number(Length),
  diameter: number(Length),
)
//   depth: A number
//   diameter: A number

// End the hole in an angle, like the end of a drill
// EXPERIMENTAL
hole::drill(pointAngle: number(Angle))
//   pointAngle: A number

// End the hole flat
// EXPERIMENTAL
hole::flat()

// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at the given 2D position on the given face
// EXPERIMENTAL
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

// From the hole's parts (bottom, middle, top), cut the hole into the given solid, at each of the given 2D positions on the given face
// EXPERIMENTAL
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

// Place the given holes in a line
// EXPERIMENTAL
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

// Definitions of standard holes that could be drilled or cut into solids
hole
