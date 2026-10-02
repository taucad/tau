# openrscad — 2D primitives

5 top-level symbols. Signatures are verbatim openscad.

// Category: 2D primitives
// Axis-aligned 2D rectangle
// square (module)
square(size, center=false)

// Category: 2D primitives
// 2D circle of radius `r` (or diameter `d`)
// circle (module)
circle(r | d, $fn)

// Category: 2D primitives
// 2D polygon from a list of points
// polygon (module)
polygon(points, paths, convexity)

// Category: 2D primitives
// 2D text outlines
// text (module)
text(t, size, font, halign, valign, spacing, direction, language, script)

// Category: 2D primitives
// Import geometry from STL/OFF/DXF/SVG
// import (module)
import(file, convexity, ...)
