---
picogk: minor
dotnet-kernel-core: minor
---

Tau-built .NET layers are pinned on the locked dependency host `https://dependencies.tau.new/` instead of `cdn.tau.new`.

- `@taucad/dotnet-kernel-core`: `dependencyBaseUrl` (`/layer`) is `https://dependencies.tau.new/`, so a composed `worker` pin names `https://dependencies.tau.new/blobs/sha256/<hex>` first and its GitHub Release second. `runComposeTauPlugin --outputs` prints `dependency-url=` in place of `cdn-url=`.
- `@taucad/picogk`: `tau-plugin.json` and its SBOM pin the Tau PicoGK layers the `desktop@0.2.0` release mirrored there: darwin-arm64 sha256 `f7767d236745fd316f79e92b8e239497ea9d44bfb1ce957c8cb3ce05db9cdc81` (release `picogk-layer-f7767d236745fd31`) and linux-x64 on glibc 2.28 or later sha256 `98a50727c2143456cd943f90798eee702afb207e7ca505de4fa6353679519baa` (release `picogk-layer-98a50727c2143456`). The golden closure receipts move with them.
