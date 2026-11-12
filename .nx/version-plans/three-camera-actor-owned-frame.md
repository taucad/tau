---
three: minor
---

Keep the camera actor told of the rig's render frame and clip policy: `setRenderFrame` and `setClipPlanes` still present at once and are what the native cameras show, and while the rig's actor runs they also send it the value, and a frame or policy sent to that actor directly becomes the rig's. Let `createThreeCameraRig` take `clock`, `inspect` and `onRejectedEvent` for that actor.
