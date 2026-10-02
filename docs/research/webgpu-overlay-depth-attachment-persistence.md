---
title: 'WebGPU Overlay Depth-Attachment Persistence vs WebGL Compositor-Clear'
description: 'Root cause of the WebGPU infinite-grid flicker: canvas depth attachment is persistent across frames, unlike WebGL where the browser compositor wipes it'
status: active
created: '2026-05-15'
updated: '2026-05-15'
category: investigation
related:
  - docs/policy/graphics-backend-policy.md
  - docs/research/webgpu-render-loop-audit.md
  - docs/research/webgpu-reversed-z-transparent-sort-inversion.md
---

# WebGPU Overlay Depth-Attachment Persistence vs WebGL Compositor-Clear

Root-cause investigation for the user-reported "WebGPU infinite grid flickers / disappears from certain camera angles; WebGL is stable" regression in the Tau CAD viewport.

## Executive Summary

The infinite grid lives in a separate overlay `THREE.Scene` rendered at R3F priority 2 by `SceneOverlayFrameLoop`. The hook sets `gl.autoClear = false` and runs a **depth-only restore pass** on the main scene to repopulate the canvas's depth attachment before drawing the overlay. Under WebGL this works because the browser compositor implicitly clears the WebGL drawing buffer's depth attachment to 1.0 between frames (WebGL spec, `preserveDrawingBuffer: false`). Under WebGPU the canvas depth attachment is a **persistent three.js-managed texture** — only the swapchain color is reacquired per frame — so `gl.autoClear = false` causes `loadOp: 'load'` to preserve last frame's depth values. Combined with **reversed-Z** (`depthCompare = GREATER`), stale "close" depth values silently block the depth-restore writes, and the grid then depth-tests against the lingering stale values and gets discarded wherever the camera _recently_ had foreground geometry.

Fix: explicitly clear depth + stencil at the start of the depth-restore pass while preserving color (post-processing already composited it). Implemented in `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`.

## Problem Statement

User report: the infinite grid renders reliably on the WebGL viewport but is "flakey" on WebGPU — sometimes missing entirely from certain camera angles, sometimes flickering across a partial screen region. Rotating the camera (in particular a 180-degree "down-to-up" flip) often "fixes" the missing grid. Disabling WebGPU and falling back to WebGL eliminates the problem.

This investigation isolates the smoking gun, explains why the symptom is camera-history-dependent, and proposes a minimal surgical fix.

## Methodology

Read-only source analysis across:

- `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`
- `apps/ui/app/components/geometry/graphics/three/post-processing.tsx`
- `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx`
- `apps/ui/app/components/geometry/graphics/three/renderer.ts`
- `apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.node.ts`
- `apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.ts`
- `node_modules/three/src/renderers/common/Renderer.js`
- `node_modules/three/src/renderers/common/Background.js`
- `node_modules/three/src/renderers/common/RenderPipeline.js`
- `node_modules/three/src/renderers/common/QuadMesh.js`

Plus the WebGL spec (drawing-buffer compositor clear semantics) and the WebGPU spec (swapchain texture lifecycle).

## Findings

### Finding 1: WebGL gets a free per-frame depth clear from the browser compositor

WebGL 1.0 spec §2.2:

> By default, after compositing the contents of the drawing buffer SHALL be cleared to their default values, as shown in the table below: COLOR_CLEAR_VALUE = (0, 0, 0, 0); DEPTH_CLEAR_VALUE = 1.0; STENCIL_CLEAR_VALUE = 0. This default behavior can be changed by setting the `preserveDrawingBuffer` attribute of the `WebGLContextAttributes` object.

Tau's viewport WebGL renderer (`apps/ui/app/components/geometry/graphics/three/renderer.ts:84-94`) does NOT set `preserveDrawingBuffer`, so the browser wipes both color and depth attachments between frames. `gl.autoClear = false` in `SceneOverlay` is then effectively "load a buffer that was just cleared by the platform" — equivalent to a clear.

### Finding 2: WebGPU's canvas depth attachment is persistent across frames

`three.js/src/renderers/common/Renderer.js:1461-1481` shows that the depth attachment of any render target — including the canvas — is initialized exactly once:

```ts
if (renderTarget !== null && renderTarget.depthBuffer === true) {
  const renderTargetData = this._textures.get(renderTarget);
  if (renderTargetData.depthInitialized !== true) {
    if (this.autoClear === false || (this.autoClear === true && this.autoClearDepth === false)) {
      this.clearDepth();
    }
    renderTargetData.depthInitialized = true;
  }
}
```

After `depthInitialized = true`, the depth texture survives indefinitely. Clears only happen when `Background.update()` (`three.js/src/renderers/common/Background.js:185-211`) decides to emit `loadOp: 'clear'` based on the renderer's `autoClear*` flags:

```ts
if (renderer.autoClear === true || forceClear === true) {
  // ...
  renderContext.clearColor = renderer.autoClearColor === true;
  renderContext.clearDepth = renderer.autoClearDepth === true;
  renderContext.clearStencil = renderer.autoClearStencil === true;
}
```

With `gl.autoClear = false`, all three booleans default to "preserve" (`loadOp: 'load'`) — previous-frame depth is explicitly carried forward.

Unlike WebGL, WebGPU has no browser-side compositor clear of the canvas depth attachment. The swapchain color texture is acquired fresh each frame, but the depth attachment three.js attaches to it is a stable texture object reused frame-to-frame.

### Finding 3: SceneOverlay's `gl.autoClear = false` strategy never re-clears depth

`apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx:20-40` (pre-fix):

```ts
useFrame((state) => {
  const { gl, scene, camera } = state;
  const previousAutoClear = gl.autoClear;
  gl.autoClear = false; // <-- depth never cleared

  const previousOverrideMaterial = scene.overrideMaterial;
  scene.overrideMaterial = depthOnlyMaterial;
  gl.render(scene, camera); // depth-only restore (loadOp = 'load')
  scene.overrideMaterial = previousOverrideMaterial;

  gl.render(overlayScene, camera); // grid + axes, depthTest against stale depth

  gl.autoClear = previousAutoClear;
}, 2);
```

Both `gl.render()` calls inherit the disabled auto-clear. Combined with Finding 2, the canvas depth attachment under WebGPU accumulates whatever depth values past frames wrote — and is never reset.

### Finding 4: Reversed-Z amplifies the stale-depth pathology

The viewport WebGPU renderer is configured with `reversedDepthBuffer: true` (`apps/ui/app/components/geometry/graphics/three/renderer.ts:55-61`). Under reversed-Z three.js maps the near plane to clip-z = 1 and the far plane to clip-z = 0; the depth compare is `GREATER` (closer = larger depth value). The depth-clear value flips to 0.

Failure sequence:

1. **Frame N**: model occupies pixel `P`. The depth-restore pass writes a HIGH depth value (close to 1, near the camera) at `P`.
2. **Camera moves; frame N+1**: pixel `P` is now empty — no current-frame geometry covers it. The depth-restore pass is depth-only on the main scene, so it never rasterizes at pixel `P`. The stale HIGH depth value from frame N persists.
3. **Grid pass at frame N+1**: the grid pixel at `P` has a LOWER reversed-Z value (it sits much farther from the camera than the previous frame's model). `GREATER` compare fails → the grid fragment is discarded.

A second-order failure compounds the first: even when geometry IS at pixel `P` in the new frame, if the new fragment's reversed-Z value is _less than_ the stale stored value, the depth-restore write itself fails (the override `MeshBasicMaterial` uses default `depthTest = true`, `depthWrite = true` and inherits the renderer-level GREATER compare under reversed-Z). The stale value persists across many frames.

### Finding 5: The bug requires post-processing enabled (the default)

`PostProcessingWebGpuActive` (`apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx:36-87`) drives a `RenderPipeline` at R3F priority 1. `RenderPipeline.render()` (`three.js/src/renderers/common/RenderPipeline.js:121-150`) renders into its own internal render targets, then composites to the canvas via a fullscreen `QuadMesh` pass (`three.js/src/renderers/common/QuadMesh.js:104-108`). The `QuadMesh` material is depth-disabled, so the canvas depth attachment is **never touched** by the post pipeline.

Under post-on WebGPU, only `SceneOverlay`'s depth-restore pass writes the canvas depth attachment — and it never clears it. Under post-off the priority-1 `MainSceneFallback` (`apps/ui/app/components/geometry/graphics/three/post-processing.tsx:14-19`) calls `gl.render(scene, camera)` with default `autoClear = true`, which clears depth at the start of every frame; the bug does not manifest.

This matches the user's symptom: the default viewer configuration ships post-on, so the bug surfaces in normal usage.

### Finding 6: Symptom narrative maps cleanly to the failure model

| User-reported symptom                      | Failure-model prediction                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grid missing from certain camera angles    | Pixels where the camera _recently_ had foreground geometry retain "close" stale depth values — grid fails GREATER compare there                                   |
| "Flakey" rendering, partial-screen regions | Stale depth follows the camera's silhouette history, leaving angular dead zones in the grid                                                                       |
| Moving the camera fixes it                 | Camera motion brings new geometry into the previously-stale pixels, eventually overwriting them with consistent depth; flipping 180° clears the silhouette region |
| Disabling post-processing fixes it         | Priority-1 `MainSceneFallback` calls `gl.render(scene, camera)` with default `autoClear = true` — depth is reset per frame                                        |
| WebGL never shows the bug                  | Browser compositor clears the WebGL drawing buffer depth attachment between frames (Finding 1)                                                                    |

## Fix

Edit `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx` `SceneOverlayFrameLoop` to clear **depth + stencil** before the depth-restore pass while preserving **color** (the post-processing output already lives on the canvas):

```ts
useFrame((state) => {
  const { gl, scene, camera } = state;

  const previousAutoClear = gl.autoClear;
  const previousAutoClearColor = gl.autoClearColor;
  const previousAutoClearDepth = gl.autoClearDepth;
  const previousAutoClearStencil = gl.autoClearStencil;

  // Depth-restore pass: clear depth + stencil, preserve color (post output).
  gl.autoClear = true;
  gl.autoClearColor = false;
  gl.autoClearDepth = true;
  gl.autoClearStencil = true;

  const previousOverrideMaterial = scene.overrideMaterial;
  scene.overrideMaterial = depthOnlyMaterial;
  gl.render(scene, camera);
  scene.overrideMaterial = previousOverrideMaterial;

  // Overlay pass: preserve everything (depth was just written, color stays).
  gl.autoClear = false;
  gl.render(overlayScene, camera);

  gl.autoClear = previousAutoClear;
  gl.autoClearColor = previousAutoClearColor;
  gl.autoClearDepth = previousAutoClearDepth;
  gl.autoClearStencil = previousAutoClearStencil;
}, 2);
```

Properties of this fix:

- **Backend-symmetric.** WebGL keeps its existing implicit-clear behaviour (the explicit clear is redundant but harmless); WebGPU now matches it explicitly. Both backends now traverse the same intent-level pipeline.
- **Reversed-Z aware.** `Renderer.getClearDepth()` (`three.js/src/renderers/common/Renderer.js:2207-2210`) returns `1 - this._clearDepth` when `reversedDepthBuffer === true`, so the depth clear value automatically adapts to 0 (far plane) on the viewport renderer.
- **Surgical.** One file, ~15 lines. No new material types, no render-graph refactor.
- **No perf regression.** One extra depth-attachment clear per frame; depth-only clears are tile-cache fast paths on tile-based GPUs and effectively free on desktop discretes.

## Recommendations

| #   | Action                                                                                                                                                                                   | Priority | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Apply the depth-clear fix in `SceneOverlayFrameLoop` (above).                                                                                                                            | P0       | Low    | High   |
| R2  | Capture this lifecycle asymmetry in `learned-graphics-stack.mdc` so the next overlay/post-pipeline author doesn't re-discover it.                                                        | P1       | Low    | Medium |
| R3  | (Future) Consider promoting `SceneOverlay` to a TSL `pass()` node in `RenderPipeline` so overlays share the post pipeline's render-graph and avoid manual `gl.render` plumbing entirely. | P3       | High   | Medium |

## Trade-offs

Alternatives evaluated:

| Option                                                  | Pros                                                 | Cons                                                                                                                      | Verdict  |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Explicit depth+stencil clear in `SceneOverlay` (chosen) | Surgical, backend-symmetric, no architectural change | Adds one clear per frame (negligible)                                                                                     | Adopted  |
| Promote `SceneOverlay` to a `RenderPipeline` pass       | Single render graph, no manual `gl.render`           | Couples grid/axes to post stack; AO would have to be masked off overlays; large refactor                                  | Deferred |
| Move overlay to a separate DOM canvas                   | Zero depth-restore needed                            | Loses depth-correct occlusion of the grid by foreground geometry (the CAD grid-through-surface effect breaks)             | Rejected |
| Sample main-scene depth texture in the grid shader      | Single composite pass                                | Invasive depth-MRT plumbing through `RenderPipeline`, fragile across backends, ties grid implementation to the post graph | Rejected |
| Disable `reversedDepthBuffer` on the viewport           | Bug goes away under standard depth compare           | Loses GTAO precision benefit (the whole reason reversed-Z was adopted); regression on close geometry precision            | Rejected |

## References

- WebGL 1.0 spec §2.2 — drawing-buffer compositor clear semantics: https://www.khronos.org/registry/webgl/specs/latest/1.0/
- WebGPU spec — `GPUCanvasContext` swapchain texture lifecycle: https://www.w3.org/TR/webgpu/#canvas-rendering
- Three.js r18x source:
  - `node_modules/three/src/renderers/common/Renderer.js:1461-1481` (`depthInitialized` one-shot clear)
  - `node_modules/three/src/renderers/common/Renderer.js:2207-2219` (reversed-Z `getClearDepth`)
  - `node_modules/three/src/renderers/common/Background.js:185-211` (`autoClear*` → render-pass `loadOp`)
  - `node_modules/three/src/renderers/common/RenderPipeline.js:121-150` (post pipeline composite path)
  - `node_modules/three/src/renderers/common/QuadMesh.js:104-108` (fullscreen quad render — no depth write)
- Related Tau research:
  - `docs/research/webgpu-render-loop-audit.md` (R3F priority counting, SceneOverlay render ownership)
  - `docs/research/webgpu-reversed-z-transparent-sort-inversion.md` (reversed-Z transparent-sort fix)
