---
build123d: minor
picogk: minor
---

Add a `/native` subpath to `@taucad/build123d` and `@taucad/picogk` exporting `build123dNative` and `picogkNative`, each a `NativeKernelAdopter` over the package's existing closure module: the options a sealed closure maps to with their schema, Build123d's seal step, the launch set, and a `load()` that imports the kernel plugin only when a host composes it. The package roots re-export both adopters; every existing export is unchanged.
