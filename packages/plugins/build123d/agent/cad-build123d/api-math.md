# build123d — math

13 top-level symbols. Signatures are verbatim python.

// Category: math
// Return the arc tangent (measured in radians) of y/x
// Remarks: Unlike atan(y/x), the signs of both x and y are considered.
// math.atan2 (function)
atan2(y, x)

// Category: math
// Return a float with the magnitude (absolute value) of x but the sign of y
// Remarks: On platforms that support signed zeros, copysign(1.0, -0.0) returns -1.0.
// math.copysign (function)
copysign(x, y)

// Category: math
// Return the cosine of x (measured in radians)
// math.cos (function)
cos(x)

// Category: math
// Convert angle x from radians to degrees
// math.degrees (function)
degrees(x)

// Category: math
// Return the floor of x as an Integral
// Remarks: This is the largest integer <= x.
// math.floor (function)
floor(x)

// Category: math
// Greatest Common Divisor
// math.gcd (function)
gcd(*integers)

// Category: math
// Return the base 10 logarithm of x
// math.log10 (function)
log10(x)

// Category: math
// Return the base 2 logarithm of x
// math.log2 (function)
log2(x)

// Category: math
// Calculate the product of all the elements in the input iterable
// Remarks: The default start value for the product is 1. When the iterable is empty, return the start value. This function is intended specifically for use with numeric values and may reject non-numeric types.
// math.prod (function)
prod(iterable, start = 1)

// Category: math
// Convert angle x from degrees to radians
// math.radians (function)
radians(x)

// Category: math
// Return the sine of x (measured in radians)
// math.sin (function)
sin(x)

// Category: math
// Return the square root of x
// math.sqrt (function)
sqrt(x)

// Category: math
// Return the tangent of x (measured in radians)
// math.tan (function)
tan(x)
