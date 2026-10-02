# openrscad — Transforms

10 top-level symbols. Signatures are verbatim openscad.

// Category: Transforms
// Move children by a vector
// translate (module)
translate([x,y,z])

// Category: Transforms
// Rotate children (degrees)
// rotate (module)
rotate(a | [x,y,z] | a, v)

// Category: Transforms
// Scale children by a vector or scalar
// scale (module)
scale([x,y,z])

// Category: Transforms
// Resize children to absolute dimensions
// resize (module)
resize([x,y,z], auto)

// Category: Transforms
// Mirror children across a plane through the origin
// mirror (module)
mirror([x,y,z])

// Category: Transforms
// Apply a 4×3/4×4 affine matrix to children
// multmatrix (module)
multmatrix(m)

// Category: Transforms
// Recolor children for preview
// color (module)
color(c | "name", alpha=1)

// Category: Transforms
// Grow/shrink a 2D shape
// offset (module)
offset(r | delta, chamfer)

// Category: Transforms
// Convex hull of all children
// hull (module)
hull()

// Category: Transforms
// Minkowski sum of the children
// minkowski (module)
minkowski()
