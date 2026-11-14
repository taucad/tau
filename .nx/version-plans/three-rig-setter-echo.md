---
three: patch
---

A rig's `setClipPlanes` and `setRenderFrame` send the new value to the camera actor before presenting it. An `onUpdate` observer that answered the presentation with a synchronous actor event (the viewer's controls adapter echoes each presented pose) delivered a snapshot that did not yet carry the value, and the rig took the actor's old clip policy or render frame back as a change from elsewhere, so the setter had no effect.
