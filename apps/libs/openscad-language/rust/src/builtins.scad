// OpenSCAD built-in modules, functions and special variables.
//
// Declarations only: OpenSCAD implements these natively. The language server reads this file for completion, hover,
// signature help and go to definition. Descriptions follow the OpenSCAD User Manual
// (https://en.wikibooks.org/wiki/OpenSCAD_User_Manual).

/* [Special variables] */

/**
 * Number of fragments used to render a full circle. When greater than zero it overrides {@link $fa} and {@link $fs}.
 * Values of 3 or more are used directly, so `$fn = 6` renders a hexagon.
 * @example
 * sphere(r = 10, $fn = 64);
 */
$fn = 0;

/**
 * Minimum angle, in degrees, of one fragment of a circle. Smaller values give smoother curves. Ignored when
 * {@link $fn} is greater than zero.
 */
$fa = 12;

/**
 * Minimum length, in millimeters, of one fragment of a circle. Smaller values give smoother curves. Ignored when
 * {@link $fn} is greater than zero.
 */
$fs = 2;

/** Animation time, from 0 (inclusive) to 1 (exclusive), advanced by the animation view. */
$t = 0;

/** Viewport rotation angles in degrees, `[x, y, z]`. */
$vpr = [55, 0, 25];

/** Viewport translation, `[x, y, z]`. */
$vpt = [0, 0, 0];

/** Viewport camera distance. */
$vpd = 140;

/** Viewport camera field of view, in degrees. */
$vpf = 22.5;

/** Number of children passed to the current module. Use with {@link children}. */
$children = 0;

/** `true` in preview (F5) mode and `false` when rendering (F6) or exporting. */
$preview = true;

/** Number of modules in the current instantiation stack. Use with {@link parent_module}. */
$parent_modules = 0;

/** The mathematical constant π, 3.14159… */
PI = 3.141592653589793;

/* [3D primitives] */

/**
 * Creates a cube or rectangular box in the first octant. With `center = true` the box is centered on the origin.
 * @param size A single number for a cube, or `[x, y, z]` for a box.
 * @param center Center the box on the origin instead of placing one corner there.
 * @example
 * cube(10);
 * cube([20, 10, 5], center = true);
 */
module cube(size = [1, 1, 1], center = false) {}

/**
 * Creates a sphere centered on the origin.
 * @param r Radius.
 * @param d Diameter, used instead of `r`.
 * @param $fn Fragment count; see {@link $fn}.
 * @param $fa Minimum fragment angle; see {@link $fa}.
 * @param $fs Minimum fragment size; see {@link $fs}.
 * @example
 * sphere(r = 5);
 * sphere(d = 10, $fn = 48);
 */
module sphere(r = 1, d, $fn, $fa, $fs) {}

/**
 * Creates a cylinder or cone along the z axis. Use `r1` and `r2` (or `d1` and `d2`) for a cone; a radius of 0 gives
 * a point.
 * @param h Height.
 * @param r1 Radius at the bottom.
 * @param r2 Radius at the top.
 * @param center Center the cylinder on the origin along z instead of starting at z = 0.
 * @param r Radius of both ends.
 * @param d Diameter of both ends.
 * @param d1 Diameter at the bottom.
 * @param d2 Diameter at the top.
 * @param $fn Fragment count; see {@link $fn}.
 * @param $fa Minimum fragment angle; see {@link $fa}.
 * @param $fs Minimum fragment size; see {@link $fs}.
 * @example
 * cylinder(h = 10, r = 3);
 * cylinder(h = 10, r1 = 5, r2 = 0, center = true);
 */
module cylinder(h = 1, r1 = 1, r2 = 1, center = false, r, d, d1, d2, $fn, $fa, $fs) {}

/**
 * Creates a solid from a list of points and the faces that connect them. Faces list point indices clockwise when
 * seen from outside.
 * @param points List of `[x, y, z]` vertices.
 * @param faces List of faces, each a list of point indices.
 * @param convexity Maximum number of faces a ray through the solid can cross, for preview rendering.
 * @example
 * polyhedron(
 *   points = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]],
 *   faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]);
 */
module polyhedron(points, faces, convexity = 1) {}

/* [2D primitives] */

/**
 * Creates a circle centered on the origin.
 * @param r Radius.
 * @param d Diameter, used instead of `r`.
 * @param $fn Fragment count; see {@link $fn}.
 * @param $fa Minimum fragment angle; see {@link $fa}.
 * @param $fs Minimum fragment size; see {@link $fs}.
 * @example
 * circle(r = 10);
 * circle(d = 5, $fn = 6);
 */
module circle(r = 1, d, $fn, $fa, $fs) {}

/**
 * Creates a square or rectangle in the first quadrant.
 * @param size A single number for a square, or `[x, y]` for a rectangle.
 * @param center Center the rectangle on the origin instead of placing one corner there.
 * @example
 * square(10);
 * square([20, 10], center = true);
 */
module square(size = [1, 1], center = false) {}

/**
 * Creates a polygon from a list of points. Optional paths cut holes or select an outline.
 * @param points List of `[x, y]` vertices.
 * @param paths List of point index lists; the first is the outline and the rest are holes.
 * @param convexity Maximum number of edges a ray through the shape can cross, for preview rendering.
 * @example
 * polygon([[0, 0], [10, 0], [0, 10]]);
 */
module polygon(points, paths, convexity = 1) {}

/**
 * Creates 2D text. Extrude it with {@link linear_extrude} for 3D lettering.
 * @param text The string to render.
 * @param size Ascent of the text, roughly the height of capital letters.
 * @param font Font name, optionally with a style such as `"Liberation Sans:style=Bold"`.
 * @param halign Horizontal alignment: `"left"`, `"center"` or `"right"`.
 * @param valign Vertical alignment: `"top"`, `"center"`, `"baseline"` or `"bottom"`.
 * @param spacing Factor applied to the spacing between characters.
 * @param direction Text direction: `"ltr"`, `"rtl"`, `"ttb"` or `"btt"`.
 * @param language Language of the text, such as `"en"`.
 * @param script Script of the text, such as `"latin"`.
 * @param $fn Fragment count for curved glyph outlines.
 * @example
 * linear_extrude(2) text("Tau", size = 10, halign = "center");
 */
module text(text, size = 10, font, halign = "left", valign = "baseline", spacing = 1, direction = "ltr", language = "en", script = "latin", $fn) {}

/**
 * Imports geometry from a file: STL, OFF, 3MF, AMF or OBJ for 3D, and SVG or DXF for 2D.
 * @param file Path of the file, relative to this source file.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 * @param layer DXF layer to import.
 * @param center Center the imported shape on the origin.
 * @param dpi SVG resolution in dots per inch.
 * @param id SVG element id to import.
 * @example
 * import("bracket.stl");
 */
module import(file, convexity = 1, layer, center = false, dpi = 96, id) {}

/**
 * Creates a height map surface from a text matrix or a PNG image.
 * @param file Path of the `.dat` or `.png` file.
 * @param center Center the surface on the origin.
 * @param invert Invert the PNG brightness.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 */
module surface(file, center = false, invert = false, convexity = 1) {}

/* [Transformations] */

/**
 * Moves its children by a vector.
 * @param v Offset `[x, y, z]`.
 * @example
 * translate([10, 0, 0]) cube(5);
 */
module translate(v) {}

/**
 * Rotates its children. With a vector `a`, rotates about x, then y, then z by the given angles. With a number `a` and
 * an axis `v`, rotates about that axis.
 * @param a Angle in degrees, or `[x, y, z]` angles.
 * @param v Axis of rotation when `a` is a number.
 * @example
 * rotate([0, 0, 45]) cube(5);
 * rotate(a = 90, v = [1, 1, 0]) cube(5);
 */
module rotate(a, v) {}

/**
 * Scales its children.
 * @param v A single factor or `[x, y, z]` factors.
 * @example
 * scale([2, 1, 1]) sphere(5);
 */
module scale(v) {}

/**
 * Scales its children to fit the given size.
 * @param newsize Target `[x, y, z]` size; 0 keeps that axis unless `auto` is set.
 * @param auto Scale axes whose size is 0 proportionally; a boolean or `[x, y, z]` booleans.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 */
module resize(newsize, auto = false, convexity = 1) {}

/**
 * Mirrors its children in the plane through the origin whose normal is `v`.
 * @param v Normal of the mirror plane.
 * @example
 * mirror([1, 0, 0]) translate([5, 0, 0]) cube(2);
 */
module mirror(v) {}

/**
 * Applies a 4×4 (or 4×3) affine transformation matrix to its children.
 * @param m The transformation matrix.
 */
module multmatrix(m) {}

/**
 * Colors its children in preview. Colors are names (`"red"`), hex strings (`"#ff0000"`) or `[r, g, b, a]` lists with
 * components from 0 to 1.
 * @param c Color name, hex string or RGB(A) list.
 * @param alpha Opacity from 0 to 1.
 * @example
 * color("steelblue") cube(5);
 * color([1, 0, 0], alpha = 0.5) sphere(3);
 */
module color(c, alpha = 1.0) {}

/**
 * Grows or shrinks 2D children. `r` rounds corners; `delta` keeps them sharp (or chamfered with `chamfer`).
 * @param r Offset radius; negative values shrink.
 * @param delta Offset distance with sharp corners; negative values shrink.
 * @param chamfer Chamfer corners when using `delta`.
 * @example
 * offset(r = 2) square(10);
 */
module offset(r, delta, chamfer = false) {}

/**
 * Creates the convex hull of its children.
 * @example
 * hull() { translate([10, 0]) circle(2); circle(5); }
 */
module hull() {}

/**
 * Creates the Minkowski sum of its children, for example to round every edge of a box.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 * @example
 * minkowski() { cube(10); sphere(1); }
 */
module minkowski(convexity = 1) {}

/* [Boolean operations] */

/** Combines its children into one shape. Top-level children are unioned implicitly. */
module union() {}

/**
 * Subtracts every child after the first from the first child.
 * @example
 * difference() { cube(10, center = true); sphere(6.5); }
 */
module difference() {}

/** Keeps only the volume (or area) that all children share. */
module intersection() {}

/* [Extrusion] */

/**
 * Extrudes 2D children along the z axis.
 * @param height Extrusion height.
 * @param center Center the extrusion on z = 0.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 * @param twist Degrees of rotation over the full height.
 * @param slices Number of intermediate layers, for twisted or scaled extrusions.
 * @param scale Scale factor of the top relative to the bottom; a number or `[x, y]`.
 * @param $fn Fragment count used to choose `slices` for twisted extrusions.
 * @example
 * linear_extrude(height = 10, twist = 90) square(5, center = true);
 */
module linear_extrude(height = 100, center = false, convexity = 1, twist = 0, slices, scale = 1.0, $fn) {}

/**
 * Revolves 2D children, drawn on the positive x side of the plane, around the z axis. See also
 * {@link linear_extrude}.
 * @param angle Degrees to revolve, starting at the positive x axis.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 * @param $fn Fragment count; see {@link $fn}.
 * @param $fa Minimum fragment angle; see {@link $fa}.
 * @param $fs Minimum fragment size; see {@link $fs}.
 * @example
 * rotate_extrude($fn = 64) translate([10, 0]) circle(2);
 */
module rotate_extrude(angle = 360, convexity = 1, $fn, $fa, $fs) {}

/**
 * Projects 3D children onto the xy plane. With `cut = true`, takes the slice at z = 0 instead.
 * @param cut Slice at z = 0 instead of projecting the whole shape.
 */
module projection(cut = false) {}

/* [Other modules] */

/**
 * Forces a full CGAL render of its children in preview, which helps with complex booleans.
 * @param convexity Maximum number of faces a ray through the shape can cross, for preview rendering.
 */
module render(convexity = 1) {}

/**
 * Instantiates the children passed to the current module. See {@link $children}.
 * @param index Index, list of indices or range of children; all children when omitted.
 * @example
 * module pair() { children(0); translate([10, 0, 0]) children(0); }
 */
module children(index) {}

/**
 * Prints values to the console. As an expression, `echo(...) expression` prints and then evaluates `expression`.
 * @param values Values to print; named arguments print as `name = value`.
 * @example
 * echo("size", size);
 */
module echo(values) {}

/**
 * Stops evaluation with an error when `condition` is false. Also usable as an expression prefix.
 * @param condition The condition that must hold.
 * @param message Message reported when the condition fails.
 * @example
 * assert(size > 0, "size must be positive");
 */
module assert(condition, message) {}

/** Groups its children without combining them. */
module group() {}

/* [Mathematical functions] */

/**
 * Absolute value.
 * @param x A number.
 */
function abs(x) = undef;

/**
 * Sign of a number: -1, 0 or 1.
 * @param x A number.
 */
function sign(x) = undef;

/**
 * Sine of an angle in degrees.
 * @param degrees Angle in degrees.
 */
function sin(degrees) = undef;

/**
 * Cosine of an angle in degrees.
 * @param degrees Angle in degrees.
 */
function cos(degrees) = undef;

/**
 * Tangent of an angle in degrees.
 * @param degrees Angle in degrees.
 */
function tan(degrees) = undef;

/**
 * Arc cosine, in degrees.
 * @param x A number from -1 to 1.
 */
function acos(x) = undef;

/**
 * Arc sine, in degrees.
 * @param x A number from -1 to 1.
 */
function asin(x) = undef;

/**
 * Arc tangent, in degrees from -90 to 90. Use {@link atan2} for the full circle.
 * @param x A number.
 */
function atan(x) = undef;

/**
 * Angle in degrees, from -180 to 180, of the point `[x, y]`.
 * @param y The y coordinate.
 * @param x The x coordinate.
 */
function atan2(y, x) = undef;

/**
 * Largest integer not greater than `x`.
 * @param x A number.
 */
function floor(x) = undef;

/**
 * Nearest integer; halves round away from zero.
 * @param x A number.
 */
function round(x) = undef;

/**
 * Smallest integer not less than `x`.
 * @param x A number.
 */
function ceil(x) = undef;

/**
 * Natural logarithm.
 * @param x A positive number.
 */
function ln(x) = undef;

/**
 * Logarithm. With one argument, base 10.
 * @param b Base, or the value when called with one argument.
 * @param x The value.
 */
function log(b, x) = undef;

/**
 * `base` raised to the power `exponent`.
 * @param base The base.
 * @param exponent The exponent.
 */
function pow(base, exponent) = undef;

/**
 * Square root.
 * @param x A non-negative number.
 */
function sqrt(x) = undef;

/**
 * e raised to the power `x`.
 * @param x The exponent.
 */
function exp(x) = undef;

/**
 * List of random numbers.
 * @param min_value Lower bound (inclusive).
 * @param max_value Upper bound (inclusive).
 * @param value_count How many numbers to return.
 * @param seed_value Seed for a repeatable sequence.
 * @example
 * offsets = rands(-1, 1, 3, 42);
 */
function rands(min_value, max_value, value_count, seed_value) = undef;

/**
 * Smallest of the arguments, or of a single list argument.
 * @param values Numbers, or one list of numbers.
 */
function min(values) = undef;

/**
 * Largest of the arguments, or of a single list argument.
 * @param values Numbers, or one list of numbers.
 */
function max(values) = undef;

/**
 * Euclidean length of a vector.
 * @param v A vector.
 */
function norm(v) = undef;

/**
 * Cross product of two 3D vectors, or the scalar cross product of two 2D vectors.
 * @param a The first vector.
 * @param b The second vector.
 */
function cross(a, b) = undef;

/* [List and string functions] */

/**
 * Number of elements in a list or characters in a string.
 * @param value A list or string.
 */
function len(value) = undef;

/**
 * Joins lists into one list.
 * @param lists Lists (or single values) to join.
 * @example
 * concat([1, 2], [3, 4]); // [1, 2, 3, 4]
 */
function concat(lists) = undef;

/**
 * Looks up `key` in a sorted table of `[key, value]` pairs, interpolating linearly between entries.
 * @param key The key to look up.
 * @param table List of `[key, value]` pairs sorted by key.
 * @example
 * lookup(1.5, [[1, 10], [2, 20]]); // 15
 */
function lookup(key, table) = undef;

/**
 * Converts its arguments to strings and joins them.
 * @param values Values to convert.
 * @example
 * str("size = ", size);
 */
function str(values) = undef;

/**
 * Converts Unicode code points to a string.
 * @param code A code point, or a list of code points.
 */
function chr(code) = undef;

/**
 * Unicode code point of a one-character string.
 * @param character A string of one character.
 */
function ord(character) = undef;

/**
 * Finds values in a string or list and returns their indices.
 * @param match_value Value, string or list of values to find.
 * @param string_or_vector Where to search.
 * @param num_returns_per_match Matches returned per value; 0 returns all.
 * @param index_col_num Column searched when the haystack is a list of lists.
 */
function search(match_value, string_or_vector, num_returns_per_match = 1, index_col_num = 0) = undef;

/* [Type tests] */

/**
 * `true` when the value is `undef`.
 * @param value Any value.
 */
function is_undef(value) = undef;

/**
 * `true` when the value is a boolean.
 * @param value Any value.
 */
function is_bool(value) = undef;

/**
 * `true` when the value is a number other than `nan`.
 * @param value Any value.
 */
function is_num(value) = undef;

/**
 * `true` when the value is a string.
 * @param value Any value.
 */
function is_string(value) = undef;

/**
 * `true` when the value is a list.
 * @param value Any value.
 */
function is_list(value) = undef;

/**
 * `true` when the value is a function literal.
 * @param value Any value.
 */
function is_function(value) = undef;

/* [Other functions] */

/** OpenSCAD version as `[year, month, day]`. */
function version() = undef;

/** OpenSCAD version as a number, such as `20210100`. */
function version_num() = undef;

/**
 * Name of the module `n` levels up the instantiation stack. See {@link $parent_modules}.
 * @param n Levels up the stack; 0 is the current module.
 */
function parent_module(n) = undef;
