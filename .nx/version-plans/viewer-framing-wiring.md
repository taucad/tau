---
viewer: minor
---

Wire the framing actor (G5b). The graphics actor spawns `framingMachine` as its `framing` child beside the view's camera and gains `entryChanged`, `geometryBoundsMeasured`, `sectionInputAttached` and `sectionInputDetached`, with the selectors `selectGraphicsFraming`, `selectGraphicsFramed` and `selectGraphicsFramingIdentity`. `useGeometryBounds` reports each measurement as `geometryBoundsMeasured` (with the resolved stage and surface), and graphics anchors the render frame on a new presentation key before framing frames the camera. Fit view sends framing `fitRequested`; `viewFitRequested` is still emitted for the SVG pan-zoom. The section handles hand graphics their section input's DOM adapter, and graphics runs it as its `sectionInput` child.

Removed: `useCameraFraming` (the `./graphics/three/use-camera-framing` export), `useViewCameraFraming`, the `ViewCameraFraming` type and the graphics context's `cameraFraming` record, `latchViewCameraFraming` and `selectGraphicsCameraFraming`. A `GraphicsProvider` seed with a new `identity` now sends `entryChanged`.

Deliberate changes (D14):

- A remounted canvas whose first measurement is a new presentation that moved more than 10 % refits, where the hook only refreshed the bounds.
- With a pending pose, the first frame no longer faces the configured angles before the pose is applied; the end pose is the pending pose, as before.
- The record's pose reaches the camera through `adoptPersistedPose` (source `persisted`) before and over the first frame, so the camera is not left settling, and a pose that arrives while the person drags or the camera settles is dropped (D15).
- Focus frames the component with one `frameBounds{source: 'focus'}` change that keeps the scene bounds; clearing focus sends nothing.
- A section input stops when its handles unmount, at once, rather than one microtask later.
