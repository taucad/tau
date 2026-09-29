---
parameters: minor
---

Add `createParameterSetActor` to `@taucad/parameters/set-machine`, with the `ParameterFiles`, `ParameterWatch`, `ParameterSetActorInput` and `ParameterSetActor` types, so every host starts a target's parameter actor the same way. The actor fails with `WATCH_RESET` when its sidecar watch resets and `WATCH_CLOSED` when the watch ends on its own. `watch.error` accepts an optional `code` (`WatchFailureCode`), which becomes the diagnostic code instead of `WATCH_FAILED`. `ParameterWatch.closed` is required: a host's watch must say when it ends, so every host raises `WATCH_CLOSED`.
