---
viewer: minor
---

The view camera's types and selectors move from `services/graphics-camera-registry` to a new `graphics/graphics-camera` subpath (G12). It exports `asCameraActor`, `selectGraphicsCamera`, `getGraphicsCameraState`, the `ViewCameraSeed`, `CameraUpdateHandler` and `RenderFrameUpdateHandler` types, and a new `selectCameraViewDirection` that reads a camera's view direction when an event needs it. The graphics machine drops `cancelPendingMeasurements`, which nothing sent.

Breaking: the `services/graphics-camera-registry` subpath is removed; import the same names from `graphics/graphics-camera`. `GraphicsEvent` no longer includes `cancelPendingMeasurements`.
