# openrscad API index

openrscad 0.10.1 · 78 symbols · extracted by openrscad-lsp BUILTINS table.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## 3D primitives — `api-3d-primitives.md`

cube (module) [category: 3D primitives] — Axis-aligned box [id: openscad:cube]
sphere (module) [category: 3D primitives] — Sphere of radius `r` (or diameter `d`) [id: openscad:sphere]
cylinder (module) [category: 3D primitives] — Cylinder or cone of height `h` [id: openscad:cylinder]
polyhedron (module) [category: 3D primitives] — Arbitrary solid from vertices and faces [id: openscad:polyhedron]

## 2D primitives — `api-2d-primitives.md`

square (module) [category: 2D primitives] — Axis-aligned 2D rectangle [id: openscad:square]
circle (module) [category: 2D primitives] — 2D circle of radius `r` (or diameter `d`) [id: openscad:circle]
polygon (module) [category: 2D primitives] — 2D polygon from a list of points [id: openscad:polygon]
text (module) [category: 2D primitives] — 2D text outlines [id: openscad:text]
import (module) [category: 2D primitives] — Import geometry from STL/OFF/DXF/SVG [id: openscad:import]

## Transforms — `api-transforms.md`

translate (module) [category: Transforms] — Move children by a vector [id: openscad:translate]
rotate (module) [category: Transforms] — Rotate children (degrees) [id: openscad:rotate]
scale (module) [category: Transforms] — Scale children by a vector or scalar [id: openscad:scale]
resize (module) [category: Transforms] — Resize children to absolute dimensions [id: openscad:resize]
mirror (module) [category: Transforms] — Mirror children across a plane through the origin [id: openscad:mirror]
multmatrix (module) [category: Transforms] — Apply a 4×3/4×4 affine matrix to children [id: openscad:multmatrix]
color (module) [category: Transforms] — Recolor children for preview [id: openscad:color]
offset (module) [category: Transforms] — Grow/shrink a 2D shape [id: openscad:offset]
hull (module) [category: Transforms] — Convex hull of all children [id: openscad:hull]
minkowski (module) [category: Transforms] — Minkowski sum of the children [id: openscad:minkowski]

## Booleans — `api-booleans.md`

union (module) [category: Booleans] — Combine all children into one solid [id: openscad:union]
difference (module) [category: Booleans] — Subtract later children from the first [id: openscad:difference]
intersection (module) [category: Booleans] — Keep only the volume shared by all children [id: openscad:intersection]

## Extrusion / projection — `api-extrusion-projection.md`

linear_extrude (module) [category: Extrusion / projection] — Extrude a 2D shape along Z [id: openscad:linear_extrude]
rotate_extrude (module) [category: Extrusion / projection] — Revolve a 2D shape around the Z axis [id: openscad:rotate_extrude]
projection (module) [category: Extrusion / projection] — Project 3D geometry down to 2D [id: openscad:projection]

## Control-flow modules — `api-control-flow-modules.md`

for (module) [category: Control-flow modules] — Iterate, instantiating children per value [id: openscad:for]
intersection_for (module) [category: Control-flow modules] — Intersect children across all iterations [id: openscad:intersection_for]
if (module) [category: Control-flow modules] — Conditionally instantiate children [id: openscad:if]
let (module) [category: Control-flow modules] — Bind variables for the children scope [id: openscad:let]
children (module) [category: Control-flow modules] — Instantiate the children passed to a module [id: openscad:children]
echo (module) [category: Control-flow modules] — Print values to the console [id: openscad:echo]
assert (module) [category: Control-flow modules] — Abort with a message if `cond` is false [id: openscad:assert]
render (module) [category: Control-flow modules] — Force a full CSG render of children [id: openscad:render]

## Math functions — `api-math-functions.md`

sin (function) [category: Math functions] — Sine (degrees) [id: openscad:sin]
cos (function) [category: Math functions] — Cosine (degrees) [id: openscad:cos]
tan (function) [category: Math functions] — Tangent (degrees) [id: openscad:tan]
asin (function) [category: Math functions] — Arcsine, in degrees [id: openscad:asin]
acos (function) [category: Math functions] — Arccosine, in degrees [id: openscad:acos]
atan (function) [category: Math functions] — Arctangent, in degrees [id: openscad:atan]
atan2 (function) [category: Math functions] — Two-argument arctangent, in degrees [id: openscad:atan2]
abs (function) [category: Math functions] — Absolute value [id: openscad:abs]
sign (function) [category: Math functions] — -1, 0, or 1 by sign of `x` [id: openscad:sign]
floor (function) [category: Math functions] — Round down to an integer [id: openscad:floor]
ceil (function) [category: Math functions] — Round up to an integer [id: openscad:ceil]
round (function) [category: Math functions] — Round to the nearest integer [id: openscad:round]
sqrt (function) [category: Math functions] — Square root [id: openscad:sqrt]
pow (function) [category: Math functions] — Exponentiation [id: openscad:pow]
exp (function) [category: Math functions] — e raised to `x` [id: openscad:exp]
ln (function) [category: Math functions] — Natural logarithm [id: openscad:ln]
log (function) [category: Math functions] — Base-10 logarithm [id: openscad:log]
min (function) [category: Math functions] — Smallest of the arguments [id: openscad:min]
max (function) [category: Math functions] — Largest of the arguments [id: openscad:max]
norm (function) [category: Math functions] — Euclidean length of a vector [id: openscad:norm]
cross (function) [category: Math functions] — Cross product of two 3-vectors [id: openscad:cross]

## List / string functions — `api-list-string-functions.md`

len (function) [category: List / string functions] — Length of a vector or string [id: openscad:len]
concat (function) [category: List / string functions] — Concatenate vectors/values into one list [id: openscad:concat]
lookup (function) [category: List / string functions] — Linear-interpolated table lookup [id: openscad:lookup]
str (function) [category: List / string functions] — Concatenate values into a string [id: openscad:str]
chr (function) [category: List / string functions] — Unicode code point(s) to a string [id: openscad:chr]
ord (function) [category: List / string functions] — First character to its Unicode code point [id: openscad:ord]
search (function) [category: List / string functions] — Find matches in a list/string [id: openscad:search]
parent_module (function) [category: List / string functions] — Name of a user module on the active instantiation stack [id: openscad:parent_module]
is_undef (function) [category: List / string functions] — True if `x` is undefined [id: openscad:is_undef]
is_bool (function) [category: List / string functions] — True if `x` is a boolean [id: openscad:is_bool]
is_num (function) [category: List / string functions] — True if `x` is a number [id: openscad:is_num]
is_string (function) [category: List / string functions] — True if `x` is a string [id: openscad:is_string]
is_list (function) [category: List / string functions] — True if `x` is a list/vector [id: openscad:is_list]
is_function (function) [category: List / string functions] — True if `x` is a function value [id: openscad:is_function]

## Special variables (offered as completions) — `api-special-variables-offered-as-completions.md`

$fn (constant) [category: Special variables (offered as completions)] — Fixed number of fragments in a circle [id: openscad:$fn]
$fa (constant) [category: Special variables (offered as completions)] — Minimum angle per fragment (degrees) [id: openscad:$fa]
$fs (constant) [category: Special variables (offered as completions)] — Minimum fragment size [id: openscad:$fs]
$t (constant) [category: Special variables (offered as completions)] — Animation time, 0→1 [id: openscad:$t]
$parent_modules (constant) [category: Special variables (offered as completions)] — Number of active user-module instantiations [id: openscad:$parent_modules]
$preview (constant) [category: Special variables (offered as completions)] — True during F5 preview, false during F6 render [id: openscad:$preview]
$vpr (constant) [category: Special variables (offered as completions)] — Viewport rotation `[x,y,z]` [id: openscad:$vpr]
$vpt (constant) [category: Special variables (offered as completions)] — Viewport translation `[x,y,z]` [id: openscad:$vpt]
$vpd (constant) [category: Special variables (offered as completions)] — Viewport camera distance [id: openscad:$vpd]
$vpf (constant) [category: Special variables (offered as completions)] — Viewport field of view [id: openscad:$vpf]
