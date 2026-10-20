---
dotnet-kernel-core: minor
picogk: minor
---

`@taucad/picogk` builds a linux-x64 PicoGK runtime layer in the desktop release (`picogk-layer-linux`), and `@taucad/dotnet-kernel-core` composes a staged variant for a target that `tau-plugin.json` does not pin yet, so a Linux host can run PicoGK models from a locally staged layer until the published layer is pinned.
