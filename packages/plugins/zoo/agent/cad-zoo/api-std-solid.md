# kcl-std — std.solid

12 top-level symbols. Signatures are verbatim kcl.

// Blend a transitional edge along a tagged path, smoothing the sharp edge
fillet(
@solid: Solid,
radius: number(Length),
tags: [Edge; 1+],
tolerance?: number(Length),
tag?: TagDecl,
): Solid
// @solid: The solid whose edges should be filletted
// radius: The radius of the fillet
// tags: The paths you want to fillet
// tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar
// tag: Create a new tag which refers to this fillet

// Cut a straight transitional edge along a tagged path
chamfer(
@solid: Solid,
length: number(Length),
tags: [Edge; 1+],
secondLength?: number(Length),
angle?: number(Angle),
tag?: TagDecl,
): Solid
// @solid: The solid whose edges should be chamfered
// length: Chamfering cuts away two faces to create a third face
// tags: The paths you want to chamfer
// secondLength: Chamfering cuts away two faces to create a third face
// angle: Chamfering cuts away two faces to create a third face
// tag: Create a new tag which refers to this chamfer

// Remove volume from a 3-dimensional shape such that a wall of the provided thickness remains, taking volume starting at the provided face, leaving it open in that direction
shell(
@solids: [Solid; 1+],
thickness: number(Length),
faces: [TaggedFace; 1+],
): [Solid]
// @solids: Which solid (or solids) to shell out
// thickness: The thickness of the shell
// faces: The faces you want removed

// Make the inside of a 3D object hollow
hollow(
@solid: Solid,
thickness: number(Length),
): Solid
// @solid: Which solid to hollow out
// thickness: The thickness of the remaining shell

// Repeat a 3-dimensional solid, changing it each time
patternTransform(
@solids: [Solid; 1+],
instances: number(_),
transform: fn(number(_)): { },
useOriginal?: bool,
): [Solid; 1+]
// @solids: The solid(s) to duplicate
// instances: The number of total instances
// transform: How each replica should be transformed
// useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Repeat a 3-dimensional solid along a linear path, with a dynamic amount of distance between each repetition, some specified number of times
patternLinear3d(
@solids: [Solid; 1+],
instances: number(\_),
distance: number(Length),
axis: Axis3d | Point3d,
useOriginal?: bool,
): [Solid; 1+]
// @solids: The solid(s) to duplicate
// instances: The number of total instances
// distance: Distance between each repetition
// axis: The axis of the pattern
// useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Repeat a 3-dimensional solid some number of times along a partial or complete circle some specified number of times
patternCircular3d(
@solids: [Solid; 1+],
instances: number(\_),
axis: Axis3d | Point3d,
center: Point3d,
arcDegrees?: number(deg),
rotateDuplicates?: bool,
useOriginal?: bool,
): [Solid; 1+]
// @solids: The solid(s) to pattern
// instances: The number of total instances
// axis: The axis of the pattern
// center: The center about which to make the pattern
// arcDegrees: "The arc angle to place the repetitions
// rotateDuplicates: Whether or not to rotate the duplicates as they are copied
// useOriginal: If the target was sketched on an extrusion, setting this will use the original sketch as the target, not the entire joined solid

// Union two or more solids into a single solid
union(
@solids: [Solid; 2+],
tolerance?: number(Length),
): [Solid; 1+]
// @solids: The solids to union
// tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar

// Intersect returns the shared volume between multiple solids, preserving only overlapping regions
intersect(
@solids: [Solid; 2+],
tolerance?: number(Length),
): [Solid; 1+]
// @solids: The solids to intersect
// tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar

// Subtract removes tool solids from base solids, leaving the remaining material
subtract(
@solids: [Solid; 1+],
tools: [Solid],
tolerance?: number(Length),
): [Solid; 1+]
// @solids: The solids to use as the base to subtract from
// tools: The solids to subtract
// tolerance: Defines the smallest distance below which two entities are considered coincident, intersecting, coplanar, or similar

// Set the appearance of a solid
appearance(
@solids: [Solid; 1+] | ImportedGeometry,
color: string,
metalness?: number(_),
roughness?: number(_),
): [Solid; 1+] | ImportedGeometry
// @solids: The The solid(s) whose appearance is being set
// color: Color of the new material, a hex string like '#ff0000'
// metalness: Metalness of the new material, a percentage like 95.7
// roughness: Roughness of the new material, a percentage like 95.7

// This module contains functions for modifying solids, e.g., by adding a fillet or chamfer, or removing part of a solid
solid
