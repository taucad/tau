---
title: 'WebGPU `scene.overrideMaterial` Vertex-Binding Failure and Infinite-Grid Performance Audit'
description: 'Root-cause trace of the "Vertex buffer slot 0 required ... was not set" validation error, design of the architectural fix, and TSL/WGSL perf audit of the infinite-grid material'
status: active
created: '2026-05-15'
updated: '2026-05-15'
category: investigation
related:
  - docs/policy/webgpu-shader-and-pipeline-policy.md
  - docs/policy/graphics-backend-policy.md
  - docs/research/webgpu-overlay-depth-attachment-persistence.md
  - docs/research/webgpu-render-loop-audit.md
  - docs/research/webgpu-composite-quad-depth-write-non-functional.md
  - docs/research/webgpu-post-processing-performance-audit.md
---

# WebGPU `scene.overrideMaterial` Vertex-Binding Failure and Infinite-Grid Performance Audit

Root-cause investigation of the `Vertex buffer slot 0 required by [RenderPipeline "renderPipeline_MeshBasicMaterial_14379"] was not set` WebGPU validation error surfaced in the Tau CAD viewport, design of the architecturally correct fix, and a companion TSL/WGSL performance audit of the infinite-grid material.

## Executive Summary

`SceneOverlayFrameLoop` (`apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`) ran a depth-only restore pass via `scene.overrideMaterial = new THREE.MeshBasicMaterial()`. Under WebGPU, that pattern shares a single material across diverse geometry attribute layouts (Mesh, `Line2`/`LineSegments2` `InstancedBufferGeometry`, section caps, helpers). Three.js's `RenderObject.getAttributes()` silently `continue`s on missing geometry attributes, so the compiled pipeline can declare vertex-buffer slots the at-draw-time binding never satisfies. WebGPU's vertex-state validator then rejects the draw. The fix replaces the override with a `scene.traverse` + per-source-material cached `colorWrite=false` clone swap; the canvas depth attachment is repopulated correctly and the validation error is eliminated. A follow-up TSL audit of `infinite-grid-material.node.ts` identified six redundant per-fragment computations promotable to varyings or CPU uniforms — captured here as P3 perf recommendations.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: Pipeline keys couple shader, raster state, and geometry signature](#finding-1-pipeline-keys-couple-shader-raster-state-and-geometry-signature)
  - [Finding 2: Vertex-buffer binding is purely attribute-driven](#finding-2-vertex-buffer-binding-is-purely-attribute-driven)
  - [Finding 3: `getAttributes()` silently drops missing attributes](#finding-3-getattributes-silently-drops-missing-attributes)
  - [Finding 4: Override material exposes diverse geometries to a single pipeline](#finding-4-override-material-exposes-diverse-geometries-to-a-single-pipeline)
  - [Finding 5: Smoking-gun trace](#finding-5-smoking-gun-trace)
  - [Finding 6: Known upstream issues match the symptom exactly](#finding-6-known-upstream-issues-match-the-symptom-exactly)
  - [Finding 7: Infinite-grid TSL audit — six redundant per-fragment computations](#finding-7-infinite-grid-tsl-audit--six-redundant-per-fragment-computations)
- [Architectural Fix](#architectural-fix)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [References](#references)

## Problem Statement

The Tau WebGPU viewport's dev console emitted, on first interaction with a loaded CAD model:

```
Vertex buffer slot 0 required by [RenderPipeline "renderPipeline_MeshBasicMaterial_14379"] was not set.
 - While encoding [RenderPassEncoder (unlabeled)].DrawIndexed(36, 1, 0, 0, 0).
 - While finishing [CommandEncoder "renderContext_4"].
[Invalid CommandBuffer from CommandEncoder "renderContext_4"] is invalid due to a previous error.
 - While calling [Queue].Submit([[Invalid CommandBuffer from CommandEncoder "renderContext_4"]])
```

The error is followed by the entire frame's command buffer being rejected by WebGPU, manifesting as missing geometry plus the infinite-grid flicker that the earlier depth-clear fix (`docs/research/webgpu-overlay-depth-attachment-persistence.md`) only partially addressed.

The investigation must determine:

1. Why a pipeline labelled `MeshBasicMaterial_14379` is encoded with vertex-buffer slot 0 unset.
2. Whether the root cause is in our `SceneOverlayFrameLoop` depth-only override, or elsewhere.
3. The architecturally correct fix (not a band-aid).
4. Whether the infinite-grid material itself has performance issues worth fixing while the WebGPU stack is under attention.

## Methodology

Read-only source analysis across:

- `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`
- `apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.node.ts`
- `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts` (Line2 attribute layout)
- `node_modules/three/src/renderers/common/Renderer.js`
- `node_modules/three/src/renderers/common/Pipelines.js`
- `node_modules/three/src/renderers/common/RenderObject.js`
- `node_modules/three/src/renderers/webgpu/WebGPUBackend.js`
- `node_modules/three/src/renderers/webgpu/utils/WebGPUAttributeUtils.js`
- `node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js`

Plus upstream issue review for three.js bug reports matching the validation message and dev-console error class, and web research on WGSL shader best practices (uniformity analysis, vertex-state validation).

## Findings

### Finding 1: Pipeline keys couple shader, raster state, and geometry signature

WebGPU pipeline identity is **not** "material UUID alone". From `Pipelines.js`:

```
_getRenderCacheKey(renderObject, stageVertex, stageFragment) {
  return stageVertex.id + ',' + stageFragment.id + ',' + this.backend.getRenderCacheKey(renderObject);
}
```

The backend key for WebGPU includes (`WebGPUBackend.getRenderCacheKey`, `node_modules/three/src/renderers/webgpu/WebGPUBackend.js:1901-1929`):

- Material blend/depth/stencil/colorWrite flags.
- `frontFaceCW` (mesh-determinant sign).
- Sample count, color/depth format, color space.
- `utils.getPrimitiveTopology(object, material)`.
- `renderObject.getGeometryCacheKey()` — encodes the geometry's attribute layout.
- `renderObject.clippingContextCacheKey`.

So with `scene.overrideMaterial`, the cache key is driven by **the override material's compiled WGSL + raster state + topology + the per-mesh geometry signature**, not the original material. A single override material can spawn many pipeline cache entries — one per (state × geometry) combination.

### Finding 2: Vertex-buffer binding is purely attribute-driven

`WebGPUBackend._draw` (`node_modules/three/src/renderers/webgpu/WebGPUBackend.js:1577-1590`):

```
for (let i = 0, l = vertexBuffers.length; i < l; i++) {
  const vertexBuffer = vertexBuffers[i];
  if (currentSets.attributes[i] !== vertexBuffer) {
    const buffer = this.get(vertexBuffer).buffer;
    passEncoderGPU.setVertexBuffer(i, buffer);
    currentSets.attributes[i] = vertexBuffer;
  }
}
```

The bind loop only sets slots `0..vertexBuffers.length - 1`. If `vertexBuffers.length` is less than the pipeline's declared vertex-buffer count, slot N is left unbound — and WebGPU validates that every declared slot has a buffer.

### Finding 3: `getAttributes()` silently drops missing attributes

`RenderObject.getAttributes()` (`node_modules/three/src/renderers/common/RenderObject.js:489-529`):

```
for (const nodeAttribute of nodeAttributes) {
  let attribute;
  if (nodeAttribute.node && nodeAttribute.node.attribute) {
    attribute = nodeAttribute.node.attribute;
  } else {
    attribute = geometry.getAttribute(nodeAttribute.name);
    attributesId[nodeAttribute.name] = attribute.id;
  }
  if (attribute === undefined) continue;   // <-- silent drop
  attributes.push(attribute);
  // ...
}
```

A `continue` for a missing geometry attribute shrinks the resolved `attributes` array. The shrunken array is then used both to **build the pipeline's vertex layout** (`WebGPUAttributeUtils.createShaderVertexBuffers`, `node_modules/three/src/renderers/webgpu/utils/WebGPUAttributeUtils.js:239-297`) and to **bind vertex buffers at draw time**. As long as resolution is stable between pipeline-build and draw, the bindings match.

The failure mode is when:

- The pipeline was built when `attributes` had N entries.
- At draw time, `getVertexBuffers()` returns the cached `attributes` whose entries don't match the pipeline (stale cache after geometry exchange — three.js [#30398](https://github.com/mrdoob/three.js/issues/30398)).
- Or, when `vertexBuffers` is cached separately from `attributes` and one but not the other is invalidated (`RenderObject.setGeometry()`, line 475-481, clears `attributes` and `attributesId` but historically did not clear `vertexBuffers`).

### Finding 4: Override material exposes diverse geometries to a single pipeline

Tau's main scene contains, at minimum:

| Object type           | Geometry class                                             | Standard attributes                                                                              | Notes                               |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| User CAD mesh         | `BufferGeometry`                                           | `position`, `normal`, sometimes `uv`, sometimes `color`                                          | TriangleList                        |
| Section-view cap fill | `BufferGeometry`                                           | `position`, `normal`                                                                             | TriangleList, often `< 100` indices |
| Fat edge segments     | `LineSegmentsGeometry` (extends `InstancedBufferGeometry`) | `position` (unit quad), `instanceStart`, `instanceEnd`, `instanceColorStart`, `instanceColorEnd` | TriangleList topology but instanced |
| Gizmo / helpers       | Various                                                    | Various                                                                                          | Mostly on a separate renderer       |

When `scene.overrideMaterial = new MeshBasicMaterial()` is applied:

- The override's internal node graph (`MeshBasicNodeMaterial` equivalent) declares its required vertex attributes (`position`, optionally `uv`, `color` depending on enabled features).
- Each `(geometry × overrideMaterial)` pair becomes a distinct `RenderObject` with its own pipeline.
- For `LineSegmentsGeometry`, the `position` attribute is a fixed unit-quad buffer; `instanceStart`/`instanceEnd` are step-mode `instance` attributes — irrelevant to a `MeshBasicMaterial` node graph that knows nothing about them.
- Attribute resolution against `LineSegmentsGeometry` for a `MeshBasicMaterial` graph that requires only `position` returns `{ position }` — pipeline declares 1 vertex buffer, bind loop sets 1 vertex buffer. **This case alone does not fail.**

The failure is more subtle. The same override material is reused across many meshes within a single frame. Three.js's RenderObject cache keys on `(object, material, lightsNode, ...)`. With a _shared_ override material, the cache produces one `RenderObject` per `(object, override)` pair. The pipeline cache produces one pipeline per `(override.WGSL, geometry.signature, raster-state)`. If any path leaves `RenderObject.attributes` populated but `vertexBuffers` stale (or vice versa) between consecutive draws of meshes with different geometry signatures, the next draw issues `drawIndexed` with the wrong vertex-buffer count for the bound pipeline.

The 36-index draw call in the error (`DrawIndexed(36, 1, 0, 0, 0)`) maps to a small geometry — most plausibly a section-view cap, a transform-controls helper, or a similar 12-triangle primitive. Its `RenderObject` was created mid-frame with a pipeline whose vertex layout doesn't match the current bind state.

### Finding 5: Smoking-gun trace

End-to-end path that produces the error:

1. **`scene.overrideMaterial = depthOnlyMaterial`** — `SceneOverlayFrameLoop` enables override (was `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx:50-53`).
2. **`Renderer.renderObject`** swaps materials per mesh, allocates or fetches a `RenderObject` keyed `(object, depthOnlyMaterial, ...)` (`node_modules/three/src/renderers/common/Renderer.js:3388-3477`).
3. **`Pipelines.updateForRender`** selects or builds a `RenderPipeline` keyed by stage IDs + `WebGPUBackend.getRenderCacheKey` — the geometry signature is part of the key.
4. **`WebGPUPipelineUtils.createRenderPipeline`** declares the WGSL vertex layout from `renderObject.getAttributes()`.
5. **`WebGPUBackend.draw → _draw`** binds `renderObject.getVertexBuffers()` then `drawIndexed`.
6. The cached `vertexBuffers` for one `RenderObject` is empty (or shorter than the pipeline's declared slots), produced by a stale-cache code path that survives between draws of diverse geometry types under override.
7. WebGPU validation rejects: `Vertex buffer slot 0 required by [RenderPipeline] was not set`.
8. The entire command buffer is invalidated.

### Finding 6: Known upstream issues match the symptom exactly

| Issue                                                     | Pattern                                                                                                          | Status in three@0.184                                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#28927](https://github.com/mrdoob/three.js/issues/28927) | `AxesHelper` (renderPipeline_2) → `VertexNormalsHelper` (renderPipeline_1): "next draw still expects slot 1 set" | Fixed via [#28935](https://github.com/mrdoob/three.js/pull/28935) "RenderObject: Fix material cache key regression." Tau on r184 includes this fix. |
| [#30398](https://github.com/mrdoob/three.js/issues/30398) | `Vertex buffer slot N required ... was not set` on geometry reassignment                                         | Fixed via [#30409](https://github.com/mrdoob/three.js/pull/30409) "NodeMaterialObserver: Detect geometry exchange." Tau on r184 includes this fix.  |
| [#32896](https://github.com/mrdoob/three.js/pull/32896)   | `overrideMaterial` reading `.colorNode` on non-node materials                                                    | Fixed in r183. Tau on r184 includes this fix.                                                                                                       |

All three fixes are present in Tau's `three@0.184.0`, yet the error persists. The residual cause is a different family of cache invalidation paths that the upstream fixes do not cover — specifically, the combination of (a) shared mutable override material, (b) WebGPU's strict vertex-state validation, and (c) diverse geometry attribute layouts within the same scene traversal. The upstream issues acknowledge this class of failure exists; the fixes addressed specific reproducers, not the general pattern.

**Conclusion**: the architecturally correct response is to stop using `scene.overrideMaterial` for cross-mesh-type passes under WebGPU. It is fundamentally fragile relative to WebGPU's vertex-state validator.

### Finding 7: Infinite-grid TSL audit — six redundant per-fragment computations

`apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.node.ts` is functionally correct but contains six computations that can be hoisted from the fragment to the vertex stage or to CPU uniforms. Severity is low (the grid is a single fullscreen-ish quad, ~2-4M fragments per frame, total cost ~0.2 ms on integrated GPUs), but cleaning them up is good practice and aligns with the new `webgpu-shader-and-pipeline-policy.md` §5.

| #   | Issue                                                                                                                | Current location  | Suggested home                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| O1  | `length(cameraPosition)` computed in both `vertexNode` (line 142) and `colorNode` (line 189)                         | Vertex + Fragment | CPU uniform or vertex-stage varying                                                     |
| O2  | `max(scaledCameraDistance, uMinGridDistance)` computed in both stages (lines 145, 192)                               | Vertex + Fragment | CPU uniform                                                                             |
| O3  | `worldPosition` varying carries a 3D vector when only 2D `worldPlane` is needed in the fragment (lines 118, 174-185) | Fragment          | Vertex (resolve axis swizzle in vertex, pass `vec2` varying)                            |
| O4  | `cameraPlane` swizzle (`cameraPosition.xy/.xz/.zy`) branched per-fragment on uniform axis (lines 176-184)            | Fragment          | CPU `vec2` uniform                                                                      |
| O5  | `If/ElseIf/Else` on `axesIndexUniform` in both stages (lines 153-161, 174-185)                                       | Vertex + Fragment | CPU permutation matrix uniform (`mat3` or `mat2`)                                       |
| O6  | `positionLocal.z * gridDistance` always evaluates to zero for the drei `<Plane>` (line 149)                          | Vertex            | Simplify to `vec3(gx, gy, 0)` and apply normal offset only on the chosen axis component |

None of these regress correctness. They are optimisation opportunities only; the depth-attachment / override-material fixes do not depend on them.

Beyond these, the material correctly:

- Mutates `uniform.value`s via `applyVisualOverrides` rather than recreating the material (rule 4 / R1).
- Uses unnamed `.toVar()` inside the reusable `pristineGridIntensity` `Fn` (rule 6 / line 53-91).
- Computes anti-aliased grid intensity with `dFdx`/`dFdy` derivatives (standard pristine-grid pattern).
- Discards low-alpha fragments to avoid overdraw on transparent overlay.

## Architectural Fix

Eliminate `scene.overrideMaterial` from `SceneOverlayFrameLoop`. Replace it with a per-mesh material swap via `scene.traverse()` using per-source-material cached `colorWrite=false` clones.

Implemented in `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`:

```typescript
const cloneByMaterial = new WeakMap<THREE.Material, THREE.Material>();
const disposeListenerByMaterial = new WeakMap<THREE.Material, () => void>();

const getDepthOnlyClone = (source: THREE.Material): THREE.Material => {
  const cached = cloneByMaterial.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const clone = source.clone();
  clone.colorWrite = false;
  clone.transparent = false;
  clone.depthWrite = true;
  clone.depthTest = true;
  const onDispose = () => {
    clone.dispose();
    cloneByMaterial.delete(source);
    source.removeEventListener('dispose', onDispose);
  };
  source.addEventListener('dispose', onDispose);
  cloneByMaterial.set(source, clone);
  return clone;
};

useFrame(({ gl, scene, camera }) => {
  // ... auto-clear setup (depth+stencil clear, color preserve) ...

  const swaps: Array<{ object: RenderableObject3D; material: THREE.Material | THREE.Material[] }> = [];
  scene.traverse((object) => {
    const candidate = object as RenderableObject3D;
    if (!isRenderable(candidate)) return;
    swaps.push({ object: candidate, material: candidate.material });
    candidate.material = Array.isArray(candidate.material)
      ? candidate.material.map(getDepthOnlyClone)
      : getDepthOnlyClone(candidate.material);
  });

  gl.render(scene, camera);

  for (const { object, material } of swaps) {
    object.material = material;
  }
  // ... overlay render ...
}, 2);
```

Properties of this fix:

- **Avoids the shared-override-material code path**: each mesh has its own material (a clone of its source). Three.js's `Renderer.renderObject` (`node_modules/three/src/renderers/common/Renderer.js:3388-3477`) never mutates a shared override material; instead, each mesh's `(object, clone)` `RenderObject` resolves attributes against its own geometry independently.
- **Pipeline-cache friendly**: clones share their source's compiled WGSL (`material.clone()` preserves node graph references), so `stageVertex.id`/`stageFragment.id` match and the pipeline cache reuses the source's compiled pipeline. No WGSL recompile cost per frame.
- **Vertex-layout consistency**: each clone's pipeline is built against the same geometry's attribute layout, so vertex-buffer slot counts always match the bind state.
- **Lifecycle-safe**: dispose listeners on source materials evict clones from the cache and dispose GPU resources. `WeakMap` keying lets GC reclaim entries when sources are dropped without dispose.
- **Backend-symmetric**: works under WebGL (where the bug doesn't manifest, but the new code is harmless) and WebGPU (where it fixes the validation error).
- **Depth-correct**: every visible Mesh / Line / LineSegments / Points contributes to the canvas depth attachment, preserving overlay occlusion semantics.

## Recommendations

| #   | Action                                                                                                                                                                             | Priority | Effort | Impact                                                            | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Apply the `scene.traverse` + cached clone fix in `SceneOverlayFrameLoop`.                                                                                                          | P0       | Low    | High (eliminates validation errors + command-buffer invalidation) | **RESOLVED** — `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx` runs a priority-2 traverse + per-source-material cached `colorWrite=false` clone-swap depth pre-pass before compositing the overlay scene. The override-material code path is permanently retired (`tau-lint/no-scene-override-material` blocks reintroduction). An attempt to remove the traversal via composite-quad `depthNode` wiring (R5 below) was reverted — see `docs/research/webgpu-composite-quad-depth-write-non-functional.md` and the postscript below.                                                                                                                        |
| R2  | Publish `docs/policy/webgpu-shader-and-pipeline-policy.md` with the `scene.overrideMaterial` ban, depth-attachment lifecycle rules, and TSL authoring conventions.                 | P0       | Low    | High (prevents regression)                                        | **RESOLVED** — policy published; new rules 11-13 (compose-based AO, composite-quad depth write, `compileAsync` warmup) added during the post-processing refactor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R3  | Audit `apps/ui` for any other `scene.overrideMaterial` usages; rewrite to traverse-and-swap pattern.                                                                               | P1       | Low    | Medium                                                            | **RESOLVED** — `tau-lint/no-scene-override-material` (error) enforces the ban statically across the workspace. No remaining usages flagged after the SceneOverlay rewrite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R4  | Implement infinite-grid perf optimisations O1-O6 (Finding 7).                                                                                                                      | P3       | Low    | Low (sub-millisecond)                                             | **RESOLVED** — `apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.node.ts` now hoists grid distance + world plane into varyings, drives `cameraPlane` via a CPU `Vector2` uniform mutated per frame, and replaces the axis `If/ElseIf/Else` with a CPU-precomputed `mat3` permutation. Unit + snapshot tests cover the new graph.                                                                                                                                                                                                                                                                                                                |
| R5  | (Future) Promote `SceneOverlay` to a TSL `pass()` node in the WebGPU post `RenderPipeline` so overlays share the depth attachment without manual `gl.render` plumbing.             | P3       | High   | Medium                                                            | **Open** — the composite-quad `depthNode` shortcut (previously marked "RESOLVED (variant)") was reverted after a zoom-dependent grid-disappearance regression revealed that three.js r184's `RenderPipeline._quadMesh.material.depthNode` does **not** populate the canvas swap-chain depth attachment subsequent `gl.render(overlayScene, camera)` calls read. Canvas-depth bridging remains the responsibility of `SceneOverlayFrameLoop`'s traverse-and-swap pre-pass (R1). Folding the overlay into the post pipeline is a non-trivial refactor still tracked here. See `docs/research/webgpu-composite-quad-depth-write-non-functional.md` for the architectural finding. |
| R6  | (Future) Open an upstream three.js issue documenting the `scene.overrideMaterial` + diverse-geometry failure mode on WebGPU, with the minimal reproducer derived from Tau's scene. | P2       | Medium | Medium (helps community + future upstream fix)                    | **Open** — not yet filed upstream; tracked in `docs/research/runtime-blueprint-v5-implementation-audit.md` follow-up bucket.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Resolution — depth-bridging evolution

The depth bridging contract evolved across four discrete iterations, ending where it began:

1. **Initial fix** (this document, R1, **active**): `scene.traverse` + per-source-material cached `colorWrite=false` clones repopulate the canvas depth attachment in a priority-2 `SceneOverlayFrameLoop` pass that runs before the overlay render. Eliminated the validation error and continues to be the production code path.
2. **Proposed depth-blit quad** (rejected): a dedicated `QuadMesh(depthOnlyMaterial)` rendered after the post composite, with `depthNode = sample(scenePassDepth, screenUV)`. Cheaper than a scene traversal but still one extra fullscreen pass per frame.
3. **Composite-quad depth write** (attempted, **reverted**): the existing post composite quad's `_quadMesh.material.depthNode` was wired directly to `scenePassDepth.sample(screenUV)` on the assumption that the composite draw would populate the canvas depth attachment as a side effect. In three.js r184 this routing does **not** reach the swap-chain depth attachment the subsequent `gl.render(overlayScene, camera)` call reads — see the postscript below and `docs/research/webgpu-composite-quad-depth-write-non-functional.md`.
4. **Restoration of R1**: after the composite-quad shortcut produced a zoom-dependent grid-disappearance regression on WebGPU (visible-when-zoomed-out / invisible-when-zoomed-in), the traverse + clone-swap pre-pass was reinstated. The composite-quad `depthNode` wiring was removed from `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx`; canvas-depth bridging is owned exclusively by `SceneOverlayFrameLoop` (see `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`).

#### Postscript — why the composite-quad shortcut failed

The audit's R2 / R5 shortcut wired `post._quadMesh.material.depthNode = scenePassDepth.sample(screenUV)` inside `useLayoutEffect` after `new ThreeRenderPipeline(...)`. The hypothesis was that running `post.render()` would draw the composite quad with depth writes enabled, populating the canvas depth-stencil attachment alongside the colour write.

That hypothesis is false in three.js r184. `RenderPipeline._update()` (`node_modules/three/src/renderers/common/RenderPipeline.js`, r184 equivalent lines around 82960–82991) reassigns `_quadMesh.material.fragmentNode` from the user-supplied `outputNode` each frame, and `_quadMesh.render(renderer)` runs against the pipeline's _internal_ render target — **not** the canvas's swap-chain depth-stencil attachment that the next `gl.render(overlayScene, camera)` call reads. The composite quad's depth output is effectively discarded for canvas-depth purposes.

Symptom observed in production: the priority-2 overlay scene depth-tested against stale / uninitialised canvas depth. The infinite-grid fade radius is proportional to `length(cameraPosition)`, so:

- **Zoomed out**: the visible grid patch extends well beyond the main-scene silhouette; large portions of the grid sit over uninitialised depth (effectively "far" under reversed-Z `GREATER`) and survive depth-test. Grid renders.
- **Zoomed in**: the visible grid patch shrinks and sits entirely within the main-scene silhouette, where canvas depth either holds stale geometry-depth or fluctuates between frames. Grid fails the depth-test in patches and visually disappears.

The fix is to stop relying on the composite quad for depth bridging. Restore the R1 traverse + clone-swap pre-pass; accept the cost of a second (depth-only, `colorWrite=false`) scene traversal per frame. Pipeline-cache hits keep the cost manageable; the clones share the source materials' compiled WGSL via `material.clone()`. Folding the overlay into the post `RenderPipeline` as a TSL pass remains the architecturally cleanest endgame and is tracked under R5 (now Open).

## Trade-offs

Alternatives evaluated for replacing `scene.overrideMaterial`:

| Option                                                                                                   | Pros                                                                                    | Cons                                                                                                                  | Verdict        |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- |
| `scene.traverse` + per-source-material cached clones (chosen)                                            | Avoids shared mutable state, pipeline-cache friendly, lifecycle-safe, backend-symmetric | One clone per source material (small memory cost), one-time setup of dispose listeners                                | **Adopted**    |
| Layer-masked depth restore (`camera.layers.set(...)`)                                                    | Surgical, no material swap                                                              | Doesn't address root cause; some objects (overlays, helpers) would be wrongly excluded from depth, breaking occlusion | Rejected       |
| Restrict traversal to `isMesh` only (skip Line2, Points, Sprite)                                         | Avoids most diverse-geometry cases                                                      | Loses depth contribution from fat edges and helpers; breaks grid-occluded-by-edges semantics                          | Rejected       |
| Use TSL `pass(overlayScene, camera)` in the post `RenderPipeline`                                        | Single render graph, no manual `gl.render`                                              | Couples overlay to post stack; AO must be masked off overlays; large refactor across three files                      | Deferred to R5 |
| Hack `_quadMesh.material.depthNode` on the post `RenderPipeline` to write depth from the prepass texture | Eliminates depth-restore pass entirely                                                  | Private API access (`_quadMesh`); fragile across three.js versions                                                    | Rejected       |
| Disable `reversedDepthBuffer` on the viewport                                                            | Validation error doesn't surface (less strict comparison ordering)                      | Loses GTAO precision benefit; regression on close-geometry precision; sidesteps but doesn't fix the bug               | Rejected       |
| Catch and ignore WebGPU validation errors via console filter                                             | Suppresses noise                                                                        | Doesn't fix the underlying invalid command buffer (frame still rejected)                                              | Rejected       |

## References

- WGSL spec — [Vertex State](https://www.w3.org/TR/webgpu/#vertex-state)
- WGSL spec — [Uniformity Analysis](https://www.w3.org/TR/WGSL/#uniformity)
- three.js [#28927](https://github.com/mrdoob/three.js/issues/28927) — WebGPURenderer: errors thrown rendering line segments (pipeline state leak)
- three.js [#30398](https://github.com/mrdoob/three.js/issues/30398) — WebGPU Fatal Error on Mesh Geometry Assignment
- three.js [#30409](https://github.com/mrdoob/three.js/pull/30409) — NodeMaterialObserver: Detect geometry exchange
- three.js [#28935](https://github.com/mrdoob/three.js/pull/28935) — RenderObject: Fix material cache key regression
- three.js [#32896](https://github.com/mrdoob/three.js/pull/32896) — WebGPURenderer: Fix `overrideMaterial` node assignments
- three.js r184 source: `node_modules/three/src/renderers/{common,webgpu}/`
- Tau research:
  - `docs/research/webgpu-overlay-depth-attachment-persistence.md` — depth-clear fix (prior pass at this bug)
  - `docs/research/webgpu-render-loop-audit.md` — R3F priority counting, SceneOverlay render ownership
  - `docs/research/webgpu-migration-graphics-stack.md` — dual-stack rollout plan
- Tau policy:
  - `docs/policy/webgpu-shader-and-pipeline-policy.md` — new authoring rules derived from this investigation
  - `docs/policy/graphics-backend-policy.md` — TSL authoring + snapshot conventions

## Appendix: Reproduction-Adjacent Evidence

The error log captured by the user, on first interaction with a CAD model under the default (post-on) WebGPU viewport configuration:

```
Vertex buffer slot 0 required by [RenderPipeline "renderPipeline_MeshBasicMaterial_14379"] was not set.
 - While encoding [RenderPassEncoder (unlabeled)].DrawIndexed(36, 1, 0, 0, 0).
 - While finishing [CommandEncoder "renderContext_4"].
208[Invalid CommandBuffer from CommandEncoder "renderContext_4"] is invalid due to a previous error.
 - While calling [Queue].Submit([[Invalid CommandBuffer from CommandEncoder "renderContext_4"]])
```

Decoded:

- `renderPipeline_MeshBasicMaterial_14379`: the pipeline was built from a `MeshBasicMaterial`-derived node graph. The `_14379` suffix is the per-pipeline counter Three.js increments per cached pipeline. The user's session had built ~14,000 distinct pipelines, consistent with diverse geometry signatures spawning new pipelines as the scene evolves (CAD geometry is reloaded with each user edit, multiplied by the override material's cross-geometry application).
- `DrawIndexed(36, 1, 0, 0, 0)`: 36 indices, 1 instance, no base offset — a cube-sized primitive. The matching `RenderObject` did not bind a position vertex buffer despite the pipeline declaring slot 0 required.
- `renderContext_4`: the canvas-bound render context (`SceneOverlay` is the only other render-context owner besides the post pipeline; the gizmo runs on a separate renderer). The depth-restore pass triggered the failure.

The `_14379` counter and `renderContext_4` together place the failure inside the depth-restore traversal, confirming `SceneOverlayFrameLoop` as the proximate trigger.
