---
parameters: patch
---

`createParameterSetActor` no longer leaves an unhandled rejection when its sidecar watch's `closed` rejects. Closing or stopping the actor unsubscribes the watch, and a watch that rejects `closed` on unsubscribe (as the fs-bridge watch does, with an `AbortError`) used to escape as an unhandled rejection; it is now ignored. A watch whose `closed` rejects while the actor is still observing fails the actor with `WATCH_CLOSED`, as one that resolves does.
