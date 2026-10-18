# kcl-std API index

kcl-std 0.2.191 · 284 symbols · extracted by kcl-lib stdlib JSON export.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## std — `api-std.md`

std.helix (function) [lines 5-44] [category: std] — Create a helix
std.offsetPlane (function) [lines 46-69] [category: std] — Offset a plane by a distance along its normal
std.clone (function) [lines 71-92] [category: std] — Clone a sketch or solid
std.assertIs (function) [lines 94-105] [category: std] — Asserts that a value is the boolean value true
std.fail (function) [lines 107-121] [category: std] — Stop KCL evaluation with a user-defined error
std.assert (function) [lines 123-151] [category: std] — Check a value meets some expected conditions at runtime
std.faceId (function) [lines 153-170] [category: std] — Given a face index, find its ID
std.edgeId (function) [lines 172-189] [category: std] — Given an edge index, find its ID
std.XY (constant) [lines 191-193] [category: std] — An abstract 3d plane aligned with the X and Y…
std.XZ (constant) [lines 195-197] [category: std] — An abstract 3d plane aligned with the X and Z…
std.YZ (constant) [lines 199-201] [category: std] — An abstract 3d plane aligned with the Y and Z…
std.X (constant) [lines 203-205] [category: std] — The X-axis (can be used in both 2d and 3d…
std.Y (constant) [lines 207-209] [category: std] — The Y-axis (can be used in both 2d and 3d…
std.Z (constant) [lines 211-213] [category: std] — The 3D Z-axis
std.START (constant) [lines 215-217] [category: std] — Identifies the starting face of an extrusion
std.END (constant) [lines 219-221] [category: std] — Identifies the ending face of an extrusion
std.NEW (constant) [lines 223-225] [category: std] — Specifies that a new object is created during extrusion
std.MERGE (constant) [lines 227-229] [category: std] — Specifies that the extrusion will be pulled into or pushed…
std.SOLID (constant) [lines 231-233] [category: std] — When bodies are solid, they have a top and bottom,…
std.SURFACE (constant) [lines 235-237] [category: std] — When bodies are surfaces, they have zero thickness
std.CCW (constant) [lines 239-241] [category: std] — Counterclockwise circular direction, currently used by `region()`
std.CW (constant) [lines 243-245] [category: std] — Clockwise circular direction, currently used by `region()`
std (module) [lines 247-250] [category: std] — The KCL standard library

## std.gdt — `api-std-gdt.md`

std.gdt.gdt::datum (function) [lines 5-48] [category: std.gdt] — GD&T datum feature
std.gdt.gdt::flatness (function) [lines 50-89] [category: std.gdt] — GD&T annotation specifying how flat faces should be
std.gdt.gdt::straightness (function) [lines 91-136] [category: std.gdt] — GD&T annotation specifying how straight a feature must be
std.gdt.gdt::circularity (function) [lines 138-172] [category: std.gdt] — GD&T annotation specifying how circular (round) a feature must be
std.gdt.gdt::cylindricity (function) [lines 174-206] [category: std.gdt] — GD&T annotation specifying how closely a feature must conform to…
std.gdt.gdt::concentricity (function) [lines 208-256] [category: std.gdt] — GD&T concentricity annotation specifying how closely a feature's median axis…
std.gdt.gdt::symmetry (function) [lines 258-318] [category: std.gdt] — GD&T symmetry annotation specifying how closely a feature's median plane…
std.gdt.gdt::runout (function) [lines 320-398] [category: std.gdt] — GD&T annotation specifying circular runout relative to a datum axis
std.gdt.gdt::angularity (function) [lines 400-473] [category: std.gdt] — GD&T angularity annotation specifying how much faces or edges may…
std.gdt.gdt::perpendicularity (function) [lines 475-519] [category: std.gdt] — GD&T perpendicularity annotation specifying how much faces or edges may…
std.gdt.gdt::parallelism (function) [lines 521-565] [category: std.gdt] — GD&T parallelism annotation specifying how much faces or edges may…
std.gdt.gdt::position (function) [lines 567-611] [category: std.gdt] — GD&T position annotation specifying how much faces or edges may…
std.gdt.gdt::annotation (function) [lines 613-653] [category: std.gdt] — GD&T annotation for attaching manufacturing text to faces or edges
std.gdt.gdt::note (function) [lines 655-691] [category: std.gdt] — GD&T note for adding free-floating manufacturing text that is not…
std.gdt.gdt::distance (function) [lines 693-739] [category: std.gdt] — GD&T distance annotation for displaying measured edge lengths or distances…
std.gdt.gdt::profile (function) [lines 741-773] [category: std.gdt] — GD&T profile annotation specifying how much edges or faces may…
std.gdt.gdt::profileLine (function) [lines 775-817] [category: std.gdt] — GD&T profile-of-a-line annotation specifying how much edges may deviate from…
std.gdt.gdt::profileSurface (function) [lines 819-849] [category: std.gdt] — GD&T profile-of-a-surface annotation specifying how much faces may deviate from…
std.gdt (module) [lines 851-853] [category: std.gdt] — Functions for working with geometric dimensioning and tolerancing (GD&T)

## std.units — `api-std-units.md`

std.units.units::toMillimeters (function) [lines 5-9] [category: std.units] — Convert a number to millimeters from its current units
std.units.units::toCentimeters (function) [lines 11-15] [category: std.units] — Convert a number to centimeters from its current units
std.units.units::toMeters (function) [lines 17-21] [category: std.units] — Convert a number to meters from its current units
std.units.units::toInches (function) [lines 23-27] [category: std.units] — Convert a number to inches from its current units
std.units.units::toFeet (function) [lines 29-33] [category: std.units] — Convert a number to feet from its current units
std.units.units::toYards (function) [lines 35-39] [category: std.units] — Converts a number to yards from its current units
std.units.units::toRadians (function) [lines 41-56] [category: std.units] — Converts a number to radians from its current units
std.units.units::toDegrees (function) [lines 58-73] [category: std.units] — Converts a number to degrees from its current units
std.units (module) [lines 75-78] [category: std.units] — Functions for converting numbers to different units

## std.string — `api-std-string.md`

std.string.string::uppercase (function) [lines 5-15] [category: std.string] — Convert all cased characters in a string to uppercase
std.string.string::lowercase (function) [lines 17-27] [category: std.string] — Convert all cased characters in a string to lowercase
std.string.string::isEqual (function) [lines 29-45] [category: std.string] — Compare two strings for equality
std.string.string::trim (function) [lines 47-57] [category: std.string] — Remove whitespace from the start and end of a string
std.string.string::trimStart (function) [lines 59-69] [category: std.string] — Remove whitespace from the start of a string
std.string.string::trimEnd (function) [lines 71-81] [category: std.string] — Remove whitespace from the end of a string
std.string.string::toString (function) [lines 83-97] [category: std.string] — Convert a number to human-readable text
std.string (module) [lines 99-102] [category: std.string] — Operations on KCL strings

## std.array — `api-std-array.md`

std.array.map (function) [lines 5-28] [category: std.array] — Apply a function to every element of a list
std.array.reduce (function) [lines 30-61] [category: std.array] — Take a starting value
std.array.push (function) [lines 63-76] [category: std.array] — Append an element to the end of an array
std.array.pop (function) [lines 78-89] [category: std.array] — Remove the last element from an array
std.array.concat (function) [lines 91-111] [category: std.array] — Combine two arrays into one by concatenating them
std.array.slice (function) [lines 113-129] [category: std.array] — Get a subarray from `start` (inclusive) to `end` (exclusive)
std.array.flatten (function) [lines 131-143] [category: std.array] — Flatten an array by one level
std.array.count (function) [lines 145-152] [category: std.array] — Find the number of elements in an array
std.array (module) [lines 154-156] [category: std.array] — Functions for manipulating arrays of values

## std.math — `api-std-math.md`

std.math.cos (function) [lines 5-20] [category: std.math] — Compute the cosine of a number
std.math.sin (function) [lines 22-37] [category: std.math] — Compute the sine of a number
std.math.tan (function) [lines 39-54] [category: std.math] — Compute the tangent of a number
std.math.acos (function) [lines 56-72] [category: std.math] — Compute the arccosine of a number
std.math.asin (function) [lines 74-89] [category: std.math] — Compute the arcsine of a number
std.math.atan (function) [lines 91-107] [category: std.math] — Compute the arctangent of a number
std.math.atan2 (function) [lines 109-128] [category: std.math] — Compute the four quadrant arctangent of Y and X
std.math.polar (function) [lines 130-148] [category: std.math] — Convert polar (angle, distance) coordinates to cartesian (x/y grid) coordinates
std.math.rem (function) [lines 150-165] [category: std.math] — Compute the remainder after dividing `num` by `div`
std.math.sqrt (function) [lines 167-182] [category: std.math] — Compute the square root of a number
std.math.abs (function) [lines 184-206] [category: std.math] — Compute the absolute value of a number
std.math.round (function) [lines 208-221] [category: std.math] — Round a number to the nearest integer
std.math.floor (function) [lines 223-236] [category: std.math] — Compute the largest integer less than or equal to a…
std.math.ceil (function) [lines 238-251] [category: std.math] — Compute the smallest integer greater than or equal to a…
std.math.min (function) [lines 253-268] [category: std.math] — Compute the minimum of the given arguments
std.math.max (function) [lines 270-285] [category: std.math] — Compute the maximum of the given arguments
std.math.pow (function) [lines 287-306] [category: std.math] — Compute the number to a power
std.math.log (function) [lines 308-326] [category: std.math] — Compute the logarithm of the number with respect to an…
std.math.log2 (function) [lines 328-341] [category: std.math] — Compute the base 2 logarithm of the number
std.math.log10 (function) [lines 343-356] [category: std.math] — Compute the base 10 logarithm of the number
std.math.ln (function) [lines 358-371] [category: std.math] — Compute the natural logarithm of the number
std.math.legLen (function) [lines 373-383] [category: std.math] — Compute the length of the given leg
std.math.legAngX (function) [lines 385-395] [category: std.math] — Compute the angle of the given leg for x
std.math.legAngY (function) [lines 397-407] [category: std.math] — Compute the angle of the given leg for y
std.math.PI (constant) [lines 409-414] [category: std.math] — The value of `pi`, Archimedes’ constant (π)
std.math.E (constant) [lines 416-420] [category: std.math] — The value of Euler’s number `e`
std.math.TAU (constant) [lines 422-426] [category: std.math] — The value of `tau`, the full circle constant (τ)
std.math (module) [lines 428-430] [category: std.math] — Functions for mathematical operations and some useful constants

## std.sketch — `api-std-sketch.md`

std.sketch.startSketchOn (function) [lines 5-48] [category: std.sketch] — Start a new 2-dimensional sketch on a specific plane or…
std.sketch.startProfile (function) [lines 50-71] [category: std.sketch] — Start a new profile at a given point
std.sketch.rectangle (function) [lines 73-92] [category: std.sketch] — Sketch a rectangle
std.sketch.circle (function) [lines 94-115] [category: std.sketch] — Construct a 2-dimensional circle, of the specified radius, centered at…
std.sketch.ellipse (function) [lines 117-140] [category: std.sketch] — Construct a 2-dimensional ellipse, of the specified major/minor radius, centered…
std.sketch.extrude (function) [lines 142-215] [category: std.sketch] — Extend a 2-dimensional sketch or individual segment of a sketch…
std.sketch.revolve (function) [lines 217-252] [category: std.sketch] — Rotate a sketch around some provided axis, creating a solid…
std.sketch.patternTransform2d (function) [lines 254-276] [category: std.sketch] — Just like `patternTransform`, but works on 2D sketches not 3D…
std.sketch.getOppositeEdge (function) [lines 278-307] [category: std.sketch] — Get the opposite edge to the edge given
std.sketch.getNextAdjacentEdge (function) [lines 309-338] [category: std.sketch] — Get the next adjacent edge to the edge given
std.sketch.getPreviousAdjacentEdge (function) [lines 340-369] [category: std.sketch] — Get the previous adjacent edge to the edge given
std.sketch.getCommonEdge (function) [lines 371-399] [category: std.sketch] — Get the shared edge between two faces
std.sketch.getBoundedEdge (function) [lines 401-445] [category: std.sketch] — Get a bounded edge of a surface used for the…
std.sketch.circleThreePoint (function) [lines 447-467] [category: std.sketch] — Construct a circle derived from 3 points
std.sketch.polygon (function) [lines 469-496] [category: std.sketch] — Create a regular polygon with the specified number of sides…
std.sketch.sweep (function) [lines 498-542] [category: std.sketch] — Create a 3D surface or solid by sweeping a sketch…
std.sketch.loft (function) [lines 544-591] [category: std.sketch] — Create a 3D surface or solid by interpolating between two…
std.sketch.patternLinear2d (function) [lines 593-628] [category: std.sketch] — Repeat a 2-dimensional sketch along some dimension, with a dynamic…
std.sketch.patternCircular2d (function) [lines 630-661] [category: std.sketch] — Repeat a 2-dimensional sketch some number of times along a…
std.sketch.segEnd (function) [lines 663-689] [category: std.sketch] — Compute the ending point of the provided line segment
std.sketch.segEndX (function) [lines 691-705] [category: std.sketch] — Compute the ending point of the provided line segment along…
std.sketch.segEndY (function) [lines 707-722] [category: std.sketch] — Compute the ending point of the provided line segment along…
std.sketch.segStart (function) [lines 724-750] [category: std.sketch] — Compute the starting point of the provided line segment
std.sketch.segStartX (function) [lines 752-766] [category: std.sketch] — Compute the starting point of the provided line segment along…
std.sketch.segStartY (function) [lines 768-783] [category: std.sketch] — Compute the starting point of the provided line segment along…
std.sketch.lastSegX (function) [lines 785-799] [category: std.sketch] — Extract the 'x' axis value of the last line segment…
std.sketch.lastSegY (function) [lines 801-815] [category: std.sketch] — Extract the 'y' axis value of the last line segment…
std.sketch.segLen (function) [lines 817-837] [category: std.sketch] — Compute the length of the provided line segment
std.sketch.segAng (function) [lines 839-855] [category: std.sketch] — Compute the angle (in degrees) of the provided line segment
std.sketch.tangentToEnd (function) [lines 857-875] [category: std.sketch] — Returns the angle coming out of the end of the…
std.sketch.profileStart (function) [lines 877-889] [category: std.sketch] — Extract the provided 2-dimensional sketch's profile origin as an array…
std.sketch.profileStartX (function) [lines 891-901] [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin's 'x' value
std.sketch.profileStartY (function) [lines 903-912] [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin's 'y' value
std.sketch.involuteCircular (function) [lines 914-943] [category: std.sketch] — Extend the current sketch with a new involute circular curve
std.sketch.line (function) [lines 945-980] [category: std.sketch] — Extend the current sketch with a new straight line
std.sketch.xLine (function) [lines 982-1014] [category: std.sketch] — Draw a line relative to the current origin to a…
std.sketch.yLine (function) [lines 1016-1043] [category: std.sketch] — Draw a line relative to the current origin to a…
std.sketch.angledLine (function) [lines 1045-1080] [category: std.sketch] — Draw a line segment relative to the current origin using…
std.sketch.angledLineThatIntersects (function) [lines 1082-1112] [category: std.sketch] — Draw an angled line from the current origin, constructing a…
std.sketch.close (function) [lines 1114-1131] [category: std.sketch] — Construct a line segment from the current origin back to…
std.sketch.arc (function) [lines 1133-1166] [category: std.sketch] — Draw a curved line segment along an imaginary circle
std.sketch.tangentialArc (function) [lines 1168-1200] [category: std.sketch] — Starting at the current sketch's origin, draw a curved line…
std.sketch.bezierCurve (function) [lines 1202-1238] [category: std.sketch] — Draw a smooth, continuous, curved line segment from the current…
std.sketch.subtract2d (function) [lines 1240-1263] [category: std.sketch] — Use a 2-dimensional sketch to cut a hole in another…
std.sketch.conic (function) [lines 1265-1302] [category: std.sketch] — Add a conic section to an existing sketch
std.sketch.parabolic (function) [lines 1304-1334] [category: std.sketch] — Add a parabolic segment to an existing sketch
std.sketch.parabolicPoint (function) [lines 1336-1351] [category: std.sketch] — Calculate the point (x, y) on a parabola given x…
std.sketch.hyperbolic (function) [lines 1353-1387] [category: std.sketch] — Add a hyperbolic section to an existing sketch
std.sketch.hyperbolicPoint (function) [lines 1389-1403] [category: std.sketch] — Calculate the point (x, y) on a hyperbola given x…
std.sketch.elliptic (function) [lines 1405-1439] [category: std.sketch] — Add an elliptic section to an existing sketch
std.sketch.ellipticPoint (function) [lines 1441-1458] [category: std.sketch] — Calculate the point (x, y) on an ellipse given x…
std.sketch.planeOf (function) [lines 1460-1495] [category: std.sketch] — Find the plane a face lies on
std.sketch.faceOf (function) [lines 1497-1519] [category: std.sketch] — Get the face of a solid
std.sketch.region (function) [lines 1521-1553] [category: std.sketch] — Create a region from closed segments
std.sketch (module) [lines 1555-1558] [category: std.sketch] — Sketching is the foundational activity for most KCL programs

## std.solid — `api-std-solid.md`

std.solid.fillet (function) [lines 5-72] [category: std.solid] — Blend a transitional edge along a tagged path, smoothing the…
std.solid.chamfer (function) [lines 74-144] [category: std.solid] — Cut a straight transitional edge along a tagged path
std.solid.shell (function) [lines 146-174] [category: std.solid] — Remove volume from a 3-dimensional shape such that a wall…
std.solid.hollow (function) [lines 176-212] [category: std.solid] — Make the inside of a 3D object hollow
std.solid.patternTransform (function) [lines 214-238] [category: std.solid] — Repeat a 3-dimensional body or imported geometry, changing it each…
std.solid.patternLinear3d (function) [lines 240-270] [category: std.solid] — Repeat a 3-dimensional body or imported geometry along a linear…
std.solid.patternCircular3d (function) [lines 272-304] [category: std.solid] — Repeat a 3-dimensional body or imported geometry some number of…
std.solid.union (function) [lines 306-333] [category: std.solid] — Union two or more solids into a single solid
std.solid.intersect (function) [lines 335-362] [category: std.solid] — Intersect returns the shared volume between multiple solids, preserving only…
std.solid.subtract (function) [lines 364-406] [category: std.solid] — Subtract removes tool solids from base solids, leaving the remaining…
std.solid.appearance (function) [lines 408-444] [category: std.solid] — Set the appearance of a solid, imported geometry, or plane
std.solid.flipSurface (function) [lines 446-474] [category: std.solid] — Flips the orientation of a surface, swapping which side is…
std.solid.split (function) [lines 476-519] [category: std.solid] — Split all faces of the target body along all faces…
std.solid.isSolid (function) [lines 521-560] [category: std.solid] — Given a KCL value that is a "body" (currently typed…
std.solid.isSurface (function) [lines 562-601] [category: std.solid] — Given a KCL value that is a 'body' (currently typed…
std.solid.deleteFace (function) [lines 603-631] [category: std.solid] — Delete a face from a body (a solid, or a…
std.solid.blend (function) [lines 633-667] [category: std.solid] — Blend two surfaces together
std.solid.joinSurfaces (function) [lines 669-765] [category: std.solid] — Join multiple surfaces together into one body, or join together…
std.solid (module) [lines 767-769] [category: std.solid] — This module contains functions for modifying solids, e.g., by adding…

## std.transform — `api-std-transform.md`

std.transform.mirror2d (function) [lines 5-27] [category: std.transform] — Mirror a sketch
std.transform.mirror3d (function) [lines 29-54] [category: std.transform] — Create a mirror image of a 3D solid/surface/body, across some…
std.transform.translate (function) [lines 56-94] [category: std.transform] — Move a solid, a sketch, or a helix
std.transform.rotate (function) [lines 96-136] [category: std.transform] — Rotate a solid, a sketch, or a helix
std.transform.scale (function) [lines 138-176] [category: std.transform] — Scale a solid, a sketch, or a helix
std.transform.hide (function) [lines 178-191] [category: std.transform] — Hide solids, planes, sketches, helices, or imported objects
std.transform.delete (function) [lines 193-208] [category: std.transform] — Deletes something from the scene
std.transform (module) [lines 210-212] [category: std.transform] — This module contains functions for transforming sketches and solids

## std.appearance — `api-std-appearance.md`

std.appearance.appearance::hexString (function) [lines 5-14] [category: std.appearance] — Build a color from its red, green and blue components
std.appearance (module) [lines 16-17] [category: std.appearance]

## std.vector — `api-std-vector.md`

std.vector.vector::add (function) [lines 5-18] [category: std.vector] — Adds every element of u to its corresponding element in…
std.vector.vector::sub (function) [lines 20-33] [category: std.vector] — Subtracts from every element of u its corresponding element in…
std.vector.vector::mul (function) [lines 35-48] [category: std.vector] — Multiplies every element of u by its corresponding element in…
std.vector.vector::div (function) [lines 50-63] [category: std.vector] — Divides every element of u by its corresponding element in…
std.vector.vector::cross (function) [lines 65-80] [category: std.vector] — Find the cross product of two 3D points or vectors
std.vector.vector::dot (function) [lines 82-93] [category: std.vector] — Find the dot product of two points or vectors of…
std.vector.vector::magnitude (function) [lines 95-102] [category: std.vector] — Find the Euclidean distance of a vector
std.vector.vector::normalize (function) [lines 104-112] [category: std.vector] — Normalize a vector (with any number of dimensions)
std.vector (module) [lines 114-115] [category: std.vector]

## std.operation — `api-std-operation.md`

std.operation.operation::facing (function) [lines 5-57] [category: std.operation]
std.operation (module) [lines 59-60] [category: std.operation]

## std.hole — `api-std-hole.md`

std.hole.hole::simple (function) [lines 5-8] [category: std.hole] — A hole top with no decoration
std.hole.hole::counterbore (function) [lines 10-41] [category: std.hole] — Cut a straight vertical counterbore at the top of the…
std.hole.hole::countersink (function) [lines 43-84] [category: std.hole] — Cut an angled countersink at the top of the hole
std.hole.hole::blind (function) [lines 86-94] [category: std.hole] — The hole has the given blind depth
std.hole.hole::drill (function) [lines 96-121] [category: std.hole] — End the hole in an angle, like the end of…
std.hole.hole::flat (function) [lines 123-147] [category: std.hole] — End the hole flat
std.hole.hole::hole (function) [lines 149-190] [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole…
std.hole.hole::holes (function) [lines 192-233] [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole…
std.hole.hole::holesLinear (function) [lines 235-257] [category: std.hole] — Place the given holes in a line
std.hole.hole::holeAt (function) [lines 259-309] [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole…
std.hole (module) [lines 311-313] [category: std.hole] — Definitions of standard holes that could be drilled or cut…

## std.gear — `api-std-gear.md`

std.gear.gear::helical (function) [lines 5-32] [category: std.gear] — A helical gear (like a spur gear, but the teeth…
std.gear.gear::spur (function) [lines 34-59] [category: std.gear] — A spur gear (like a helical gear, with a helix…
std.gear.gear::herringbone (function) [lines 61-88] [category: std.gear] — A herringbone gear (like a helical gear that reverses direction…
std.gear.gear::ring (function) [lines 90-118] [category: std.gear] — A ring gear (i.e
std.gear (module) [lines 120-123] [category: std.gear] — Define gears that users can include in their models

## std.runtime — `api-std-runtime.md`

std.runtime.exit (function) [lines 5-10] [category: std.runtime] — Exit the program early
std.runtime (module) [lines 12-15] [category: std.runtime] — Functions for debugging and interacting with the runtime system

## std.view — `api-std-view.md`

std.view.view::oriented (function) [lines 5-29] [category: std.view] — Create a camera view that looks at the model from…
std.view.view::directed (function) [lines 31-58] [category: std.view] — Create a camera view that looks along a custom direction
std.view.view::named (function) [lines 60-137] [category: std.view] — Create a named view
std.view.view::Orientation (type) [lines 139-150] [category: std.view] — A standard camera orientation for a named view
std.view.view::Visibility (type) [lines 152-158] [category: std.view] — Whether the objects of a named view start visible or…
std.view.view::Projection (type) [lines 160-165] [category: std.view] — The camera projection of a named view
std.view.view::CameraView (type) [lines 167-170] [category: std.view] — A camera viewpoint, stored as intent
std.view.view::NamedView (type) [lines 172-175] [category: std.view] — A named view
std.view (module) [lines 177-180] [category: std.view] — Named views

## std.solver — `api-std-solver.md`

std.solver.solver::point (function) [lines 5-23] [category: std.solver] — Create a point in a sketch
std.solver.solver::line (function) [lines 25-48] [category: std.solver] — Create a straight line segment in a sketch
std.solver.solver::arc (function) [lines 50-74] [category: std.solver] — Create a circular arc
std.solver.solver::circle (function) [lines 76-101] [category: std.solver] — Create a circle in a sketch
std.solver.solver::controlPointSpline (function) [lines 103-124] [category: std.solver] — Create a control-point spline in a sketch
std.solver.solver::coincident (function) [lines 126-144] [category: std.solver] — Constrain points, or a point and a segment to be…
std.solver.solver::distance (function) [lines 146-169] [category: std.solver] — Constrain the distance between two sketch entities
std.solver.solver::radius (function) [lines 171-189] [category: std.solver] — Constrain the radius of an arc or circle segment
std.solver.solver::diameter (function) [lines 191-214] [category: std.solver] — Constrain the diameter of an arc or circle segment
std.solver.solver::horizontalDistance (function) [lines 216-239] [category: std.solver] — Constrain the horizontal distance between two points
std.solver.solver::verticalDistance (function) [lines 241-264] [category: std.solver] — Constrain the vertical distance between two points
std.solver.solver::equalLength (function) [lines 266-283] [category: std.solver] — Constrain lines to have equal length
std.solver.solver::equalRadius (function) [lines 285-300] [category: std.solver] — Constrain circular segments to have equal radius
std.solver.solver::parallel (function) [lines 302-320] [category: std.solver] — Constrain lines to be parallel
std.solver.solver::perpendicular (function) [lines 322-341] [category: std.solver] — Constrain lines to be perpendicular
std.solver.solver::angle (function) [lines 343-365] [category: std.solver] — Constrain lines to meet at a given angle
std.solver.solver::angleDimension (function) [lines 367-402] [category: std.solver] — Constrain the angle in the selected sector between two lines
std.solver.solver::tangent (function) [lines 404-421] [category: std.solver] — Constrain two segments to be tangent
std.solver.solver::midpoint (function) [lines 423-448] [category: std.solver] — Constrain a point to lie at the midpoint of a…
std.solver.solver::symmetric (function) [lines 450-474] [category: std.solver] — Constrain two points, lines, arcs, or circles to be symmetric…
std.solver.solver::fixed (function) [lines 476-488] [category: std.solver] — Constrain a point to be fixed to a position
std.solver.solver::horizontal (function) [lines 490-508] [category: std.solver] — Constrain a line, or a list of points, to be…
std.solver.solver::vertical (function) [lines 510-528] [category: std.solver] — Constrain a line, or a list of points, to be…
std.solver.solver::ORIGIN (constant) [lines 530-532] [category: std.solver] — The origin point in a sketch
std.solver (module) [lines 534-537] [category: std.solver] — Functions for sketch-solve using constraints

## std.types — `api-std-types.md`

std.types.any (type) [lines 5-16] [category: std.types] — The `any` type is the type of all possible values…
std.types.never (type) [lines 18-21] [category: std.types] — The uninhabited type of computations that never complete normally
std.types.none (type) [lines 23-27] [category: std.types] — The type of the none (aka null) value
std.types.number (type) [lines 29-32] [category: std.types] — A number
std.types.bool (type) [lines 34-37] [category: std.types] — A boolean value
std.types.string (type) [lines 39-45] [category: std.types] — A sequence of characters
std.types.TagDecl (type) [lines 47-50] [category: std.types] — Tags are used to give a name (tag) to a…
std.types.TaggedEdge (type) [lines 52-55] [category: std.types] — A tag which references a line, arc, or other edge…
std.types.TaggedFace (type) [lines 57-60] [category: std.types] — A tag which references a face of a solid, including…
std.types.ImportedGeometry (type) [lines 62-65] [category: std.types] — Represents geometry which is defined using some other CAD system…
std.types.fn (type) [lines 67-69] [category: std.types] — The type of any function in KCL
std.types.Plane (type) [lines 71-74] [category: std.types] — An abstract plane
std.types.Segment (type) [lines 76-80] [category: std.types] — A segment in a sketch created in a sketch block
std.types.Sketch (type) [lines 82-85] [category: std.types] — A sketch is a collection of paths
std.types.Solid (type) [lines 87-90] [category: std.types] — A solid is a collection of extruded surfaces
std.types.Face (type) [lines 92-94] [category: std.types] — A face of a solid
std.types.Helix (type) [lines 96-99] [category: std.types] — A helix
std.types.Edge (type) [lines 101-103] [category: std.types] — An edge of a solid
std.types.BoundedEdge (type) [lines 105-107] [category: std.types] — A [bounded edge](/docs/kcl-std/functions/std-sketch-getBoundedEdge) of a solid
std.types.Point2d (type) [lines 109-112] [category: std.types] — A point in two dimensional space
std.types.Point3d (type) [lines 114-117] [category: std.types] — A point in three dimensional space
std.types.Axis2d (type) [lines 119-122] [category: std.types] — An abstract and infinite line in 2d space
std.types.Axis3d (type) [lines 124-127] [category: std.types] — An abstract and infinite line in 3d space
std.types.GdtAnnotation (type) [lines 129-131] [category: std.types] — A GD&T annotation created by one of the [`gdt` functions](/docs/kcl-std/modules/std-gdt)
std.types.mm (type) [lines 133-134] [category: std.types]
std.types.cm (type) [lines 136-137] [category: std.types]
std.types.m (type) [lines 139-140] [category: std.types]
std.types.in (type) [lines 142-143] [category: std.types]
std.types.ft (type) [lines 145-146] [category: std.types]
std.types.yd (type) [lines 148-149] [category: std.types]
std.types.rad (type) [lines 151-152] [category: std.types]
std.types.deg (type) [lines 154-155] [category: std.types]
std.types (module) [lines 157-160] [category: std.types] — KCL types

## std.turns — `api-std-turns.md`

std.turns.turns::ZERO (constant) [lines 5-7] [category: std.turns] — No turn, zero degrees/radians
std.turns.turns::QUARTER_TURN (constant) [lines 9-13] [category: std.turns] — A quarter turn, 90 degrees or π/2 radians
std.turns.turns::HALF_TURN (constant) [lines 15-19] [category: std.turns] — A half turn, 180 degrees or π radians
std.turns.turns::THREE_QUARTER_TURN (constant) [lines 21-25] [category: std.turns] — Three quarters of a turn, 270 degrees or 1.5*π radians
std.turns (module) [lines 27-29] [category: std.turns] — This module contains a few handy constants for defining turns

## std.sweep — `api-std-sweep.md`

std.sweep.sweep::TRAJECTORY (constant) [lines 5-9] [category: std.sweep] — Local/relative to the trajectory curve
std.sweep.sweep::SKETCH_PLANE (constant) [lines 11-15] [category: std.sweep] — Local/relative to a position centered within the plane being sketched…
std.sweep (module) [lines 17-18] [category: std.sweep]
