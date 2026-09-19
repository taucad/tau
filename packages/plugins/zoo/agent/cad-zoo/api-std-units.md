# kcl-std — std.units

9 top-level symbols. Signatures are verbatim kcl.

// Convert a number to millimeters from its current units
units::toMillimeters(@num: number(Length)): number(mm)
//   @num: A number

// Convert a number to centimeters from its current units
units::toCentimeters(@num: number(Length)): number(cm)
//   @num: A number

// Convert a number to meters from its current units
units::toMeters(@num: number(Length)): number(m)
//   @num: A number

// Convert a number to inches from its current units
units::toInches(@num: number(Length)): number(in)
//   @num: A number

// Convert a number to feet from its current units
units::toFeet(@num: number(Length)): number(ft)
//   @num: A number

// Converts a number to yards from its current units
units::toYards(@num: number(Length)): number(yd)
//   @num: A number

// Converts a number to radians from its current units
units::toRadians(@num: number(Angle)): number(rad)
//   @num: A number

// Converts a number to degrees from its current units
units::toDegrees(@num: number(Angle)): number(deg)
//   @num: A number

// Functions for converting numbers to different units
units
