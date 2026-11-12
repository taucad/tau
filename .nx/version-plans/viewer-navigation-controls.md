---
viewer: minor
---

Single-click camera controls (WCAG 2.5.7). `ViewerControls` takes optional `navigation` and `navigationKeys`. `navigation` adds `NavigationControls` (`@taucad/viewer/cad/navigation-controls`) under the gizmo in the viewer frame's top-right corner: orbit left, right, up and down, a "Pan with the arrows" switch that turns those four into pan, zoom in, zoom out and Fit view, each a named button of at least 24 px that one click operates under every mouse preset. The buttons send the same `navigateCamera` steps as the arrow keys and wait until the canvas has its controls. `navigationKeys` turns on the arrow, plus and minus keys, whose keys then show in the buttons' tooltips. Both are off by default; neither shows for 2D geometry.
