# openrscad — Extrusion / projection

3 top-level symbols. Signatures are verbatim openscad.

// Extrude a 2D shape along Z
linear_extrude(height, center, twist, slices, scale, $fn)

// Revolve a 2D shape around the Z axis
rotate_extrude(angle=360, $fn)

// Project 3D geometry down to 2D
projection(cut=false)
