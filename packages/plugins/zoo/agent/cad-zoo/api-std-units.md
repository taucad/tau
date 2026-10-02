# kcl-std — std.units

9 top-level symbols. Signatures are verbatim kcl.

// Category: std.units
// Convert a number to millimeters from its current units
units::toMillimeters(@num: number(Length)): number(mm)
//   @num: A number

// Category: std.units
// Convert a number to centimeters from its current units
units::toCentimeters(@num: number(Length)): number(cm)
//   @num: A number

// Category: std.units
// Convert a number to meters from its current units
units::toMeters(@num: number(Length)): number(m)
//   @num: A number

// Category: std.units
// Convert a number to inches from its current units
units::toInches(@num: number(Length)): number(in)
//   @num: A number

// Category: std.units
// Convert a number to feet from its current units
units::toFeet(@num: number(Length)): number(ft)
//   @num: A number

// Category: std.units
// Converts a number to yards from its current units
units::toYards(@num: number(Length)): number(yd)
//   @num: A number

// Category: std.units
// Converts a number to radians from its current units
units::toRadians(@num: number(Angle)): number(rad)
//   @num: A number

// Category: std.units
// Converts a number to degrees from its current units
units::toDegrees(@num: number(Angle)): number(deg)
//   @num: A number

// Category: std.units
// Functions for converting numbers to different units
// Remarks: All numbers in KCL include units, e.g., the number `42` is always '42 mm' or '42 degrees', etc. it is never just '42'. For more information, see [numeric types](/docs/kcl-lang/numeric). 

Note that you only need to explicitly convert the units of a number if you need a specific unit for your own calculations. When calling a function, KCL will convert a number to the required units automatically (where possible, and give an error or warning if it's not possible).
units
