---
name: cad-openscad
description: Guides OpenSCAD model authoring in main.scad with idiomatic CSG and adaptive tessellation. Use when creating or editing .scad geometry.
---

# OpenSCAD authoring

## Workflow

1. Author the assembly entry point in `main.scad`.
2. Put `$fa = 2; $fs = 0.4;` at the top for adaptive tessellation. Set `$fn` locally only when a feature needs an exact facet count.
3. Use snake_case variables, reusable modules, positive dimensions, and hex colors.
4. Build the intended CSG tree, then leave a top-level invocation such as `part();` so the file renders standalone.

For multiple files, import library modules with `use <lib/widget.scad>`, not `include`. A library may call its module at top level for standalone rendering; `use` prevents that call from duplicating geometry in `main.scad`.

## Geometry choices

- Use booleans for real unions, intersections, and cuts.
- Use `hull()` only for a genuine convex hull and `minkowski()` only for a genuine offset, never as substitutes for loft or `rotate_extrude`.
- Prefer one loop-built sketch followed by one extrusion over a union of many positioned solids.
- Apply `render()` only to reused subtrees, not leaves.

## Canonical pattern

```scad
$fa = 2;
$fs = 0.4;

module part() {
  difference() {
    intersection() {
      sphere(10);
      cube(15, center = true);
    }
    cylinder(h = 20, r = 5, center = true);
  }
}

part();
```

Check missing semicolons, undefined variables, unclosed modules, and non-positive dimensions first.

## Wrong / Correct

- Wrong: `cylinder(10, 5)`; positional order is easy to misread. Correct: name the arguments: `cylinder(h = 10, r = 5, center = true)`.
- Wrong: `include <lib/widget.scad>` for a module library. Correct: `use <lib/widget.scad>`.
- Wrong: relying on top-level `$fa`/`$fs` for measured accuracy. Correct: they shape the preview, but exports and GeoSpec evidence tessellate with `$fn = 32`; set `$fn` on a curved feature (`cylinder(h = 16, r = 4, $fn = 64)`) when its volume or fit is tested, and size volume tolerances to that facet count.

## Verify

Test with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.scad' })`; OpenSCAD yields mesh evidence.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Language

```openscad
// Declare a module, instantiated as a statement with optional children
module name(param, option = default) { children(); }

// Import only the modules and functions a file declares
use <path/file.scad>

// Splice a file in place, running its top-level statements and assignments
include <path/file.scad>

// Declare a function, or bind a function literal to a variable
function name(param, option = default) = expression;
f = function (x) expression;

// Splice a list or range into the enclosing list
[each list, item]
[for (list = lists) each list]

// Render only this subtree
!cube(10);

// Disable a subtree
*cube(10);

// Highlight a subtree in the preview
#cube(10);

// Show a subtree as a transparent background, excluded from the result
%cube(10);
```

### Transforms

```openscad
// Move children by a vector
translate(v = [0, 0, 0])

// Recolor children for preview
color(c = "name", alpha = 1)
color(c = "#rrggbb", alpha = 1)
color(c = [r, g, b, a])

// Rotate children (degrees)
rotate(a = [0, 0, 0])
rotate(a = 0)
rotate(a = 0, v = [0, 0, 1])

// Convex hull of all children
hull()

// Scale children by a vector or scalar
scale(v = [1, 1, 1])
scale(v = 1)

// Grow/shrink a 2D shape
offset(r = 1, $fn, $fa, $fs)
offset(delta, chamfer = false)

// Minkowski sum of the children
minkowski()

// Mirror children across a plane through the origin
mirror(v = [1, 0, 0])

// Apply a 4×3/4×4 affine matrix to children
multmatrix(m)

// Resize children to absolute dimensions
resize(newsize = [0, 0, 0], auto = false)
```

### 3D primitives

```openscad
// Axis-aligned box
cube(size = [1, 1, 1], center = false)

// Cylinder or cone of height `h`
cylinder(h = 1, r = 1, center = false, $fn, $fa, $fs)
cylinder(h = 1, r1 = 1, r2 = 1, center = false, $fn, $fa, $fs)
cylinder(h = 1, d, center = false, $fn, $fa, $fs)
cylinder(h = 1, d1, d2, center = false, $fn, $fa, $fs)

// Sphere of radius `r` (or diameter `d`)
sphere(r = 1, $fn, $fa, $fs)
sphere(d, $fn, $fa, $fs)

// Arbitrary solid from vertices and faces
polyhedron(points, faces, convexity = 1)
```

### Booleans

```openscad
// Subtract later children from the first
difference()

// Combine all children into one solid
union()

// Keep only the volume shared by all children
intersection()
```

### Control-flow modules

```openscad
// Iterate, instantiating children per value
for (i = [start : end]) children
for (i = [start : step : end]) children
for (item = [a, b, c]) children
for (i = [0 : 2], j = [0 : 2]) children
[for (i = [start : end]) expression]
[for (i = 0; i < n; i = i + 1) expression]

// Bind variables for the children scope
let (name = value) children
y = let (name = value) expression;
[for (i = [start : end]) let (name = value) expression]

// Conditionally instantiate children
if (condition) children
if (condition) children else children
[for (x = list) if (condition) x]

// Abort with a message if `cond` is false
assert(condition, message)
y = assert(condition, message) expression;

// Instantiate the children passed to a module
children()
children(index)
children([i, j])
children([start : end])

// Print values to the console
echo(value, ...)
y = echo(value) expression;

// Intersect children across all iterations
intersection_for (i = [start : end]) children

// Force a full CSG render of children
render()
```

### Extrusion / projection

```openscad
// Extrude a 2D shape along Z
linear_extrude(height = 100, center = false, twist = 0, slices, scale = 1, v = [0, 0, 1])

// Revolve a 2D shape around the Z axis
rotate_extrude(angle = 360, start = 0, $fn, $fa, $fs)

// Project 3D geometry down to 2D
projection(cut=false)
```

### 2D primitives

```openscad
// 2D polygon from a list of points
polygon(points, paths)

// Axis-aligned 2D rectangle
square(size = [1, 1], center = false)

// 2D circle of radius `r` (or diameter `d`)
circle(r = 1, $fn, $fa, $fs)
circle(d, $fn, $fa, $fs)

// 2D text outlines
text(text, size = 10, font = "Liberation Sans", direction = "ltr", language = "en", script = "latin", halign = "left", valign = "baseline", spacing = 1)

// Import geometry from STL/OFF/DXF/SVG
import(file)
```

### Math functions

```openscad
// Cosine (degrees)
cos(deg)

// Sine (degrees)
sin(deg)

// Largest of the arguments
max(a, b, ...)
max(values)

// Square root
sqrt(x)

// Arctangent, in degrees
atan(x)

// Exponentiation
pow(base, exp)

// Arccosine, in degrees
acos(x)

// Two-argument arctangent, in degrees
atan2(y, x)

// Round down to an integer
floor(x)

// Smallest of the arguments
min(a, b, ...)
min(values)

// Tangent (degrees)
tan(deg)

// Absolute value
abs(x)

// Round up to an integer
ceil(x)

// Arcsine, in degrees
asin(x)

// Cross product of two 3-vectors
cross(a, b)

// e raised to `x`
exp(x)

// Natural logarithm
ln(x)

// Base-10 logarithm
log(x)

// Euclidean length of a vector
norm(v)

// Round to the nearest integer
round(x)

// -1, 0, or 1 by sign of `x`
sign(x)
```

### List / string functions

```openscad
// Concatenate vectors/values into one list
concat(a, b, ...)

// Length of a vector or string
len(value)

// Concatenate values into a string
str(value, ...)

// Unicode code point(s) to a string
chr(code, ...)
chr(codes)

// First character to its Unicode code point
ord(char)

// Find matches in a list/string
search(match_value, string_or_vector, num_returns_per_match, index_col_num)

// True if `x` is a boolean
is_bool(x)

// True if `x` is a function value
is_function(x)

// True if `x` is a list/vector
is_list(x)

// True if `x` is a number
is_num(x)

// True if `x` is a string
is_string(x)

// True if `x` is undefined
is_undef(x)

// Linear-interpolated table lookup
lookup(key, table)

// Name of a user module on the active instantiation stack
parent_module(index)
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 88 symbols by file.

- `api-3d-primitives.md` — 3D primitives
- `api-2d-primitives.md` — 2D primitives
- `api-transforms.md` — Transforms
- `api-booleans.md` — Booleans
- `api-extrusion-projection.md` — Extrusion / projection
- `api-control-flow-modules.md` — Control-flow modules
- `api-math-functions.md` — Math functions
- `api-list-string-functions.md` — List / string functions
- `api-special-variables-offered-as-completions.md` — Special variables (offered as completions)
- `api-language.md` — Language

Read ranges, not whole files. Never copy a reference into a source file.
