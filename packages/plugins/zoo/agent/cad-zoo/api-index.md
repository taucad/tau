# kcl-std API index

kcl-std 0.2.184 · 284 symbols · extracted by kcl-lib stdlib JSON export.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## std — `api-std.md`

std.helix (function) [category: std] — Create a helix
std.offsetPlane (function) [category: std] — Offset a plane by a distance along its normal
std.clone (function) [category: std] — Clone a sketch or solid
std.assertIs (function) [category: std] — Asserts that a value is the boolean value true
std.fail (function) [category: std] — Stop KCL evaluation with a user-defined error
std.assert (function) [category: std] — Check a value meets some expected conditions at runtime
std.faceId (function) [category: std] — Given a face index, find its ID
std.edgeId (function) [category: std] — Given an edge index, find its ID
std.XY (constant) [category: std] — An abstract 3d plane aligned with the X and Y…
std.XZ (constant) [category: std] — An abstract 3d plane aligned with the X and Z…
std.YZ (constant) [category: std] — An abstract 3d plane aligned with the Y and Z…
std.X (constant) [category: std] — The X-axis (can be used in both 2d and 3d…
std.Y (constant) [category: std] — The Y-axis (can be used in both 2d and 3d…
std.Z (constant) [category: std] — The 3D Z-axis
std.START (constant) [category: std] — Identifies the starting face of an extrusion
std.END (constant) [category: std] — Identifies the ending face of an extrusion
std.NEW (constant) [category: std] — Specifies that a new object is created during extrusion
std.MERGE (constant) [category: std] — Specifies that the extrusion will be pulled into or pushed…
std.SOLID (constant) [category: std] — When bodies are solid, they have a top and bottom,…
std.SURFACE (constant) [category: std] — When bodies are surfaces, they have zero thickness
std.CCW (constant) [category: std] — Counterclockwise circular direction, currently used by `region()`
std.CW (constant) [category: std] — Clockwise circular direction, currently used by `region()`
std (module) [category: std] — The KCL standard library

## std.gdt — `api-std-gdt.md`

std.gdt.gdt::datum (function) [category: std.gdt] — GD&T datum feature
std.gdt.gdt::flatness (function) [category: std.gdt] — GD&T annotation specifying how flat faces should be
std.gdt.gdt::straightness (function) [category: std.gdt] — GD&T annotation specifying how straight a feature must be
std.gdt.gdt::circularity (function) [category: std.gdt] — GD&T annotation specifying how circular (round) a feature must be
std.gdt.gdt::cylindricity (function) [category: std.gdt] — GD&T annotation specifying how closely a feature must conform to…
std.gdt.gdt::concentricity (function) [category: std.gdt] — GD&T concentricity annotation specifying how closely a feature's median axis…
std.gdt.gdt::symmetry (function) [category: std.gdt] — GD&T symmetry annotation specifying how closely a feature's median plane…
std.gdt.gdt::runout (function) [category: std.gdt] — GD&T annotation specifying circular runout relative to a datum axis
std.gdt.gdt::angularity (function) [category: std.gdt] — GD&T angularity annotation specifying how much faces or edges may…
std.gdt.gdt::perpendicularity (function) [category: std.gdt] — GD&T perpendicularity annotation specifying how much faces or edges may…
std.gdt.gdt::parallelism (function) [category: std.gdt] — GD&T parallelism annotation specifying how much faces or edges may…
std.gdt.gdt::position (function) [category: std.gdt] — GD&T position annotation specifying how much faces or edges may…
std.gdt.gdt::annotation (function) [category: std.gdt] — GD&T annotation for attaching manufacturing text to faces or edges
std.gdt.gdt::note (function) [category: std.gdt] — GD&T note for adding free-floating manufacturing text that is not…
std.gdt.gdt::distance (function) [category: std.gdt] — GD&T distance annotation for displaying measured edge lengths or distances…
std.gdt.gdt::profile (function) [category: std.gdt] — GD&T profile annotation specifying how much edges or faces may…
std.gdt.gdt::profileLine (function) [category: std.gdt] — GD&T profile-of-a-line annotation specifying how much edges may deviate from…
std.gdt.gdt::profileSurface (function) [category: std.gdt] — GD&T profile-of-a-surface annotation specifying how much faces may deviate from…
std.gdt (module) [category: std.gdt] — Functions for working with geometric dimensioning and tolerancing (GD&T)

## std.units — `api-std-units.md`

std.units.units::toMillimeters (function) [category: std.units] — Convert a number to millimeters from its current units
std.units.units::toCentimeters (function) [category: std.units] — Convert a number to centimeters from its current units
std.units.units::toMeters (function) [category: std.units] — Convert a number to meters from its current units
std.units.units::toInches (function) [category: std.units] — Convert a number to inches from its current units
std.units.units::toFeet (function) [category: std.units] — Convert a number to feet from its current units
std.units.units::toYards (function) [category: std.units] — Converts a number to yards from its current units
std.units.units::toRadians (function) [category: std.units] — Converts a number to radians from its current units
std.units.units::toDegrees (function) [category: std.units] — Converts a number to degrees from its current units
std.units (module) [category: std.units] — Functions for converting numbers to different units

## std.string — `api-std-string.md`

std.string.string::uppercase (function) [category: std.string] — Convert all cased characters in a string to uppercase
std.string.string::lowercase (function) [category: std.string] — Convert all cased characters in a string to lowercase
std.string.string::isEqual (function) [category: std.string] — Compare two strings for equality
std.string.string::trim (function) [category: std.string] — Remove whitespace from the start and end of a string
std.string.string::trimStart (function) [category: std.string] — Remove whitespace from the start of a string
std.string.string::trimEnd (function) [category: std.string] — Remove whitespace from the end of a string
std.string.string::toString (function) [category: std.string] — Convert a number to human-readable text
std.string (module) [category: std.string] — Operations on KCL strings

## std.array — `api-std-array.md`

std.array.map (function) [category: std.array] — Apply a function to every element of a list
std.array.reduce (function) [category: std.array] — Take a starting value
std.array.push (function) [category: std.array] — Append an element to the end of an array
std.array.pop (function) [category: std.array] — Remove the last element from an array
std.array.concat (function) [category: std.array] — Combine two arrays into one by concatenating them
std.array.slice (function) [category: std.array] — Get a subarray from `start` (inclusive) to `end` (exclusive)
std.array.flatten (function) [category: std.array] — Flatten an array by one level
std.array.count (function) [category: std.array] — Find the number of elements in an array
std.array (module) [category: std.array] — Functions for manipulating arrays of values

## std.math — `api-std-math.md`

std.math.cos (function) [category: std.math] — Compute the cosine of a number
std.math.sin (function) [category: std.math] — Compute the sine of a number
std.math.tan (function) [category: std.math] — Compute the tangent of a number
std.math.acos (function) [category: std.math] — Compute the arccosine of a number
std.math.asin (function) [category: std.math] — Compute the arcsine of a number
std.math.atan (function) [category: std.math] — Compute the arctangent of a number
std.math.atan2 (function) [category: std.math] — Compute the four quadrant arctangent of Y and X
std.math.polar (function) [category: std.math] — Convert polar (angle, distance) coordinates to cartesian (x/y grid) coordinates
std.math.rem (function) [category: std.math] — Compute the remainder after dividing `num` by `div`
std.math.sqrt (function) [category: std.math] — Compute the square root of a number
std.math.abs (function) [category: std.math] — Compute the absolute value of a number
std.math.round (function) [category: std.math] — Round a number to the nearest integer
std.math.floor (function) [category: std.math] — Compute the largest integer less than or equal to a…
std.math.ceil (function) [category: std.math] — Compute the smallest integer greater than or equal to a…
std.math.min (function) [category: std.math] — Compute the minimum of the given arguments
std.math.max (function) [category: std.math] — Compute the maximum of the given arguments
std.math.pow (function) [category: std.math] — Compute the number to a power
std.math.log (function) [category: std.math] — Compute the logarithm of the number with respect to an…
std.math.log2 (function) [category: std.math] — Compute the base 2 logarithm of the number
std.math.log10 (function) [category: std.math] — Compute the base 10 logarithm of the number
std.math.ln (function) [category: std.math] — Compute the natural logarithm of the number
std.math.legLen (function) [category: std.math] — Compute the length of the given leg
std.math.legAngX (function) [category: std.math] — Compute the angle of the given leg for x
std.math.legAngY (function) [category: std.math] — Compute the angle of the given leg for y
std.math.PI (constant) [category: std.math] — The value of `pi`, Archimedes’ constant (π)
std.math.E (constant) [category: std.math] — The value of Euler’s number `e`
std.math.TAU (constant) [category: std.math] — The value of `tau`, the full circle constant (τ)
std.math (module) [category: std.math] — Functions for mathematical operations and some useful constants

## std.sketch — `api-std-sketch.md`

std.sketch.startSketchOn (function) [category: std.sketch] — Start a new 2-dimensional sketch on a specific plane or…
std.sketch.startProfile (function) [category: std.sketch] — Start a new profile at a given point
std.sketch.rectangle (function) [category: std.sketch] — Sketch a rectangle
std.sketch.circle (function) [category: std.sketch] — Construct a 2-dimensional circle, of the specified radius, centered at…
std.sketch.ellipse (function) [category: std.sketch] — Construct a 2-dimensional ellipse, of the specified major/minor radius, centered…
std.sketch.extrude (function) [category: std.sketch] — Extend a 2-dimensional sketch or individual segment of a sketch…
std.sketch.revolve (function) [category: std.sketch] — Rotate a sketch around some provided axis, creating a solid…
std.sketch.patternTransform2d (function) [category: std.sketch] — Just like `patternTransform`, but works on 2D sketches not 3D…
std.sketch.getOppositeEdge (function) [category: std.sketch] — Get the opposite edge to the edge given
std.sketch.getNextAdjacentEdge (function) [category: std.sketch] — Get the next adjacent edge to the edge given
std.sketch.getPreviousAdjacentEdge (function) [category: std.sketch] — Get the previous adjacent edge to the edge given
std.sketch.getCommonEdge (function) [category: std.sketch] — Get the shared edge between two faces
std.sketch.getBoundedEdge (function) [category: std.sketch] — Get a bounded edge of a surface used for the…
std.sketch.circleThreePoint (function) [category: std.sketch] — Construct a circle derived from 3 points
std.sketch.polygon (function) [category: std.sketch] — Create a regular polygon with the specified number of sides…
std.sketch.sweep (function) [category: std.sketch] — Create a 3D surface or solid by sweeping a sketch…
std.sketch.loft (function) [category: std.sketch] — Create a 3D surface or solid by interpolating between two…
std.sketch.patternLinear2d (function) [category: std.sketch] — Repeat a 2-dimensional sketch along some dimension, with a dynamic…
std.sketch.patternCircular2d (function) [category: std.sketch] — Repeat a 2-dimensional sketch some number of times along a…
std.sketch.segEnd (function) [category: std.sketch] — Compute the ending point of the provided line segment
std.sketch.segEndX (function) [category: std.sketch] — Compute the ending point of the provided line segment along…
std.sketch.segEndY (function) [category: std.sketch] — Compute the ending point of the provided line segment along…
std.sketch.segStart (function) [category: std.sketch] — Compute the starting point of the provided line segment
std.sketch.segStartX (function) [category: std.sketch] — Compute the starting point of the provided line segment along…
std.sketch.segStartY (function) [category: std.sketch] — Compute the starting point of the provided line segment along…
std.sketch.lastSegX (function) [category: std.sketch] — Extract the 'x' axis value of the last line segment…
std.sketch.lastSegY (function) [category: std.sketch] — Extract the 'y' axis value of the last line segment…
std.sketch.segLen (function) [category: std.sketch] — Compute the length of the provided line segment
std.sketch.segAng (function) [category: std.sketch] — Compute the angle (in degrees) of the provided line segment
std.sketch.tangentToEnd (function) [category: std.sketch] — Returns the angle coming out of the end of the…
std.sketch.profileStart (function) [category: std.sketch] — Extract the provided 2-dimensional sketch's profile origin as an array…
std.sketch.profileStartX (function) [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin's 'x' value
std.sketch.profileStartY (function) [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin's 'y' value
std.sketch.involuteCircular (function) [category: std.sketch] — Extend the current sketch with a new involute circular curve
std.sketch.line (function) [category: std.sketch] — Extend the current sketch with a new straight line
std.sketch.xLine (function) [category: std.sketch] — Draw a line relative to the current origin to a…
std.sketch.yLine (function) [category: std.sketch] — Draw a line relative to the current origin to a…
std.sketch.angledLine (function) [category: std.sketch] — Draw a line segment relative to the current origin using…
std.sketch.angledLineThatIntersects (function) [category: std.sketch] — Draw an angled line from the current origin, constructing a…
std.sketch.close (function) [category: std.sketch] — Construct a line segment from the current origin back to…
std.sketch.arc (function) [category: std.sketch] — Draw a curved line segment along an imaginary circle
std.sketch.tangentialArc (function) [category: std.sketch] — Starting at the current sketch's origin, draw a curved line…
std.sketch.bezierCurve (function) [category: std.sketch] — Draw a smooth, continuous, curved line segment from the current…
std.sketch.subtract2d (function) [category: std.sketch] — Use a 2-dimensional sketch to cut a hole in another…
std.sketch.conic (function) [category: std.sketch] — Add a conic section to an existing sketch
std.sketch.parabolic (function) [category: std.sketch] — Add a parabolic segment to an existing sketch
std.sketch.parabolicPoint (function) [category: std.sketch] — Calculate the point (x, y) on a parabola given x…
std.sketch.hyperbolic (function) [category: std.sketch] — Add a hyperbolic section to an existing sketch
std.sketch.hyperbolicPoint (function) [category: std.sketch] — Calculate the point (x, y) on a hyperbola given x…
std.sketch.elliptic (function) [category: std.sketch] — Add an elliptic section to an existing sketch
std.sketch.ellipticPoint (function) [category: std.sketch] — Calculate the point (x, y) on an ellipse given x…
std.sketch.planeOf (function) [category: std.sketch] — Find the plane a face lies on
std.sketch.faceOf (function) [category: std.sketch] — Get the face of a solid
std.sketch.region (function) [category: std.sketch] — Create a region from closed segments
std.sketch (module) [category: std.sketch] — Sketching is the foundational activity for most KCL programs

## std.solid — `api-std-solid.md`

std.solid.fillet (function) [category: std.solid] — Blend a transitional edge along a tagged path, smoothing the…
std.solid.chamfer (function) [category: std.solid] — Cut a straight transitional edge along a tagged path
std.solid.shell (function) [category: std.solid] — Remove volume from a 3-dimensional shape such that a wall…
std.solid.hollow (function) [category: std.solid] — Make the inside of a 3D object hollow
std.solid.patternTransform (function) [category: std.solid] — Repeat a 3-dimensional body or imported geometry, changing it each…
std.solid.patternLinear3d (function) [category: std.solid] — Repeat a 3-dimensional body or imported geometry along a linear…
std.solid.patternCircular3d (function) [category: std.solid] — Repeat a 3-dimensional body or imported geometry some number of…
std.solid.union (function) [category: std.solid] — Union two or more solids into a single solid
std.solid.intersect (function) [category: std.solid] — Intersect returns the shared volume between multiple solids, preserving only…
std.solid.subtract (function) [category: std.solid] — Subtract removes tool solids from base solids, leaving the remaining…
std.solid.appearance (function) [category: std.solid] — Set the appearance of a solid, imported geometry, or plane
std.solid.flipSurface (function) [category: std.solid] — Flips the orientation of a surface, swapping which side is…
std.solid.split (function) [category: std.solid] — Split all faces of the target body along all faces…
std.solid.isSolid (function) [category: std.solid] — Given a KCL value that is a "body" (currently typed…
std.solid.isSurface (function) [category: std.solid] — Given a KCL value that is a 'body' (currently typed…
std.solid.deleteFace (function) [category: std.solid] — Delete a face from a body (a solid, or a…
std.solid.blend (function) [category: std.solid] — Blend two surfaces together
std.solid.joinSurfaces (function) [category: std.solid] — Join multiple surfaces together into one body, or join together…
std.solid (module) [category: std.solid] — This module contains functions for modifying solids, e.g., by adding…

## std.transform — `api-std-transform.md`

std.transform.mirror2d (function) [category: std.transform] — Mirror a sketch
std.transform.mirror3d (function) [category: std.transform] — Create a mirror image of a 3D solid/surface/body, across some…
std.transform.translate (function) [category: std.transform] — Move a solid, a sketch, or a helix
std.transform.rotate (function) [category: std.transform] — Rotate a solid, a sketch, or a helix
std.transform.scale (function) [category: std.transform] — Scale a solid, a sketch, or a helix
std.transform.hide (function) [category: std.transform] — Hide solids, planes, sketches, helices, or imported objects
std.transform.delete (function) [category: std.transform] — Deletes something from the scene
std.transform (module) [category: std.transform] — This module contains functions for transforming sketches and solids

## std.appearance — `api-std-appearance.md`

std.appearance.appearance::hexString (function) [category: std.appearance] — Build a color from its red, green and blue components
std.appearance (module) [category: std.appearance]

## std.vector — `api-std-vector.md`

std.vector.vector::add (function) [category: std.vector] — Adds every element of u to its corresponding element in…
std.vector.vector::sub (function) [category: std.vector] — Subtracts from every element of u its corresponding element in…
std.vector.vector::mul (function) [category: std.vector] — Multiplies every element of u by its corresponding element in…
std.vector.vector::div (function) [category: std.vector] — Divides every element of u by its corresponding element in…
std.vector.vector::cross (function) [category: std.vector] — Find the cross product of two 3D points or vectors
std.vector.vector::dot (function) [category: std.vector] — Find the dot product of two points or vectors of…
std.vector.vector::magnitude (function) [category: std.vector] — Find the Euclidean distance of a vector
std.vector.vector::normalize (function) [category: std.vector] — Normalize a vector (with any number of dimensions)
std.vector (module) [category: std.vector]

## std.operation — `api-std-operation.md`

std.operation.operation::facing (function) [category: std.operation]
std.operation (module) [category: std.operation]

## std.hole — `api-std-hole.md`

std.hole.hole::simple (function) [category: std.hole] — A hole top with no decoration
std.hole.hole::counterbore (function) [category: std.hole] — Cut a straight vertical counterbore at the top of the…
std.hole.hole::countersink (function) [category: std.hole] — Cut an angled countersink at the top of the hole
std.hole.hole::blind (function) [category: std.hole] — The hole has the given blind depth
std.hole.hole::drill (function) [category: std.hole] — End the hole in an angle, like the end of…
std.hole.hole::flat (function) [category: std.hole] — End the hole flat
std.hole.hole::hole (function) [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole…
std.hole.hole::holes (function) [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole…
std.hole.hole::holesLinear (function) [category: std.hole] — Place the given holes in a line
std.hole.hole::holeAt (function) [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole…
std.hole (module) [category: std.hole] — Definitions of standard holes that could be drilled or cut…

## std.gear — `api-std-gear.md`

std.gear.gear::helical (function) [category: std.gear] — A helical gear (like a spur gear, but the teeth…
std.gear.gear::spur (function) [category: std.gear] — A spur gear (like a helical gear, with a helix…
std.gear.gear::herringbone (function) [category: std.gear] — A herringbone gear (like a helical gear that reverses direction…
std.gear.gear::ring (function) [category: std.gear] — A ring gear (i.e
std.gear (module) [category: std.gear] — Define gears that users can include in their models

## std.runtime — `api-std-runtime.md`

std.runtime.exit (function) [category: std.runtime] — Exit the program early
std.runtime (module) [category: std.runtime] — Functions for debugging and interacting with the runtime system

## std.view — `api-std-view.md`

std.view.view::oriented (function) [category: std.view] — Create a camera view that looks at the model from…
std.view.view::directed (function) [category: std.view] — Create a camera view that looks along a custom direction
std.view.view::named (function) [category: std.view] — Create a named view
std.view.view::Orientation (type) [category: std.view] — A standard camera orientation for a named view
std.view.view::Visibility (type) [category: std.view] — Whether the objects of a named view start visible or…
std.view.view::Projection (type) [category: std.view] — The camera projection of a named view
std.view.view::CameraView (type) [category: std.view] — A camera viewpoint, stored as intent
std.view.view::NamedView (type) [category: std.view] — A named view
std.view (module) [category: std.view] — Named views

## std.solver — `api-std-solver.md`

std.solver.solver::point (function) [category: std.solver] — Create a point in a sketch
std.solver.solver::line (function) [category: std.solver] — Create a straight line segment in a sketch
std.solver.solver::arc (function) [category: std.solver] — Create a circular arc
std.solver.solver::circle (function) [category: std.solver] — Create a circle in a sketch
std.solver.solver::controlPointSpline (function) [category: std.solver] — Create a control-point spline in a sketch
std.solver.solver::coincident (function) [category: std.solver] — Constrain points, or a point and a segment to be…
std.solver.solver::distance (function) [category: std.solver] — Constrain the distance between two sketch entities
std.solver.solver::radius (function) [category: std.solver] — Constrain the radius of an arc or circle segment
std.solver.solver::diameter (function) [category: std.solver] — Constrain the diameter of an arc or circle segment
std.solver.solver::horizontalDistance (function) [category: std.solver] — Constrain the horizontal distance between two points
std.solver.solver::verticalDistance (function) [category: std.solver] — Constrain the vertical distance between two points
std.solver.solver::equalLength (function) [category: std.solver] — Constrain lines to have equal length
std.solver.solver::equalRadius (function) [category: std.solver] — Constrain circular segments to have equal radius
std.solver.solver::parallel (function) [category: std.solver] — Constrain lines to be parallel
std.solver.solver::perpendicular (function) [category: std.solver] — Constrain lines to be perpendicular
std.solver.solver::angle (function) [category: std.solver] — Constrain lines to meet at a given angle
std.solver.solver::angleDimension (function) [category: std.solver] — Constrain the angle in the selected sector between two lines
std.solver.solver::tangent (function) [category: std.solver] — Constrain two segments to be tangent
std.solver.solver::midpoint (function) [category: std.solver] — Constrain a point to lie at the midpoint of a…
std.solver.solver::symmetric (function) [category: std.solver] — Constrain two points, lines, arcs, or circles to be symmetric…
std.solver.solver::fixed (function) [category: std.solver] — Constrain a point to be fixed to a position
std.solver.solver::horizontal (function) [category: std.solver] — Constrain a line, or a list of points, to be…
std.solver.solver::vertical (function) [category: std.solver] — Constrain a line, or a list of points, to be…
std.solver.solver::ORIGIN (constant) [category: std.solver] — The origin point in a sketch
std.solver (module) [category: std.solver] — Functions for sketch-solve using constraints

## std.types — `api-std-types.md`

std.types.any (type) [category: std.types] — The `any` type is the type of all possible values…
std.types.never (type) [category: std.types] — The uninhabited type of computations that never complete normally
std.types.none (type) [category: std.types] — The type of the none (aka null) value
std.types.number (type) [category: std.types] — A number
std.types.bool (type) [category: std.types] — A boolean value
std.types.string (type) [category: std.types] — A sequence of characters
std.types.TagDecl (type) [category: std.types] — Tags are used to give a name (tag) to a…
std.types.TaggedEdge (type) [category: std.types] — A tag which references a line, arc, or other edge…
std.types.TaggedFace (type) [category: std.types] — A tag which references a face of a solid, including…
std.types.ImportedGeometry (type) [category: std.types] — Represents geometry which is defined using some other CAD system…
std.types.fn (type) [category: std.types] — The type of any function in KCL
std.types.Plane (type) [category: std.types] — An abstract plane
std.types.Segment (type) [category: std.types] — A segment in a sketch created in a sketch block
std.types.Sketch (type) [category: std.types] — A sketch is a collection of paths
std.types.Solid (type) [category: std.types] — A solid is a collection of extruded surfaces
std.types.Face (type) [category: std.types] — A face of a solid
std.types.Helix (type) [category: std.types] — A helix
std.types.Edge (type) [category: std.types] — An edge of a solid
std.types.BoundedEdge (type) [category: std.types] — A [bounded edge](/docs/kcl-std/functions/std-sketch-getBoundedEdge) of a solid
std.types.Point2d (type) [category: std.types] — A point in two dimensional space
std.types.Point3d (type) [category: std.types] — A point in three dimensional space
std.types.Axis2d (type) [category: std.types] — An abstract and infinite line in 2d space
std.types.Axis3d (type) [category: std.types] — An abstract and infinite line in 3d space
std.types.GdtAnnotation (type) [category: std.types] — A GD&T annotation created by one of the [`gdt` functions](/docs/kcl-std/modules/std-gdt)
std.types.mm (type) [category: std.types]
std.types.cm (type) [category: std.types]
std.types.m (type) [category: std.types]
std.types.in (type) [category: std.types]
std.types.ft (type) [category: std.types]
std.types.yd (type) [category: std.types]
std.types.rad (type) [category: std.types]
std.types.deg (type) [category: std.types]
std.types (module) [category: std.types] — KCL types

## std.turns — `api-std-turns.md`

std.turns.turns::ZERO (constant) [category: std.turns] — No turn, zero degrees/radians
std.turns.turns::QUARTER_TURN (constant) [category: std.turns] — A quarter turn, 90 degrees or π/2 radians
std.turns.turns::HALF_TURN (constant) [category: std.turns] — A half turn, 180 degrees or π radians
std.turns.turns::THREE_QUARTER_TURN (constant) [category: std.turns] — Three quarters of a turn, 270 degrees or 1.5*π radians
std.turns (module) [category: std.turns] — This module contains a few handy constants for defining turns

## std.sweep — `api-std-sweep.md`

std.sweep.sweep::TRAJECTORY (constant) [category: std.sweep] — Local/relative to the trajectory curve
std.sweep.sweep::SKETCH_PLANE (constant) [category: std.sweep] — Local/relative to a position centered within the plane being sketched…
std.sweep (module) [category: std.sweep]
