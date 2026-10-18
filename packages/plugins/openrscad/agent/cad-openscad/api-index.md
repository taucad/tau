# openrscad API index

openrscad 0.11.0-beta.4 · 88 symbols · extracted by openrscad-lsp BUILTINS table + evaluator-verified signatures.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## 3D primitives — `api-3d-primitives.md`

cube (module) [lines 5-9] [category: 3D primitives] — Axis-aligned box
sphere (module) [lines 11-15] [category: 3D primitives] — Sphere of radius `r` (or diameter `d`)
cylinder (module) [lines 17-24] [category: 3D primitives] — Cylinder or cone of height `h`
polyhedron (module) [lines 26-29] [category: 3D primitives] — Arbitrary solid from vertices and faces

## 2D primitives — `api-2d-primitives.md`

square (module) [lines 5-9] [category: 2D primitives] — Axis-aligned 2D rectangle
circle (module) [lines 11-15] [category: 2D primitives] — 2D circle of radius `r` (or diameter `d`)
polygon (module) [lines 17-20] [category: 2D primitives] — 2D polygon from a list of points
text (module) [lines 22-26] [category: 2D primitives] — 2D text outlines
import (module) [lines 28-31] [category: 2D primitives] — Import geometry from STL/OFF/DXF/SVG

## Transforms — `api-transforms.md`

translate (module) [lines 5-8] [category: Transforms] — Move children by a vector
rotate (module) [lines 10-16] [category: Transforms] — Rotate children (degrees)
scale (module) [lines 18-22] [category: Transforms] — Scale children by a vector or scalar
resize (module) [lines 24-28] [category: Transforms] — Resize children to absolute dimensions
mirror (module) [lines 30-33] [category: Transforms] — Mirror children across a plane through the origin
multmatrix (module) [lines 35-38] [category: Transforms] — Apply a 4×3/4×4 affine matrix to children
color (module) [lines 40-46] [category: Transforms] — Recolor children for preview
offset (module) [lines 48-52] [category: Transforms] — Grow/shrink a 2D shape
hull (module) [lines 54-57] [category: Transforms] — Convex hull of all children
minkowski (module) [lines 59-62] [category: Transforms] — Minkowski sum of the children

## Booleans — `api-booleans.md`

union (module) [lines 5-8] [category: Booleans] — Combine all children into one solid
difference (module) [lines 10-13] [category: Booleans] — Subtract later children from the first
intersection (module) [lines 15-18] [category: Booleans] — Keep only the volume shared by all children

## Extrusion / projection — `api-extrusion-projection.md`

linear_extrude (module) [lines 5-9] [category: Extrusion / projection] — Extrude a 2D shape along Z
rotate_extrude (module) [lines 11-14] [category: Extrusion / projection] — Revolve a 2D shape around the Z axis
projection (module) [lines 16-19] [category: Extrusion / projection] — Project 3D geometry down to 2D

## Control-flow modules — `api-control-flow-modules.md`

for (module) [lines 5-14] [category: Control-flow modules] — Iterate, instantiating children per value
intersection_for (module) [lines 16-19] [category: Control-flow modules] — Intersect children across all iterations
if (module) [lines 21-26] [category: Control-flow modules] — Conditionally instantiate children
let (module) [lines 28-33] [category: Control-flow modules] — Bind variables for the children scope
children (module) [lines 35-42] [category: Control-flow modules] — Instantiate the children passed to a module
echo (module) [lines 44-49] [category: Control-flow modules] — Print values to the console
assert (module) [lines 51-55] [category: Control-flow modules] — Abort with a message if `cond` is false
render (module) [lines 57-61] [category: Control-flow modules] — Force a full CSG render of children

## Math functions — `api-math-functions.md`

sin (function) [lines 5-8] [category: Math functions] — Sine (degrees)
cos (function) [lines 10-13] [category: Math functions] — Cosine (degrees)
tan (function) [lines 15-18] [category: Math functions] — Tangent (degrees)
asin (function) [lines 20-23] [category: Math functions] — Arcsine, in degrees
acos (function) [lines 25-28] [category: Math functions] — Arccosine, in degrees
atan (function) [lines 30-33] [category: Math functions] — Arctangent, in degrees
atan2 (function) [lines 35-38] [category: Math functions] — Two-argument arctangent, in degrees
abs (function) [lines 40-43] [category: Math functions] — Absolute value
sign (function) [lines 45-48] [category: Math functions] — -1, 0, or 1 by sign of `x`
floor (function) [lines 50-53] [category: Math functions] — Round down to an integer
ceil (function) [lines 55-58] [category: Math functions] — Round up to an integer
round (function) [lines 60-63] [category: Math functions] — Round to the nearest integer
sqrt (function) [lines 65-68] [category: Math functions] — Square root
pow (function) [lines 70-73] [category: Math functions] — Exponentiation
exp (function) [lines 75-78] [category: Math functions] — e raised to `x`
ln (function) [lines 80-83] [category: Math functions] — Natural logarithm
log (function) [lines 85-88] [category: Math functions] — Base-10 logarithm
min (function) [lines 90-94] [category: Math functions] — Smallest of the arguments
max (function) [lines 96-100] [category: Math functions] — Largest of the arguments
norm (function) [lines 102-105] [category: Math functions] — Euclidean length of a vector
cross (function) [lines 107-110] [category: Math functions] — Cross product of two 3-vectors

## List / string functions — `api-list-string-functions.md`

len (function) [lines 5-8] [category: List / string functions] — Length of a vector or string
concat (function) [lines 10-13] [category: List / string functions] — Concatenate vectors/values into one list
lookup (function) [lines 15-18] [category: List / string functions] — Linear-interpolated table lookup
str (function) [lines 20-23] [category: List / string functions] — Concatenate values into a string
chr (function) [lines 25-29] [category: List / string functions] — Unicode code point(s) to a string
ord (function) [lines 31-34] [category: List / string functions] — First character to its Unicode code point
search (function) [lines 36-40] [category: List / string functions] — Find matches in a list/string
parent_module (function) [lines 42-46] [category: List / string functions] — Name of a user module on the active instantiation stack
is_undef (function) [lines 48-51] [category: List / string functions] — True if `x` is undefined
is_bool (function) [lines 53-56] [category: List / string functions] — True if `x` is a boolean
is_num (function) [lines 58-61] [category: List / string functions] — True if `x` is a number
is_string (function) [lines 63-66] [category: List / string functions] — True if `x` is a string
is_list (function) [lines 68-71] [category: List / string functions] — True if `x` is a list/vector
is_function (function) [lines 73-76] [category: List / string functions] — True if `x` is a function value

## Special variables (offered as completions) — `api-special-variables-offered-as-completions.md`

$fn (constant) [lines 5-7] [category: Special variables (offered as completions)] — Fixed number of fragments in a circle
$fa (constant) [lines 9-11] [category: Special variables (offered as completions)] — Minimum angle per fragment (degrees)
$fs (constant) [lines 13-15] [category: Special variables (offered as completions)] — Minimum fragment size
$t (constant) [lines 17-19] [category: Special variables (offered as completions)] — Animation time, 0→1
$parent_modules (constant) [lines 21-23] [category: Special variables (offered as completions)] — Number of active user-module instantiations
$preview (constant) [lines 25-27] [category: Special variables (offered as completions)] — True during F5 preview, false during F6 render
$vpr (constant) [lines 29-31] [category: Special variables (offered as completions)] — Viewport rotation `[x,y,z]`
$vpt (constant) [lines 33-35] [category: Special variables (offered as completions)] — Viewport translation `[x,y,z]`
$vpd (constant) [lines 37-39] [category: Special variables (offered as completions)] — Viewport camera distance
$vpf (constant) [lines 41-43] [category: Special variables (offered as completions)] — Viewport field of view

## Language — `api-language.md`

module (module) [lines 5-8] [category: Language] — Declare a module, instantiated as a statement with optional children
function (function) [lines 10-15] [category: Language] — Declare a function, or bind a function literal to a…
include (module) [lines 17-20] [category: Language] — Splice a file in place, running its top-level statements and…
use (module) [lines 22-25] [category: Language] — Import only the modules and functions a file declares
each (function) [lines 27-31] [category: Language] — Splice a list or range into the enclosing list
$children (constant) [lines 33-35] [category: Language] — Number of children passed to the current module
# (module) [lines 37-40] [category: Language] — Highlight a subtree in the preview
% (module) [lines 42-45] [category: Language] — Show a subtree as a transparent background, excluded from the…
! (module) [lines 47-50] [category: Language] — Render only this subtree
* (module) [lines 52-55] [category: Language] — Disable a subtree
