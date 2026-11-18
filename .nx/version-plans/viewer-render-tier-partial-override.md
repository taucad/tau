---
viewer: minor
---

`RenderTierOverride.features` also takes a partial feature set, laid over the adapter's own features, so a test can run the hardware composition (ambient occlusion, FXAA, speculative preparation) on a software GPU while the environment cubemap keeps the size that adapter can filter. A rasterizer name still selects that rasterizer's whole feature set.
