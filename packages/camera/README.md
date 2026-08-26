# @taucad/camera

Renderer-neutral camera state, framing, and projection logic for CAD viewers.

The package root contains data types and math. Importing `@taucad/camera` does not load XState. The optional `@taucad/camera/machine` subpath exports one machine, `cameraMachine`, for headless or renderer-driven use.

## Camera view or camera state

Use `CameraView` while a viewer frames bounds and moves between perspective and orthographic projections. It stores target, target-to-camera direction, screen-up, visible vertical span, viewport, and bounds.

Use `CameraState` when another process must reproduce one frame. It stores position, target, screen-up, projection, zoom, clipping, and aspect as serializable values. `createCameraState` validates and copies those values before asynchronous work:

```ts
import { createCameraState } from '@taucad/camera';

const captureCamera = createCameraState({
  position: [80, -55, 35],
  target: [5, 0, 8],
  up: [0.18, 0.12, 0.98],
  projection: {
    kind: 'perspective',
    verticalFieldOfView: 48,
    zoom: 1.25,
  },
  clipping: { near: 0.1, far: 2_000 },
  aspect: 16 / 9,
});

JSON.stringify(captureCamera); // safe to send to a worker or remote renderer
```

The vectors use the host's world coordinate system and length unit. `up` preserves camera roll. Perspective field of view is vertical and measured in degrees. Zoom is a positive magnification. Orthographic state replaces `verticalFieldOfView` with an unzoomed `verticalSpan` in world units.

## Drive a viewer

```ts
import { createCameraView } from '@taucad/camera';
import { cameraMachine } from '@taucad/camera/machine';
import { createActor } from 'xstate';

const initialView = createCameraView({
  requestedVerticalFieldOfView: 60,
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  viewport: { width: 1280, height: 720, pixelRatio: 1 },
  bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
});

const camera = createActor(cameraMachine, { input: { initialView } }).start();
camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
camera.stop();
```

Projection changes are immediate. Hosts may animate their input values before sending them and inject renderer behavior with XState's `.provide()`. Snapshots contain only serializable camera data.

Runtime support: Node.js 24 or newer and modern browsers. `xstate` 5 is a peer dependency. This package is Apache-2.0 licensed; its implementation was authored for Tau and does not include copied Three.js source.
