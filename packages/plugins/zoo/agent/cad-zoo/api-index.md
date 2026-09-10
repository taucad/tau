# kcl-std API index

kcl-std 0.2.111 · 191 symbols · extracted by kcl-lib stdlib JSON export.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## std — `api-std.md`

helix (function) — Create a helix
offsetPlane (function) — Offset a plane by a distance along its normal
clone (function) — Clone a sketch or solid
assertIs (function) — Asserts that a value is the boolean value true
assert (function) — Check a value meets some expected conditions at runtime
XY (constant) — An abstract 3d plane aligned with the X and Y…
XZ (constant) — An abstract 3d plane aligned with the X and Z…
YZ (constant) — An abstract 3d plane aligned with the Y and Z…
X (constant) — The X-axis (can be used in both 2d and 3d…
Y (constant) — The Y-axis (can be used in both 2d and 3d…
Z (constant) — The 3D Z-axis
START (constant) — Identifies the starting face of an extrusion
END (constant) — Identifies the ending face of an extrusion
NEW (constant) — Specifies that a new object is created during extrusion
MERGE (constant) — Specifies that the extrusion will be pulled into or pushed…
std (module) — The KCL standard library

## std.gdt — `api-std-gdt.md`

gdt::datum (function) — GD&T datum feature
gdt::flatness (function) — GD&T annotation specifying how flat faces should be
gdt (module) — Functions for working with geometric dimensioning and tolerancing (GD&T)

## std.units — `api-std-units.md`

units::toMillimeters (function) — Convert a number to millimeters from its current units
units::toCentimeters (function) — Convert a number to centimeters from its current units
units::toMeters (function) — Convert a number to meters from its current units
units::toInches (function) — Convert a number to inches from its current units
units::toFeet (function) — Convert a number to feet from its current units
units::toYards (function) — Converts a number to yards from its current units
units::toRadians (function) — Converts a number to radians from its current units
units::toDegrees (function) — Converts a number to degrees from its current units
units (module) — Functions for converting numbers to different units

## std.array — `api-std-array.md`

map (function) — Apply a function to every element of a list
reduce (function) — Take a starting value
push (function) — Append an element to the end of an array
pop (function) — Remove the last element from an array
concat (function) — Combine two arrays into one by concatenating them
count (function) — Find the number of elements in an array
array (module) — Functions for manipulating arrays of values

## std.math — `api-std-math.md`

cos (function) — Compute the cosine of a number
sin (function) — Compute the sine of a number
tan (function) — Compute the tangent of a number
acos (function) — Compute the arccosine of a number
asin (function) — Compute the arcsine of a number
atan (function) — Compute the arctangent of a number
atan2 (function) — Compute the four quadrant arctangent of Y and X
polar (function) — Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid)…
rem (function) — Compute the remainder after dividing `num` by `div`
sqrt (function) — Compute the square root of a number
abs (function) — Compute the absolute value of a number
round (function) — Round a number to the nearest integer
floor (function) — Compute the largest integer less than or equal to a…
ceil (function) — Compute the smallest integer greater than or equal to a…
min (function) — Compute the minimum of the given arguments
max (function) — Compute the maximum of the given arguments
pow (function) — Compute the number to a power
log (function) — Compute the logarithm of the number with respect to an…
log2 (function) — Compute the base 2 logarithm of the number
log10 (function) — Compute the base 10 logarithm of the number
ln (function) — Compute the natural logarithm of the number
legLen (function) — Compute the length of the given leg
legAngX (function) — Compute the angle of the given leg for x
legAngY (function) — Compute the angle of the given leg for y
PI (constant) — The value of `pi`, Archimedes’ constant (π)
E (constant) — The value of Euler’s number `e`
TAU (constant) — The value of `tau`, the full circle constant (τ)
math (module) — Functions for mathematical operations and some useful constants

## std.sketch — `api-std-sketch.md`

startSketchOn (function) — Start a new 2-dimensional sketch on a specific plane or…
startProfile (function) — Start a new profile at a given point
rectangle (function) — Sketch a rectangle
circle (function) — Construct a 2-dimensional circle, of the specified radius, centered at…
ellipse (function) — Construct a 2-dimensional ellipse, of the specified major/minor radius, centered…
extrude (function) — Extend a 2-dimensional sketch through a third dimension in order…
revolve (function) — Rotate a sketch around some provided axis, creating a solid…
patternTransform2d (function) — Just like `patternTransform`, but works on 2D sketches not 3D…
getOppositeEdge (function) — Get the opposite edge to the edge given
getNextAdjacentEdge (function) — Get the next adjacent edge to the edge given
getPreviousAdjacentEdge (function) — Get the previous adjacent edge to the edge given
getCommonEdge (function) — Get the shared edge between two faces
circleThreePoint (function) — Construct a circle derived from 3 points
polygon (function) — Create a regular polygon with the specified number of sides…
sweep (function) — Extrude a sketch along a path
loft (function) — Create a 3D surface or solid by interpolating between two…
patternLinear2d (function) — Repeat a 2-dimensional sketch along some dimension, with a dynamic…
patternCircular2d (function) — Repeat a 2-dimensional sketch some number of times along a…
segEnd (function) — Compute the ending point of the provided line segment
segEndX (function) — Compute the ending point of the provided line segment along…
segEndY (function) — Compute the ending point of the provided line segment along…
segStart (function) — Compute the starting point of the provided line segment
segStartX (function) — Compute the starting point of the provided line segment along…
segStartY (function) — Compute the starting point of the provided line segment along…
lastSegX (function) — Extract the 'x' axis value of the last line segment…
lastSegY (function) — Extract the 'y' axis value of the last line segment…
segLen (function) — Compute the length of the provided line segment
segAng (function) — Compute the angle (in degrees) of the provided line segment
tangentToEnd (function) — Returns the angle coming out of the end of the…
profileStart (function) — Extract the provided 2-dimensional sketch's profile's origin value
profileStartX (function) — Extract the provided 2-dimensional sketch's profile's origin's 'x' value
profileStartY (function) — Extract the provided 2-dimensional sketch's profile's origin's 'y' value
involuteCircular (function) — Extend the current sketch with a new involute circular curve
line (function) — Extend the current sketch with a new straight line
xLine (function) — Draw a line relative to the current origin to a…
yLine (function) — Draw a line relative to the current origin to a…
angledLine (function) — Draw a line segment relative to the current origin using…
angledLineThatIntersects (function) — Draw an angled line from the current origin, constructing a…
close (function) — Construct a line segment from the current origin back to…
arc (function) — Draw a curved line segment along an imaginary circle
tangentialArc (function) — Starting at the current sketch's origin, draw a curved line…
bezierCurve (function) — Draw a smooth, continuous, curved line segment from the current…
subtract2d (function) — Use a 2-dimensional sketch to cut a hole in another…
conic (function) — Add a conic section to an existing sketch
parabolic (function) — Add a parabolic segment to an existing sketch
parabolicPoint (function) — Calculate the point (x, y) on a parabola given x…
hyperbolic (function) — Add a hyperbolic section to an existing sketch
hyperbolicPoint (function) — Calculate the point (x, y) on a hyperbola given x…
elliptic (function) — Add an elliptic section to an existing sketch
ellipticPoint (function) — Calculate the point (x, y) on an ellipse given x…
planeOf (function) — Find the plane a face lies on
sketch (module) — Sketching is the foundational activity for most KCL programs

## std.solid — `api-std-solid.md`

fillet (function) — Blend a transitional edge along a tagged path, smoothing the…
chamfer (function) — Cut a straight transitional edge along a tagged path
shell (function) — Remove volume from a 3-dimensional shape such that a wall…
hollow (function) — Make the inside of a 3D object hollow
patternTransform (function) — Repeat a 3-dimensional solid, changing it each time
patternLinear3d (function) — Repeat a 3-dimensional solid along a linear path, with a…
patternCircular3d (function) — Repeat a 3-dimensional solid some number of times along a…
union (function) — Union two or more solids into a single solid
intersect (function) — Intersect returns the shared volume between multiple solids, preserving only…
subtract (function) — Subtract removes tool solids from base solids, leaving the remaining…
appearance (function) — Set the appearance of a solid
solid (module) — This module contains functions for modifying solids, e.g., by adding…

## std.transform — `api-std-transform.md`

mirror2d (function) — Mirror a sketch
translate (function) — Move a solid or a sketch
rotate (function) — Rotate a solid or a sketch
scale (function) — Scale a solid or a sketch
transform (module) — This module contains functions for transforming sketches and solids

## std.appearance — `api-std-appearance.md`

appearance::hexString (function) — Build a color from its red, green and blue components
appearance (module)

## std.vector — `api-std-vector.md`

vector::add (function) — Adds every element of u to its corresponding element in…
vector::sub (function) — Subtracts from every element of u its corresponding element in…
vector::mul (function) — Multiplies every element of u by its corresponding element in…
vector::div (function) — Divides every element of u by its corresponding element in…
vector::cross (function) — Find the cross product of two 3D points or vectors
vector::dot (function) — Find the dot product of two points or vectors of…
vector::magnitude (function) — Find the Euclidean distance of a vector
vector::normalize (function) — Normalize a vector (with any number of dimensions)
vector (module)

## std.hole — `api-std-hole.md`

hole::simple (function) — A hole top with no decoration
hole::counterbore (function) — Cut a straight vertical counterbore at the top of the…
hole::countersink (function) — Cut an angled countersink at the top of the hole
hole::blind (function) — The hole has the given blind depth
hole::drill (function) — End the hole in an angle, like the end of…
hole::flat (function) — End the hole flat
hole::hole (function) — From the hole's parts (bottom, middle, top), cut the hole…
hole::holes (function) — From the hole's parts (bottom, middle, top), cut the hole…
hole::holesLinear (function) — Place the given holes in a line
hole (module) — Definitions of standard holes that could be drilled or cut…

## std.types — `api-std-types.md`

any (type) — The `any` type is the type of all possible values…
none (type) — The type of the none (aka null) value
number (type) — A number
bool (type) — A boolean value
string (type) — A sequence of characters
TagDecl (type) — Tags are used to give a name (tag) to a…
TaggedEdge (type) — A tag which references a line, arc, or other edge…
TaggedFace (type) — A tag which references a face of a solid, including…
ImportedGeometry (type) — Represents geometry which is defined using some other CAD system…
fn (type) — The type of any function in KCL
Plane (type) — An abstract plane
Sketch (type) — A sketch is a collection of paths
Solid (type) — A solid is a collection of extruded surfaces
Face (type) — A face of a solid
Helix (type) — A helix
Edge (type) — An edge of a solid
Point2d (type) — A point in two dimensional space
Point3d (type) — A point in three dimensional space
Axis2d (type) — An abstract and infinite line in 2d space
Axis3d (type) — An abstract and infinite line in 3d space
GdtAnnotation (type) — A GD&T annotation
mm (type)
cm (type)
m (type)
in (type)
ft (type)
yd (type)
rad (type)
deg (type)
types (module) — KCL types

## std.turns — `api-std-turns.md`

turns::ZERO (constant) — No turn, zero degrees/radians
turns::QUARTER_TURN (constant) — A quarter turn, 90 degrees or π/2 radians
turns::HALF_TURN (constant) — A half turn, 180 degrees or π radians
turns::THREE_QUARTER_TURN (constant) — Three quarters of a turn, 270 degrees or 1.5\*π radians
turns (module) — This module contains a few handy constants for defining turns

## std.sweep — `api-std-sweep.md`

sweep::TRAJECTORY (constant) — Local/relative to the trajectory curve
sweep::SKETCH_PLANE (constant) — Local/relative to a position centered within the plane being sketched…
sweep (module)
