---
viewer: minor
---

Camera presets and the input router. `@taucad/viewer/graphics/three/controls/camera-presets` exports the six mouse presets (P1 to P6) of the camera research as binding tables, with the pure resolver `resolveDrag`; a button and modifier combination a preset does not list does nothing. `ThreeViewerProperties`, `CadViewer` and `ModelViewer` take an optional `cameraInput` (`preset`, `zoomToCursor`, `orbitAboutCursor`, `invertZoom`) and `gizmoStyle` (ids in `@taucad/viewer/graphics/three/controls/viewport-gizmo-styles`). With a camera input the capture-phase router beside the controls applies the preset to every press and wheel step, waits until a right-button press travels past 4 px before it moves the camera so a click stays a click, treats a macOS Ctrl + click as the secondary click, and keeps a Ctrl + wheel inside the viewer from zooming the page. Without one, every binding is as before.

With a camera input the wheel and a pinch zoom toward the point under the cursor unless `zoomToCursor` is off (the camera and its target move along the cursor ray, so every model point under the cursor stays there), `invertZoom` reverses the wheel and the pinch, and `orbitAboutCursor` turns an orbit about the surface point under the press. Release notes: when the viewer controls are turned on, zoom goes toward the cursor by default instead of toward the view's centre; Settings can turn it off.

`gizmoStyle` picks the view cube's style: `cube` (the rounded cube, as before), `classic-cube` (the library's sharp cube), `axis-balls` (one ball per axis direction) and `axes` (Tau's axis triad alone, which takes no click). Every style takes its colours from Tau's tokens in both themes, and a change rebuilds the open gizmo without a reload.
