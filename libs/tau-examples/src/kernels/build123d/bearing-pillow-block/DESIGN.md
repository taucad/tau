# Bearing Pillow Block

A desktop-CNC or printed stand for a 608 skate bearing (22 mm outside diameter). The bore is `bearing_od / 2 + bore_clearance`, through the housing along Y, with a filleted foot and two clearance holes.

build123d is the showcase because this is algebra-mode OpenCascade in Python: `Pos * Box`, a rotated `Cylinder`, and `fillet` on the vertical edges. The same part in OpenSCAD is a `difference()` of meshes. Replicad can build it in the browser; build123d is the desktop-native session, which is why this row is `reference`. `exampleRuntime` does not compose build123d (its examples ship no checked-in thumbnails), so this draft has no render.

Parameters live on `Params`: `bearing_od`, `bore_clearance`, `base_length`, `base_width`, `base_thickness`, `housing_length`, `housing_height`, `top_wall`, `fillet_radius`, `hole_diameter`, `hole_spacing`.

**Run status: unverified.** This cloud VM was not asked to prepare the native build123d kernel.
