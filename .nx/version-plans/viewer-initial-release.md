---
viewer: patch
---

Publish the initial `@taucad/viewer` 0.0.1 package: Tau's interactive CAD viewer, its graphics machines and its model controls, with one export subpath per module.

- **Embedding**: `ViewerEnvironmentProvider` describes the colour scheme, contrast, accent, graphics backend and developer switches (`showRenderFps` turns off the canvas FPS readout; `readableCanvas` keeps the WebGL drawing buffer so the embedder can read the live canvas back); `ExactMeasurementProvider` supplies CAD-exact distances to the measure tool.
- **`ModelViewer`**: takes `sourceFile` and reports a secondary click on a component as a structured `GeometryComponentReference` through `onComponentReference`.
- **Panels**: `StructureSection` lists a view's components without the app's pane chrome; a click selects, and the eye hides or shows a component.
