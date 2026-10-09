# openrscad — Extrusion / projection

3 top-level symbols. Signatures are verbatim openscad.

// Category: Extrusion / projection
// Extrude a 2D shape along Z
// Remarks: Only height is positional. slices defaults to 1, or ceil(|twist| / 15) when twisted.
// linear_extrude (module)
linear_extrude(height = 100, center = false, twist = 0, slices, scale = 1, v = [0, 0, 1])

// Category: Extrusion / projection
// Revolve a 2D shape around the Z axis
// rotate_extrude (module)
rotate_extrude(angle = 360, start = 0, $fn, $fa, $fs)

// Category: Extrusion / projection
// Project 3D geometry down to 2D
// projection (module)
projection(cut=false)
