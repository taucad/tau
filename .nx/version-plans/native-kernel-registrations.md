---
build123d: minor
picogk: minor
---

`build123dKernel` and `picogkKernel` registrations carry their native deployments (`build123dNative`, `picogkNative`) through `withNativeDeployment`, so a host that lists `build123d()` or `picogk()` in a runtime definition reads what to prepare from the definition and each kernel resolves its prepared closure when it initializes. Each package's own `tau-plugin.json` is now imported at run time from the published file instead of being bundled into `dist`.
