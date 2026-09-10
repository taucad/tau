# kcl-std — std.math

28 top-level symbols. Signatures are verbatim kcl.

// Compute the cosine of a number
cos(@num: number(Angle)): number
// @num: A number

// Compute the sine of a number
sin(@num: number(Angle)): number
// @num: A number

// Compute the tangent of a number
tan(@num: number(Angle)): number
// @num: A number

// Compute the arccosine of a number
acos(@num: number(\_)): number(rad)
// @num: A number

// Compute the arcsine of a number
asin(@num: number(\_)): number(rad)
// @num: A number

// Compute the arctangent of a number
atan(@num: number(\_)): number(rad)
// @num: A number

// Compute the four quadrant arctangent of Y and X
atan2(
y: number(Length),
x: number(Length),
): number(rad)
// y: A number
// x: A number

// Convert polar/sphere (azimuth, elevation, distance) coordinates to cartesian (x/y/z grid) coordinates
polar(
angle: number(rad),
length: number(Length),
): Point2d
// angle: A number
// length: A number

// Compute the remainder after dividing `num` by `div`
rem(
@num: number,
divisor: number,
): number
// @num: The number which will be divided by `divisor`
// divisor: The number which will divide `num`

// Compute the square root of a number
sqrt(@input: number): number
// @input: A number

// Compute the absolute value of a number
abs(@input: number): number
// @input: A number

// Round a number to the nearest integer
round(@input: number): number
// @input: A number

// Compute the largest integer less than or equal to a number
floor(@input: number): number
// @input: A number

// Compute the smallest integer greater than or equal to a number
ceil(@input: number): number
// @input: A number

// Compute the minimum of the given arguments
min(@input: [number; 1+]): number
// @input: An array of numbers to compute the minimum of

// Compute the maximum of the given arguments
max(@input: [number; 1+]): number
// @input: An array of numbers to compute the maximum of

// Compute the number to a power
pow(
@input: number,
exp: number(\_),
): number
// @input: The number to raise
// exp: The power to raise to

// Compute the logarithm of the number with respect to an arbitrary base
log(
@input: number,
base: number(\_),
): number
// @input: The number to compute the logarithm of
// base: The base of the logarithm

// Compute the base 2 logarithm of the number
log2(@input: number): number
// @input: A number

// Compute the base 10 logarithm of the number
log10(@input: number): number
// @input: A number

// Compute the natural logarithm of the number
ln(@input: number): number
// @input: A number

// Compute the length of the given leg
legLen(
hypotenuse: number(Length),
leg: number(Length),
): number(Length)
// hypotenuse: The length of the triangle's hypotenuse
// leg: The length of one of the triangle's legs (i.e

// Compute the angle of the given leg for x
legAngX(
hypotenuse: number(Length),
leg: number(Length),
): number(deg)
// hypotenuse: The length of the triangle's hypotenuse
// leg: The length of one of the triangle's legs (i.e

// Compute the angle of the given leg for y
legAngY(
hypotenuse: number(Length),
leg: number(Length),
): number(deg)
// hypotenuse: The length of the triangle's hypotenuse
// leg: The length of one of the triangle's legs (i.e

// The value of `pi`, Archimedes’ constant (π)
PI: number(\_?)

// The value of Euler’s number `e`
E: number

// The value of `tau`, the full circle constant (τ)
TAU: number

// Functions for mathematical operations and some useful constants
math
