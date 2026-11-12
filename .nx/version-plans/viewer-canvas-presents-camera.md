---
viewer: minor
---

The canvas actor presents the view's camera on its surface: a resize reaches the camera as `setViewport` in the macrostep the canvas reports it, before the frame renders, and the camera's clip policy pads the far plane for the infinite grid while the grid is in the canvas's scene (the canvas reports it with the new `gridShown` event), lying across graphics' `upDirection` (the new `upDirectionChanged` canvas event), and clears when the canvas is lost, fails or stops. `ThreeCanvasInstance`'s `upDirection` prop is no longer read. The controls adapter steps `camera-controls` each frame. Remove `TauCameraControls` and the `graphics/three/controls/tau-camera-controls` subpath: import `resolveCameraControlProps` and `resolveCameraControlMouseButtons` from `graphics/three/controls/camera-controls-feel`, and `retargetCameraControls` from the controls adapter. `shouldUpdateTauCameraControlsFrame` is removed.
