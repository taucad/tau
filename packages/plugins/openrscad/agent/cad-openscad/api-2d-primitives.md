# openrscad — 2D primitives

5 top-level symbols. Signatures are verbatim openscad.

// Category: 2D primitives
// Axis-aligned 2D rectangle
// Remarks: `size` may be a scalar for a square.
// square (module)
square(size = [1, 1], center = false)

// Category: 2D primitives
// 2D circle of radius `r` (or diameter `d`)
// circle (module)
circle(r = 1, $fn, $fa, $fs)
circle(d, $fn, $fa, $fs)

// Category: 2D primitives
// 2D polygon from a list of points
// polygon (module)
polygon(points, paths)

// Category: 2D primitives
// 2D text outlines
// Remarks: Curve resolution follows the ambient $fn, not a per-call one.
// text (module)
text(text, size = 10, font = "Liberation Sans", direction = "ltr", language = "en", script = "latin", halign = "left", valign = "baseline", spacing = 1)

// Category: 2D primitives
// Import geometry from STL/OFF/DXF/SVG
// import (module)
import(file)
