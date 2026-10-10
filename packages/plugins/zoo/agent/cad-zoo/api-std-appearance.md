# kcl-std — std.appearance

2 top-level symbols. Signatures are verbatim kcl.

// Category: std.appearance
// Build a color from its red, green and blue components
// std.appearance.appearance::hexString (function)
appearance::hexString(@rgb: [number(_); 3]): string
//   @rgb: The red, blue and green components of the color
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   startSketchOn(-XZ)
//     |> circle(center = [0, 0], radius = 10)
//     |> extrude(length = 4)
//     |> appearance(color = appearance::hexString([50, 160, 160]))

// Category: std.appearance
appearance
