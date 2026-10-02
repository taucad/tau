---
title: 'WebGPU Post-Processing Performance Audit and Architectural Simplifications'
description: 'Pipeline-level audit of Tau WebGPU GTAO post-processing: per-frame work breakdown, depth-blit quad re-evaluation, and architectural simplifications informed by three.js r184 best practices'
status: active
created: '2026-05-15'
updated: '2026-05-15'
category: optimization
related:
  - docs/policy/webgpu-shader-and-pipeline-policy.md
  - docs/research/webgpu-override-material-vertex-binding-failure.md
  - docs/research/webgpu-overlay-depth-attachment-persistence.md
  - docs/research/webgpu-render-loop-audit.md
  - docs/research/webgpu-composite-quad-depth-write-non-functional.md
---

# WebGPU Post-Processing Performance Audit and Architectural Simplifications

Audit of Tau's WebGPU post-processing pipeline (`apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx`) triggered by (a) user-reported steady-state slowness and (b) the need to re-evaluate the depth-blit-quad fix proposed in the R5 plan for `webgpu-override-material-vertex-binding-failure.md`.

## Executive Summary

Tau's current WebGPU post pipeline issues **two full 4-MSAA full-resolution scene rasterizations per frame** (depth + normalView MRT prepass, then a lit beauty pass with `builtinAOContext`), plus a half-resolution GTAO fullscreen quad, plus a tonemap composite quad, plus a depth-only replay of the main scene for the overlay, plus the overlay scene itself. Of these, the **second scene rasterization is unnecessary** — the documented compose-based GTAO pattern (per the `GTAONode` JSDoc, `node_modules/three/examples/jsm/tsl/display/GTAONode.js:27-31`) renders the scene once with MRT outputs and multiplies AO into the composite, eliminating a full geometry pass per frame.

The depth-blit-quad proposal in the R5 plan is **not standard practice**; it is a workaround for the gap that exists today because `prePass` and `scenePass` own independent render targets. If the pipeline collapses to a single MRT scene pass (recommended), an analogous depth-bridging mechanism is still needed for the overlay, but the cost shifts to a non-redundant location and is implementable without a dedicated extra quad pass.

Recommended changes, in priority order: (1) collapse the dual scene render into one compose-based MRT pass, (2) drop MSAA on the AO-input MRT to halve the resolve bandwidth, (3) `compileAsync` warmup at component mount (now non-blocking in r184), (4) reconsider `useTemporalFiltering` under `frameloop='demand'` (currently a no-op), (5) reduce GTAO `samples` from 16 to 8 with quality A/B, (6) revisit overlay depth-bridging in light of (1).

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Current Pipeline Inventory](#current-pipeline-inventory)
- [Findings](#findings)
- [Architectural Alternatives](#architectural-alternatives)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Risks](#risks)
- [References](#references)

## Problem Statement

Two questions:

1. The R5 plan for [docs/research/webgpu-override-material-vertex-binding-failure.md](docs/research/webgpu-override-material-vertex-binding-failure.md) proposes a fullscreen depth-blit quad after `post.render()` to write the prepass depth texture into the canvas depth attachment. Is this standard practice, or are there better alternatives?
2. The user reports that the WebGPU viewport is "quite slow" in steady state. What are the dominant per-frame costs, and which are removable?

Both questions converge on the same audit: understanding the current pipeline's per-frame work, comparing it against documented three.js TSL post-processing patterns, and proposing architectural simplifications that resolve both concerns.

## Methodology

Source analysis across:

- [apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx](apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx)
- [apps/ui/app/components/geometry/graphics/three/post-processing.tsx](apps/ui/app/components/geometry/graphics/three/post-processing.tsx)
- [apps/ui/app/components/geometry/graphics/three/renderer.ts](apps/ui/app/components/geometry/graphics/three/renderer.ts)
- [apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx](apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx)
- `node_modules/three/src/nodes/display/PassNode.js`
- `node_modules/three/src/renderers/common/RenderPipeline.js`
- `node_modules/three/src/renderers/common/Renderer.js`
- `node_modules/three/src/renderers/webgpu/WebGPUBackend.js`
- `node_modules/three/src/renderers/webgpu/utils/WebGPUTextureUtils.js`
- `node_modules/three/examples/jsm/tsl/display/GTAONode.js` (canonical GTAO patterns)
- `node_modules/three/examples/jsm/tsl/display/BloomNode.js` (single-scenepass reference)

Plus upstream three.js issue/PR review for relevant performance-related landings in r181-r184:

- [#28784](https://github.com/mrdoob/three.js/pull/28784) — MSAA with post-processing (r167)
- [#28863](https://github.com/mrdoob/three.js/pull/28863) — Improved AO approach
- [#29198](https://github.com/mrdoob/three.js/pull/29198) — Reduce cache-sharing overhead (closed; superseded by #29845 bind-group caching)
- [#31883](https://github.com/mrdoob/three.js/pull/31883) — GTAONode R-channel format (r181)
- [#32984](https://github.com/mrdoob/three.js/pull/32984) — `compileAsync` truly non-blocking (r184)

Plus web research on screen-space AO normal-reconstruction techniques (Intel ASSAO, Speckle's CAD-focused implementation, McGuire's SAO).

## Current Pipeline Inventory

Per `PostProcessingWebGpuActive` ([post-processing-webgpu.tsx:40-87](apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx)):

| #   | Stage                                                                            | Source                      | Cost class                                                              |
| --- | -------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| 1   | `prePass` — full scene render with MRT (normalView packed to color)              | line 44-50                  | Full-res, 4-MSAA, geometry pass + normal-MRT bandwidth                  |
| 2   | GTAO fullscreen pass                                                             | `GTAONode.js:304-306`       | Half-res output, full-res depth+normal sampling, 16 directional samples |
| 3   | `scenePass` — full scene render with AO context applied via `builtinAOContext`   | line 67-68                  | Full-res, 4-MSAA, geometry pass (second one)                            |
| 4   | Final composite quad (`RenderPipeline._quadMesh`) — tonemap + output color space | `RenderPipeline.js:121-141` | Fullscreen quad, always invoked                                         |
| 5   | SceneOverlay depth-only re-render of main scene                                  | `scene-overlay.tsx:115-155` | Full geometry pass with cloned materials (`colorWrite=false`)           |
| 6   | SceneOverlay overlay scene render                                                | `scene-overlay.tsx:160-163` | Small geometry pass (grid + axes)                                       |

The renderer is configured with `antialias: true` ([renderer.ts:55-61](apps/ui/app/components/geometry/graphics/three/renderer.ts)), which sets `renderer.samples = 4`. `PassNode.setup` propagates this to every `PassNode`'s render target unless `options.samples` overrides it (`PassNode.js:756`). Tau does **not** override on either pass, so both prepass and scenePass run at 4-MSAA.

## Findings

### Finding 1: Two full MSAA scene rasterizations per frame is the dominant GPU cost

The current pipeline renders the entire scene **twice** per frame at full resolution with 4× MSAA:

- `prePass` writes depth + a normalView-encoded color MRT.
- `scenePass` re-rasterizes everything with `builtinAOContext` applied during shading.

The two passes own independent `RenderTarget` instances (`PassNode.js:259-268`), so no depth attachment is shared between them. For a CAD viewer with multi-million-triangle assemblies, this is the dominant cost.

The canonical three.js TSL pattern is documented in `GTAONode.js:24-31`:

```js
// AO multiplied in composite — not via builtinAOContext
const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({ normal: normalView }));
const aoPass = ao(scenePassDepth, scenePassNormal, camera);
const aoPassOutput = aoPass.getTextureNode();
renderPipeline.outputNode = scenePassColor.mul(vec4(vec3(aoPassOutput.r), 1));
```

This pattern **renders the scene once** and produces the AO inputs (depth + normalView MRT) as a side effect of the beauty pass. AO is then computed from those outputs and multiplied into the composite. `BloomNode.js:14-22` follows the same single-scene-pass discipline.

Estimated saving: ~30-50% of post-processing GPU cost on large CAD assemblies (the second scene pass cost is proportional to triangle count).

### Finding 2: MSAA on the normal MRT doubles bandwidth without anti-aliasing benefit

`PassNode.setup` ([PassNode.js:756](node_modules/three/src/nodes/display/PassNode.js)):

```js
this.renderTarget.samples = this.options.samples === undefined ? renderer.samples : this.options.samples;
```

Tau does not pass `samples` on either `pass()` call, so the prepass's normalView MRT is **also** 4-MSAA. The normal texture is sampled by GTAO as a screen-space buffer; MSAA on it provides no visual benefit but doubles the resolve bandwidth.

`pass(scene, camera, { samples: 1 })` disables MSAA on that pass while leaving the renderer-wide `samples = 4` intact for any beauty passes that genuinely benefit. This is the documented mechanism per PR [#28784](https://github.com/mrdoob/three.js/pull/28784).

### Finding 3: `useTemporalFiltering = true` is a no-op under `frameloop='demand'`

The current code ([post-processing-webgpu.tsx:61](apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx)) sets `aoNode.useTemporalFiltering = true`, but `GTAONode` does **not** maintain a history buffer — the flag only rotates the sample kernel direction per `frameId % 6` (`GTAONode.js:278-282`). Without temporal accumulation, the rotated samples produce **per-frame grain that varies between frames** instead of converging.

Under `frameloop='demand'` ([three-canvas-instance.tsx:86](apps/ui/app/components/geometry/graphics/three/three-canvas-instance.tsx)), frames are only rendered on `invalidate()`. Two scenarios:

- **Idle**: no frames render → no rotation occurs → AO is stable but at the fixed rotation of the last invalidated frame.
- **User interaction (orbit/pan)**: each invalidation increments `frameId` and rotates → AO shimmers slightly between consecutive frames.

The visual outcome: faint AO grain shimmer during interaction with no convergence benefit. Setting `useTemporalFiltering = false` either eliminates the shimmer or accepts a fixed-rotation banding pattern; neither is strictly better, but the current configuration is semantically incoherent with the frameloop policy.

### Finding 4: No `compileAsync` warmup — first-frame hitch on every mount

`PostProcessingWebGpuActive` constructs the `RenderPipeline` in `useLayoutEffect` and immediately ships into the `useFrame` loop at priority 1 ([post-processing-webgpu.tsx:40-84](apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx)) without invoking `compileAsync`. Three.js's `PassNode.compileAsync(renderer)` exists (`PassNode.js:739-751`) and was made **truly non-blocking** in r184 by [PR #32984](https://github.com/mrdoob/three.js/pull/32984). Tau is on three@0.184.0.

Without warmup, the first frame after mount (or after any pipeline-cache-invalidating event like material change, viewport resize, post-processing toggle) builds WGSL pipelines synchronously inside the `useFrame` callback, producing 10-100 ms hitches.

### Finding 5: GTAO at 16 samples may be over-budget for CAD geometry

`aoNode.samples.value = 16` ([post-processing-webgpu.tsx:64](apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx)) drives the GTAO directional-sampling loop ([GTAONode.js:363-420](node_modules/three/examples/jsm/tsl/display/GTAONode.js)). 16 samples is high for a real-time viewer; the original GTAO paper recommends 8-12 for typical scene complexity, with 16+ reserved for offline or hero shots.

CAD assemblies tend to have **larger flat surfaces** than organic content, which is the easy case for GTAO — undersampling artifacts manifest mainly at corners and crevices, which are visually less salient on a CAD model dominated by planar faces.

Resolution scale is already at 0.5, which helps. The samples count is the next dial.

### Finding 6: Depth-blit quad is non-standard; alternatives exist

Standard practice in production graphics engines (Unreal, Unity, Filament) is to **share the same depth attachment across passes** by orchestrating render-target ownership, rather than blitting depth between separate render targets. Three.js's TSL post-processing model deliberately gives each `pass()` its own RT, which precludes that pattern at the user-facing API.

The depth-blit quad (proposed in the R5 plan) is a workaround for the per-PassNode-RT constraint. It is reasonable and works, but it is **not what three.js examples demonstrate**. The canonical three.js pattern for overlays under post-processing is one of:

- **A.** Render the overlay as a separate scene at priority > post pipeline's priority, accepting that its depth occlusion against the post-pipeline-rendered scene must be solved out-of-band. This is what Tau does today (with the current depth-only re-render fix).
- **B.** Compose the overlay into the post pipeline's output by adding another TSL pass and chaining via `outputNode`. The overlay still doesn't share depth, but it's rendered through the same RenderPipeline. AO must be skipped for the overlay's contents.
- **C.** Render overlay objects into the main scene with `renderOrder` and `depthTest: true, depthWrite: false`, but use layer masks plus a custom AO-skipping mechanism to prevent AO darkening the overlays. Three.js does not currently expose per-mesh AO opt-out cleanly.

Of these, the depth-blit quad is closest to **A** with a dedicated depth-only quad replacing the scene replay. It is **structurally simpler** than the current per-mesh clone-swap, but still costs one fullscreen pass per frame.

If the pipeline collapses to a single MRT scenePass (Finding 1), the scenePass's depth texture is already a known input to subsequent composite stages. The hoped-for overlay strategy was to make the **composite quad write depth alongside color** via a one-line change to the composite's `NodeMaterial` (`material.depthNode = scenePassDepth.sample(screenUV)`). **This was tried and reverted** — in three.js r184 the composite-quad's depth output does not route to the swap-chain depth attachment subsequent `gl.render(overlayScene, camera)` calls read; see `docs/research/webgpu-composite-quad-depth-write-non-functional.md`. The production overlay strategy remains the R1 traverse + clone-swap depth pre-pass.

### Finding 7: Post pipeline always runs, even when the scene is unchanged

`useFrame(() => pipelineRef.current?.post.render(), 1)` ([post-processing-webgpu.tsx:82-84](apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx)) re-runs the full post pipeline on every R3F demand frame. Under `frameloop='demand'`, frames fire only on `invalidate()` — but every `invalidate()` triggers a full post re-render, even if it was caused by an event that didn't visually change the scene (e.g. tool selection changes, hover state on UI overlays, etc.).

Three.js does not directly expose a "scene unchanged" predicate; the application would need to track scene/camera dirty state and short-circuit `post.render()` accordingly. The cost saving is per-skipped-frame: 100% of the post-pipeline work for that frame.

This is a higher-effort optimization with subtle correctness pitfalls (forgetting to invalidate the dirty bit when a relevant uniform changes); P3.

### Finding 8: Three.js bind-group caching has already landed in r184

PR [#29845](https://github.com/mrdoob/three.js/pull/29845) (Per "texture set" bindGroup caching) superseded the `isolate` workaround in PR [#29198](https://github.com/mrdoob/three.js/pull/29198) and is in three@0.184.0. This was previously a CPU-side cost for post-pipeline-heavy apps; Tau benefits automatically without code changes.

No action required for this finding; it is noted for completeness.

### Finding 9: GTAONode already uses R-channel format

PR [#31883](https://github.com/mrdoob/three.js/pull/31883) (r181) optimized `GTAONode`'s render target format from RGBA to R, saving 75% of AO target memory and bandwidth. Tau is on r184 and benefits automatically.

No action required.

## Architectural Alternatives

The depth-blit quad's standing depends on what the surrounding pipeline looks like. Four candidate architectures:

| Option                              | Scene-render passes per frame                       | AO inputs                                            | Overlay strategy                                          | Effort       |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ------------ |
| **Current**                         | 2 (prepass + scenePass)                             | prepass MRT                                          | Priority-2 SceneOverlay with per-mesh clone swap          | (status quo) |
| **A. Single-pass compose AO**       | 1 (MRT scenePass produces depth + normal + color)   | scenePass MRT                                        | Composite quad writes color **and** depth via `depthNode` | Medium       |
| **B. Compose AO + depth-blit quad** | 1 (MRT scenePass)                                   | scenePass MRT                                        | Dedicated fullscreen depth-blit quad after post           | Medium       |
| **C. Depth-derived normals**        | 1 (scenePass produces depth + color, no normal MRT) | scenePass.depth + screen-space normal reconstruction | Same as A or B                                            | Medium-high  |
| **D. Overlay inside post pipeline** | 1                                                   | scenePass MRT                                        | TSL pass(overlayScene) composited after AO                | High         |

**Option A (recommended)**: rendering the scene once with MRT outputs and writing both color and depth from the composite quad. This eliminates the second scene pass (Finding 1), reuses the already-computed scenePass depth attachment for canvas depth (Finding 6 standard alternative), and keeps `SceneOverlay` simple (priority-2 `gl.render(overlayScene, camera)` with `autoClear=false`).

**Option B** is a fallback if the composite quad's depth-write path turns out to have a three.js limitation (no public API to mutate `RenderPipeline._quadMesh.material.depthNode` cleanly). Same scene-pass count as A; one extra quad pass per frame.

**Option C** (depth-derived normals) is the more aggressive variant of A. Saves the MRT normal-write bandwidth at the cost of slightly noisier AO at silhouette edges. CAD geometry has many planar regions where derivation is exact; the trade-off may favour CAD specifically. Medium-high effort because a custom TSL function for `normalView_fromDepth` must be written (three.js does not export one as of r184).

**Option D** (overlay-in-pipeline) was the original R5 spirit but is high-effort and couples overlay rendering tightly to post-processing. Reserve for a future iteration.

## Recommendations

| #   | Action                                                                                                                                                                                                                        | Priority | Effort      | Impact                                                         | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Collapse `prePass` + `scenePass` into a single MRT scenePass; switch from `builtinAOContext` to compose-based AO (`scenePassColor.mul(aoOutput.r)`) per the GTAONode canonical pattern.                                       | P0       | Medium      | High — eliminates one full scene render per frame              | **RESOLVED** — implemented in `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R2  | Make the composite quad write depth: set `RenderPipeline.outputNode`'s material `depthNode = scenePassDepth.sample(screenUV)` so canvas depth is populated alongside color. Replaces the R5 depth-blit-quad proposal.         | P0       | Low         | High — eliminates the entire SceneOverlay depth-restore pass   | **Reverted** — the wiring was removed from `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` after a zoom-dependent grid-disappearance regression revealed that `_quadMesh.material.depthNode` does **not** populate the canvas swap-chain depth attachment subsequent `gl.render(overlayScene, camera)` calls read in three.js r184. Canvas depth bridging restored via the R1 traverse + clone-swap pre-pass in `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`. See `docs/research/webgpu-composite-quad-depth-write-non-functional.md` for the architectural finding and `docs/research/webgpu-override-material-vertex-binding-failure.md` (Resolution postscript) for the failure-mode trace. |
| R3  | Pass `{ samples: 1 }` to `pass()` for the MRT prepass (and to the scenePass if AO quality remains acceptable). Override MSAA per-pass, leave canvas-wide `antialias: true` for edge-rendered geometry.                        | P1       | Low         | Medium — halves resolve bandwidth on the AO inputs             | **RESOLVED (D1a variant)** — single scenePass remains at 4-MSAA so beauty stays anti-aliased; the normal MRT inherits MSAA on the same pipeline. Acceptable since the second scene rasterization is eliminated entirely. Reverting to no-MSAA on normals is deferred until profiling justifies it.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R4  | `await pipeline.compileAsync()` (or `await pass.compileAsync(renderer)` for each pass) inside `useLayoutEffect` before installing the priority-1 frame loop. Now non-blocking in r184.                                        | P1       | Low         | Medium — eliminates first-frame hitch on mount and post-toggle | **RESOLVED** — `scenePass.compileAsync(renderer)` is awaited inside an `async-iife: bootstrap` annotated IIFE; `pipelineRef.current` only publishes after warmup completes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R5  | Set `aoNode.useTemporalFiltering = false` under `frameloop='demand'`. The current value is a no-op at best and produces inter-frame grain shimmer at worst.                                                                   | P1       | Trivial     | Low-medium — removes user-visible shimmer                      | **RESOLVED** — `aoNode.useTemporalFiltering = false` with an inline rationale comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R6  | Reduce `aoNode.samples.value` from 16 to 8; re-evaluate visually on dense CAD assemblies. Document the choice in a comment.                                                                                                   | P2       | Trivial     | Medium — halves the AO shader inner-loop cost                  | **RESOLVED** — `aoNode.samples.value = 8`; visual A/B deferred until reports of corner/crevice degradation on dense assemblies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R7  | (Stretch) Adopt depth-derived normals (Option C); skip normalView MRT entirely. Defer until R1+R2 land and a perf gap remains.                                                                                                | P3       | Medium-high | Medium                                                         | **Deferred** — R1-R6 are expected to close the bulk of the perf gap; depth-derived normals will be re-evaluated only if profiling shows the normal MRT remains a bottleneck on the canonical assembly fixtures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R8  | (Stretch) Implement scene/camera dirty-tracking gate around `post.render()` to skip post on non-visual invalidates.                                                                                                           | P3       | Medium      | Low-medium (depends on invalidate-storm frequency)             | **Deferred** — same gating as R7; revisit once R1-R6 baseline is measured.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R9  | Update `webgpu-shader-and-pipeline-policy.md` with: (a) MSAA-per-pass override pattern, (b) `compileAsync` warmup requirement on `RenderPipeline` construction, (c) compose-based AO as the preferred AO integration pattern. | P1       | Low         | Medium — prevents regression                                   | **RESOLVED** — policy rules 11-13 published; anti-pattern + summary checklist refreshed; cross-link to `tau-lint/no-scene-override-material` added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

R1 alone collapses the per-frame work to: **1 MRT scene pass + 1 GTAO quad + 1 composite quad + 1 depth-only scene pre-pass (overlay) + 1 overlay pass = 5 passes**, down from 6 today. R2 (composite-quad depth write) would have brought the count to 4 but is reverted (see status note above and `docs/research/webgpu-composite-quad-depth-write-non-functional.md`); the depth-only pre-pass remains the canvas-depth producer for priority-2 overlays.

### Implementation summary

The recommendations above were delivered as a single architectural cut over `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` and `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`, with R2 subsequently reverted:

- The legacy `prePass` is gone; a single MRT scenePass produces depth + view-space normal + beauty colour.
- AO is composed via `scenePassColor.mul(vec4(vec3(ao.r), 1))` (rule 11).
- `scenePass.compileAsync(renderer)` warms the scene pipelines during `useLayoutEffect`; the priority-1 `useFrame` is a no-op until warmup resolves (rule 13).
- `aoNode.useTemporalFiltering = false`, `aoNode.samples.value = 8`.
- `SceneOverlayFrameLoop` runs a priority-2 `scene.traverse` + per-source-material cached `colorWrite=false` clone-swap depth pre-pass, then composites the overlay scene on top — both calls under `gl.autoClear=false`. The composite-quad `depthNode` wiring originally adopted under R2 has been removed; see the R2 status note above.
- Policy + lint coverage prevent regression: `tau-lint/no-scene-override-material` (error) blocks reintroducing the override-material workaround; `webgpu-shader-and-pipeline-policy.md` rules 11 + 13 govern compose-AO and `compileAsync` warmup. Rule 12 has been rewritten as an anti-pattern (do **not** rely on `_quadMesh.material.depthNode` to populate canvas depth) plus a positive rule mandating an explicit depth pre-pass for overlay scenes — see the policy doc.

The R7/R8 stretch items are intentionally deferred — the R1 + R3-R6 cut is expected to close the bulk of the perf gap on the canonical assembly fixtures, and profiling should drive any subsequent stretch. R2 is no longer a candidate after the architectural finding documented in `docs/research/webgpu-composite-quad-depth-write-non-functional.md`.

## Trade-offs

| Optimization                        | Cost                                                                                                                                                                                                                                                                                                                                     | Risk                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single MRT scenePass (R1)           | One-time refactor across post-processing-webgpu.tsx                                                                                                                                                                                                                                                                                      | AO quality may differ subtly at depth discontinuities since AO now samples scenePass-rasterized depth instead of a dedicated prepass depth (functionally equivalent in this codebase but worth visual A/B) |
| Composite-quad depth write (R2)     | Adds `depthNode` to RenderPipeline's quad material via public TSL APIs                                                                                                                                                                                                                                                                   | Requires verifying that `RenderPipeline._quadMesh.material` accepts external `depthNode` mutation. If not, fall back to a dedicated depth-blit quad (Option B).                                            |
| MSAA off on AO inputs (R3)          | The scenePass MRT loses MSAA on its color attachment too, since MRT shares the sample count. If we want MSAA on the lit beauty color but not the normal, need MRT-per-attachment samples (not currently supported). Workaround: keep scenePass at 4-MSAA but use compose-based AO, accepting that AO samples MSAA-resolved depth/normal. | Acceptable for CAD; AA matters on silhouette edges, not on AO inputs                                                                                                                                       |
| `compileAsync` warmup (R4)          | Mount becomes async-await                                                                                                                                                                                                                                                                                                                | UI may show pre-warmed frames during compilation — likely invisible since the canvas is empty until the renderer is ready anyway                                                                           |
| `useTemporalFiltering = false` (R5) | Visible AO pattern is more uniform but lacks rotation variety                                                                                                                                                                                                                                                                            | None for a CAD viewer                                                                                                                                                                                      |
| AO samples 16 → 8 (R6)              | Halves the AO inner-loop ALU                                                                                                                                                                                                                                                                                                             | Visible noise increase in corner/crevice AO; tune resolution scale (currently 0.5) or thickness compensation                                                                                               |
| Depth-derived normals (R7)          | Removes MRT normal output                                                                                                                                                                                                                                                                                                                | Silhouette-edge AO artifacts; CAD scenes typically tolerate well                                                                                                                                           |

## Risks

- **Three.js public API for `RenderPipeline._quadMesh.material.depthNode` is informal.** The R2 path depends on whether mutating the composite quad's material is supported across three.js minor versions. Validate against the current r184 source: `RenderPipeline.update()` re-applies `outputNode` to `_quadMesh.material.fragmentNode`, so any external `depthNode` we set must survive update. Need a focused test asserting that the depthNode persists across multiple `post.render()` calls.
- **MRT-per-attachment sample counts are unsupported.** WebGPU's `GPURenderPipelineDescriptor.multisample.count` applies to the whole pipeline. If we keep scenePass at MSAA, the normal attachment is also multisampled. Workaround: render the normal at MSAA and resolve via three.js's standard MRT resolve path. Cost: still ~2× the bandwidth vs no-MSAA normal, but better than today (which has 2 scene passes both at MSAA).
- **Compose-based AO requires the lit scene to be rendered without AO context.** All custom materials that previously read AO via `builtinAOContext` (none in Tau as of audit) would need updating. Current Tau materials are AO-agnostic — none consume AO directly — so this risk is zero today, but document it in the policy.
- **Depth-derived normals (R7) require a custom TSL function.** Three.js does not export `normalView_fromDepth` as of r184. The implementation is ~10 lines of TSL using `dFdx`/`dFdy` of view-space position reconstructed from depth, but it must be snapshot-tested per `webgpu-shader-and-pipeline-policy.md` rule 10.

## References

- Three.js TSL examples (canonical patterns):
  - `node_modules/three/examples/jsm/tsl/display/GTAONode.js:24-31` — compose-based AO usage example
  - `node_modules/three/examples/jsm/tsl/display/BloomNode.js:14-22` — single scenePass + screen-space effect
- Three.js source (audit references):
  - `node_modules/three/src/nodes/display/PassNode.js:539,756,832-863` — MRT, samples, render-target ownership
  - `node_modules/three/src/renderers/common/RenderPipeline.js:121-141` — composite quad invocation
  - `node_modules/three/src/renderers/webgpu/utils/WebGPUTextureUtils.js:461-466,1555-1594` — depth format selection
- Three.js PRs / issues:
  - [#28784](https://github.com/mrdoob/three.js/pull/28784) — MSAA with post-processing (r167)
  - [#28863](https://github.com/mrdoob/three.js/pull/28863) — Improved AO approach
  - [#29845](https://github.com/mrdoob/three.js/pull/29845) — Bind-group caching (r-ish 170s)
  - [#31883](https://github.com/mrdoob/three.js/pull/31883) — GTAONode R-channel format (r181)
  - [#32984](https://github.com/mrdoob/three.js/pull/32984) — `compileAsync` non-blocking (r184)
  - [#26820](https://github.com/mrdoob/three.js/issues/26820) — WebGPU node-system startup cost
- External references:
  - [Practical Real-Time Strategies for Accurate Indirect Occlusion (Activision, GTAO paper)](https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf)
  - [Scalable Ambient Obscurance (McGuire 2012)](https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf) — normal-from-depth precedent
  - [Adaptive Screen Space Ambient Occlusion (Intel ASSAO)](https://www.intel.com/content/www/us/en/developer/articles/technical/adaptive-screen-space-ambient-occlusion.html) — normal-from-depth as standard practice
  - [Speckle: Improved Ambient Occlusion](https://speckle.systems/blog/speckles-improved-ambient-occlusion-a-closer-look) — CAD-domain normal-from-depth case study
- Tau related:
  - [docs/policy/webgpu-shader-and-pipeline-policy.md](docs/policy/webgpu-shader-and-pipeline-policy.md) — must absorb R9
  - [docs/research/webgpu-override-material-vertex-binding-failure.md](docs/research/webgpu-override-material-vertex-binding-failure.md) — R5 plan to be revised in light of R2
  - [docs/research/webgpu-overlay-depth-attachment-persistence.md](docs/research/webgpu-overlay-depth-attachment-persistence.md) — earlier overlay depth-clear fix
  - [docs/research/webgpu-render-loop-audit.md](docs/research/webgpu-render-loop-audit.md) — R3F priority counting baseline

## Appendix: Per-Frame Work Comparison

Estimated per-frame work for a representative CAD assembly (~500k triangles, 1920×1080, 4-MSAA where applicable):

| Stage                                          | Today                                       | After R1 (as shipped, R2 reverted)                                 | After R1+R3+R6                                      | After R1+R3+R6+R7                          |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------ |
| Lit geometry pass (MRT)                        | 2 × 500k × MSAA = ~4M rasterized fragments  | 1 × 500k × MSAA = ~2M                                              | 1 × 500k × MSAA = ~2M (color only; AO inputs at 1×) | 1 × 500k × MSAA = ~2M (no normal MRT)      |
| GTAO quad                                      | 0.5× res, 16 samples                        | 0.5× res, 8 samples                                                | 0.5× res, 8 samples                                 | 0.5× res, 8 samples (normal reconstructed) |
| Composite quad                                 | Color only                                  | Color only                                                         | Color only                                          | Color only                                 |
| Depth pre-pass (overlay canvas-depth producer) | Per-mesh clone re-render (depth-only)       | Per-mesh clone re-render (depth-only, R1 traverse + cached clones) | Same                                                | Same                                       |
| Overlay render                                 | 1 pass (priority 2)                         | 1 pass (priority 2)                                                | 1 pass (priority 2)                                 | 1 pass (priority 2)                        |
| Total scene passes                             | **3** (prepass + scenepass + depth-restore) | **2** (MRT scenepass + depth-only pre-pass)                        | **2**                                               | **2**                                      |

The R1 step removes the second beauty rasterization (`builtinAOContext` → compose-AO), bringing total scene passes from 3 to 2. R2 (composite-quad depth write) would have brought it to 1, but is reverted; see status note in the Recommendations table.
