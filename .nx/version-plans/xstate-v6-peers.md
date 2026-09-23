---
camera: minor
revisions: minor
parameters: minor
three: minor
host: minor
runtime: patch
cli: patch
---

Move to XState v6: packages that use XState now peer on `xstate` `^6.0.0-alpha.59` (`host` and `three` require it; `camera`, `parameters` and `revisions` keep it optional), and their machines and helpers use v6 `setup({ schemas })`, transition functions and `createAsyncLogic`/`createCallbackLogic`. Hosts providing actors type them with the exported actor maps (`ParameterSetActors` and the revisions `*Actors` types). Revisions machines export named machine interfaces. `runtime` drops its unused `xstate` peer; `cli` depends on `xstate` directly for `host`.
