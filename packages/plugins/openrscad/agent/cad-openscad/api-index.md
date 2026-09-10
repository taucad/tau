# openrscad API index

openrscad 0.10.1 · 78 symbols · extracted by openrscad-lsp BUILTINS table.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## 3D primitives — `api-3d-primitives.md`

cube (module) — Axis-aligned box
sphere (module) — Sphere of radius `r` (or diameter `d`)
cylinder (module) — Cylinder or cone of height `h`
polyhedron (module) — Arbitrary solid from vertices and faces

## 2D primitives — `api-2d-primitives.md`

square (module) — Axis-aligned 2D rectangle
circle (module) — 2D circle of radius `r` (or diameter `d`)
polygon (module) — 2D polygon from a list of points
text (module) — 2D text outlines
import (module) — Import geometry from STL/OFF/DXF/SVG

## Transforms — `api-transforms.md`

translate (module) — Move children by a vector
rotate (module) — Rotate children (degrees)
scale (module) — Scale children by a vector or scalar
resize (module) — Resize children to absolute dimensions
mirror (module) — Mirror children across a plane through the origin
multmatrix (module) — Apply a 4×3/4×4 affine matrix to children
color (module) — Recolor children for preview
offset (module) — Grow/shrink a 2D shape
hull (module) — Convex hull of all children
minkowski (module) — Minkowski sum of the children

## Booleans — `api-booleans.md`

union (module) — Combine all children into one solid
difference (module) — Subtract later children from the first
intersection (module) — Keep only the volume shared by all children

## Extrusion / projection — `api-extrusion-projection.md`

linear_extrude (module) — Extrude a 2D shape along Z
rotate_extrude (module) — Revolve a 2D shape around the Z axis
projection (module) — Project 3D geometry down to 2D

## Control-flow modules — `api-control-flow-modules.md`

for (module) — Iterate, instantiating children per value
intersection_for (module) — Intersect children across all iterations
if (module) — Conditionally instantiate children
let (module) — Bind variables for the children scope
children (module) — Instantiate the children passed to a module
echo (module) — Print values to the console
assert (module) — Abort with a message if `cond` is false
render (module) — Force a full CSG render of children

## Math functions — `api-math-functions.md`

sin (function) — Sine (degrees)
cos (function) — Cosine (degrees)
tan (function) — Tangent (degrees)
asin (function) — Arcsine, in degrees
acos (function) — Arccosine, in degrees
atan (function) — Arctangent, in degrees
atan2 (function) — Two-argument arctangent, in degrees
abs (function) — Absolute value
sign (function) — -1, 0, or 1 by sign of `x`
floor (function) — Round down to an integer
ceil (function) — Round up to an integer
round (function) — Round to the nearest integer
sqrt (function) — Square root
pow (function) — Exponentiation
exp (function) — e raised to `x`
ln (function) — Natural logarithm
log (function) — Base-10 logarithm
min (function) — Smallest of the arguments
max (function) — Largest of the arguments
norm (function) — Euclidean length of a vector
cross (function) — Cross product of two 3-vectors

## List / string functions — `api-list-string-functions.md`

len (function) — Length of a vector or string
concat (function) — Concatenate vectors/values into one list
lookup (function) — Linear-interpolated table lookup
str (function) — Concatenate values into a string
chr (function) — Unicode code point(s) to a string
ord (function) — First character to its Unicode code point
search (function) — Find matches in a list/string
parent_module (function) — Name of a user module on the active instantiation stack
is_undef (function) — True if `x` is undefined
is_bool (function) — True if `x` is a boolean
is_num (function) — True if `x` is a number
is_string (function) — True if `x` is a string
is_list (function) — True if `x` is a list/vector
is_function (function) — True if `x` is a function value

## Special variables (offered as completions) — `api-special-variables-offered-as-completions.md`

$fn (constant) — Fixed number of fragments in a circle
$fa (constant) — Minimum angle per fragment (degrees)
$fs (constant) — Minimum fragment size
$t (constant) — Animation time, 0→1
$parent_modules (constant) — Number of active user-module instantiations
$preview (constant) — True during F5 preview, false during F6 render
$vpr (constant) — Viewport rotation `[x,y,z]`
$vpt (constant) — Viewport translation `[x,y,z]`
$vpd (constant) — Viewport camera distance
$vpf (constant) — Viewport field of view
