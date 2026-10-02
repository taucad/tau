# kcl-std — std

16 top-level symbols. Signatures are verbatim kcl.

// Category: std
// Create a helix
// std.helix (function)
helix(
  revolutions: number(_),
  angleStart: number(Angle),
  ccw?: bool,
  radius?: number(Length),
  axis?: Axis3d | Edge,
  length?: number(Length),
  cylinder?: Solid,
): Helix
//   revolutions: Number of revolutions
//   angleStart: Start angle
//   ccw: Is the helix rotation counter clockwise? The default is `false`
//   radius: Radius of the helix
//   axis: Axis to use for the helix
//   length: Length of the helix
//   cylinder: Cylinder to create the helix on

// Category: std
// Offset a plane by a distance along its normal
// Remarks: For example, if you offset the `XZ` plane by 10, the new plane will be parallel to the `XZ` plane and 10 units away from it.
// std.offsetPlane (function)
offsetPlane(
  @plane: Plane,
  offset: number(Length),
): Plane
//   @plane: The plane (e.g
//   offset: Distance from the standard plane this new plane will be created at

// Category: std
// Clone a sketch or solid
// Remarks: This works essentially like a copy-paste operation. It creates a perfect replica at that point in time that you can manipulate individually afterwards. This doesn't really have much utility unless you need the equivalent of a double instance pattern with zero transformations. Really only use this function if YOU ARE SURE you need it. In most cases you do not need clone and using a pattern with `instance = 2` is more appropriate.
// std.clone (function)
clone(@geometry: Sketch | Solid | ImportedGeometry): Sketch | Solid | ImportedGeometry
//   @geometry: The sketch, solid, or imported geometry to be cloned

// Category: std
// Asserts that a value is the boolean value true
// std.assertIs (function)
assertIs(
  @actual: bool,
  error?: string,
)
//   @actual: Value to check
//   error: If the value was false, the program will terminate with this error message

// Category: std
// Check a value meets some expected conditions at runtime
// std.assert (function)
assert(
  @actual: number,
  isGreaterThan?: number,
  isLessThan?: number,
  isGreaterThanOrEqual?: number,
  isLessThanOrEqual?: number,
  isEqualTo?: number,
  tolerance?: number,
  error?: string,
)
//   @actual: Value to check
//   isGreaterThan: Comparison argument
//   isLessThan: Comparison argument
//   isGreaterThanOrEqual: Comparison argument
//   isLessThanOrEqual: Comparison argument
//   isEqualTo: Comparison argument
//   tolerance: If `isEqualTo` is used, this is the tolerance to allow for the comparison
//   error: If the value was false, the program will terminate with this error message

// Category: std
// An abstract 3d plane aligned with the X and Y axes
XY: Plane

// Category: std
// An abstract 3d plane aligned with the X and Z axes
XZ: Plane

// Category: std
// An abstract 3d plane aligned with the Y and Z axes
YZ: Plane

// Category: std
// The X-axis (can be used in both 2d and 3d contexts)
X: Axis3d

// Category: std
// The Y-axis (can be used in both 2d and 3d contexts)
Y: Axis3d

// Category: std
// The 3D Z-axis
Z: Axis3d

// Category: std
// Identifies the starting face of an extrusion
START: TaggedFace

// Category: std
// Identifies the ending face of an extrusion
END: TaggedFace

// Category: std
// Specifies that a new object is created during extrusion
NEW: string

// Category: std
// Specifies that the extrusion will be pulled into or pushed out of the existing object, modifying it without creating a new object
MERGE: string

// Category: std
// The KCL standard library
// Remarks: Contains frequently used constants, functions for interacting with the KittyCAD servers to create sketches and geometry, and utility functions. The standard library is organised into modules (listed below), but most things are always available in KCL programs. You might also want the [KCL language reference](/docs/kcl-lang) or the [KCL guide](https://zoo.dev/docs/kcl-book/intro.html).
std
