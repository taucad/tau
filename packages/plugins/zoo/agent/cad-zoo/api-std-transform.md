# kcl-std — std.transform

5 top-level symbols. Signatures are verbatim kcl.

// Category: std.transform
// Mirror a sketch
// Remarks: Mirror occurs around a local sketch axis rather than a global axis.
mirror2d(
  @sketches: [Sketch; 1+],
  axis: Axis2d | Edge,
): Sketch
//   @sketches: The sketch or sketches to be reflected
//   axis: The axis to reflect around

// Category: std.transform
// Move a solid or a sketch
// Remarks: This is really useful for assembling parts together. You can create a part and then move it to the correct location. Translate is really useful for sketches if you want to move a sketch and then rotate it using the `rotate` function to create a loft.
translate(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  x?: number(Length),
  y?: number(Length),
  z?: number(Length),
  global?: bool,
  xyz?: [number(Length); 3],
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry
//   @objects: The solid, sketch, or set of solids or sketches to move
//   x: The amount to move the solid or sketch along the x axis
//   y: The amount to move the solid or sketch along the y axis
//   z: The amount to move the solid or sketch along the z axis
//   global: If true, the transform is applied in global space
//   xyz: If given, interpret this point as 3 distances, along each of [X, Y, Z] and translate by each of them

// Category: std.transform
// Rotate a solid or a sketch
// Remarks: This is really useful for assembling parts together. You can create a part and then rotate it to the correct orientation. For sketches, you can use this to rotate a sketch and then loft it with another sketch. ### Using Roll, Pitch, and Yaw When rotating a part in 3D space, "roll," "pitch," and "yaw" refer to the three rotational axes used to describe its orientation: roll is rotation around the longitudinal axis (front-to-back), pitch is rotation around the lateral axis (wing-to-wing), and yaw is rotation around the vertical axis (up-down); essentially, it's like tilting the part on its side (roll), tipping the nose up or down (pitch), and turning it left or right (yaw). So, in the context of a 3D model: - **Roll**: Imagine spinning a pencil on its tip - that's a roll movement. - **Pitch**: Think of a seesaw motion, where the object tilts up or down along its side axis. - **Yaw**: Like turning your head left or right, this is a rotation around the vertical axis ### Using an Axis and Angle When rotating a part around an axis, you specify the axis of rotation and the angle of rotation.
rotate(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  roll?: number(Angle),
  pitch?: number(Angle),
  yaw?: number(Angle),
  axis?: Axis3d | Point3d,
  angle?: number(Angle),
  global?: bool,
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry
//   @objects: The solid, sketch, or set of solids or sketches to rotate
//   roll: The roll angle
//   pitch: The pitch angle
//   yaw: The yaw angle
//   axis: The axis to rotate around
//   angle: The angle to rotate
//   global: If true, the transform is applied in global space

// Category: std.transform
// Scale a solid or a sketch
// Remarks: This is really useful for resizing parts. You can create a part and then scale it to the correct size. For sketches, you can use this to scale a sketch and then loft it with another sketch. By default the transform is applied in local sketch axis, therefore the origin will not move. If you want to apply the transform in global space, set `global` to `true`. The origin of the model will move. If the model is not centered on origin and you scale globally it will look like the model moves and gets bigger at the same time. Say you have a square `(1,1) - (1,2) - (2,2) - (2,1)` and you scale by 2 globally it will become `(2,2) - (2,4)`...etc so the origin has moved from `(1.5, 1.5)` to `(2,2)`.
scale(
  @objects: [Solid; 1+] | [Sketch; 1+] | ImportedGeometry,
  x?: number(_),
  y?: number(_),
  z?: number(_),
  global?: bool,
  factor?: number(_),
): [Solid; 1+] | [Sketch; 1+] | ImportedGeometry
//   @objects: The solid, sketch, or set of solids or sketches to scale
//   x: The scale factor for the x axis
//   y: The scale factor for the y axis
//   z: The scale factor for the z axis
//   global: If true, the transform is applied in global space
//   factor: If given, scale the solid by this much

// Category: std.transform
// This module contains functions for transforming sketches and solids
transform
