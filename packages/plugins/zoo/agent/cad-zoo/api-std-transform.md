# kcl-std — std.transform

5 top-level symbols. Signatures are verbatim kcl.

// Mirror a sketch
mirror2d(
  @sketches: [Sketch; 1+],
  axis: Axis2d | Edge,
): Sketch
//   @sketches: The sketch or sketches to be reflected
//   axis: The axis to reflect around

// Move a solid or a sketch
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

// Rotate a solid or a sketch
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

// Scale a solid or a sketch
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

// This module contains functions for transforming sketches and solids
transform
