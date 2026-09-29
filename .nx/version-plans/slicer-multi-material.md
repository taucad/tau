---
slicer: major
---

Slice a model's colours with their own filaments. `sliceWithBambuStudio` takes `parts` (a binary STL each, optional `#RRGGBB` `color`) instead of `stl` and `filamentColor`: one part slices as before; several slice as one assembled object that keeps their placement, part i with filament i and one filament preset per part (the first repeated). The `glb → gcode.3mf` transcoder groups a GLB by material colour and slices up to four colours this way; more colours, colours on faces of one solid, or the reference and service engines print the model in its first colour with a `REPRESENTATION_UNSUPPORTED` warning naming the merged colours. `writeBambuContainer` takes `filamentColors` (recorded as the plate's `filament_colour` and in `slice_info.config`; `SLICER_CONTAINER_COLOR_INVALID` otherwise) and `readBambuContainer` returns them. Model colours are now rounded, not truncated (`#FF0000` no longer reads as `#FE0000`).
