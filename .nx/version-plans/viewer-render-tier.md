---
viewer: minor
---

The viewer resolves a render tier once per canvas incarnation. `@taucad/viewer/graphics/three/render-tier` (new) exports `RenderTier` (`backend`, `rasterizer: 'hardware' | 'software'`, `features: { ambientOcclusion, antialias, speculativePreparation, environmentResolution }`, `fallbackReason`, `overridden`), `resolveRenderTier`, `renderTierFeatures`, `hardwareRenderTier` and the test-only `RenderTierOverride`. The post-processing composition and the lighting environment read their features from the tier instead of asking the renderer whether it rasterizes on the CPU; behaviour is unchanged.

The canvas actor's `hostCreated` event carries the renderer's `tier`, its context holds it from `ready`, and `selectPresentedRenderTier` (new) returns it only once the canvas has presented and while it still draws. `ViewerEnvironment` takes an optional `renderTierOverride`, which an embedder sets only in an undeployed debug build so a software GPU can run the hardware features. `CanvasHostRoot` takes the same override.
