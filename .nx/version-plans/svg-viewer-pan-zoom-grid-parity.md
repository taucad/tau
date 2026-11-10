---
viewer: minor
tscircuit: minor
---

`@taucad/viewer`'s SVG viewer pans and zooms: drag moves the drawing, the wheel and a trackpad pinch zoom about the pointer, and Fit view returns to the fitted view. Its grid now matches the 3D viewer's grid: the same line widths (1.25 px minor, 2 px major), tint and opacity in light, dark and high-contrast themes, drawn with the 3D grid shader's line coverage. `overlay-colors.constants` exports `infiniteGridSmallThickness`, `infiniteGridLargeThickness` and `resolveInfiniteGridTint` as the one source of those values. SVG units are read as millimetres, or as the scale an SVG declares in `data-real-to-screen-transform`, so the grid readout is a real length.

`@taucad/tscircuit` outlines the schematic sheet in the light and dark themes and declares the PCB view's millimetre-to-pixel scale in `data-real-to-screen-transform`, as the schematic view does. The kernel version is `1.3.2`, so cached schematic and PCB views are rendered again.
