# openrscad — 2D primitives

5 top-level symbols. Signatures are verbatim openscad.

// Axis-aligned 2D rectangle
// square (module)
square(size, center=false)

// 2D circle of radius `r` (or diameter `d`)
// circle (module)
circle(r | d, $fn)

// 2D polygon from a list of points
// polygon (module)
polygon(points, paths, convexity)

// 2D text outlines
// text (module)
text(t, size, font, halign, valign, spacing, direction, language, script)

// Import geometry from STL/OFF/DXF/SVG
// import (module)
import(file, convexity, ...)
