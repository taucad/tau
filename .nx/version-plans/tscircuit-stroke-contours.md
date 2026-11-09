---
tscircuit: patch
---

The 3D board builds copper traces and silkscreen strokes as capsule outlines in JavaScript and fills them as one cross-section per side and layer, instead of a hull of two circles per segment. The board also frees every cross-section and solid it derives once its layers are meshed. Board geometry is unchanged.
