# build123d — brep_from_stl

1 top-level symbols. Signatures are verbatim python.

# Category: brep_from_stl
# Detect analytic primitives in a mesh and return faces, leftovers, and code
# Remarks: This is the user-facing entry point for STL-to-BREP reconstruction. The mesh is indexed first so face geometry and adjacency can be reused throughout the pipeline. Detection proceeds in stages: 1. High-confidence planes are found first from cleaned proxy faces. 2. Spheres are found next from broad radius-signature classification, connected or sewn regions, local sphere fitting, and region growth. 3. Cylinders are detected from area-grouped sewn regions and local cylinder seeds, then grown, refit, and validated. 4. Remaining coplanar connected components are detected as fallback planes. Each accepted patch is converted into a build123d Face, unmatched mesh faces are returned as leftovers, and the generated code strings are sorted in the same order as the returned primitives.
# build123d.brep_from_stl.detect_primitives (function)
detect_primitives(mesh: Shape) -> tuple[ShapeList[Face], ShapeList[Face], list[str]]
