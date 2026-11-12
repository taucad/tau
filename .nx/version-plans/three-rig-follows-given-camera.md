---
three: minor
---

Let `createThreeCameraRig` present a camera actor it did not create: pass `actorRef`, and the rig follows that actor between `connect()` and the function it returns, sending it the rig's render frame and clip policy. `dispose()` leaves a given actor running.

`ThreeCameraRigOptions` is now a union: pass either `initialView` (with an optional `pixelBudget`) for a rig-owned camera, or `actorRef` for a given one. Options with neither no longer type-check.
