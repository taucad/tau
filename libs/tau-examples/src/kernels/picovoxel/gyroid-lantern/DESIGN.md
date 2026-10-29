# Gyroid Lantern

A small lamp sleeve: gyroid wall, cylindrical outside, solid foot so it sits on a desk. Print it in a translucent filament and drop in a tea light.

PicoVoxel is the showcase because the wall is a signed-distance expression (`sin`/`cos` gyroid, intersected with a cylinder), not a boundary model that was meshed later. OpenSCAD and JSCAD can fake a lattice with booleans; they do not have this periodic minimal surface. Finer `voxelSize` costs time with the cube of the resolution — leave the default at 0.7 mm for a draft render.

Parameters: `voxelSize`, `radius`, `height`, `period`, `wall`, `baseThickness`, `baseLip`.
