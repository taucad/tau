---
cli: minor
host: minor
mcp: minor
agent-plugin: minor
---

`screenshot` captures a saved workbench view, and its section takes metres only (live-render LRP-8b).

- `screenshot { workbenchView: '<id>' }` reads `.tau/workbench/views/<id>.json` and captures its entry file, selected kernel view with its options and authored instance, camera (preset, look or saved pose; the kernel view's own camera when it saved one), field of view (0 is orthographic), plane cuts and display in one image. `targetFile` is optional with it and must match the view's entry; `view`, `instance`, `options`, `section` and `multi_angle` are refused beside it. A missing view is `FILE_NOT_FOUND` naming the saved views, an invalid or newer record `INVALID_RECORD`, a revolution cut or a pose in another frame `VALIDATION_ERROR`. The result `message` names the view and says the grid, pinned measurements and hidden components are not drawn.
- **Breaking:** `screenshot` `section.offsetMm`, deprecated for one release, is removed and refused. Send `offset` in metres: `offsetMm: 6` is `offset: 0.006`.
- `@taucad/chat/rpc` gains the `CaptureImagesClientInput` and `CaptureWorkbenchView` types; `RpcImageClient.captureImages` takes the resolved input.
