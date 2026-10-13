---
parameters: minor
---

Add `createParameterSetActor` to `@taucad/parameters/set-machine`, with the `ParameterFiles`, `ParameterWatch`, `ParameterSetActorInput` and `ParameterSetActor` types, so every host starts a target's parameter actor the same way. When its sidecar watch resets (events were lost) the actor re-arms the watch and reloads, planning a command not yet written again; it fails with `WATCH_CLOSED` when the watch ends on its own. `watch.error` accepts an optional `code` (`WatchFailureCode`), which becomes the diagnostic code instead of `WATCH_FAILED`. `ParameterWatch.closed` is required: a host's watch must say when it ends, so every host raises `WATCH_CLOSED`.
