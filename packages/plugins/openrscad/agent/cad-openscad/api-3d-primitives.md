# openrscad — 3D primitives

4 top-level symbols. Signatures are verbatim openscad.

// Category: 3D primitives
// Axis-aligned box
// Remarks: `size` may be a scalar for a cube.
// cube (module)
cube(size = [1, 1, 1], center = false)

// Category: 3D primitives
// Sphere of radius `r` (or diameter `d`)
// sphere (module)
sphere(r = 1, $fn, $fa, $fs)
sphere(d, $fn, $fa, $fs)

// Category: 3D primitives
// Cylinder or cone of height `h`
// Remarks: Positional order is h, r1, r2, center; pass r, d, d1 and d2 by name.
// cylinder (module)
cylinder(h = 1, r = 1, center = false, $fn, $fa, $fs)
cylinder(h = 1, r1 = 1, r2 = 1, center = false, $fn, $fa, $fs)
cylinder(h = 1, d, center = false, $fn, $fa, $fs)
cylinder(h = 1, d1, d2, center = false, $fn, $fa, $fs)

// Category: 3D primitives
// Arbitrary solid from vertices and faces
// polyhedron (module)
polyhedron(points, faces, convexity = 1)
