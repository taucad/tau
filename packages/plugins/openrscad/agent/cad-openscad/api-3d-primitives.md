# openrscad — 3D primitives

4 top-level symbols. Signatures are verbatim openscad.

// Axis-aligned box
// cube (module)
cube(size, center=false)

// Sphere of radius `r` (or diameter `d`)
// sphere (module)
sphere(r | d, $fn, $fa, $fs)

// Cylinder or cone of height `h`
// cylinder (module)
cylinder(h, r | r1,r2 | d, center=false)

// Arbitrary solid from vertices and faces
// polyhedron (module)
polyhedron(points, faces, convexity)
