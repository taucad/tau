---
taucad-ui: minor
workbench-panes: minor
---

`@taucad/ui`'s bottom drawer grabber is a 44px target: the grabber row is 36px (`--drawer-handle-height`) and its handle reaches 8px above the sheet's edge, so the surface's header actions below it stay their own targets. The keyboard slider and its detents are unchanged.

`@taucad/workbench-panes`' `workbenchPanes.model` is titled "Model tree", so the hierarchy pane no longer shares its name with the 3D model on stage. The pane id stays `model`.
