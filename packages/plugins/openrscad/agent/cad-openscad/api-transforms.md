# openrscad — Transforms

10 top-level symbols. Signatures are verbatim openscad.

// Category: Transforms
// Move children by a vector
// translate (module)
translate(v = [0, 0, 0])

// Category: Transforms
// Rotate children (degrees)
// Remarks: A vector rotates about X, then Y, then Z; a scalar about Z; with v, about axis v.
// rotate (module)
rotate(a = [0, 0, 0])
rotate(a = 0)
rotate(a = 0, v = [0, 0, 1])

// Category: Transforms
// Scale children by a vector or scalar
// scale (module)
scale(v = [1, 1, 1])
scale(v = 1)

// Category: Transforms
// Resize children to absolute dimensions
// Remarks: `auto` may be per axis.
// resize (module)
resize(newsize = [0, 0, 0], auto = false)

// Category: Transforms
// Mirror children across a plane through the origin
// mirror (module)
mirror(v = [1, 0, 0])

// Category: Transforms
// Apply a 4×3/4×4 affine matrix to children
// multmatrix (module)
multmatrix(m)

// Category: Transforms
// Recolor children for preview
// Remarks: Vector channels run 0 to 1.
// color (module)
color(c = "name", alpha = 1)
color(c = "#rrggbb", alpha = 1)
color(c = [r, g, b, a])

// Category: Transforms
// Grow/shrink a 2D shape
// offset (module)
offset(r = 1, $fn, $fa, $fs)
offset(delta, chamfer = false)

// Category: Transforms
// Convex hull of all children
// hull (module)
hull()

// Category: Transforms
// Minkowski sum of the children
// minkowski (module)
minkowski()
