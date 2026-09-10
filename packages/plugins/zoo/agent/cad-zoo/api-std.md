# kcl-std — std

16 top-level symbols. Signatures are verbatim kcl.

// Create a helix
helix(
revolutions: number(\_),
angleStart: number(Angle),
ccw?: bool,
radius?: number(Length),
axis?: Axis3d | Edge,
length?: number(Length),
cylinder?: Solid,
): Helix
// revolutions: Number of revolutions
// angleStart: Start angle
// ccw: Is the helix rotation counter clockwise? The default is `false`
// radius: Radius of the helix
// axis: Axis to use for the helix
// length: Length of the helix
// cylinder: Cylinder to create the helix on

// Offset a plane by a distance along its normal
offsetPlane(
@plane: Plane,
offset: number(Length),
): Plane
// @plane: The plane (e.g
// offset: Distance from the standard plane this new plane will be created at

// Clone a sketch or solid
clone(@geometry: Sketch | Solid | ImportedGeometry): Sketch | Solid | ImportedGeometry
// @geometry: The sketch, solid, or imported geometry to be cloned

// Asserts that a value is the boolean value true
assertIs(
@actual: bool,
error?: string,
)
// @actual: Value to check
// error: If the value was false, the program will terminate with this error message

// Check a value meets some expected conditions at runtime
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
// @actual: Value to check
// isGreaterThan: Comparison argument
// isLessThan: Comparison argument
// isGreaterThanOrEqual: Comparison argument
// isLessThanOrEqual: Comparison argument
// isEqualTo: Comparison argument
// tolerance: If `isEqualTo` is used, this is the tolerance to allow for the comparison
// error: If the value was false, the program will terminate with this error message

// An abstract 3d plane aligned with the X and Y axes
XY: Plane

// An abstract 3d plane aligned with the X and Z axes
XZ: Plane

// An abstract 3d plane aligned with the Y and Z axes
YZ: Plane

// The X-axis (can be used in both 2d and 3d contexts)
X: Axis3d

// The Y-axis (can be used in both 2d and 3d contexts)
Y: Axis3d

// The 3D Z-axis
Z: Axis3d

// Identifies the starting face of an extrusion
START: TaggedFace

// Identifies the ending face of an extrusion
END: TaggedFace

// Specifies that a new object is created during extrusion
NEW: string

// Specifies that the extrusion will be pulled into or pushed out of the existing object, modifying it without creating a new object
MERGE: string

// The KCL standard library
std
