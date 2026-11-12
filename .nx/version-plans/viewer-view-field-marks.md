---
viewer: minor
---

Show where each per-view setting comes from in the viewer settings menu.

- `ViewerViewFields` takes two more optional members: `inheritsFrom(leaf)`, the level a leaf set in the view returns to on Reset (`'person'` or `'tau'`), and `resetView()`.
- With `sourceOf`, the menu marks each leaf. A leaf the person sets and the view does not reads "From my defaults" under its label. A leaf the view sets shows the modified dot and "Set in this view"; the dot's tooltip names what Reset returns to ("Reset to my default" or "Reset to Tau default"), and pressing it calls `reset`. With `resetView` as well, a "Reset view" item counts the leaves the view sets ("2 changed in this view") and calls `resetView`.
- `viewerViewFieldPaths` lists every inheritable leaf path.
- A host that gives no `sourceOf` sees no marks and no "Reset view", as before.
