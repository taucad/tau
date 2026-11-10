---
viewer: minor
---

The viewer's renderer lifecycle is a canvas actor. `@taucad/viewer/machines/canvas.machine` (new) exports `canvasMachine` (`creating → ready → presented ; lost ; failed`, context `canvasId`, `backend`, `surface`), its events and emitted `surfaceAttached`, `canvasEventTypes`, `canvasIgnoredEvents` and the selectors `selectCanvasAwaitingFrame` and `selectCanvasBackend`. The graphics machine spawns one canvas actor per mounted surface on `canvasAttached` and stops it on `canvasDetached`; its context holds it as `canvas: { canvasId, ref }`. The canvas actor holds the viewer's WebGL context budget slot, starts its host adapter from R3F's `onCreated` with the renderer, DOM canvas and `invalidate` in the adapter's closure, detects the first presented frame, and times the `canvas.mount` and `frame.first` load spans on its transitions.

Breaking: the graphics machine no longer has `activeRenderer`, `canvasPresentation` or `webGpuProbeSettled` in context, and `rendererInitialized`, `rendererRemoved`, `rendererPresented`, `canvasMounted` and `canvasUnmounted` leave its alphabet. Read the renderer's backend with `selectCanvasBackend` and the stage's busy state with `selectCanvasAwaitingFrame` on `context.canvas.ref`. The probe is the new `operational.backend` region (`probing → resolved → lost`), tagged `backend-probing` while it runs. `ThreeCanvasInstance` takes `webglContext` and `admittedBytes` in place of `onSurfaceResize`.

`@taucad/workbench-panes`' `ViewerStage` reads its busy state from the canvas actor; behaviour is unchanged.
