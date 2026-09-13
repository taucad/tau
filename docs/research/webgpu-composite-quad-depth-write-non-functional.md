---
title: 'WebGPU `RenderPipeline._quadMesh.material.depthNode` Does Not Reach Canvas Depth Attachment'
description: "Architectural finding: three.js r184 routes the composite quad's depth output to the RenderPipeline's internal target, not the swap-chain depth attachment subsequent gl.render calls read"
status: active
created: '2026-05-15'
updated: '2026-05-15'
category: investigation
related:
  - docs/policy/webgpu-shader-and-pipeline-policy.md
  - docs/research/webgpu-override-material-vertex-binding-failure.md
  - docs/research/webgpu-post-processing-performance-audit.md
  - docs/research/webgpu-overlay-depth-attachment-persistence.md
---

# WebGPU `RenderPipeline._quadMesh.material.depthNode` Does Not Reach Canvas Depth Attachment

Root-cause trace of why wiring `_quadMesh.material.depthNode = scenePassDepth.sample(screenUV)` on three.js's `RenderPipeline` does **not** populate the canvas swap-chain depth attachment subsequent `gl.render(overlayScene, camera)` calls read.

## Executive Summary

The `docs/research/webgpu-post-processing-performance-audit.md` R2 recommendation wired `post._quadMesh.material.depthNode = scenePassDepth.sample(screenUV)` on the assumption that the composite quad's depth output would populate the canvas depth attachment. In three.js r184 the composite quad runs against the `RenderPipeline`'s **internal** render target — its `depthNode` is consumed inside that internal pass, not exported to the swap-chain depth-stencil attachment that the next `gl.render(overlayScene, camera)` call reads. The wiring is silently a no-op for canvas-depth-bridging purposes.

Symptom that surfaced the bug: the infinite grid (priority-2 `SceneOverlay`) renders correctly when the camera is zoomed out but disappears in patches when zoomed in. The fade radius is proportional to `length(cameraPosition)`, so the visible grid patch shrinks with zoom; when small enough to sit entirely within the main-scene silhouette, it depth-tests against stale / uninitialised canvas depth and fails the reversed-Z `GREATER` compare. WebGL is unaffected because the EffectComposer's framebuffer-blit step preserves canvas depth.

Resolution: revert the composite-quad `depthNode` wiring and restore the priority-2 `SceneOverlay` traverse + per-source-material cached `colorWrite=false` clone-swap depth pre-pass. Codified as rule 12 (now an anti-pattern + positive rule) of `docs/policy/webgpu-shader-and-pipeline-policy.md`.

## Problem Statement

Following the post-processing performance refactor documented in `docs/research/webgpu-post-processing-performance-audit.md`, users reported a new regression: the infinite grid in the WebGPU viewport renders correctly when the camera is zoomed out but disappears in patches when zoomed in. WebGL is unaffected.

The refactor's hypothesis was that wiring `post._quadMesh.material.depthNode = scenePassDepth.sample(screenUV)` would populate the canvas depth attachment as a side effect of the composite quad's draw, eliminating the need for the priority-2 `SceneOverlay` depth-restore pass. The visual regression refuted that hypothesis. This document captures the architectural root cause so future agents do not re-attempt the same shortcut.

## Methodology

Read-only source analysis of three.js r184:

- `node_modules/three/src/renderers/common/RenderPipeline.js` (`_update`, `render`, `_quadMesh` ownership)
- `node_modules/three/src/nodes/display/QuadMesh.js`
- `node_modules/three/src/renderers/common/Renderer.js` (canvas-bound render context, swap-chain depth attachment lifecycle)
- `node_modules/three/src/renderers/webgpu/WebGPUBackend.js`
- `node_modules/three/src/renderers/webgpu/utils/WebGPUTextureUtils.js`

Plus runtime symptom analysis correlating the grid's visibility with `length(cameraPosition) * uTauGridFadeRadius` against the main-scene bounding-box silhouette in screen space.

## Findings

### Finding 1: The composite quad targets the `RenderPipeline`'s internal render target, not the canvas

`RenderPipeline.render(scene, camera)` orchestrates its constituent passes (`PassNode`s, `outputNode` composite) against `RenderPipeline`-owned render targets. `_quadMesh` is the fullscreen composite the `outputNode` is bound to; `_update()` reassigns its `material.fragmentNode` from the user-supplied `outputNode` each frame, then `_quadMesh.render(renderer)` runs against the pipeline's internal target. Inside that internal pass:

- The colour output is the final RGBA the pipeline returns to the caller; the caller (Tau's priority-1 `useFrame`) does **not** then blit it back to the canvas — three.js's `WebGPUBackend` handles canvas presentation via the swap-chain at the renderer level, not the `RenderPipeline` level.
- The depth output (when `depthNode` is set) is consumed by **this internal pass's depth-stencil attachment**, not by the canvas's swap-chain depth-stencil attachment.

There is no code path in r184's `RenderPipeline._update` / `RenderPipeline.render` that copies the internal depth-stencil attachment to the canvas's swap-chain depth-stencil attachment after the composite quad draws.

### Finding 2: `gl.render(overlayScene, camera)` reads the canvas swap-chain depth attachment

`WebGPURenderer.render(scene, camera)` (`Renderer.js` → backend dispatch) issues a render pass whose colour attachment is the swap-chain texture and whose depth-stencil attachment is the renderer's canvas-bound depth texture. That depth attachment is a persistent texture (see `docs/research/webgpu-overlay-depth-attachment-persistence.md`) — its lifecycle is bounded by `loadOp: 'load' | 'clear'`, not by intermediate `RenderPipeline` runs.

Result: between the composite quad's draw (inside the `RenderPipeline`) and the priority-2 `gl.render(overlayScene, camera)`, the canvas depth attachment receives **no update** from the composite-quad's `depthNode` wiring. Whatever was last loaded into it is what the overlay scene depth-tests against.

### Finding 3: The zoom-dependent visibility is a function of grid fade radius vs. scene silhouette

The infinite-grid TSL material (`apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.node.ts`) fades the grid at `length(cameraPosition) * uTauGridFadeRadius` (approximately `0.2 * gridDistance`). When the camera is close to the model:

- `length(cameraPosition)` is small → fade radius is small → visible grid patch is small → patch lies entirely within the main-scene silhouette in screen space → patch fragments depth-test against stale canvas depth that holds (mostly) main-scene-geometry depth → reversed-Z `GREATER` fails → grid fragments are discarded → **grid disappears**.

When the camera is far from the model:

- `length(cameraPosition)` is large → fade radius is large → visible grid patch extends well beyond the main-scene silhouette → most of the patch lies over uninitialised / cleared canvas depth (effectively "far" under reversed-Z) → depth-test succeeds → **grid renders**.

This zoom-dependent symptom is consistent with Finding 1 + Finding 2: the canvas depth attachment is not being updated by the composite-quad path, so the overlay depth-tests against whatever depth happens to remain in the attachment.

### Finding 4: WebGL is unaffected because EffectComposer's framebuffer blit preserves canvas depth

Under WebGL, `EffectComposer` writes its final output into the canvas framebuffer via a `gl.blitFramebuffer` (or equivalent) that copies the colour attachment **and the depth-stencil attachment**. Subsequent `gl.render(overlayScene, camera)` calls then read the depth attachment that contains real geometry depth. WebGPU has no equivalent automatic depth-attachment bridge between intermediate render targets and the swap-chain — every render must explicitly populate the canvas depth attachment with `loadOp: 'load'` plus a real draw that writes depth.

## Architectural Implications

Canvas-depth bridging on the WebGPU path **must** be a property of a render that targets the canvas directly. Three options:

| Option                            | Mechanism                                                                                                                                                                                 | Verdict                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Explicit depth pre-pass**    | Priority-2 `SceneOverlay` runs `scene.traverse` + per-source-material cached `colorWrite=false` clone-swap, then `gl.render(scene, camera)` on the canvas before compositing the overlay. | **Adopted** — production code path. Costs one extra geometry traversal per frame but pipeline-cache friendly via clone-WeakMap.         |
| \*\*B. Composite-quad `depthNode` | `post._quadMesh.material.depthNode = scenePassDepth.sample(screenUV)`.                                                                                                                    | **Non-functional in r184** — see Findings 1 + 2. Do not attempt.                                                                        |
| \*\*C. Overlay-in-RenderPipeline  | Promote `SceneOverlay` to a TSL `pass()` node inside the post `RenderPipeline` so overlays share the depth attachment within the pipeline's internal target.                              | **Future work** — non-trivial refactor; tracked as R5 (now Open) in `docs/research/webgpu-override-material-vertex-binding-failure.md`. |

Option A is the only one viable today against three.js r184's public + private surface. Option C is the architecturally cleanest endgame but requires AO masking, overlay-vs-AO ordering, and TSL plumbing that we have not yet investigated.

## Recommendations

| #   | Action                                                                                                                                                                                                                    | Priority | Effort  | Impact                                                                            | Status                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Restore the priority-2 `SceneOverlay` traverse + cached `colorWrite=false` clone-swap depth pre-pass and drop the composite-quad `depthNode` wiring.                                                                      | P0       | Low     | High — fixes the visible regression                                               | **Resolved** — implemented in `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx` and `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx`. |
| R2  | Rewrite policy rule 12 in `docs/policy/webgpu-shader-and-pipeline-policy.md` as an anti-pattern (do **not** rely on `_quadMesh.material.depthNode`) plus a positive rule (overlay scenes own an explicit depth pre-pass). | P0       | Trivial | High — prevents regression                                                        | **Resolved**.                                                                                                                                                                     |
| R3  | Add a Playwright pixel-histogram regression guard that fails when the grid colour disappears from a rendered frame at a known camera pose.                                                                                | P1       | Low     | Medium — catches future C2-style regressions even without scriptable camera orbit | **Resolved** — extended `apps/ui-e2e/src/graphics-backend.spec.ts`.                                                                                                               |
| R4  | (Future) Investigate Option C — fold the overlay scene into the post `RenderPipeline` as a TSL `pass()` node so canvas-depth bridging is implicit within a single pipeline. Re-evaluates AO masking and overlay ordering. | P3       | High    | Medium — eliminates the extra depth pre-pass cost                                 | **Open** — tracked under R5 of `docs/research/webgpu-override-material-vertex-binding-failure.md`.                                                                                |
| R5  | (Future) File an upstream three.js feature request: documented API for routing a `RenderPipeline`'s composite-quad depth into the canvas swap-chain depth attachment, so consumers do not re-attempt this shortcut.       | P3       | Medium  | Medium — closes the documentation gap that surfaced this bug                      | **Open**.                                                                                                                                                                         |

## Trade-offs

| Trade-off                 | Cost of Option A                                | Cost of Option B (non-functional)                     | Cost of Option C                                       |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Per-frame work            | +1 geometry traversal (pipeline-cache friendly) | Hypothetically zero — but the path is silently broken | Single TSL pass; overlay materials may need AO masking |
| Implementation complexity | Low — already known to work                     | Trivial wiring but does not function                  | High — TSL refactor, AO masking, ordering              |
| Maintenance               | Documented in rule 12 + R1 of override-fix doc  | Anti-pattern in rule 12                               | Requires policy updates + new snapshot tests           |
| Visual correctness        | Verified across zoom levels                     | Fails at close zoom                                   | Pending C investigation                                |

## References

- three.js r184 source:
  - `node_modules/three/src/renderers/common/RenderPipeline.js` — composite quad's render-target ownership
  - `node_modules/three/src/nodes/display/QuadMesh.js` — `QuadMesh` lifecycle
  - `node_modules/three/src/renderers/common/Renderer.js` — canvas-bound render context, swap-chain handling
  - `node_modules/three/src/renderers/webgpu/WebGPUBackend.js` — depth-stencil attachment lifecycle
- Related Tau research:
  - `docs/research/webgpu-override-material-vertex-binding-failure.md` — R1 traverse + clone-swap is the restored production path
  - `docs/research/webgpu-post-processing-performance-audit.md` — R2 (now reverted) was the architectural mis-step that surfaced this finding
  - `docs/research/webgpu-overlay-depth-attachment-persistence.md` — canvas depth attachment as a persistent texture
- Tau policy:
  - `docs/policy/webgpu-shader-and-pipeline-policy.md` — rule 12 (rewritten anti-pattern + positive rule)
