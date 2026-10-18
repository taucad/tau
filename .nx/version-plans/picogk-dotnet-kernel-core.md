---
picogk: patch
---

`@taucad/picogk` now runs on `@taucad/dotnet-kernel-core`: its launch set, closure-to-options mapping, options schema, worker session, workspace mirror and layer publication rule are the core's, given PicoGK's closure layout, worker protocol and layer. Every export, the kernel version, `tau-plugin.json` and its SBOM are unchanged. `picogkNative` is built with `defineDotnetKernelAdopter` from the same layout.
