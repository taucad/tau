# build123d — brep_from_stl

1 top-level symbols. Signatures are verbatim python.

// Detect analytic primitives in a mesh and return faces, leftovers, and code
detect_primitives(mesh: Shape) -> tuple[ShapeList[Face], ShapeList[Face], list[str]]
