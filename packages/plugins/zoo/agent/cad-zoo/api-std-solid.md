# kcl-std — std.solid

12 top-level symbols. Signatures are verbatim kcl.

// Category: std.solid
// Blend a transitional edge along a tagged path, smoothing the sharp edge
// Remarks: Fillet is similar in function and use to a chamfer, except
a chamfer will cut a sharp transition along an edge while fillet
will smoothly blend the transition.
fillet(
  @solid: Solid,
  radius: number(Length),
  tags: [Edge; 1+],
  tolerance?: number(Length),
  tag?: TagDecl,
): Solid
//   @solid: The solid whose edges should be filletted
//   radius: The radius of the fillet
//   tags: The paths you want to fillet
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
//   tag: Create a new tag which refers to this fillet

// Category: std.solid
// Cut a straight transitional edge along a tagged path
// Remarks: Chamfer is similar in function and use to a fillet, except
a fillet will blend the transition along an edge, rather than cut
a sharp, straight transitional edge.
chamfer(
  @solid: Solid,
  length: number(Length),
  tags: [Edge; 1+],
  secondLength?: number(Length),
  angle?: number(Angle),
  tag?: TagDecl,
): Solid
//   @solid: The solid whose edges should be chamfered
//   length: Chamfering cuts away two faces to create a third face
//   tags: The paths you want to chamfer
//   secondLength: Chamfering cuts away two faces to create a third face
//   angle: Chamfering cuts away two faces to create a third face
//   tag: Create a new tag which refers to this chamfer

// Category: std.solid
// Remove volume from a 3-dimensional shape such that a wall of the provided thickness remains, taking volume starting at the provided face, leaving it open in that direction
shell(
  @solids: [Solid; 1+],
  thickness: number(Length),
  faces: [TaggedFace; 1+],
): [Solid]
//   @solids: Which solid (or solids) to shell out
//   thickness: The thickness of the shell
//   faces: The faces you want removed

// Category: std.solid
// Make the inside of a 3D object hollow
// Remarks: Remove volume from a 3-dimensional shape such that a wall of the
provided thickness remains around the exterior of the shape.
hollow(
  @solid: Solid,
  thickness: number(Length),
): Solid
//   @solid: Which solid to hollow out
//   thickness: The thickness of the remaining shell

// Category: std.solid
// Repeat a 3-dimensional solid, changing it each time
// Remarks: Replicates the 3D solid, applying a transformation function to each replica.
Transformation function could alter rotation, scale, visibility, position, etc.

The `patternTransform` call itself takes a number for how many total instances of
the shape should be. For example, if you use a circle with `patternTransform(instances = 4, transform = f)`
then there will be 4 circles: the original, and 3 created by replicating the original and
calling the transform function on each.

The transform function takes a single parameter: an integer representing which
number replication the transform is for. E.g. the first replica to be transformed
will be passed the argument `1`. This simplifies your math: the transform function can
rely on id `0` being the original instance passed into the `patternTransform`. See the examples.

The transform function returns a transform object. All properties of the object are optional,
they each default to "no change". So the overall transform object defaults to "no change" too.
Its properties are:

 - `translate` (3D point)

   Translates the replica, moving its position in space.

 - `replicate` (bool)

   If false, this ID will not actually copy the object. It'll be skipped.

 - `scale` (3D point)

   Stretches the object, multiplying its width in the given dimension by the point's component in
   that direction.

 - `rotation` (object, with the following properties)

   - `rotation.axis` (a 3D point, defaults to the Z axis)

   - `rotation.angle`

   - `rotation.origin` (either "local" i.e. rotate around its own center, "global" i.e. rotate around the scene's center, or a 3D point, defaults to "local")
patternTransform(
  @solids: [Solid; 1+],
  instances: number(_),
  transform: fn(number(_)): { },
  useOriginal?: bool,
): [Solid; 1+]
//   @solids: The solid(s) to duplicate
//   instances: The number of total instances
//   transform: How each replica should be transformed
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Category: std.solid
// Repeat a 3-dimensional solid along a linear path, with a dynamic amount of distance between each repetition, some specified number of times
patternLinear3d(
  @solids: [Solid; 1+],
  instances: number(_),
  distance: number(Length),
  axis: Axis3d | Point3d,
  useOriginal?: bool,
): [Solid; 1+]
//   @solids: The solid(s) to duplicate
//   instances: The number of total instances
//   distance: Distance between each repetition
//   axis: The axis of the pattern
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Category: std.solid
// Repeat a 3-dimensional solid some number of times along a partial or complete circle some specified number of times
patternCircular3d(
  @solids: [Solid; 1+],
  instances: number(_),
  axis: Axis3d | Point3d,
  center: Point3d,
  arcDegrees?: number(deg),
  rotateDuplicates?: bool,
  useOriginal?: bool,
): [Solid; 1+]
//   @solids: The solid(s) to pattern
//   instances: The number of total instances
//   axis: The axis of the pattern
//   center: The center about which to make the pattern
//   arcDegrees: "The arc angle to place the repetitions
//   rotateDuplicates: Whether or not to rotate the duplicates as they are copied
//   useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Category: std.solid
// Union two or more solids into a single solid
union(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
): [Solid; 1+]
//   @solids: The solids to union
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar

// Category: std.solid
// Intersect returns the shared volume between multiple solids, preserving only overlapping regions
// Remarks: Intersect computes the geometric intersection of multiple solid bodies,
returning a new solid representing the volume that is common to all input
solids. This operation is useful for determining shared material regions,
verifying fit, and analyzing overlapping geometries in assemblies.
intersect(
  @solids: [Solid; 2+],
  tolerance?: number(Length),
): [Solid; 1+]
//   @solids: The solids to intersect
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar

// Category: std.solid
// Subtract removes tool solids from base solids, leaving the remaining material
// Remarks: Performs a bool subtraction operation, removing the volume of one or more
tool solids from one or more base solids. The result is a new solid
representing the material that remains after all tool solids have been cut
away. This function is essential for machining simulations, cavity creation,
and complex multi-body part modeling.
subtract(
  @solids: [Solid; 1+],
  tools: [Solid],
  tolerance?: number(Length),
): [Solid; 1+]
//   @solids: The solids to use as the base to subtract from
//   tools: The solids to subtract
//   tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar

// Category: std.solid
// Set the appearance of a solid
// Remarks: This will work on any solid, including extruded solids, revolved solids, and shelled solids.
appearance(
  @solids: [Solid; 1+] | ImportedGeometry,
  color: string,
  metalness?: number(_),
  roughness?: number(_),
): [Solid; 1+] | ImportedGeometry
//   @solids: The The solid(s) whose appearance is being set
//   color: Color of the new material, a hex string like '#ff0000'
//   metalness: Metalness of the new material, a percentage like 95.7
//   roughness: Roughness of the new material, a percentage like 95.7

// Category: std.solid
// This module contains functions for modifying solids, e.g., by adding a fillet or chamfer, or removing part of a solid
solid
