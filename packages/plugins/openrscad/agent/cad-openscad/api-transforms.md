# openrscad — Transforms

10 top-level symbols. Signatures are verbatim openscad.

// Move children by a vector
translate([x,y,z])

// Rotate children (degrees)
rotate(a | [x,y,z] | a, v)

// Scale children by a vector or scalar
scale([x,y,z])

// Resize children to absolute dimensions
resize([x,y,z], auto)

// Mirror children across a plane through the origin
mirror([x,y,z])

// Apply a 4×3/4×4 affine matrix to children
multmatrix(m)

// Recolor children for preview
color(c | "name", alpha=1)

// Grow/shrink a 2D shape
offset(r | delta, chamfer)

// Convex hull of all children
hull()

// Minkowski sum of the children
minkowski()
