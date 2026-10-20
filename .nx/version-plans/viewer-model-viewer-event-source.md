---
viewer: minor
---

`ModelViewer` takes `eventSource`, the element its canvas takes pointer events from, and hands it to `CadViewer`. A host that draws the viewer inside a canvas region, as the shared `ViewerStage` of `@taucad/workbench-panes` does, passes the region so a press on an overlay over the canvas still reaches the model, as the Tau app's viewer already does.
