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
});

worker.postMessage({ type: 'capture', camera: cameraState });
```

The returned object contains plain tuples and tagged projection data. World position and quaternion-derived screen-up preserve parent transforms and roll. No Three.js type crosses the worker or RPC boundary.

## Drive native endpoint cameras

```ts
import { createCameraView } from '@taucad/camera';
import { createThreeCameraRig } from '@taucad/three';

const rig = createThreeCameraRig({
  initialView: createCameraView({
    requestedVerticalFieldOfView: 60,
    target: [0, 0, 0],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 10,
    perspectiveZoom: 1,
    viewport: { width: 1280, height: 720, pixelRatio: 1 },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  }),
});

rig.actorRef.start();
// Optional host envelope for helpers outside model bounds, such as a grid.
rig.setClipPlanes({
  near: 1e-3,
  minimumPerspectiveFar: 10_000_000_000,
  orthographicFarMultiplier: 5,
});
rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
console.log(rig.activeCamera.isOrthographicCamera); // true
rig.dispose();
```

The rig derives tight model clip planes by default and applies the fitted zoom from `@taucad/camera` to the native perspective camera. Orthographic frames encode the same visible span directly and use native zoom `1`. Hosts with renderable scene helpers outside those bounds can call `setClipPlanes`; the policy keeps a configurable broad perspective far plane while multiplying the bounds-derived orthographic far plane to preserve linear depth precision. It survives subsequent actor updates. The package deliberately has no React, React Three Fiber, DOM, controls, gizmo, or post-processing dependency. Hosts retarget those resources from the rig's `onUpdate` callback and must call `dispose()` when the owning viewer is destroyed.

Runtime support: Node.js 24 or newer and modern browsers with Three.js 0.184 or compatible. `@taucad/camera`, `three`, and `xstate` 5 are peer dependencies. This package is Apache-2.0 licensed; it uses public Three.js APIs and does not redistribute Three.js source.
