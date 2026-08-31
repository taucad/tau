# @taucad/three

Framework-independent Three.js capabilities for Tau.

`createThreeCameraRig` adapts `@taucad/camera` to two persistent native Three.js endpoint cameras. Exactly one `PerspectiveCamera` or `OrthographicCamera` is active semantically; both stay synchronized so endpoint handoff does not allocate a camera or use a hybrid camera facade.

## Copy a live camera for capture

`readThreeCameraState` copies the complete world-space state of a perspective or orthographic camera. Pass the target owned by your controls; Three.js cameras do not store it.

```ts
import { readThreeCameraState } from '@taucad/three/camera';

const cameraState = readThreeCameraState({
  camera,
  target: controls.target,
  renderFrame,
});

worker.postMessage({ type: 'capture', camera: cameraState });
```

The returned object contains physical-metre tuples, a frame ID, and tagged projection data. The active render frame is inverted at this boundary, so no native render-local coordinate or Three.js type crosses the worker or RPC boundary.

## Drive native endpoint cameras

```ts
import { createCameraView } from '@taucad/camera';
import { createThreeCameraRig } from '@taucad/three';

const rig = createThreeCameraRig({
  initialView: createCameraView({
    frameId: 'tau:root',
    requestedVerticalFieldOfView: 60,
    target: [0, 0, 0],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 10,
    perspectiveZoom: 1,
    viewport: { width: 1280, height: 720, pixelRatio: 1 },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  }),
  renderFrame: {
    anchorFrameId: 'tau:root',
    originMeters: [0, 0, 0],
    metersPerRenderUnit: 1,
  },
});

rig.actorRef.start();
rig.setRenderFrame(nextRenderFrame); // remaps both native cameras without changing physical state
rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
console.log(rig.activeCamera.isOrthographicCamera); // true
rig.dispose();
```

The rig derives scale-covariant clip planes and applies the fitted zoom from `@taucad/camera`. `@taucad/three/spatial` supplies native point, ray, bounds, plane, and outer-matrix adapters. The package deliberately has no React, React Three Fiber, DOM, controls, gizmo, or post-processing dependency. Hosts retarget those resources from the rig's `onUpdate` callback and must call `dispose()` when the owning viewer is destroyed.

Runtime support: Node.js 24 or newer and modern browsers with Three.js 0.184 or compatible. `@taucad/camera`, `three`, and `xstate` 5 are peer dependencies. This package is Apache-2.0 licensed; it uses public Three.js APIs and does not redistribute Three.js source.
