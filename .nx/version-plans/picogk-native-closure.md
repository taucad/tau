---
picogk: minor
cli: minor
---

`@taucad/picogk` ships a `tau-plugin.json` that pins Microsoft's .NET runtime archive and the Tau PicoGK layer, and exports `picogkOptionsFromClosure`, which launches the worker through the `dotnet` muxer from a prepared closure (new optional `runtimePath` and `workerArguments` options). `tau export` runs `.cs` models from the closure `tau prepare picogk` seals instead of reading a desktop-prepared resource root, and refuses an unprepared kernel with `KERNEL_NOT_PREPARED`.
