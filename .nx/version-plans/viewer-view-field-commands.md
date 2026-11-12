---
viewer: minor
---

Let a host write per-view settings as view commands.

- `ViewerControls` takes an optional `viewFields` (`ViewerViewFields` from `@taucad/viewer/cad/viewer-view-fields`): `set(leaf, value)`, `reset(leaf)` and an optional `sourceOf(leaf)`, keyed by the inheritable leaf paths (`display.grid`, `fieldOfView`, `grid.unit` and so on). With it, the settings menu's toggles, up direction and field of view, the G and P keys and the grid unit menu call `set` and change nothing live; the host writes the view record and seeds the viewer from it.
- Without it, every control changes the live graphics owner as before, so an embedder that supplies none sees no change.
- `ViewerViewFieldsProvider` and `useViewerViewFields` expose the same commands to controls rendered outside the bar.
