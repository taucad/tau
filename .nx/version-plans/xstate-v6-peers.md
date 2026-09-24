---
__default__: minor
---

Move to XState v6: packages that use XState now peer on `xstate` `^6.0.0-alpha.59` (`host` and `three` require it; `camera`, `parameters` and `revisions` keep it optional), and their machines and helpers use v6 `setup({ schemas })`, transition functions and `createAsyncLogic`/`createCallbackLogic`. Hosts providing actors type them with the exported actor maps (`ParameterSetActors` and the revisions `*Actors` types). Revisions machines export named machine interfaces. `runtime` drops its unused `xstate` peer; `cli` depends on `xstate` directly for `host`.

### Breaking changes

- **Peer range.** `xstate` moves from `^5.0.0` to `^6.0.0-alpha.59` for `camera`, `parameters`, `revisions`, `three` and `host`. `camera` and `revisions` become optional peers (as `parameters` already was); `three` and `host` require it. Only their machine subpaths (and `three`'s root and `./camera`) load XState. `runtime` no longer declares an `xstate` peer, so its consumers no longer inherit one.
- **Machine authoring.** Machines exported from these packages are XState v6 machines. Hosts that `.provide()` actors pass v6 logic (`createAsyncLogic`, `createCallbackLogic`, `createEventObservableLogic`) and type the map with the exported actor types (`ParameterSetActors`, `RemoteActors` and the other revisions `*Actors`), because v6 infers a provided map from its argument rather than from the machine.
- **`@taucad/three`.** `ThreeCameraRig.actorRef` is typed `Actor<typeof cameraMachine>` instead of `ActorRefFrom<…>` (v6 refs have no `start`/`stop`).
- **`@taucad/revisions`.** The package root no longer reaches XState at runtime or in its declarations: the plain `Sync*`, `Remote*` and publish-actor types are declared in XState-free modules and still exported from the root, while `RemoteActors` is exported from `@taucad/revisions/remote-machine`. Each machine subpath exports a named machine interface (for example `ProjectRevisionsMachine`). At startup the project-revisions root now runs its lease sweep before the remote and pending reads (v6 starts invoked children after the parent's entry effects); the three reads are independent.
