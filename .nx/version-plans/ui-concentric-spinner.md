---
taucad-ui: patch
viewer: patch
workbench-panes: patch
---

Spinners now turn concentrically at every size. The new `spin-glyph` utility in `@taucad/ui/styles/tokens.css` rotates an SVG's drawing about its viewBox centre instead of rotating the `<svg>` box, which WebKit turns about a pixel-snapped centre and so wobbles whenever the box lands on a fractional size. `Loader`, the toast loading glyph and the viewer and workbench-pane spinners use it.
