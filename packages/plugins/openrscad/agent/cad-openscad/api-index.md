# openrscad API index

openrscad 0.11.0-beta.4 · 88 symbols · extracted by openrscad-lsp BUILTINS table + evaluator-verified signatures.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## 3D primitives — `api-3d-primitives.md`

cube (module) [category: 3D primitives] — Axis-aligned box
sphere (module) [category: 3D primitives] — Sphere of radius `r` (or diameter `d`)
cylinder (module) [category: 3D primitives] — Cylinder or cone of height `h`
polyhedron (module) [category: 3D primitives] — Arbitrary solid from vertices and faces

## 2D primitives — `api-2d-primitives.md`

square (module) [category: 2D primitives] — Axis-aligned 2D rectangle
circle (module) [category: 2D primitives] — 2D circle of radius `r` (or diameter `d`)
polygon (module) [category: 2D primitives] — 2D polygon from a list of points
text (module) [category: 2D primitives] — 2D text outlines
import (module) [category: 2D primitives] — Import geometry from STL/OFF/DXF/SVG

## Transforms — `api-transforms.md`

translate (module) [category: Transforms] — Move children by a vector
rotate (module) [category: Transforms] — Rotate children (degrees)
scale (module) [category: Transforms] — Scale children by a vector or scalar
resize (module) [category: Transforms] — Resize children to absolute dimensions
mirror (module) [category: Transforms] — Mirror children across a plane through the origin
multmatrix (module) [category: Transforms] — Apply a 4×3/4×4 affine matrix to children
color (module) [category: Transforms] — Recolor children for preview
offset (module) [category: Transforms] — Grow/shrink a 2D shape
hull (module) [category: Transforms] — Convex hull of all children
minkowski (module) [category: Transforms] — Minkowski sum of the children

## Booleans — `api-booleans.md`

union (module) [category: Booleans] — Combine all children into one solid
difference (module) [category: Booleans] — Subtract later children from the first
intersection (module) [category: Booleans] — Keep only the volume shared by all children

## Extrusion / projection — `api-extrusion-projection.md`

linear_extrude (module) [category: Extrusion / projection] — Extrude a 2D shape along Z
rotate_extrude (module) [category: Extrusion / projection] — Revolve a 2D shape around the Z axis
projection (module) [category: Extrusion / projection] — Project 3D geometry down to 2D

## Control-flow modules — `api-control-flow-modules.md`

for (module) [category: Control-flow modules] — Iterate, instantiating children per value
intersection_for (module) [category: Control-flow modules] — Intersect children across all iterations
if (module) [category: Control-flow modules] — Conditionally instantiate children
let (module) [category: Control-flow modules] — Bind variables for the children scope
children (module) [category: Control-flow modules] — Instantiate the children passed to a module
echo (module) [category: Control-flow modules] — Print values to the console
assert (module) [category: Control-flow modules] — Abort with a message if `cond` is false
render (module) [category: Control-flow modules] — Force a full CSG render of children

## Math functions — `api-math-functions.md`

sin (function) [category: Math functions] — Sine (degrees)
cos (function) [category: Math functions] — Cosine (degrees)
tan (function) [category: Math functions] — Tangent (degrees)
asin (function) [category: Math functions] — Arcsine, in degrees
acos (function) [category: Math functions] — Arccosine, in degrees
atan (function) [category: Math functions] — Arctangent, in degrees
atan2 (function) [category: Math functions] — Two-argument arctangent, in degrees
abs (function) [category: Math functions] — Absolute value
sign (function) [category: Math functions] — -1, 0, or 1 by sign of `x`
floor (function) [category: Math functions] — Round down to an integer
ceil (function) [category: Math functions] — Round up to an integer
round (function) [category: Math functions] — Round to the nearest integer
sqrt (function) [category: Math functions] — Square root
pow (function) [category: Math functions] — Exponentiation
exp (function) [category: Math functions] — e raised to `x`
ln (function) [category: Math functions] — Natural logarithm
log (function) [category: Math functions] — Base-10 logarithm
min (function) [category: Math functions] — Smallest of the arguments
max (function) [category: Math functions] — Largest of the arguments
norm (function) [category: Math functions] — Euclidean length of a vector
cross (function) [category: Math functions] — Cross product of two 3-vectors

## List / string functions — `api-list-string-functions.md`

len (function) [category: List / string functions] — Length of a vector or string
concat (function) [category: List / string functions] — Concatenate vectors/values into one list
lookup (function) [category: List / string functions] — Linear-interpolated table lookup
str (function) [category: List / string functions] — Concatenate values into a string
chr (function) [category: List / string functions] — Unicode code point(s) to a string
ord (function) [category: List / string functions] — First character to its Unicode code point
search (function) [category: List / string functions] — Find matches in a list/string
parent_module (function) [category: List / string functions] — Name of a user module on the active instantiation stack
is_undef (function) [category: List / string functions] — True if `x` is undefined
is_bool (function) [category: List / string functions] — True if `x` is a boolean
is_num (function) [category: List / string functions] — True if `x` is a number
is_string (function) [category: List / string functions] — True if `x` is a string
is_list (function) [category: List / string functions] — True if `x` is a list/vector
is_function (function) [category: List / string functions] — True if `x` is a function value

## Special variables (offered as completions) — `api-special-variables-offered-as-completions.md`

$fn (constant) [category: Special variables (offered as completions)] — Fixed number of fragments in a circle
$fa (constant) [category: Special variables (offered as completions)] — Minimum angle per fragment (degrees)
$fs (constant) [category: Special variables (offered as completions)] — Minimum fragment size
$t (constant) [category: Special variables (offered as completions)] — Animation time, 0→1
$parent_modules (constant) [category: Special variables (offered as completions)] — Number of active user-module instantiations
$preview (constant) [category: Special variables (offered as completions)] — True during F5 preview, false during F6 render
$vpr (constant) [category: Special variables (offered as completions)] — Viewport rotation `[x,y,z]`
$vpt (constant) [category: Special variables (offered as completions)] — Viewport translation `[x,y,z]`
$vpd (constant) [category: Special variables (offered as completions)] — Viewport camera distance
$vpf (constant) [category: Special variables (offered as completions)] — Viewport field of view

## Language — `api-language.md`

module (module) [category: Language] — Declare a module, instantiated as a statement with optional children
function (function) [category: Language] — Declare a function, or bind a function literal to a…
include (module) [category: Language] — Splice a file in place, running its top-level statements and…
use (module) [category: Language] — Import only the modules and functions a file declares
each (function) [category: Language] — Splice a list or range into the enclosing list
$children (constant) [category: Language] — Number of children passed to the current module
# (module) [category: Language] — Highlight a subtree in the preview
% (module) [category: Language] — Show a subtree as a transparent background, excluded from the…
! (module) [category: Language] — Render only this subtree
* (module) [category: Language] — Disable a subtree
