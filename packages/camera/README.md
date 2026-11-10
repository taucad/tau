# @taucad/camera

Renderer-neutral camera state, framing, and projection logic for CAD viewers.

The package root contains data types and math. Importing `@taucad/camera` does not load XState. The optional `@taucad/camera/machine` subpath exports one machine, `cameraMachine`, and its composition root, `createCameraActor`, for headless or renderer-driven use.

## Camera view or camera state

Use `CameraView` while a viewer frames bounds and moves between perspective and orthographic projections. It stores target, target-to-camera direction, screen-up, visible vertical span, perspective zoom, viewport, and bounds. `frameCameraBounds` applies the same two-stage bounds fit used by Tau's thumbnails: an AABB-safe distance followed by a projected-corner zoom. The resulting visible span remains the projection-independent handoff invariant at 0° FOV.

Use `CameraState` when another process must reproduce one frame. It stores position, target, screen-up, projection, zoom, clipping, and aspect as serializable values. `resolveCameraState({ view })` resolves a framed `CameraView` into that complete state; `createCameraState` validates and copies already resolved values before asynchronous work:

```ts
import { createCameraState } from '@taucad/camera';

const captureCamera = createCameraState({
  frameId: 'tau:root',
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

The vectors use the named physical frame and metres. `up` preserves camera roll. Perspective field of view is vertical and measured in degrees. Zoom is a positive magnification. Orthographic state replaces `verticalFieldOfView` with an unzoomed `verticalSpan` in metres. Renderers map this state into their local render frame; changing that representation does not change camera state.

## Drive a viewer

```ts
import { createCameraView } from '@taucad/camera';
import { cameraMachine } from '@taucad/camera/machine';
import { createActor } from 'xstate';

const initialView = createCameraView({
  frameId: 'tau:root',
  requestedVerticalFieldOfView: 60,
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
  viewport: { width: 1280, height: 720, pixelRatio: 1 },
  bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
});

const camera = createActor(cameraMachine, { input: { initialView } }).start();
camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
camera.stop();
```

Projection changes are immediate. Hosts may animate their input values before sending them and subscribe a renderer adapter to the actor. Snapshots contain only serializable camera data.

### Where a change came from

Every change bumps `context.revision` once and records its source in `context.lastChange`:

| Source               | Event                                               | Made by        |
| -------------------- | --------------------------------------------------- | -------------- |
| `input`, `gizmo`     | `poseObserved`                                      | a person       |
| `fov`, `up`          | `setVerticalFieldOfView`, `setUpDirection`          | a person       |
| `fit`, `focus`       | `frameGeometry` with `source: 'fit'`, `frameBounds` | a person       |
| `framing`            | `frameGeometry` with `source: 'framing'`            | the viewer     |
| `viewport`, `bounds` | `setViewport`, `setBounds`                          | the viewer     |
| `persisted`          | `adoptPersistedPose`                                | a saved record |

The actor emits `viewChanged` with the revision, the source and the visible span for each change. `setRenderFrame` and `setClipPolicy` change how a driver presents the pose, not the pose, so they synchronize the driver without a revision.

### Gestures and saved poses

The actor tracks the person's gesture in its `input` state. Send `interactionStarted` and `interactionEnded` around a drag and `poseObserved` for each pose the controls report:

- A pose of a held gesture puts the camera in `input.dragging`. `interactionEnded` moves it to `input.settling`.
- A pose with no held gesture, such as a wheel step or damping after a release, puts the camera in `input.settling` and restarts the settle window.
- After `cameraPoseSettleMilliseconds` (250 ms) with no further pose, the camera returns to `input.idle`.

`adoptPersistedPose` applies a saved record's pose, orientation, field of view or up direction only in `input.idle`, as one change, and emits `adoptionApplied`. While the person drags or the camera settles, the record is dropped and the actor emits `adoptionDropped`. It is never queued, so the person's pose wins.

A controls update that a driver synchronization caused carries an integer `echoRevision` on `poseObserved`. The camera ignores it; a stamp that is not an integer is refused.

### Refused events

A payload the camera cannot use, such as a non-finite field of view, a zero-sized viewport, inverted bounds, a zero or parallel direction, a margin above 0.5, or a missing or null field, is refused. The actor stays active on its last valid view and `snapshot.can(event)` answers `false`. To observe refusals, create the actor with `createCameraActor`, which reports each one to `onRejectedEvent` with the reason `refusedPayload`, next to XState's own dead letters:

```ts
import { cameraMachine, createCameraActor } from '@taucad/camera/machine';

const camera = createCameraActor({
  machine: cameraMachine,
  input: { initialView },
  onRejectedEvent: ({ event, reason }) => console.warn(`camera refused ${event.type}: ${reason}`),
}).start();
```

`createCameraActor` also forwards `clock` and `inspect`, so a test can step the settle window on a simulated clock.

### Up direction

`resolveCameraUp({ direction, preferredUp, fallbackUp })` from the package root keeps the preferred up axis unless it is parallel to the view direction, then tries the fallback, the default up and the x axis in turn. `setUpDirection` uses it.

Runtime support: Node.js 24 or newer and modern browsers. `xstate` 6 (`^6.0.0-alpha.59`) is an optional peer dependency, needed only for `@taucad/camera/machine`. This package is Apache-2.0 licensed; its implementation was authored for Tau and does not include copied Three.js source.
