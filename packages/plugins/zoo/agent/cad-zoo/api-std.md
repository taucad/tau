# kcl-std — std

23 top-level symbols. Signatures are verbatim kcl.

// Category: std
// Create a helix
// std.helix (function)
helix(
  revolutions: number(_),
  angleStart: number(Angle),
  ccw?: bool,
  radius?: number(Length),
  axis?: Axis3d | Edge | Segment | any,
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
// Example:
//   // Demonstrate building a helix where the central axis is a line defined in a sketch block.
//   // First, here's the sketch block with a line:
//   sketch002 = sketch(on = XZ) {
//     line1 = line(start = [var -0.82mm, var 3.4mm], end = [var -1.58mm, var -5.24mm])
//   }
//   
//   // Create a helix around the line in the sketch above.
//   helixPath = helix(
//     angleStart = 0,
//     ccw = true,
//     revolutions = 5,
//     length = 10,
//     radius = 5,
//     axis = sketch002.line1,
//   )
//   
//   // Create a spring by sweeping around the helix path.
//   springSketch = startSketchOn(XZ)
//     |> circle(center = [5, 0], radius = 0.5)
//     |> sweep(path = helixPath)

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
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Loft a square and a circle on the `XY` plane using offset.
//   squareSketch = startSketchOn(XY)
//       |> startProfile(at = [-100, 200])
//       |> line(end = [200, 0])
//       |> line(end = [0, -200])
//       |> line(end = [-200, 0])
//       |> line(endAbsolute = [profileStartX(%), profileStartY(%)])
//       |> close()
//   
//   circleSketch = startSketchOn(offsetPlane(XY, offset = 150))
//       |> circle( center = [0, 100], radius = 50 )
//   
//   loft([squareSketch, circleSketch])

// Category: std
// Clone a sketch or solid
// Remarks: This works essentially like a copy-paste operation. It creates a perfect replica at that point in time that you can manipulate individually afterwards. This doesn't really have much utility unless you need the equivalent of a double instance pattern with zero transformations. Really only use this function if YOU ARE SURE you need it. In most cases you do not need clone and using a pattern with `instance = 2` is more appropriate. A clone inherits all transforms already applied to the source geometry. Because of [a known rotation-origin bug](https://github.com/KittyCAD/modeling-app/issues/9983), rotating a clone of an already-translated body can also move its inherited placement. Until that bug is fixed, clone an untransformed seed, rotate it first, and then apply that instance's complete translation. // Clone an array that includes an imported geometry, solid and sketch.
// std.clone (function)
clone(@geometries: [Sketch | Solid | ImportedGeometry; 1+]): [Sketch | Solid | ImportedGeometry; 1+]
//   @geometries: The sketch, solid, or imported geometry to be cloned
// Example:
//   // Clone an imported model.
//   
//   import "tests/inputs/cube.sldprt" as cube
//   
//   myCube = cube
//   
//   clonedCube = clone(myCube)
//      |> translate(
//      x = 1020,
//      )
//      |> appearance(
//          color = "#ff0000",
//          metalness = 50,
//          roughness = 50
//      )

// Category: std
// Asserts that a value is the boolean value true
// std.assertIs (function)
assertIs(
  @actual: bool,
  error?: string,
)
//   @actual: Value to check
//   error: If the value was false, the program will terminate with this error message
// Example:
//   kclIsFun = true
//   assertIs(kclIsFun)

// Category: std
// Stop KCL evaluation with a user-defined error
// Remarks: Use `fail` when evaluation cannot continue and the caller should receive a specific error message. `fail` never returns a value.
// EXPERIMENTAL
// std.fail (function)
fail(@msg: string): never
//   @msg: Message reported to the caller
// Example:
//   fn positive(@value: number): number {
//     return if value > 0 {
//       value
//     } else {
//       fail("value must be positive")
//     }
//   }

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
  isNotEqualTo?: number,
  tolerance?: number,
  error?: string,
)
//   @actual: Value to check
//   isGreaterThan: Comparison argument
//   isLessThan: Comparison argument
//   isGreaterThanOrEqual: Comparison argument
//   isLessThanOrEqual: Comparison argument
//   isEqualTo: Comparison argument
//   isNotEqualTo: Comparison argument
//   tolerance: If `isEqualTo` or `isNotEqualTo` is used, this is the tolerance to allow for the comparison
//   error: If the value was false, the program will terminate with this error message
// Example:
//   n = 10
//   assert(n, isEqualTo = 10)
//   assert(n, isGreaterThanOrEqual = 0, isLessThan = 100, error = "number should be between 0 and 100")
//   assert(1.0000000000012, isEqualTo = 1, tolerance = 0.0001, error = "number should be almost exactly 1")
//   assert(PI, isNotEqualTo = 3, tolerance = 0.0001, error = "PI should not be exactly 3")

// Category: std
// Given a face index, find its ID
// std.faceId (function)
faceId(
  @body: Solid,
  index: number(_),
): TaggedFace
//   @body: The solid whose faces we're trying to find
//   index: Face to identify
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Cylinder
//   cylinder = startSketchOn(XY)
//     |> circle(center = [0, 0], radius = 4.09, tag = $seg01)
//     |> extrude(length = 5)
//   
//   // Delete the face at index 2
//   // (the top face)
//   deleteFace(cylinder, faces = [faceId(cylinder, index = 2)])

// Category: std
// Given an edge index, find its ID
// std.edgeId (function)
edgeId(
  @body: Solid,
  index?: number(_),
  closestTo?: Point3d,
): Edge
//   @body: The solid whose edges we're trying to find
//   index: Edge to identify
//   closestTo: Query the edge closest to this point
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   // Cylinder
//   cylinder = startSketchOn(XY)
//     |> circle(center = [0, 0], radius = 4.09, tag = $seg01)
//     |> extrude(length = 5)
//     // Fillet the edge at index 2, i.e. the top edge.
//     |> fillet(radius = 1, tags = [edgeId(index = 2)])

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
// When bodies are solid, they have a top and bottom, and enclose all space between them
SOLID: string

// Category: std
// When bodies are surfaces, they have zero thickness
SURFACE: string

// Category: std
// Counterclockwise circular direction, currently used by `region()`
CCW: string

// Category: std
// Clockwise circular direction, currently used by `region()`
CW: string

// Category: std
// The KCL standard library
// Remarks: Contains frequently used constants, functions for interacting with the KittyCAD servers to create sketches and geometry, and utility functions. The standard library is organised into modules (listed below), but most things are always available in KCL programs. You might also want the [KCL language reference](/docs/kcl-lang) or the [KCL guide](https://zoo.dev/docs/kcl-book/intro.html).
std
