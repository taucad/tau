---
tscircuit: patch
---

Publish `@taucad/tscircuit`, the tscircuit EDA kernel: TSX boards rendered to a 3D GLB, schematic SVG or PCB SVG through the `output` render option, with BOM, netlist and circuit JSON exports. Rendering is offline; consumers on a zod 4 workspace need the documented pnpm `readPackage` hook until upstream tscircuit manifests are zod-4 clean.
