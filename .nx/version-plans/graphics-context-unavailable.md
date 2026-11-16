---
viewer: minor
---

`createRenderer` rejects with the new `GraphicsContextUnavailableError` (from `@taucad/viewer/graphics/graphics-backend`, with `isGraphicsContextUnavailableError`) when the browser gives the canvas no WebGL 2 context: hardware acceleration off, a blocklisted GPU, or a GPU process that gave up. Before, the node renderer's WebGL 2 backend (forced, or the fallback from WebGPU) rejected with `TypeError: Cannot read properties of null (reading 'getSupportedExtensions')`, and the classic renderer with three's `Error creating WebGL context.`. The viewport no longer labels that failure a WebGPU initialization error, so it shows the failure screen at once, with a message the person can act on, instead of retrying on WebGL first. `CanvasFailure.kind` gains `context-unavailable`.
