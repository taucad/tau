# kcl-std — std.solid

19 top-level symbols. Signatures are verbatim kcl.

// Category: std.solid
// Blend a transitional edge along a tagged path, smoothing the sharp edge
// Remarks: Fillet is similar in function and use to a chamfer, except a chamfer will cut a sharp transition along an edge while fillet will smoothly blend the transition.
// std.solid.fillet (function)
fillet(
  @solid: Solid,
  radius: number(Length),
  tags?: [Edge; 1+],
  edges?: [any],
  tolerance?: number(Length),
  tag?: TagDecl,
  legacyMethod?: bool,
  version?: number(_),
): Solid
//   @solid: The solid whose edges should be filletted
//   radius: The radius of the fillet
//   tags: The paths you want to fillet (legacy API)
//   edges: Experimental face API
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   tag: Create a new tag which refers to this fillet
//   legacyMethod: You probably shouldn't set this or care about this, it's for opting back into an older version of an engine algorithm
//   version: What version of the fillet algorithm to use
// Example:
//   blockProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     edge2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     edge3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     edge4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
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
//   block = extrude(region(segments = [blockProfile.edge1, blockProfile.edge2]), length = 3, tagEnd = $top)
//   
//   tabProfile = startSketchOn(block, face = top)
//     |> startProfile(at = [1mm, 1mm])
//     |> line(end = [4mm, 0mm], tag = $tabEdge)
//     |> line(end = [0mm, 1mm])
//     |> line(end = [-4mm, 0mm])
//     |> close()
//   
//   blockWithTab = extrude(tabProfile, length = 1mm)
//   filletedBlock = fillet(blockWithTab, radius = 0.5mm, tags = [getNextAdjacentEdge(tabEdge)])

// Category: std.solid
// Cut a straight transitional edge along a tagged path
// Remarks: Chamfer is similar in function and use to a fillet, except a fillet will blend the transition along an edge, rather than cut a sharp, straight transitional edge.
// std.solid.chamfer (function)
chamfer(
  @solid: Solid,
  length: number(Length),
  tags?: [Edge; 1+],
  edges?: [any],
  secondLength?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
  legacyMethod?: bool,
  version?: number(_),
): Solid
//   @solid: The solid whose edges should be chamfered
//   length: Chamfering cuts away two faces to create a third face
//   tags: The paths you want to chamfer (legacy API)
//   edges: Experimental face API
//   secondLength: Chamfering cuts away two faces to create a third face
//   angle: Chamfering cuts away two faces to create a third face
//   tag: Create a new tag which refers to this chamfer
//   legacyMethod: You probably shouldn't set this or care about this, it's for opting back into an older version of an engine algorithm
//   version: What version of the fillet algorithm to use
// Example:
//   baseProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     edge2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     edge3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     edge4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
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
//   block = extrude(region(segments = [baseProfile.edge1, baseProfile.edge2]), length = 3mm, tagEnd = $top)
//   
//   tabProfile = startSketchOn(block, face = top)
//     |> startProfile(at = [1mm, 1mm])
//     |> line(end = [4mm, 0mm], tag = $tabEdge)
//     |> line(end = [0mm, 1mm])
//     |> line(end = [-4mm, 0mm])
//     |> close()
//   
//   blockWithTab = extrude(tabProfile, length = 1mm)
//   chamfered = chamfer(blockWithTab, length = 0.5mm, tags = [getNextAdjacentEdge(tabEdge)])

// Category: std.solid
// Remove volume from a 3-dimensional shape such that a wall of the provided thickness remains, taking volume starting at the provided face, leaving it open in that direction
// std.solid.shell (function)
shell(
  @solids: [Solid; 1+],
  thickness: number(Length),
  faces: [TaggedFace; 1+],
): [Solid]
//   @solids: Which solid (or solids) to shell out
//   thickness: The thickness of the shell
//   faces: The faces you want removed
// Example:
//   boxProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 6mm, var 0mm])
//     edge2 = line(start = [var 6mm, var 0mm], end = [var 6mm, var 4mm])
//     edge3 = line(start = [var 6mm, var 4mm], end = [var 0mm, var 4mm])
//     edge4 = line(start = [var 0mm, var 4mm], end = [var 0mm, var 0mm])
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
//   box = extrude(region(segments = [boxProfile.edge1, boxProfile.edge2]), length = 4mm)
//   openBox = shell(box, faces = [END], thickness = 0.5mm)

// Category: std.solid
// Make the inside of a 3D object hollow
// Remarks: Remove volume from a 3-dimensional shape such that a wall of the provided thickness remains around the exterior of the shape. By default, it'll look visually the same, but you can see the difference if you use `appearance` to make it transparent, or cut it open with a `subtract`.
// std.solid.hollow (function)
hollow(
  @solid: Solid,
  thickness: number(Length),
): Solid
//   @solid: Which solid to hollow out
//   thickness: The thickness of the remaining shell
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Make two cubes, utterly identical,
//   // except that one (left) is hollowed out,
//   // and the other one (right) isn't.
//   width = 2
//   solidCube = startSketchOn(-XZ)
//     |> startProfile(at = [-width, width])
//     |> line(end = [width, 0])
//     |> line(end = [0, -width])
//     |> line(end = [-width, 0])
//     |> close()
//     |> extrude(length = width, symmetric = true)
//   
//   hollowCube = clone(solidCube)
//     |> hollow(thickness = 0.25)
//     |> translate(x = width * 1.1)
//   
//   // Make a tool that spans the top half of both cubes,
//   // so we can cut open the cubes and look at their insides.
//   tool = startSketchOn(offsetPlane(XY, offset = width))
//     |> startProfile(at = [0, width])
//     |> line(end = [width * 3, 0])
//     |> line(end = [0, -width * 2])
//     |> line(end = [-width * 3, 0])
//     |> close()
//     |> extrude(length = width, symmetric = true)
//   subtract([solidCube, hollowCube], tools = tool)

// Category: std.solid
// Repeat a 3-dimensional body or imported geometry, changing it each time
// Remarks: Replicates the 3D solid or imported geometry, applying a transformation function to each replica. Transformation function could alter rotation, scale, visibility, position, etc. The `patternTransform` call itself takes a number for how many total instances of the shape should be. For example, if you use a circle with `patternTransform(instances = 4, transform = f)` then there will be 4 circles: the original, and 3 created by replicating the original and calling the transform function on each. The transform function takes a single parameter: an integer representing which number replication the transform is for. E.g. the first replica to be transformed will be passed the argument `1`. This simplifies your math: the transform function can rely on id `0` being the original instance passed into the `patternTransform`. See the examples. The transform function returns a transform object. All properties of the object are optional, they each default to "no change". So the overall transform object defaults to "no change" too. Its properties are: - `translate` (3D point) Translates the replica, moving its position in space. - `replicate` (bool) If false, this ID will not actually copy the object. It'll be skipped. - `scale` (3D point) Stretches the object, multiplying its width in the given dimension by the point's component in that direction. - `rotation` (object, with the following properties) - `rotation.axis` (a 3D point, defaults to the Z axis) - `rotation.angle` - `rotation.origin` (either "local" i.e. rotate around its own center, "global" i.e. rotate around the scene's center, or a 3D point, defaults to "local") **NOTE:** Currently,, revolved bodies don't support being scaled in a non-uniform way (i.e. scaled differently along each axis).
// std.solid.patternTransform (function)
patternTransform(
  @solids: [Solid; 1+] | ImportedGeometry,
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: bool,
): [Solid | ImportedGeometry; 1+]
//   @solids: The solid(s) or imported geometry to duplicate
//   instances: The number of total instances
//   transform: How each replica should be transformed
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Each instance will be shifted along the X axis.
//   fn transform(@id) {
//     return { translate = [4 * id, 0, 0] }
//   }
//   
//   // Sketch 4 cylinders.
//   sketch001 = startSketchOn(XZ)
//     |> circle(center = [0, 0], radius = 2)
//     |> extrude(length = 5)
//     |> patternTransform(instances = 4, transform = transform)

// Category: std.solid
// Repeat a 3-dimensional body or imported geometry along a linear path, with a dynamic amount of distance between each repetition, some specified number of times
// std.solid.patternLinear3d (function)
patternLinear3d(
  @solids: [Solid; 1+] | ImportedGeometry,
  instances: number(_),
  distance: number(Length),
  axis: Axis3d | Point3d,
  useOriginal?: bool,
): [Solid | ImportedGeometry; 1+]
//   @solids: The solid(s) or imported geometry to duplicate
//   instances: The number of total instances
//   distance: Distance between each repetition
//   axis: The axis of the pattern
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   /// Pattern using a named axis.
//   
//   exampleSketch = startSketchOn(XZ)
//     |> startProfile(at = [0, 0])
//     |> line(end = [0, 2])
//     |> line(end = [3, 1])
//     |> line(end = [0, -4])
//     |> close()
//   
//   example = extrude(exampleSketch, length = 1)
//     |> patternLinear3d(
//         axis = X,
//         instances = 7,
//         distance = 6
//       )

// Category: std.solid
// Repeat a 3-dimensional body or imported geometry some number of times along a partial or complete circle some specified number of times
// std.solid.patternCircular3d (function)
patternCircular3d(
  @solids: [Solid; 1+] | ImportedGeometry,
  instances: number(_),
  axis: Axis3d | Point3d,
  center?: Point3d,
  arcDegrees?: number(deg),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Solid | ImportedGeometry; 1+]
//   @solids: The solid(s) or imported geometry to pattern
//   instances: The number of total instances
//   axis: The axis of the pattern
//   center: The center about which to make the pattern
//   arcDegrees: "The arc angle to place the repetitions
//   rotateDuplicates: Whether or not to rotate the duplicates as they are copied
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   /// Pattern using a named axis.
//   
//   exampleSketch = startSketchOn(XZ)
//     |> circle(center = [0, 0], radius = 1)
//   
//   example = extrude(exampleSketch, length = -5)
//     |> patternCircular3d(
//          axis = X,
//          center = [10, -20, 0],
//          instances = 11,
//          arcDegrees = 360,
//          rotateDuplicates = true
//        )

// Category: std.solid
// Union two or more solids into a single solid
// Remarks: This operation consumes every input solid. After it succeeds, the original solid variables cannot be used in another modeling operation. Assign the returned solid or solids to a new variable and use that result for any subsequent operations.
// std.solid.union (function)
union(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
  legacyMethod?: bool,
): [Solid; 1+]
//   @solids: The solids to union
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   legacyMethod: You probably shouldn't set this or care about this, it's for opting back into an older version of an engine algorithm
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Union two cubes using the stdlib functions.
//   
//   fn cube(center, size) {
//       return startSketchOn(XY)
//           |> startProfile(at = [center[0] - size, center[1] - size])
//           |> line(endAbsolute = [center[0] + size, center[1] - size])
//           |> line(endAbsolute = [center[0] + size, center[1] + size])
//           |> line(endAbsolute = [center[0] - size, center[1] + size])
//           |> close()
//           |> extrude(length = 10)
//   }
//   
//   part001 = cube(center = [0, 0], size = 10)
//   part002 = cube(center = [7, 3], size = 5)
//       |> translate(z = 1)
//   
//   unionedPart = union([part001, part002])

// Category: std.solid
// Intersect returns the shared volume between multiple solids, preserving only overlapping regions
// Remarks: Intersect computes the geometric intersection of multiple solid bodies, returning a new solid representing the volume that is common to all input solids. This operation is useful for determining shared material regions, verifying fit, and analyzing overlapping geometries in assemblies. This operation consumes every input solid. After it succeeds, the original solid variables cannot be used in another modeling operation. Assign the returned solid or solids to a new variable and use that result for any subsequent operations.
// std.solid.intersect (function)
intersect(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
  legacyMethod?: bool,
): [Solid; 1+]
//   @solids: The solids to intersect
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   legacyMethod: You probably shouldn't set this or care about this, it's for opting back into an older version of an engine algorithm
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Intersect two cubes using the stdlib functions.
//   
//   fn cube(center, size) {
//       return startSketchOn(XY)
//           |> startProfile(at = [center[0] - size, center[1] - size])
//           |> line(endAbsolute = [center[0] + size, center[1] - size])
//           |> line(endAbsolute = [center[0] + size, center[1] + size])
//           |> line(endAbsolute = [center[0] - size, center[1] + size])
//           |> close()
//           |> extrude(length = 10)
//   }
//   
//   part001 = cube(center = [0, 0], size = 10)
//   part002 = cube(center = [7, 3], size = 5)
//       |> translate(z = 1)
//   
//   intersectedPart = intersect([part001, part002])

// Category: std.solid
// Subtract removes tool solids from base solids, leaving the remaining material
// Remarks: Performs a bool subtraction operation, removing the volume of one or more tool solids from one or more base solids. The result is a new solid representing the material that remains after all tool solids have been cut away. This function is essential for machining simulations, cavity creation, and complex multi-body part modeling. This operation consumes both the base solids and the tool solids. After it succeeds, neither set of original variables can be used in another modeling operation. Assign the returned solid or solids to a new variable and use that result for subsequent operations. For multiple cuts, pass each `subtract` result into the next call instead of reusing the original base solid.
// std.solid.subtract (function)
subtract(
  @solids: [Solid; 1+],
  tools: [Solid],
  tolerance?: number(Length),
  legacyMethod?: bool,
): [Solid]
//   @solids: The solids to use as the base to subtract from
//   tools: The solids to subtract
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   legacyMethod: You probably shouldn't set this or care about this, it's for opting back into an older version of an engine algorithm
// Example:
//   @settings(defaultLengthUnit = mm, kclVersion = 2.0)
//   
//   baseSketch = sketch(on = XY) {
//     bottom = line(start = [var -10mm, var -10mm], end = [var 10mm, var -10mm])
//     right = line(start = [var 10mm, var -10mm], end = [var 10mm, var 10mm])
//     top = line(start = [var 10mm, var 10mm], end = [var -10mm, var 10mm])
//     left = line(start = [var -10mm, var 10mm], end = [var -10mm, var -10mm])
//     coincident([bottom.end, right.start])
//     coincident([right.end, top.start])
//     coincident([top.end, left.start])
//     coincident([left.end, bottom.start])
//   }
//   baseRegion = region(segments = [baseSketch.bottom, baseSketch.right])
//   base = extrude(baseRegion, length = 10mm)
//   
//   toolSketch = sketch(on = XY) {
//     bottom = line(start = [var 2mm, var -2mm], end = [var 12mm, var -2mm])
//     right = line(start = [var 12mm, var -2mm], end = [var 12mm, var 8mm])
//     top = line(start = [var 12mm, var 8mm], end = [var 2mm, var 8mm])
//     left = line(start = [var 2mm, var 8mm], end = [var 2mm, var -2mm])
//     coincident([bottom.end, right.start])
//     coincident([right.end, top.start])
//     coincident([top.end, left.start])
//     coincident([left.end, bottom.start])
//   }
//   toolRegion = region(segments = [toolSketch.bottom, toolSketch.right])
//   tool = extrude(toolRegion, length = 10mm)
//     |> translate(z = 1mm)
//   
//   subtractedPart = subtract([base], tools = [tool])

// Category: std.solid
// Set the appearance of a solid, imported geometry, or plane
// Remarks: This will work on any solid, including extruded solids, revolved solids, and shelled solids. For planes, only `color` is used.
// std.solid.appearance (function)
appearance(
  @solids: [Solid; 1+] | ImportedGeometry | Plane,
  color: string,
  metalness?: number(_),
  roughness?: number(_),
  opacity?: number(_),
): [Solid; 1+] | ImportedGeometry | Plane
//   @solids: The solid(s), imported geometry, or plane whose appearance is being set
//   color: Color of the new material, a hex string like '#ff0000'
//   metalness: Metalness of the new material, a percentage like 95.7
//   roughness: Roughness of the new material, a percentage like 95.7
//   opacity: Opacity
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
//   pipeProfile = sketch(on = XY) {
//     outerCircle = circle(start = [var 2mm, var 0mm], center = [var 0mm, var 0mm])
//     innerCircle = circle(start = [var 1.5mm, var 0mm], center = [var 0mm, var 0mm])
//   }
//   pipeRegion = region(segments = [pipeProfile.outerCircle])
//   sweep(pipeRegion, path = sweepPath)
//     |> appearance(color = "#ff0000", metalness = 50, roughness = 50)

// Category: std.solid
// Flips the orientation of a surface, swapping which side is the front and which is the reverse
// std.solid.flipSurface (function)
flipSurface(@surface: [Solid; 1+]): [Solid; 1+]
//   @surface: The surfaces to flip (swap the surface's back and front sides)
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   sideLen = 4
//   
//   fn square(@plane, offset, y) {
//     at = if y {
//       [-offset, 0]
//     } else {
//       [0, offset]
//     }
//     return startSketchOn(plane)
//       |> startProfile(at)
//       |> if y { yLine(length = sideLen)} else {xLine(length = sideLen)}
//       |> extrude(length = if y {-sideLen} else {sideLen}, bodyType = SURFACE)
//   }
//   
//   // Make a cube polysurface from 6 squares
//   cube = [
//     square(XY, offset = 0, y = false),
//     square(XZ, offset = 0, y = true) |> flipSurface(),
//     square(YZ, offset = 0, y = false),
//     square(XY, offset = sideLen, y = false),
//     square(XZ, offset = -sideLen, y = true),
//     square(YZ, offset = sideLen, y = false)
//   ]

// Category: std.solid
// Split all faces of the target body along all faces of the tool bodies
// std.solid.split (function)
split(
  @targets: [Solid; 1+],
  merge?: bool,
  keepTools?: bool,
  tools?: [Solid],
  legacyMethod?: bool,
): [Solid; 1+]
//   @targets: The bodies to split
//   merge: Whether to merge the bodies into one after
//   keepTools: If false, the tool bodies will be removed from the scene
//   tools: The tools to split the target bodies along
//   legacyMethod: You probably shouldn't set this or care about this, it's for opting back into an older version of an engine algorithm
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   sideLen = 4
//   
//   // Helper function to make a square surface body.
//   fn square(@plane, offset, y) {
//     at = if y {
//       [-offset, 0]
//     } else {
//       [0, offset]
//     }
//     return startSketchOn(plane)
//       |> startProfile(at)
//       |> if y { yLine(length = sideLen)} else {xLine(length = sideLen)}
//       |> extrude(length = if y {-sideLen} else {sideLen}, bodyType = SURFACE)
//   }
//   
//   // Make a cube polysurface from 6 squares.
//   cube = [
//     square(XY, offset = 0, y = false),
//     square(XZ, offset = 0, y = true) |> flipSurface(),
//     square(YZ, offset = 0, y = false),
//     square(XY, offset = sideLen, y = false),
//     square(XZ, offset = -sideLen, y = true),
//     square(YZ, offset = sideLen, y = false)
//   ]
//   
//   // Via split + merge, create a solid cube from the 6 square surfaces (faces of the cube).
//   cubeSolid = split(cube, merge = true)
//   
//   // To prove it's solid, we can set the whole cube's appearance.
//   appearance(cubeSolid, color = "#da4333", roughness = 50, metalness = 90)

// Category: std.solid
// Given a KCL value that is a "body" (currently typed as `Solid`), returns `true` if the value is a solid and `false` otherwise
// std.solid.isSolid (function)
isSolid(@val: Solid): bool
//   @val: Value to check if it is a solid or not
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   fn square(@plane, origin, side, body_type) {
//     return startSketchOn(plane)
//       |> startProfile(at = origin)
//       |> yLine(length = side)
//       |> xLine(length = side)
//       |> yLine(length = -side)
//       |> xLine(length = -side)
//       |> extrude(length = side, bodyType = body_type)
//   }
//   
//   originX0Y0 = [0, 0]
//   originX10Y0 = [10, 0]
//   
//   cube = square(
//     XY,
//     origin = originX0Y0,
//     side = 5,
//     body_type = "solid",
//   )
//   openBoxSurface = square(
//     XY,
//     origin = originX10Y0,
//     side = 6,
//     body_type = "surface",
//   )
//   
//   assertIs(isSolid(cube))
//   assertIs(isSurface(openBoxSurface))
//   
//   // surface is not a solid
//   assertIs(!isSolid(openBoxSurface))
//   
//   // solid is not a surface
//   assertIs(!isSurface(cube))

// Category: std.solid
// Given a KCL value that is a 'body' (currently typed as `Solid`), returns `true` if the value is a surface and `false` otherwise
// std.solid.isSurface (function)
isSurface(@val: Solid): bool
//   @val: Value to check if it is a surface or not
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   fn square(@plane, origin, side, body_type) {
//     return startSketchOn(plane)
//       |> startProfile(at = origin)
//       |> yLine(length = side)
//       |> xLine(length = side)
//       |> yLine(length = -side)
//       |> xLine(length = -side)
//       |> extrude(length = side, bodyType = body_type)
//   }
//   
//   originX0Y0 = [0, 0]
//   originX10Y0 = [10, 0]
//   
//   cube = square(
//     XY,
//     origin = originX0Y0,
//     side = 5,
//     body_type = "solid",
//   )
//   openBoxSurface = square(
//     XY,
//     origin = originX10Y0,
//     side = 6,
//     body_type = "surface",
//   )
//   
//   assertIs(isSolid(cube))
//   assertIs(isSurface(openBoxSurface))
//   
//   // surface is not a solid
//   assertIs(!isSolid(openBoxSurface))
//   
//   // solid is not a surface
//   assertIs(!isSurface(cube))

// Category: std.solid
// Delete a face from a body (a solid, or a polysurface)
// std.solid.deleteFace (function)
deleteFace(
  @body: Solid,
  faces?: [TaggedFace; 1+],
  faceIndices?: [number(_); 1+],
): Solid
//   @body: Target to delete a surface from
//   faces: Face to delete
//   faceIndices: Face to delete
// Example:
//   boxProfile = sketch(on = XY) {
//     edge1 = line(start = [var 0mm, var 0mm], end = [var 5mm, var 0mm])
//     edge2 = line(start = [var 5mm, var 0mm], end = [var 5mm, var 5mm])
//     edge3 = line(start = [var 5mm, var 5mm], end = [var 0mm, var 5mm])
//     edge4 = line(start = [var 0mm, var 5mm], end = [var 0mm, var 0mm])
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
//   box = extrude(region(segments = [boxProfile.edge1, boxProfile.edge2]), length = 4mm, tagEnd = $top)
//   openBox = deleteFace(box, faces = [top])

// Category: std.solid
// Blend two surfaces together
// Remarks: Or blend the full edges directly with tagged edges (no `getBoundedEdge`): Experimental face API: edge specifier objects are supported for testing, but are not ready for generated or user-facing KCL yet; prefer tagged edges or bounded edges until point-and-click and migration support ships. Sketch block tags work too:
// std.solid.blend (function)
blend(@edges: [BoundedEdge | TaggedEdge | any; 2]): Solid
//   @edges: The two edges that will be blended
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
//   myBlend = blend([extrude001.sketch.tags.line7, extrude002.sketch.tags.line3])

// Category: std.solid
// Join multiple surfaces together into one body, or join together the results of a split into one body
// std.solid.joinSurfaces (function)
joinSurfaces(
  @selection: [Solid; 1+],
  tolerance?: number(Length),
): Solid
//   @selection: The bodies to join together
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   @settings(defaultLengthUnit = mm)
//   
//   beamSectionWidth = 40
//   beamSectionHeight = 95
//   beamLength = 142
//   beamCurvedRadius = 2000
//   beamCurvedArcLength = beamLength
//   beamBoxCutterInset = 8
//   beamForkCutterGap = 2
//   beamForkCutterTipExtension = beamBoxCutterInset + beamForkCutterGap
//   
//   beamHalfWidth = beamSectionWidth / 2
//   beamHalfHeight = beamSectionHeight / 2
//   beamCurvedAngle = -(beamCurvedArcLength / beamCurvedRadius): number(rad)
//   beamForkCutterHalfWidth = beamHalfWidth + beamForkCutterGap
//   beamForkCutterHalfHeight = beamHalfHeight + beamForkCutterGap
//   beamForkCutterBackX = beamForkCutterHalfWidth
//   beamForkCutterOpenX = -beamForkCutterHalfWidth - beamForkCutterTipExtension
//   
//   
//   beamForkCutterStraightProfile = startSketchOn(XZ)
//     |> startProfile(at = [beamForkCutterOpenX, beamForkCutterHalfHeight])
//     |> line(
//          end = [beamForkCutterBackX - beamForkCutterOpenX, 0],
//          tag = $beamForkCutterTopStraightEdge,
//        )
//     |> line(end = [0, -2 * beamForkCutterHalfHeight], tag = $beamForkCutterBackStraightEdge)
//     |> line(
//          end = [beamForkCutterOpenX - beamForkCutterBackX, 0],
//          tag = $beamForkCutterBottomStraightEdge,
//        )
//   
//   beamForkCutterStraight = extrude(
//     beamForkCutterStraightProfile,
//     length = beamLength,
//     bodyType = SURFACE,
//   )
//   
//   beamForkCutterCurvedProfile = startSketchOn(XZ)
//     |> startProfile(at = [beamForkCutterOpenX, beamForkCutterHalfHeight])
//     |> line(
//          end = [beamForkCutterBackX - beamForkCutterOpenX, 0],
//          tag = $beamForkCutterTopCurvedEdge,
//        )
//     |> line(end = [0, -2 * beamForkCutterHalfHeight], tag = $beamForkCutterBackCurvedEdge)
//     |> line(
//          end = [beamForkCutterOpenX - beamForkCutterBackX, 0],
//          tag = $beamForkCutterBottomCurvedEdge,
//        )
//   
//   curvedBeamAxis = {
//     direction = [0, 1],
//     origin = [beamCurvedRadius, 0]
//   }
//   
//   beamForkCutterCurved = revolve(
//     beamForkCutterCurvedProfile,
//     axis = curvedBeamAxis,
//     angle = beamCurvedAngle,
//     bodyType = SURFACE,
//   )
//   
//   beamForkCutterCurvedPlaced = beamForkCutterCurved
//     |> rotate(axis = Z, angle = -22deg, global = true)
//     |> translate(x = 93, y = 453, global = true)
//   
//   beamForkCutterTopBlend = blend([
//     getBoundedEdge(beamForkCutterCurvedPlaced, edge = getOppositeEdge(beamForkCutterTopCurvedEdge)),
//     beamForkCutterTopStraightEdge,
//   ])
//   
//   beamForkCutterBackBlend = blend([
//     getBoundedEdge(beamForkCutterCurvedPlaced, edge = getOppositeEdge(beamForkCutterBackCurvedEdge)),
//     beamForkCutterBackStraightEdge,
//   ])
//   
//   beamForkCutterBottomBlend = blend([
//     getBoundedEdge(beamForkCutterCurvedPlaced, edge = getOppositeEdge(beamForkCutterBottomCurvedEdge)),
//     beamForkCutterBottomStraightEdge,
//   ])
//   
//   bumperBeamForkCutter = [
//     beamForkCutterTopBlend,
//     beamForkCutterBackBlend,
//     beamForkCutterBottomBlend,
//   ]
//   |> joinSurfaces()

// Category: std.solid
// This module contains functions for modifying solids, e.g., by adding a fillet or chamfer, or removing part of a solid
solid
