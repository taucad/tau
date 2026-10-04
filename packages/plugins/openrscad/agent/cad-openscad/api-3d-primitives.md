# openrscad — 3D primitives

4 top-level symbols. Signatures are verbatim openscad.

// Category: 3D primitives
// Axis-aligned box
// cube (module)
cube(size, center=false)

// Category: 3D primitives
// Sphere of radius `r` (or diameter `d`)
// sphere (module)
sphere(r | d, $fn, $fa, $fs)

// Category: 3D primitives
// Cylinder or cone of height `h`
// cylinder (module)
cylinder(h, r | r1,r2 | d, center=false)

// Category: 3D primitives
// Arbitrary solid from vertices and faces
// polyhedron (module)
polyhedron(points, faces, convexity)
