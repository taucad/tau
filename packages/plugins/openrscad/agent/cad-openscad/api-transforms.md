# openrscad — Transforms

10 top-level symbols. Signatures are verbatim openscad.

// Move children by a vector
// translate (module)
translate([x,y,z])

// Rotate children (degrees)
// rotate (module)
rotate(a | [x,y,z] | a, v)

// Scale children by a vector or scalar
// scale (module)
scale([x,y,z])

// Resize children to absolute dimensions
// resize (module)
resize([x,y,z], auto)

// Mirror children across a plane through the origin
// mirror (module)
mirror([x,y,z])

// Apply a 4×3/4×4 affine matrix to children
// multmatrix (module)
multmatrix(m)

// Recolor children for preview
// color (module)
color(c | "name", alpha=1)

// Grow/shrink a 2D shape
// offset (module)
offset(r | delta, chamfer)

// Convex hull of all children
// hull (module)
hull()

// Minkowski sum of the children
// minkowski (module)
minkowski()
