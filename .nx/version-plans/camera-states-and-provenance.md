---
camera: minor
---

Give the camera actor input states (`idle`, `dragging`, `settling`), a recorded source for every change (`lastChange`), atomic `frameGeometry` and `frameBounds`, idle-gated `adoptPersistedPose`, the render frame and clip policy, and refusal of invalid payloads in place of an errored actor. Add `createCameraActor` and `resolveCameraUp`. Remove the `saveHome` and `reset` events and the `initialView` context field.
