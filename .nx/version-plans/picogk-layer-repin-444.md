---
picogk: minor
---

`@taucad/picogk`'s `tau-plugin.json` pins the Tau PicoGK layers that desktop-staging 444 built from `3eb70716fa`, which carries #1002's batched implicit rendering and adaptive meshing: darwin-arm64 sha256 `629eff24263a72e0c56eb4f469a513874f9a228dd37e7116457e7a1e20f04565` (release `picogk-layer-629eff24263a72e0`) and linux-x64 on glibc 2.28 or later sha256 `4e0bfb0a4dbcde8a4e1238fa0f533af12b34f720dbfee801eb4118eacbf36c7d` (release `picogk-layer-4e0bfb0a4dbcde8a`), both from the same sources. Prepared PicoGK workers now echo their meshing, so a view that sets no `meshAdaptivity` meshes adaptively at 0.25 and an explicit adaptive request runs instead of refusing with `meshing-unsupported`; exports still mesh uniformly.
