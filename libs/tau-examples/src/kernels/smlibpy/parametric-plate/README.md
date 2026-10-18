# Parametric plate — SMLibPy

An original Tau example (Apache-2.0): a mounting plate with filleted corners, a grid of through holes and softened top edges. It is the Python port of the SMLib WebAssembly `parametric-plate` example and imports only `smlibpy` and the standard library.

Geometry uses millimetres, Z-up. The `Params` dataclass sizes the plate (`length`, `width`, `thickness`), the corner and top-edge radii (`corner_radius`, `edge_radius`) and the hole grid (`hole_diameter`, `hole_columns`, `hole_rows`, `hole_spacing`). `validate` refuses a grid that does not fit before any geometry is built.

The Python worker returns one named body with a metallic glTF material. GLB and glTF carry the name, color and PBR material; STEP carries the exact NURBS body; STL is the tessellated surface. Expected cost: light.
