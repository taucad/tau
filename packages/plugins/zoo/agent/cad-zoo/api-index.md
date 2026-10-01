# kcl-std API index

kcl-std 0.2.111 · 191 symbols · extracted by kcl-lib stdlib JSON export.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## std — `api-std.md`

std.helix (function) — Create a helix
std.offsetPlane (function) — Offset a plane by a distance along its normal
std.clone (function) — Clone a sketch or solid
std.assertIs (function) — Asserts that a value is the boolean value true
std.assert (function) — Check a value meets some expected conditions at runtime
std.XY (constant) — An abstract 3d plane aligned with the X and Y…
std.XZ (constant) — An abstract 3d plane aligned with the X and Z…
std.YZ (constant) — An abstract 3d plane aligned with the Y and Z…
std.X (constant) — The X-axis (can be used in both 2d and 3d…
std.Y (constant) — The Y-axis (can be used in both 2d and 3d…
std.Z (constant) — The 3D Z-axis
std.START (constant) — Identifies the starting face of an extrusion
std.END (constant) — Identifies the ending face of an extrusion
std.NEW (constant) — Specifies that a new object is created during extrusion
std.MERGE (constant) — Specifies that the extrusion will be pulled into or pushed…
std (module) — The KCL standard library

## std.gdt — `api-std-gdt.md`

std.gdt.gdt::datum (function) — GD&T datum feature
std.gdt.gdt::flatness (function) — GD&T annotation specifying how flat faces should be
std.gdt (module) — Functions for working with geometric dimensioning and tolerancing (GD&T)

## std.units — `api-std-units.md`

std.units.units::toMillimeters (function) — Convert a number to millimeters from its current units
std.units.units::toCentimeters (function) — Convert a number to centimeters from its current units
std.units.units::toMeters (function) — Convert a number to meters from its current units
std.units.units::toInches (function) — Convert a number to inches from its current units
std.units.units::toFeet (function) — Convert a number to feet from its current units
std.units.units::toYards (function) — Converts a number to yards from its current units
std.units.units::toRadians (function) — Converts a number to radians from its current units
std.units.units::toDegrees (function) — Converts a number to degrees from its current units
std.units (module) — Functions for converting numbers to different units

## std.array — `api-std-array.md`

std.array.map (function) — Apply a function to every element of a list
std.array.reduce (function) — Take a starting value
std.array.push (function) — Append an element to the end of an array
std.array.pop (function) — Remove the last element from an array
std.array.concat (function) — Combine two arrays into one by concatenating them
std.array.count (function) — Find the number of elements in an array
std.array (module) — Functions for manipulating arrays of values

## std.math — `api-std-math.md`

std.math.cos (function) — Compute the cosine of a number
std.math.sin (function) — Compute the sine of a number
std.math.tan (function) — Compute the tangent of a number
std.math.acos (function) — Compute the arccosine of a number
std.math.asin (function) — Compute the arcsine of a number
std.math.atan (function) — Compute the arctangent of a number
std.math.atan2 (function) — Compute the four quadrant arctangent of Y and X
std.math.polar (function) — Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid)…
std.math.rem (function) — Compute the remainder after dividing `num` by `div`
std.math.sqrt (function) — Compute the square root of a number
std.math.abs (function) — Compute the absolute value of a number
std.math.round (function) — Round a number to the nearest integer
std.math.floor (function) — Compute the largest integer less than or equal to a…
std.math.ceil (function) — Compute the smallest integer greater than or equal to a…
std.math.min (function) — Compute the minimum of the given arguments
std.math.max (function) — Compute the maximum of the given arguments
std.math.pow (function) — Compute the number to a power
std.math.log (function) — Compute the logarithm of the number with respect to an…
std.math.log2 (function) — Compute the base 2 logarithm of the number
std.math.log10 (function) — Compute the base 10 logarithm of the number
std.math.ln (function) — Compute the natural logarithm of the number
std.math.legLen (function) — Compute the length of the given leg
std.math.legAngX (function) — Compute the angle of the given leg for x
std.math.legAngY (function) — Compute the angle of the given leg for y
std.math.PI (constant) — The value of `pi`, Archimedes’ constant (π)
std.math.E (constant) — The value of Euler’s number `e`
std.math.TAU (constant) — The value of `tau`, the full circle constant (τ)
std.math (module) — Functions for mathematical operations and some useful constants

## std.sketch — `api-std-sketch.md`

std.sketch.startSketchOn (function) — Start a new 2-dimensional sketch on a specific plane or…
std.sketch.startProfile (function) — Start a new profile at a given point
std.sketch.rectangle (function) — Sketch a rectangle
std.sketch.circle (function) — Construct a 2-dimensional circle, of the specified radius, centered at…
std.sketch.ellipse (function) — Construct a 2-dimensional ellipse, of the specified major/minor radius, centered…
std.sketch.extrude (function) — Extend a 2-dimensional sketch through a third dimension in order…
std.sketch.revolve (function) — Rotate a sketch around some provided axis, creating a solid…
std.sketch.patternTransform2d (function) — Just like `patternTransform`, but works on 2D sketches not 3D…
std.sketch.getOppositeEdge (function) — Get the opposite edge to the edge given
std.sketch.getNextAdjacentEdge (function) — Get the next adjacent edge to the edge given
std.sketch.getPreviousAdjacentEdge (function) — Get the previous adjacent edge to the edge given
std.sketch.getCommonEdge (function) — Get the shared edge between two faces
std.sketch.circleThreePoint (function) — Construct a circle derived from 3 points
std.sketch.polygon (function) — Create a regular polygon with the specified number of sides…
std.sketch.sweep (function) — Extrude a sketch along a path
std.sketch.loft (function) — Create a 3D surface or solid by interpolating between two…
std.sketch.patternLinear2d (function) — Repeat a 2-dimensional sketch along some dimension, with a dynamic…
std.sketch.patternCircular2d (function) — Repeat a 2-dimensional sketch some number of times along a…
std.sketch.segEnd (function) — Compute the ending point of the provided line segment
std.sketch.segEndX (function) — Compute the ending point of the provided line segment along…
std.sketch.segEndY (function) — Compute the ending point of the provided line segment along…
std.sketch.segStart (function) — Compute the starting point of the provided line segment
std.sketch.segStartX (function) — Compute the starting point of the provided line segment along…
std.sketch.segStartY (function) — Compute the starting point of the provided line segment along…
std.sketch.lastSegX (function) — Extract the 'x' axis value of the last line segment…
std.sketch.lastSegY (function) — Extract the 'y' axis value of the last line segment…
std.sketch.segLen (function) — Compute the length of the provided line segment
std.sketch.segAng (function) — Compute the angle (in degrees) of the provided line segment
std.sketch.tangentToEnd (function) — Returns the angle coming out of the end of the…
std.sketch.profileStart (function) — Extract the provided 2-dimensional sketch's profile's origin value
std.sketch.profileStartX (function) — Extract the provided 2-dimensional sketch's profile's origin's 'x' value
std.sketch.profileStartY (function) — Extract the provided 2-dimensional sketch's profile's origin's 'y' value
std.sketch.involuteCircular (function) — Extend the current sketch with a new involute circular curve
std.sketch.line (function) — Extend the current sketch with a new straight line
std.sketch.xLine (function) — Draw a line relative to the current origin to a…
std.sketch.yLine (function) — Draw a line relative to the current origin to a…
std.sketch.angledLine (function) — Draw a line segment relative to the current origin using…
std.sketch.angledLineThatIntersects (function) — Draw an angled line from the current origin, constructing a…
std.sketch.close (function) — Construct a line segment from the current origin back to…
std.sketch.arc (function) — Draw a curved line segment along an imaginary circle
std.sketch.tangentialArc (function) — Starting at the current sketch's origin, draw a curved line…
std.sketch.bezierCurve (function) — Draw a smooth, continuous, curved line segment from the current…
std.sketch.subtract2d (function) — Use a 2-dimensional sketch to cut a hole in another…
std.sketch.conic (function) — Add a conic section to an existing sketch
std.sketch.parabolic (function) — Add a parabolic segment to an existing sketch
std.sketch.parabolicPoint (function) — Calculate the point (x, y) on a parabola given x…
std.sketch.hyperbolic (function) — Add a hyperbolic section to an existing sketch
std.sketch.hyperbolicPoint (function) — Calculate the point (x, y) on a hyperbola given x…
std.sketch.elliptic (function) — Add an elliptic section to an existing sketch
std.sketch.ellipticPoint (function) — Calculate the point (x, y) on an ellipse given x…
std.sketch.planeOf (function) — Find the plane a face lies on
std.sketch (module) — Sketching is the foundational activity for most KCL programs

## std.solid — `api-std-solid.md`

std.solid.fillet (function) — Blend a transitional edge along a tagged path, smoothing the…
std.solid.chamfer (function) — Cut a straight transitional edge along a tagged path
std.solid.shell (function) — Remove volume from a 3-dimensional shape such that a wall…
std.solid.hollow (function) — Make the inside of a 3D object hollow
std.solid.patternTransform (function) — Repeat a 3-dimensional solid, changing it each time
std.solid.patternLinear3d (function) — Repeat a 3-dimensional solid along a linear path, with a…
std.solid.patternCircular3d (function) — Repeat a 3-dimensional solid some number of times along a…
std.solid.union (function) — Union two or more solids into a single solid
std.solid.intersect (function) — Intersect returns the shared volume between multiple solids, preserving only…
std.solid.subtract (function) — Subtract removes tool solids from base solids, leaving the remaining…
std.solid.appearance (function) — Set the appearance of a solid
std.solid (module) — This module contains functions for modifying solids, e.g., by adding…

## std.transform — `api-std-transform.md`

std.transform.mirror2d (function) — Mirror a sketch
std.transform.translate (function) — Move a solid or a sketch
std.transform.rotate (function) — Rotate a solid or a sketch
std.transform.scale (function) — Scale a solid or a sketch
std.transform (module) — This module contains functions for transforming sketches and solids

## std.appearance — `api-std-appearance.md`

std.appearance.appearance::hexString (function) — Build a color from its red, green and blue components
std.appearance (module)

## std.vector — `api-std-vector.md`

std.vector.vector::add (function) — Adds every element of u to its corresponding element in…
std.vector.vector::sub (function) — Subtracts from every element of u its corresponding element in…
std.vector.vector::mul (function) — Multiplies every element of u by its corresponding element in…
std.vector.vector::div (function) — Divides every element of u by its corresponding element in…
std.vector.vector::cross (function) — Find the cross product of two 3D points or vectors
std.vector.vector::dot (function) — Find the dot product of two points or vectors of…
std.vector.vector::magnitude (function) — Find the Euclidean distance of a vector
std.vector.vector::normalize (function) — Normalize a vector (with any number of dimensions)
std.vector (module)

## std.hole — `api-std-hole.md`

std.hole.hole::simple (function) — A hole top with no decoration
std.hole.hole::counterbore (function) — Cut a straight vertical counterbore at the top of the…
std.hole.hole::countersink (function) — Cut an angled countersink at the top of the hole
std.hole.hole::blind (function) — The hole has the given blind depth
std.hole.hole::drill (function) — End the hole in an angle, like the end of…
std.hole.hole::flat (function) — End the hole flat
std.hole.hole::hole (function) — From the hole's parts (bottom, middle, top), cut the hole…
std.hole.hole::holes (function) — From the hole's parts (bottom, middle, top), cut the hole…
std.hole.hole::holesLinear (function) — Place the given holes in a line
std.hole (module) — Definitions of standard holes that could be drilled or cut…

## std.types — `api-std-types.md`

std.types.any (type) — The `any` type is the type of all possible values…
std.types.none (type) — The type of the none (aka null) value
std.types.number (type) — A number
std.types.bool (type) — A boolean value
std.types.string (type) — A sequence of characters
std.types.TagDecl (type) — Tags are used to give a name (tag) to a…
std.types.TaggedEdge (type) — A tag which references a line, arc, or other edge…
std.types.TaggedFace (type) — A tag which references a face of a solid, including…
std.types.ImportedGeometry (type) — Represents geometry which is defined using some other CAD system…
std.types.fn (type) — The type of any function in KCL
std.types.Plane (type) — An abstract plane
std.types.Sketch (type) — A sketch is a collection of paths
std.types.Solid (type) — A solid is a collection of extruded surfaces
std.types.Face (type) — A face of a solid
std.types.Helix (type) — A helix
std.types.Edge (type) — An edge of a solid
std.types.Point2d (type) — A point in two dimensional space
std.types.Point3d (type) — A point in three dimensional space
std.types.Axis2d (type) — An abstract and infinite line in 2d space
std.types.Axis3d (type) — An abstract and infinite line in 3d space
std.types.GdtAnnotation (type) — A GD&T annotation
std.types.mm (type)
std.types.cm (type)
std.types.m (type)
std.types.in (type)
std.types.ft (type)
std.types.yd (type)
std.types.rad (type)
std.types.deg (type)
std.types (module) — KCL types

## std.turns — `api-std-turns.md`

std.turns.turns::ZERO (constant) — No turn, zero degrees/radians
std.turns.turns::QUARTER_TURN (constant) — A quarter turn, 90 degrees or π/2 radians
std.turns.turns::HALF_TURN (constant) — A half turn, 180 degrees or π radians
std.turns.turns::THREE_QUARTER_TURN (constant) — Three quarters of a turn, 270 degrees or 1.5*π radians
std.turns (module) — This module contains a few handy constants for defining turns

## std.sweep — `api-std-sweep.md`

std.sweep.sweep::TRAJECTORY (constant) — Local/relative to the trajectory curve
std.sweep.sweep::SKETCH_PLANE (constant) — Local/relative to a position centered within the plane being sketched…
std.sweep (module)
