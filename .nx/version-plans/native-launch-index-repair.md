---
runtime: minor
native-process-core: minor
build123d: minor
picogk: minor
cli: minor
---

A sealed native closure carries a launch index (`launch.json`, a receipted file covered by `treeIntegrity`) holding only the launch set's rows, so a launch reads it and the receipt's head instead of the full receipt. `PreparationHost.inspectLaunch`, `PreparationPlugin.launchSet` and `reverifyClosure` are new; `build123dLaunchSet` and `picogkLaunchSet` name the files each kernel's process loads first, and PicoGK's set shrinks to the muxer, `hostfxr`, `hostpolicy`, the worker, `PicoGK.dll` and the engine. A native worker that exits before its handshake re-verifies its closure through `installNativeRuntimeVerifier`, and the refusal names the damaged files. A repair now unseals the closure while it changes it, so a seal step sees the tree as at first seal and a failed repair is never reported intact. Payload files are written `0o644` or `0o755`, so a tar seed verifies like a clone, and a payload the store already held is recorded as acquired from the store.
