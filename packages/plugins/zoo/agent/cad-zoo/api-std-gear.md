# kcl-std — std.gear

5 top-level symbols. Signatures are verbatim kcl.

// Category: std.gear
// A helical gear (like a spur gear, but the teeth are cut at an angle to the axis)
// Remarks: The gear will be placed at (0, 0, 0) in the global scene, and extruded up the Z axis. Use `translate()` and `rotate()` to move it around once it's created.
// EXPERIMENTAL
// std.gear.gear::helical (function)
gear::helical(
  nTeeth: number(_),
  module: number(Length),
  pressureAngle: number(Angle),
  helixAngle: number(Angle),
  gearHeight: number(Length),
): Solid
//   nTeeth: A number
//   module: A number
//   pressureAngle: A number
//   helixAngle: A number
//   gearHeight: A number
// Example:
//   // Basic helical gear example.
//   
//   @settings(defaultLengthUnit = mm, kclVersion = 1.0, experimentalFeatures = allow)
//   gearBody = gear::helical(
//     nTeeth = 10,
//     module = 2,
//     pressureAngle = 20deg,
//     helixAngle = 35deg,
//     gearHeight = 7,
//   )

// Category: std.gear
// A spur gear (like a helical gear, with a helix angle of 0)
// Remarks: The gear will be placed at (0, 0, 0) in the global scene, and extruded up the Z axis. Use `translate()` and `rotate()` to move it around once it's created.
// EXPERIMENTAL
// std.gear.gear::spur (function)
gear::spur(
  nTeeth: number(_),
  module: number(Length),
  pressureAngle: number(Angle),
  gearHeight: number(Length),
): Solid
//   nTeeth: A number
//   module: A number
//   pressureAngle: A number
//   gearHeight: A number
// Example:
//   // Basic example of a spur gear.
//   
//   @settings(defaultLengthUnit = mm, kclVersion = 1.0, experimentalFeatures = allow)
//   
//   gear::spur(
//     nTeeth = 21,
//     module = 1.5,
//     pressureAngle = 14deg,
//     gearHeight = 6,
//   )

// Category: std.gear
// A herringbone gear (like a helical gear that reverses direction halfway up the axis)
// Remarks: The gear will be placed at (0, 0, 0) in the global scene, and extruded up the Z axis. Use `translate()` and `rotate()` to move it around once it's created.
// EXPERIMENTAL
// std.gear.gear::herringbone (function)
gear::herringbone(
  nTeeth: number(_),
  module: number(Length),
  pressureAngle: number(Angle),
  gearHeight: number(Length),
  helixAngle: number(Angle),
): Solid
//   nTeeth: A number
//   module: A number
//   pressureAngle: A number
//   gearHeight: A number
//   helixAngle: A number
// Example:
//   // Basic herringbone gear example.
//   
//   @settings(defaultLengthUnit = mm, kclVersion = 1.0, experimentalFeatures = allow)
//   myGear = gear::herringbone(
//     nTeeth = 10,
//     module = 2,
//     pressureAngle = 20deg,
//     gearHeight = 5,
//     helixAngle = 40deg,
//   )

// Category: std.gear
// A ring gear (i.e
// Remarks: The gear will be placed at (0, 0, 0) in the global scene, and extruded up the Z axis. Use `translate()` and `rotate()` to move it around once it's created.
// EXPERIMENTAL
// std.gear.gear::ring (function)
gear::ring(
  nTeeth: number(_),
  module: number(Length),
  pressureAngle: number(Angle),
  helixAngle: number(Angle),
  gearHeight: number(Length),
): Solid
//   nTeeth: A number
//   module: A number
//   pressureAngle: A number
//   helixAngle: A number
//   gearHeight: A number
// Example:
//   // Basic example of a ring gear.
//   
//   @settings(defaultLengthUnit = mm, kclVersion = 1.0, experimentalFeatures = allow)
//   
//   gear::ring(
//     nTeeth = 40,
//     module = 1.5,
//     pressureAngle = 14deg,
//     helixAngle = -25deg,
//     gearHeight = 5,
//   )

// Category: std.gear
// Define gears that users can include in their models
// EXPERIMENTAL
gear
