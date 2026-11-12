---
viewer: minor
---

The canvas actor presents the view's camera on its surface: a resize reaches the camera as `setViewport` in the macrostep the canvas reports it, before the frame renders, and the camera's clip policy pads the far plane for the infinite grid while graphics shows the grid (`enableGrid`, `upDirection`), following graphics' new `gridChanged` canvas event, and clears when the canvas is lost, fails or stops. `ThreeCanvasInstance`'s `enableGrid` and `upDirection` props no longer set the clip policy. The controls adapter steps `camera-controls` each frame. Remove `TauCameraControls` and the `graphics/three/controls/tau-camera-controls` subpath: import `resolveCameraControlProps` and `resolveCameraControlMouseButtons` from `graphics/three/controls/camera-controls-feel`, and `retargetCameraControls` from the controls adapter. `shouldUpdateTauCameraControlsFrame` is removed.
