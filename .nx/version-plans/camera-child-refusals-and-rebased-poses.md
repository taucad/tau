---
camera: minor
---

Let `poseObserved` carry the `renderFrame` its gesture rebased to, taken in the same change. Add `createCameraRefusalInspector`, which reports a refused event of a camera spawned as another actor's child to the system's `onRejectedEvent`. Remove the deprecated `setView` alias; send `poseObserved` with `source: 'input'`.
