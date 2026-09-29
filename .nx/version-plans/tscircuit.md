---
tscircuit: minor
---

fix(runtime)!: Publish the tscircuit EDA kernel on the v2 view/export contract. One evaluation offers separate 3D board, schematic SVG and PCB SVG views plus GLB, BOM CSV, netlist text and circuit JSON exports. The former global `renderOptions.output` selector is removed; the current client renders only the first offered view until W3 adds explicit document-view selection. Rendering remains offline.
