---
taucad-ui: minor
workbench-panes: minor
---

`@taucad/ui`'s bottom drawer grabber is a 44px target: the grabber row is 36px (`--drawer-handle-height`) and its handle reaches 8px above the sheet's edge, so the surface's header actions below it stay their own targets. The keyboard slider's detents are unchanged; it now announces them by name (`aria-valuetext` Peek, Half, Full) rather than as a percentage of the viewport.

`@taucad/workbench-panes`' `workbenchPanes.model` is titled "Model tree", so the hierarchy pane no longer shares its name with the 3D model on stage. The pane id stays `model`. The part menu's and part gallery's "Reveal in Explorer" verb reads "Reveal in model tree" to match.
