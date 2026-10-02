# kcl-std API index

kcl-std 0.2.111 · 191 symbols · extracted by kcl-lib stdlib JSON export.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## std — `api-std.md`

helix (function) [category: std] — Create a helix [id: kcl:std.helix]
offsetPlane (function) [category: std] — Offset a plane by a distance along its normal [id: kcl:std.offsetPlane]
clone (function) [category: std] — Clone a sketch or solid [id: kcl:std.clone]
assertIs (function) [category: std] — Asserts that a value is the boolean value true [id: kcl:std.assertIs]
assert (function) [category: std] — Check a value meets some expected conditions at runtime [id: kcl:std.assert]
XY (constant) [category: std] — An abstract 3d plane aligned with the X and Y… [id: kcl:std.XY]
XZ (constant) [category: std] — An abstract 3d plane aligned with the X and Z… [id: kcl:std.XZ]
YZ (constant) [category: std] — An abstract 3d plane aligned with the Y and Z… [id: kcl:std.YZ]
X (constant) [category: std] — The X-axis (can be used in both 2d and 3d… [id: kcl:std.X]
Y (constant) [category: std] — The Y-axis (can be used in both 2d and 3d… [id: kcl:std.Y]
Z (constant) [category: std] — The 3D Z-axis [id: kcl:std.Z]
START (constant) [category: std] — Identifies the starting face of an extrusion [id: kcl:std.START]
END (constant) [category: std] — Identifies the ending face of an extrusion [id: kcl:std.END]
NEW (constant) [category: std] — Specifies that a new object is created during extrusion [id: kcl:std.NEW]
MERGE (constant) [category: std] — Specifies that the extrusion will be pulled into or pushed… [id: kcl:std.MERGE]
std (module) [category: std] — The KCL standard library [id: kcl:std]

## std.gdt — `api-std-gdt.md`

gdt::datum (function) [category: std.gdt] — GD&T datum feature [id: kcl:std.gdt.gdt::datum]
gdt::flatness (function) [category: std.gdt] — GD&T annotation specifying how flat faces should be [id: kcl:std.gdt.gdt::flatness]
gdt (module) [category: std.gdt] — Functions for working with geometric dimensioning and tolerancing (GD&T) [id: kcl:std.gdt]

## std.units — `api-std-units.md`

units::toMillimeters (function) [category: std.units] — Convert a number to millimeters from its current units [id: kcl:std.units.units::toMillimeters]
units::toCentimeters (function) [category: std.units] — Convert a number to centimeters from its current units [id: kcl:std.units.units::toCentimeters]
units::toMeters (function) [category: std.units] — Convert a number to meters from its current units [id: kcl:std.units.units::toMeters]
units::toInches (function) [category: std.units] — Convert a number to inches from its current units [id: kcl:std.units.units::toInches]
units::toFeet (function) [category: std.units] — Convert a number to feet from its current units [id: kcl:std.units.units::toFeet]
units::toYards (function) [category: std.units] — Converts a number to yards from its current units [id: kcl:std.units.units::toYards]
units::toRadians (function) [category: std.units] — Converts a number to radians from its current units [id: kcl:std.units.units::toRadians]
units::toDegrees (function) [category: std.units] — Converts a number to degrees from its current units [id: kcl:std.units.units::toDegrees]
units (module) [category: std.units] — Functions for converting numbers to different units [id: kcl:std.units]

## std.array — `api-std-array.md`

map (function) [category: std.array] — Apply a function to every element of a list [id: kcl:std.array.map]
reduce (function) [category: std.array] — Take a starting value [id: kcl:std.array.reduce]
push (function) [category: std.array] — Append an element to the end of an array [id: kcl:std.array.push]
pop (function) [category: std.array] — Remove the last element from an array [id: kcl:std.array.pop]
concat (function) [category: std.array] — Combine two arrays into one by concatenating them [id: kcl:std.array.concat]
count (function) [category: std.array] — Find the number of elements in an array [id: kcl:std.array.count]
array (module) [category: std.array] — Functions for manipulating arrays of values [id: kcl:std.array]

## std.math — `api-std-math.md`

cos (function) [category: std.math] — Compute the cosine of a number [id: kcl:std.math.cos]
sin (function) [category: std.math] — Compute the sine of a number [id: kcl:std.math.sin]
tan (function) [category: std.math] — Compute the tangent of a number [id: kcl:std.math.tan]
acos (function) [category: std.math] — Compute the arccosine of a number [id: kcl:std.math.acos]
asin (function) [category: std.math] — Compute the arcsine of a number [id: kcl:std.math.asin]
atan (function) [category: std.math] — Compute the arctangent of a number [id: kcl:std.math.atan]
atan2 (function) [category: std.math] — Compute the four quadrant arctangent of Y and X [id: kcl:std.math.atan2]
polar (function) [category: std.math] — Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid)… [id: kcl:std.math.polar]
rem (function) [category: std.math] — Compute the remainder after dividing `num` by `div` [id: kcl:std.math.rem]
sqrt (function) [category: std.math] — Compute the square root of a number [id: kcl:std.math.sqrt]
abs (function) [category: std.math] — Compute the absolute value of a number [id: kcl:std.math.abs]
round (function) [category: std.math] — Round a number to the nearest integer [id: kcl:std.math.round]
floor (function) [category: std.math] — Compute the largest integer less than or equal to a… [id: kcl:std.math.floor]
ceil (function) [category: std.math] — Compute the smallest integer greater than or equal to a… [id: kcl:std.math.ceil]
min (function) [category: std.math] — Compute the minimum of the given arguments [id: kcl:std.math.min]
max (function) [category: std.math] — Compute the maximum of the given arguments [id: kcl:std.math.max]
pow (function) [category: std.math] — Compute the number to a power [id: kcl:std.math.pow]
log (function) [category: std.math] — Compute the logarithm of the number with respect to an… [id: kcl:std.math.log]
log2 (function) [category: std.math] — Compute the base 2 logarithm of the number [id: kcl:std.math.log2]
log10 (function) [category: std.math] — Compute the base 10 logarithm of the number [id: kcl:std.math.log10]
ln (function) [category: std.math] — Compute the natural logarithm of the number [id: kcl:std.math.ln]
legLen (function) [category: std.math] — Compute the length of the given leg [id: kcl:std.math.legLen]
legAngX (function) [category: std.math] — Compute the angle of the given leg for x [id: kcl:std.math.legAngX]
legAngY (function) [category: std.math] — Compute the angle of the given leg for y [id: kcl:std.math.legAngY]
PI (constant) [category: std.math] — The value of `pi`, Archimedes’ constant (π) [id: kcl:std.math.PI]
E (constant) [category: std.math] — The value of Euler’s number `e` [id: kcl:std.math.E]
TAU (constant) [category: std.math] — The value of `tau`, the full circle constant (τ) [id: kcl:std.math.TAU]
math (module) [category: std.math] — Functions for mathematical operations and some useful constants [id: kcl:std.math]

## std.sketch — `api-std-sketch.md`

startSketchOn (function) [category: std.sketch] — Start a new 2-dimensional sketch on a specific plane or… [id: kcl:std.sketch.startSketchOn]
startProfile (function) [category: std.sketch] — Start a new profile at a given point [id: kcl:std.sketch.startProfile]
rectangle (function) [category: std.sketch] — Sketch a rectangle [id: kcl:std.sketch.rectangle]
circle (function) [category: std.sketch] — Construct a 2-dimensional circle, of the specified radius, centered at… [id: kcl:std.sketch.circle]
ellipse (function) [category: std.sketch] — Construct a 2-dimensional ellipse, of the specified major/minor radius, centered… [id: kcl:std.sketch.ellipse]
extrude (function) [category: std.sketch] — Extend a 2-dimensional sketch through a third dimension in order… [id: kcl:std.sketch.extrude]
revolve (function) [category: std.sketch] — Rotate a sketch around some provided axis, creating a solid… [id: kcl:std.sketch.revolve]
patternTransform2d (function) [category: std.sketch] — Just like `patternTransform`, but works on 2D sketches not 3D… [id: kcl:std.sketch.patternTransform2d]
getOppositeEdge (function) [category: std.sketch] — Get the opposite edge to the edge given [id: kcl:std.sketch.getOppositeEdge]
getNextAdjacentEdge (function) [category: std.sketch] — Get the next adjacent edge to the edge given [id: kcl:std.sketch.getNextAdjacentEdge]
getPreviousAdjacentEdge (function) [category: std.sketch] — Get the previous adjacent edge to the edge given [id: kcl:std.sketch.getPreviousAdjacentEdge]
getCommonEdge (function) [category: std.sketch] — Get the shared edge between two faces [id: kcl:std.sketch.getCommonEdge]
circleThreePoint (function) [category: std.sketch] — Construct a circle derived from 3 points [id: kcl:std.sketch.circleThreePoint]
polygon (function) [category: std.sketch] — Create a regular polygon with the specified number of sides… [id: kcl:std.sketch.polygon]
sweep (function) [category: std.sketch] — Extrude a sketch along a path [id: kcl:std.sketch.sweep]
loft (function) [category: std.sketch] — Create a 3D surface or solid by interpolating between two… [id: kcl:std.sketch.loft]
patternLinear2d (function) [category: std.sketch] — Repeat a 2-dimensional sketch along some dimension, with a dynamic… [id: kcl:std.sketch.patternLinear2d]
patternCircular2d (function) [category: std.sketch] — Repeat a 2-dimensional sketch some number of times along a… [id: kcl:std.sketch.patternCircular2d]
segEnd (function) [category: std.sketch] — Compute the ending point of the provided line segment [id: kcl:std.sketch.segEnd]
segEndX (function) [category: std.sketch] — Compute the ending point of the provided line segment along… [id: kcl:std.sketch.segEndX]
segEndY (function) [category: std.sketch] — Compute the ending point of the provided line segment along… [id: kcl:std.sketch.segEndY]
segStart (function) [category: std.sketch] — Compute the starting point of the provided line segment [id: kcl:std.sketch.segStart]
segStartX (function) [category: std.sketch] — Compute the starting point of the provided line segment along… [id: kcl:std.sketch.segStartX]
segStartY (function) [category: std.sketch] — Compute the starting point of the provided line segment along… [id: kcl:std.sketch.segStartY]
lastSegX (function) [category: std.sketch] — Extract the 'x' axis value of the last line segment… [id: kcl:std.sketch.lastSegX]
lastSegY (function) [category: std.sketch] — Extract the 'y' axis value of the last line segment… [id: kcl:std.sketch.lastSegY]
segLen (function) [category: std.sketch] — Compute the length of the provided line segment [id: kcl:std.sketch.segLen]
segAng (function) [category: std.sketch] — Compute the angle (in degrees) of the provided line segment [id: kcl:std.sketch.segAng]
tangentToEnd (function) [category: std.sketch] — Returns the angle coming out of the end of the… [id: kcl:std.sketch.tangentToEnd]
profileStart (function) [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin value [id: kcl:std.sketch.profileStart]
profileStartX (function) [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin's 'x' value [id: kcl:std.sketch.profileStartX]
profileStartY (function) [category: std.sketch] — Extract the provided 2-dimensional sketch's profile's origin's 'y' value [id: kcl:std.sketch.profileStartY]
involuteCircular (function) [category: std.sketch] — Extend the current sketch with a new involute circular curve [id: kcl:std.sketch.involuteCircular]
line (function) [category: std.sketch] — Extend the current sketch with a new straight line [id: kcl:std.sketch.line]
xLine (function) [category: std.sketch] — Draw a line relative to the current origin to a… [id: kcl:std.sketch.xLine]
yLine (function) [category: std.sketch] — Draw a line relative to the current origin to a… [id: kcl:std.sketch.yLine]
angledLine (function) [category: std.sketch] — Draw a line segment relative to the current origin using… [id: kcl:std.sketch.angledLine]
angledLineThatIntersects (function) [category: std.sketch] — Draw an angled line from the current origin, constructing a… [id: kcl:std.sketch.angledLineThatIntersects]
close (function) [category: std.sketch] — Construct a line segment from the current origin back to… [id: kcl:std.sketch.close]
arc (function) [category: std.sketch] — Draw a curved line segment along an imaginary circle [id: kcl:std.sketch.arc]
tangentialArc (function) [category: std.sketch] — Starting at the current sketch's origin, draw a curved line… [id: kcl:std.sketch.tangentialArc]
bezierCurve (function) [category: std.sketch] — Draw a smooth, continuous, curved line segment from the current… [id: kcl:std.sketch.bezierCurve]
subtract2d (function) [category: std.sketch] — Use a 2-dimensional sketch to cut a hole in another… [id: kcl:std.sketch.subtract2d]
conic (function) [category: std.sketch] — Add a conic section to an existing sketch [id: kcl:std.sketch.conic]
parabolic (function) [category: std.sketch] — Add a parabolic segment to an existing sketch [id: kcl:std.sketch.parabolic]
parabolicPoint (function) [category: std.sketch] — Calculate the point (x, y) on a parabola given x… [id: kcl:std.sketch.parabolicPoint]
hyperbolic (function) [category: std.sketch] — Add a hyperbolic section to an existing sketch [id: kcl:std.sketch.hyperbolic]
hyperbolicPoint (function) [category: std.sketch] — Calculate the point (x, y) on a hyperbola given x… [id: kcl:std.sketch.hyperbolicPoint]
elliptic (function) [category: std.sketch] — Add an elliptic section to an existing sketch [id: kcl:std.sketch.elliptic]
ellipticPoint (function) [category: std.sketch] — Calculate the point (x, y) on an ellipse given x… [id: kcl:std.sketch.ellipticPoint]
planeOf (function) [category: std.sketch] — Find the plane a face lies on [id: kcl:std.sketch.planeOf]
sketch (module) [category: std.sketch] — Sketching is the foundational activity for most KCL programs [id: kcl:std.sketch]

## std.solid — `api-std-solid.md`

fillet (function) [category: std.solid] — Blend a transitional edge along a tagged path, smoothing the… [id: kcl:std.solid.fillet]
chamfer (function) [category: std.solid] — Cut a straight transitional edge along a tagged path [id: kcl:std.solid.chamfer]
shell (function) [category: std.solid] — Remove volume from a 3-dimensional shape such that a wall… [id: kcl:std.solid.shell]
hollow (function) [category: std.solid] — Make the inside of a 3D object hollow [id: kcl:std.solid.hollow]
patternTransform (function) [category: std.solid] — Repeat a 3-dimensional solid, changing it each time [id: kcl:std.solid.patternTransform]
patternLinear3d (function) [category: std.solid] — Repeat a 3-dimensional solid along a linear path, with a… [id: kcl:std.solid.patternLinear3d]
patternCircular3d (function) [category: std.solid] — Repeat a 3-dimensional solid some number of times along a… [id: kcl:std.solid.patternCircular3d]
union (function) [category: std.solid] — Union two or more solids into a single solid [id: kcl:std.solid.union]
intersect (function) [category: std.solid] — Intersect returns the shared volume between multiple solids, preserving only… [id: kcl:std.solid.intersect]
subtract (function) [category: std.solid] — Subtract removes tool solids from base solids, leaving the remaining… [id: kcl:std.solid.subtract]
appearance (function) [category: std.solid] — Set the appearance of a solid [id: kcl:std.solid.appearance]
solid (module) [category: std.solid] — This module contains functions for modifying solids, e.g., by adding… [id: kcl:std.solid]

## std.transform — `api-std-transform.md`

mirror2d (function) [category: std.transform] — Mirror a sketch [id: kcl:std.transform.mirror2d]
translate (function) [category: std.transform] — Move a solid or a sketch [id: kcl:std.transform.translate]
rotate (function) [category: std.transform] — Rotate a solid or a sketch [id: kcl:std.transform.rotate]
scale (function) [category: std.transform] — Scale a solid or a sketch [id: kcl:std.transform.scale]
transform (module) [category: std.transform] — This module contains functions for transforming sketches and solids [id: kcl:std.transform]

## std.appearance — `api-std-appearance.md`

appearance::hexString (function) [category: std.appearance] — Build a color from its red, green and blue components [id: kcl:std.appearance.appearance::hexString]
appearance (module) [category: std.appearance] [id: kcl:std.appearance]

## std.vector — `api-std-vector.md`

vector::add (function) [category: std.vector] — Adds every element of u to its corresponding element in… [id: kcl:std.vector.vector::add]
vector::sub (function) [category: std.vector] — Subtracts from every element of u its corresponding element in… [id: kcl:std.vector.vector::sub]
vector::mul (function) [category: std.vector] — Multiplies every element of u by its corresponding element in… [id: kcl:std.vector.vector::mul]
vector::div (function) [category: std.vector] — Divides every element of u by its corresponding element in… [id: kcl:std.vector.vector::div]
vector::cross (function) [category: std.vector] — Find the cross product of two 3D points or vectors [id: kcl:std.vector.vector::cross]
vector::dot (function) [category: std.vector] — Find the dot product of two points or vectors of… [id: kcl:std.vector.vector::dot]
vector::magnitude (function) [category: std.vector] — Find the Euclidean distance of a vector [id: kcl:std.vector.vector::magnitude]
vector::normalize (function) [category: std.vector] — Normalize a vector (with any number of dimensions) [id: kcl:std.vector.vector::normalize]
vector (module) [category: std.vector] [id: kcl:std.vector]

## std.hole — `api-std-hole.md`

hole::simple (function) [category: std.hole] — A hole top with no decoration [id: kcl:std.hole.hole::simple]
hole::counterbore (function) [category: std.hole] — Cut a straight vertical counterbore at the top of the… [id: kcl:std.hole.hole::counterbore]
hole::countersink (function) [category: std.hole] — Cut an angled countersink at the top of the hole [id: kcl:std.hole.hole::countersink]
hole::blind (function) [category: std.hole] — The hole has the given blind depth [id: kcl:std.hole.hole::blind]
hole::drill (function) [category: std.hole] — End the hole in an angle, like the end of… [id: kcl:std.hole.hole::drill]
hole::flat (function) [category: std.hole] — End the hole flat [id: kcl:std.hole.hole::flat]
hole::hole (function) [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole… [id: kcl:std.hole.hole::hole]
hole::holes (function) [category: std.hole] — From the hole's parts (bottom, middle, top), cut the hole… [id: kcl:std.hole.hole::holes]
hole::holesLinear (function) [category: std.hole] — Place the given holes in a line [id: kcl:std.hole.hole::holesLinear]
hole (module) [category: std.hole] — Definitions of standard holes that could be drilled or cut… [id: kcl:std.hole]

## std.types — `api-std-types.md`

any (type) [category: std.types] — The `any` type is the type of all possible values… [id: kcl:std.types.any]
none (type) [category: std.types] — The type of the none (aka null) value [id: kcl:std.types.none]
number (type) [category: std.types] — A number [id: kcl:std.types.number]
bool (type) [category: std.types] — A boolean value [id: kcl:std.types.bool]
string (type) [category: std.types] — A sequence of characters [id: kcl:std.types.string]
TagDecl (type) [category: std.types] — Tags are used to give a name (tag) to a… [id: kcl:std.types.TagDecl]
TaggedEdge (type) [category: std.types] — A tag which references a line, arc, or other edge… [id: kcl:std.types.TaggedEdge]
TaggedFace (type) [category: std.types] — A tag which references a face of a solid, including… [id: kcl:std.types.TaggedFace]
ImportedGeometry (type) [category: std.types] — Represents geometry which is defined using some other CAD system… [id: kcl:std.types.ImportedGeometry]
fn (type) [category: std.types] — The type of any function in KCL [id: kcl:std.types.fn]
Plane (type) [category: std.types] — An abstract plane [id: kcl:std.types.Plane]
Sketch (type) [category: std.types] — A sketch is a collection of paths [id: kcl:std.types.Sketch]
Solid (type) [category: std.types] — A solid is a collection of extruded surfaces [id: kcl:std.types.Solid]
Face (type) [category: std.types] — A face of a solid [id: kcl:std.types.Face]
Helix (type) [category: std.types] — A helix [id: kcl:std.types.Helix]
Edge (type) [category: std.types] — An edge of a solid [id: kcl:std.types.Edge]
Point2d (type) [category: std.types] — A point in two dimensional space [id: kcl:std.types.Point2d]
Point3d (type) [category: std.types] — A point in three dimensional space [id: kcl:std.types.Point3d]
Axis2d (type) [category: std.types] — An abstract and infinite line in 2d space [id: kcl:std.types.Axis2d]
Axis3d (type) [category: std.types] — An abstract and infinite line in 3d space [id: kcl:std.types.Axis3d]
GdtAnnotation (type) [category: std.types] — A GD&T annotation [id: kcl:std.types.GdtAnnotation]
mm (type) [category: std.types] [id: kcl:std.types.mm]
cm (type) [category: std.types] [id: kcl:std.types.cm]
m (type) [category: std.types] [id: kcl:std.types.m]
in (type) [category: std.types] [id: kcl:std.types.in]
ft (type) [category: std.types] [id: kcl:std.types.ft]
yd (type) [category: std.types] [id: kcl:std.types.yd]
rad (type) [category: std.types] [id: kcl:std.types.rad]
deg (type) [category: std.types] [id: kcl:std.types.deg]
types (module) [category: std.types] — KCL types [id: kcl:std.types]

## std.turns — `api-std-turns.md`

turns::ZERO (constant) [category: std.turns] — No turn, zero degrees/radians [id: kcl:std.turns.turns::ZERO]
turns::QUARTER_TURN (constant) [category: std.turns] — A quarter turn, 90 degrees or π/2 radians [id: kcl:std.turns.turns::QUARTER_TURN]
turns::HALF_TURN (constant) [category: std.turns] — A half turn, 180 degrees or π radians [id: kcl:std.turns.turns::HALF_TURN]
turns::THREE_QUARTER_TURN (constant) [category: std.turns] — Three quarters of a turn, 270 degrees or 1.5*π radians [id: kcl:std.turns.turns::THREE_QUARTER_TURN]
turns (module) [category: std.turns] — This module contains a few handy constants for defining turns [id: kcl:std.turns]

## std.sweep — `api-std-sweep.md`

sweep::TRAJECTORY (constant) [category: std.sweep] — Local/relative to the trajectory curve [id: kcl:std.sweep.sweep::TRAJECTORY]
sweep::SKETCH_PLANE (constant) [category: std.sweep] — Local/relative to a position centered within the plane being sketched… [id: kcl:std.sweep.sweep::SKETCH_PLANE]
sweep (module) [category: std.sweep] [id: kcl:std.sweep]
