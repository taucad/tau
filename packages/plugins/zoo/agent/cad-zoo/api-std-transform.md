# kcl-std — std.transform

8 top-level symbols. Signatures are verbatim kcl.

// Category: std.transform
// Mirror a sketch
// Remarks: Mirror occurs around a local sketch axis rather than a global axis.
// std.transform.mirror2d (function)
mirror2d(
  @sketches: [Sketch; 1+],
  axis: Axis2d | Edge | Segment,
): Sketch
//   @sketches: The sketch or sketches to be reflected
//   axis: The axis to reflect around
// Example:
//   // Mirror an un-closed sketch across a line from a sketch block.
//   helper001 = sketch(on = XZ) {
//     line1 = line(start = [var 0mm, var 0mm], end = [var 0mm, var 10mm])
//   }
//   
//   sketch001 = startSketchOn(XZ)
//       |> startProfile(at = [0, 8.5])
//       |> line(end = [20, -8.5])
//       |> line(end = [-20, -8.5])
//       |> mirror2d(axis = helper001.line1)
//   
//   // example = extrude(sketch001, length = 10)

// Category: std.transform
// Create a mirror image of a 3D solid/surface/body, across some specified mirror axis
// std.transform.mirror3d (function)
mirror3d(
  @bodies: [Solid; 1+],
  across: Edge | Plane | Axis3d | Segment | any,
): [Solid; 1+]
//   @bodies: The body or bodies to be reflected
//   across: The axis (or other geometry) to reflect across
// Example:
//   // Simple mirror3d example, showing mirroring across named axes.
//   @settings(kclVersion = 2.0)
//   
//   sketch001 = sketch(on = XY) {
//     line3 = line(start = [var -4.59mm, var -5.11mm], end = [var -5mm, var 3.51mm])
//     arc1 = arc(start = [var -4.69mm, var -3.99mm], end = [var -6.48mm, var 0mm], center = [var -5.13mm, var -1.79mm])
//     horizontal([arc1.end, ORIGIN])
//   }
//   
//   hidden001 = hide(sketch001)
//   region001 = region(segments = [sketch001.line3, sketch001.arc1])
//   mySolid = extrude(region001, length = 1)
//     |> translate(z = 1)
//   
//   mySolid2 = mirror3d([mySolid], across = YZ)
//   mirror3d([mySolid, mySolid2], across = XY)

// Category: std.transform
// Move a solid, a sketch, or a helix
// Remarks: This is really useful for assembling parts together. You can create a part and then move it to the correct location. By default, this does a local translation, around the sketch/body's coordinate system. To translate around the global scene coordinate system, use `global = true`. Translate is really useful for sketches if you want to move a sketch and then rotate it using the `rotate` function to create a loft.
// std.transform.translate (function)
translate(
  @objects: [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry,
  x?: number(Length),
  y?: number(Length),
  z?: number(Length),
  global?: bool,
  xyz?: [number(Length); 3],
): [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry
//   @objects: The solid, sketch, helix, or set of solids, sketches, or helices to move
//   x: The amount to move the solid or sketch along the x axis
//   y: The amount to move the solid or sketch along the y axis
//   z: The amount to move the solid or sketch along the z axis
//   global: If true, the transform is applied in global space
//   xyz: If given, interpret this point as 3 distances, along each of [X, Y, Z] and translate by each of them
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
//   moved = sweep(pipeRegion, path = sweepPath)
//     |> translate(x = 1mm, y = 1mm, z = 2.5mm)

// Category: std.transform
// Rotate a solid, a sketch, or a helix
// Remarks: This is really useful for assembling parts together. You can create a part and then rotate it to the correct orientation. For sketches, you can use this to rotate a sketch and then loft it with another sketch. By default, this does a local rotation, around the sketch/body's center. To rotate around the global scene coordinates, use `global = true`. ### Using Roll, Pitch, and Yaw When rotating a part in 3D space, "roll," "pitch," and "yaw" refer to the three rotational axes used to describe its orientation: roll is rotation around the longitudinal axis (front-to-back), pitch is rotation around the lateral axis (wing-to-wing), and yaw is rotation around the vertical axis (up-down); essentially, it's like tilting the part on its side (roll), tipping the nose up or down (pitch), and turning it left or right (yaw). So, in the context of a 3D model: - **Roll**: Imagine spinning a pencil on its tip - that's a roll movement. - **Pitch**: Think of a seesaw motion, where the object tilts up or down along its side axis. - **Yaw**: Like turning your head left or right, this is a rotation around the vertical axis ### Using an Axis and Angle When rotating a part around an axis, you specify the axis of rotation and the angle of rotation.
// std.transform.rotate (function)
rotate(
  @objects: [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry,
  roll?: number(Angle),
  pitch?: number(Angle),
  yaw?: number(Angle),
  axis?: Axis3d | Point3d,
  angle?: number(Angle),
  global?: bool,
): [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry
//   @objects: The solid, sketch, helix, or set of solids, sketches, or helices to rotate
//   roll: The roll angle
//   pitch: The pitch angle
//   yaw: The yaw angle
//   axis: The axis to rotate around
//   angle: The angle to rotate
//   global: If true, the transform is applied in global space
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
//   rotated = sweep(pipeRegion, path = sweepPath)
//     |> rotate(roll = 10deg, pitch = 10deg, yaw = 90deg)

// Category: std.transform
// Scale a solid, a sketch, or a helix
// Remarks: This is really useful for resizing parts. You can create a part and then scale it to the correct size. For sketches, you can use this to scale a sketch and then loft it with another sketch. The `x`, `y`, `z`, and `factor` arguments are dimensionless multipliers, not physical distances. Unlike `translate`, `scale` does not accept a length such as `10mm`. To resize an object with a known size, divide the target length by the current length. For example, `targetWidth / seedWidth` produces the dimensionless scale factor for the x axis. By default the transform is applied in local sketch axis, therefore the origin will not move. If you want to apply the transform in global space, set `global` to `true`. The origin of the model will move. If the model is not centered on origin and you scale globally it will look like the model moves and gets bigger at the same time. Say you have a square `(1,1) - (1,2) - (2,2) - (2,1)` and you scale by 2 globally it will become `(2,2) - (2,4)`...etc so the origin has moved from `(1.5, 1.5)` to `(2,2)`. **NOTE:** Currently,, revolved bodies don't support being scaled in a non-uniform way (i.e. scaled differently along each axis).
// std.transform.scale (function)
scale(
  @objects: [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry,
  x?: number(_),
  y?: number(_),
  z?: number(_),
  global?: bool,
  factor?: number(_),
): [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry
//   @objects: The solid, sketch, helix, or set of solids, sketches, or helices to scale
//   x: The dimensionless scale factor for the x axis
//   y: The dimensionless scale factor for the y axis
//   z: The dimensionless scale factor for the z axis
//   global: If true, the transform is applied in global space
//   factor: If given, scale the solid by this dimensionless factor
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
//   scaled = sweep(pipeRegion, path = sweepPath)
//     |> scale(z = 2.5)

// Category: std.transform
// Hide solids, planes, sketches, helices, or imported objects
// Remarks: Hidden objects remain in the model and can still be referenced by later operations. Hiding can be useful to see hard-to-reach vantages, or clarify overlapping geometry while you work.
// std.transform.hide (function)
hide(@objects: [Solid; 1+] | [Plane; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry | [GdtAnnotation; 1+]): [Solid; 1+] | [Plane; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry | [GdtAnnotation; 1+]
//   @objects: The object or objects to hide
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Hide a body, leaving a sketch on face intact
//   cylinder = startSketchOn(XY)
//     |> circle(center = [0, 0], radius = 2)
//     |> extrude(length = 2mm)
//   dot = startSketchOn(cylinder, face = END)
//     |> circle(center = [0, 0], radius = 1)
//   hide(cylinder)

// Category: std.transform
// Deletes something from the scene
// EXPERIMENTAL
// std.transform.delete (function)
delete(@objects: [Solid; 1+] | [Sketch; 1+] | [Helix; 1+] | ImportedGeometry | [GdtAnnotation; 1+])
//   @objects: The object or objects to delete
// Example:
//   // Basic example, showing deleting something.
//   @settings(kclVersion = 2.0, experimentalFeatures = allow)
//   
//   // Make a cylinder
//   sketch001 = sketch(on = XY) {
//     circle1 = circle(start = [var -2mm, var 1mm], center = [var -1mm, var 0.5mm])
//   }
//   cylinder = extrude(region(sketch = sketch001, point = sketch001.circle1.center), length = 5)
//   // Delete it
//   delete(cylinder)

// Category: std.transform
// This module contains functions for transforming sketches and solids
transform
