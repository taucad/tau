# kcl-std — std.math

28 top-level symbols. Signatures are verbatim kcl.

// Category: std.math
// Compute the cosine of a number
cos(@num: number(Angle)): number
//   @num: A number

// Category: std.math
// Compute the sine of a number
sin(@num: number(Angle)): number
//   @num: A number

// Category: std.math
// Compute the tangent of a number
tan(@num: number(Angle)): number
//   @num: A number

// Category: std.math
// Compute the arccosine of a number
acos(@num: number(_)): number(rad)
//   @num: A number

// Category: std.math
// Compute the arcsine of a number
asin(@num: number(_)): number(rad)
//   @num: A number

// Category: std.math
// Compute the arctangent of a number
// Remarks: Consider using `atan2()` instead for the true inverse of tangent.
atan(@num: number(_)): number(rad)
//   @num: A number

// Category: std.math
// Compute the four quadrant arctangent of Y and X
atan2(
  y: number(Length),
  x: number(Length),
): number(rad)
//   y: A number
//   x: A number

// Category: std.math
// Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid) coordinates
polar(
  angle: number(rad),
  length: number(Length),
): Point2d
//   angle: A number
//   length: A number

// Category: std.math
// Compute the remainder after dividing `num` by `div`
rem(
  @num: number,
  divisor: number,
): number
//   @num: The number which will be divided by `divisor`
//   divisor: The number which will divide `num`

// Category: std.math
// Compute the square root of a number
sqrt(@input: number): number
//   @input: A number

// Category: std.math
// Compute the absolute value of a number
abs(@input: number): number
//   @input: A number

// Category: std.math
// Round a number to the nearest integer
round(@input: number): number
//   @input: A number

// Category: std.math
// Compute the largest integer less than or equal to a number
floor(@input: number): number
//   @input: A number

// Category: std.math
// Compute the smallest integer greater than or equal to a number
ceil(@input: number): number
//   @input: A number

// Category: std.math
// Compute the minimum of the given arguments
min(@input: [number; 1+]): number
//   @input: An array of numbers to compute the minimum of

// Category: std.math
// Compute the maximum of the given arguments
max(@input: [number; 1+]): number
//   @input: An array of numbers to compute the maximum of

// Category: std.math
// Compute the number to a power
pow(
  @input: number,
  exp: number(_),
): number
//   @input: The number to raise
//   exp: The power to raise to

// Category: std.math
// Compute the logarithm of the number with respect to an arbitrary base
// Remarks: The result might not be correctly rounded owing to implementation details; `log2` can produce more accurate results for base 2, and `log10` can produce more accurate results for base 10.
log(
  @input: number,
  base: number(_),
): number
//   @input: The number to compute the logarithm of
//   base: The base of the logarithm

// Category: std.math
// Compute the base 2 logarithm of the number
log2(@input: number): number
//   @input: A number

// Category: std.math
// Compute the base 10 logarithm of the number
log10(@input: number): number
//   @input: A number

// Category: std.math
// Compute the natural logarithm of the number
ln(@input: number): number
//   @input: A number

// Category: std.math
// Compute the length of the given leg
legLen(
  hypotenuse: number(Length),
  leg: number(Length),
): number(Length)
//   hypotenuse: The length of the triangle's hypotenuse
//   leg: The length of one of the triangle's legs (i.e

// Category: std.math
// Compute the angle of the given leg for x
legAngX(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)
//   hypotenuse: The length of the triangle's hypotenuse
//   leg: The length of one of the triangle's legs (i.e

// Category: std.math
// Compute the angle of the given leg for y
legAngY(
  hypotenuse: number(Length),
  leg: number(Length),
): number(deg)
//   hypotenuse: The length of the triangle's hypotenuse
//   leg: The length of one of the triangle's legs (i.e

// Category: std.math
// The value of `pi`, Archimedes’ constant (π)
// Remarks: `PI` is a number and is technically a ratio, so you might expect it to have type `number(_)`. However, `PI` is nearly always used for converting between different units - usually degrees to or from radians. Therefore, `PI` is treated a bit specially by KCL and always has unknown units. This means that if you use `PI`, you will need to give KCL some extra information about the units of numbers. Usually you should use type ascription on the result of calculations, e.g., `(2 * PI): rad`. It is better to use `units::toRadians` or `units::toDegrees` to convert between angles with different units where possible.
PI: number(_?)

// Category: std.math
// The value of Euler’s number `e`
E: number

// Category: std.math
// The value of `tau`, the full circle constant (τ)
TAU: number

// Category: std.math
// Functions for mathematical operations and some useful constants
math
