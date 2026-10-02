---
title: 'GLTF Edges Fat-Line Performance Audit'
description: 'Performance audit of apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts: why edge rendering causes lag on large CAD models and the architectural changes that bring WebGPU fat-line rendering up to best-practice.'
status: active
created: '2026-05-15'
updated: '2026-05-16'
category: optimization
related:
  - docs/policy/webgpu-shader-and-pipeline-policy.md
  - docs/policy/graphics-backend-policy.md
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/webgpu-edge-line-crispness-gap.md
  - docs/research/webgpu-fat-line-renderer-aware-depth.md
  - docs/research/webgpu-fat-line-hardware-clipping-bug.md
  - docs/research/webgpu-line2-reversed-z-trim.md
  - docs/research/gltf-edges-line-rendering-regression.md
  - docs/research/webgpu-axes-hover-pipeline-stall.md
  - docs/research/screenshot-viewport-shared-material-state-bleed.md
---

# GLTF Edges Fat-Line Performance Audit

Why `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts` becomes a lag bottleneck on larger CAD models (forcing users to disable edge rendering as a workaround), and the architectural change set that brings it to the best-practice envelope for "fat line" rendering on three.js r184 + `WebGPURenderer`.

## Executive Summary

The dominant cost is **structural, not shader-bound**: every `LineSegments` primitive in a GLTF assembly becomes its own `LineSegments2` mesh **with its own freshly allocated `Line2NodeMaterial` / `LineMaterial`**. A 200-part assembly therefore produces 200 draw calls, 200 instanced-quad pipelines, 200 uniform-buffer allocations, and (on the cold cache) 200 sequential WGSL/program compiles. Three.js's pipeline cache key includes the material identity, so per-primitive materials defeat the cache entirely; on three.js ≥ r183 (`viewportOpaqueMipTexture` fix) shared materials are now the strict performance winner, not the WebGL-era loser they were prior to r183 ([three.js #32582 / #32639](https://github.com/mrdoob/three.js/issues/32582)). Secondary costs compound: position extraction is a `number[]` push loop with no pre-allocation, the entire conversion runs synchronously on the main thread inside `gltfLoader.parseAsync`, `LineSegments2.raycast` allocates fresh `Vector3`s per call, and the WebGPU `discard` path with `alphaToCoverage = false` (kept for screenshot crispness) disables early-Z on overlapping edges. The recommended sequence — share materials globally, batch edges per-color into a single merged `LineSegmentsGeometry`, pre-allocate typed arrays, pre-warm pipelines with `compileAsync`, suppress raycast where unused — collapses the dominant draw-call cost into `O(1)` regardless of part count and brings policy compliance for `webgpu-shader-and-pipeline-policy.md` rules 4, 8, and 13.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Scope and Non-Goals](#scope-and-non-goals)
4. [Findings](#findings)
5. [Recommendations](#recommendations)
6. [Trade-offs](#trade-offs)
7. [Code Examples](#code-examples)
8. [Diagrams](#diagrams)
9. [References](#references)
10. [Appendix](#appendix)

## Problem Statement

User-reported symptom: "for larger models, disabling edge rendering is sometimes necessary to make the renderer less laggy." Edge rendering is controlled by the `enableLines` toggle in `apps/ui/app/components/geometry/graphics/three/react/gltf-mesh.tsx`; flipping it from `true` → `false` masks the regression by hiding every `LineSegments2` mesh, so the smoking gun is somewhere in the fat-line pipeline rather than the surface pipeline.

The runtime profile signature reported by users (UI thread stuttering during orbit, frame budget blown well below 60 fps once the part count crosses ~100) implicates one of three failure classes:

1. **Per-frame CPU cost** — too many draw calls or expensive material `onBeforeRender`/`onBeforeCompile` work.
2. **Per-frame GPU cost** — overdraw, missing early-Z, expensive fragment paths.
3. **One-shot mount cost spilling into the first interaction** — synchronous pipeline compiles delaying the first render frame.

This audit checks each axis against the current implementation in `gltf-edges.ts` and the consuming `gltf-mesh.tsx`, with explicit comparisons against upstream three.js r184 behaviour and the codified rules in `docs/policy/webgpu-shader-and-pipeline-policy.md`.

## Methodology

1. **Source read** — Full re-read of `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts`, `apps/ui/app/components/geometry/graphics/three/react/gltf-mesh.tsx`, `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`, and `packages/runtime/src/middleware/gltf-edge-detection.middleware.ts`.
2. **Upstream verification** — Inspected `node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/lines/{LineMaterial.js,LineSegmentsGeometry.js,LineSegments2.js,webgpu/LineSegments2.js}` to confirm the WebGPU + WebGL fat-line implementations consume the same `LineSegmentsGeometry` shape and to characterise their raycast cost.
3. **Policy cross-check** — Audited each finding against `docs/policy/webgpu-shader-and-pipeline-policy.md` rules 4 (uniform branching), 7 (lifecycle flags), 8 (pipeline cache keys), and 13 (pipeline warmup).
4. **Issue corpus** — Reviewed three.js `mrdoob/three.js#32582` (shared material WebGPU perf regression, fixed in r183 via `viewportOpaqueMipTexture`), `#32639` (the fix PR), `#29018` / `#29114` (BatchedMesh-for-lines feature requests), `#21488` (`setPositions` second-call bug), `#1370` (historic perf baseline for line rendering), and the regl/webgpu-instanced-lines reference implementation by R Reusser.
5. **Prior-art reconciliation** — Compared against `docs/research/gltf-edges-line-rendering-regression.md` (depth bias correctness), `docs/research/webgpu-edge-line-crispness-gap.md` (alphaToCoverage discard path), `docs/research/webgpu-axes-hover-pipeline-stall.md` (persistent-instance pattern for line materials), and `docs/research/screenshot-viewport-shared-material-state-bleed.md` (per-renderer material allocation rationale) so this audit doesn't reverse decisions taken there.

## Scope and Non-Goals

**In scope**: viewport-pipeline performance of edge rendering for GLTF models loaded through `GltfMesh`, on both WebGL and WebGPU backends. Both initial-mount cost (loading a model) and steady-state cost (orbit/zoom on a loaded model) are in frame.

**Out of scope**:

- The kernel-side `gltfEdgeDetectionMiddleware` algorithm (`packages/runtime/src/utils/edge-detection.ts`). Its O(n) hash-based detection has its own tuning surface (precision multiplier, dihedral threshold) but is not the smoking gun for the lag report — edge detection runs once per render, not per frame.
- The screenshot-capability pipeline. `applyEdgeMaterialsToClonedScene` allocates fresh materials per capture by design (see `docs/research/screenshot-viewport-shared-material-state-bleed.md`); changing that contract is a separate decision.
- The deliberate per-renderer depth encoding divergence inside `Line2NodeMaterial.setupDepth` (`docs/research/webgpu-fat-line-renderer-aware-depth.md`).
- `alphaToCoverage = false` on WebGPU. This is the deliberate WebGPU-edge-line-crispness fix; reverting it would re-introduce the screenshot graininess gap (`docs/research/webgpu-edge-line-crispness-gap.md`). Its perf footprint is documented in Finding 6 below but not actioned.

## Findings

| #   | Finding                                                                       | Severity | Where                                                                                                    | Cost class            |
| --- | ----------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| F1  | Per-primitive `Line2NodeMaterial` / `LineMaterial` allocation                 | P0       | `convertToFatLineSegments2`, `createWebGpuGltfFatLineMaterial`, `createWebGlGltfFatLineMaterial`         | Pipeline + memory     |
| F2  | One `LineSegments2` mesh per GLTF primitive → N draw calls                    | P0       | `applyFatLineSegments` traversal                                                                         | Draw-call CPU         |
| F3  | `extractPositions` builds `number[]` via `.push()` with no pre-allocation     | P1       | `extractFromInterleavedIndexed`, `extractFromInterleavedNonIndexed`, `extractFromRegularIndexed`         | GC + main-thread      |
| F4  | Synchronous edge conversion blocks the GLTF-parse promise                     | P1       | `gltf-mesh.tsx:356` (`applyFatLineSegments(...)`)                                                        | Main-thread           |
| F5  | No `compileAsync` warmup before first frame                                   | P1       | `gltf-mesh.tsx` Effect 1 / `applyFatLineSegments`                                                        | Cold-mount stall      |
| F6  | `LineSegments2.raycast` runs per-segment screen-space math with allocations   | P2       | Upstream three.js (called via R3F raycaster); not overridden                                             | Per-pick CPU          |
| F7  | WebGL `onBeforeCompile` allocates a fresh `depthBias` uniform per material    | P2       | `createWebGlGltfFatLineMaterial`                                                                         | Program cache fan-out |
| F8  | `renderOrder = 1` puts opaque edges into a separate sort bucket               | P3       | `convertToFatLineSegments2`                                                                              | Sort overhead         |
| F9  | `[...array]` spread on non-indexed `Float32Array` in `extractPositions`       | P2       | `extractPositions` (final fallback branch)                                                               | Allocation            |
| F10 | `updateLineMaterialResolution` traverses scene + writes per-material uniforms | P3       | `gltf-mesh.tsx` size-change `useEffect`; called on resize, but per-material write defeats sharing wins   | Resize CPU            |
| F11 | LRU-style stale Float32Array references in `LineSegmentsGeometry` (#21488)    | P3       | `LineSegmentsGeometry.setPositions` — not actively re-triggered, but a footgun for future mutation paths | Latent                |
| F12 | `discard` path on WebGPU edges disables early-Z (deliberate, but unbudgeted)  | P3       | `createWebGpuGltfFatLineMaterial` (`alphaToCoverage = false`)                                            | Fragment overdraw     |

### Finding 1: Per-primitive material allocation defeats the WebGPU pipeline cache

**Evidence — current shape** (`apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts:225-261`):

```225:261:apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts
const geometry = new LineSegmentsGeometry();
geometry.setPositions(positions);

if (backend === 'webgpu') {
  const material = createWebGpuGltfFatLineMaterial();
  const lineSegments2 = new WebGpuFatLineSegments2(geometry, material);
  // ...
  return lineSegments2;
}

const material = createWebGlGltfFatLineMaterial(resolution);
const lineSegments2 = new LineSegments2(geometry, material);
```

A 200-primitive assembly (typical CAD model with ~200 parts) therefore allocates 200 `Line2NodeMaterial` instances. Under three.js r184 `WebGPURenderer`, the pipeline cache key is `(stageVertex.id, stageFragment.id, backend.getRenderCacheKey(renderObject))` — distinct material instances produce distinct stage IDs, so each primitive triggers a separate `device.createRenderPipelineAsync` invocation on cold cache. This is the exact mechanism behind `docs/research/webgpu-axes-hover-pipeline-stall.md` (Finding 2), generalised across the entire edge corpus.

**Evidence — upstream r183 fix** ([three.js #32582](https://github.com/mrdoob/three.js/issues/32582), [#32639](https://github.com/mrdoob/three.js/pull/32639)). Prior to r183, shared materials in WebGPU were _slower_ than per-primitive materials because each material build invoked `viewportSharedTexture()` and minted a fresh node ID; the cache key thrashed even with shared instances. r183 collapsed that into the global `viewportOpaqueMipTexture` singleton, so on r184 (our pinned version) **shared materials are the strict performance winner**. Tau already mirrors that pattern with `tauOpaqueViewportTextureSingleton` in `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts:72` — sharing materials at the consumer layer would finally cash in the singleton's intended benefit.

**Memory delta**. Each `Line2NodeMaterial` allocates a TSL graph, a uniform buffer for `color`/`linewidth`/`opacity`/`linewidth`/`gapSize`/`dashSize`/`dashOffset`/`dashScale` (~64 B), and a WebGPU `BindGroup`. For 200 primitives that is ~12.8 KB of uniform-buffer storage plus ~200 bind-group descriptors — small in absolute terms, but the bind-group churn shows up in the renderer's `nodes.update(renderObject)` hot path on every `renderList.render(...)` iteration.

**Policy violation**. `docs/policy/webgpu-shader-and-pipeline-policy.md` Rule 4 line-materials addendum requires persistent material instances; Rule 8 requires the pipeline budget to be knowable at mount time. Both are violated by per-primitive allocation.

### Finding 2: One `LineSegments2` per GLTF primitive turns N edges into N draw calls

**Evidence** — `applyFatLineSegments` traverses `gltf.scene`, finds every `LineSegments` produced by the GLTFLoader (which itself splits each glTF mesh's LINE primitive into its own `Object3D`), and replaces each with a new `LineSegments2`:

```282:294:apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts
gltf.scene.traverse((object) => {
  if (object.type === 'LineSegments') {
    const lineSegments = object as LineSegments;
    const parent = lineSegments.parent as Group | undefined;
    if (parent) {
      const lineSegments2 = convertToFatLineSegments2(lineSegments, resolution, backend);
      if (lineSegments2) {
        replacements.push({ parent, oldChild: lineSegments, newChild: lineSegments2 });
      }
    }
  }
});
```

The kernel-side middleware (`packages/runtime/src/middleware/gltf-edge-detection.middleware.ts:65-130`) creates one edge primitive per source mesh. Replicad's `meshEdges` path produces the same shape (one LINE primitive per shape). A 200-part assembly therefore exits the GLTF loader as 200 `LineSegments` and exits `applyFatLineSegments` as 200 `LineSegments2`. Each `LineSegments2` is its own renderable mesh in three's renderList → 200 draw calls every frame.

**Industry baseline.** `BatchedMesh` does not yet support `LINES` primitives ([three.js #29018](https://github.com/mrdoob/three.js/issues/29018), [#29114](https://github.com/mrdoob/three.js/issues/29114)), but `LineSegmentsGeometry` _itself_ is already an `InstancedBufferGeometry` — every line segment is an instance of an 8-vertex quad. There is no architectural reason that segments must be sharded across multiple `LineSegments2` meshes. Merging the per-primitive position arrays into a single `LineSegmentsGeometry` collapses N draw calls into one instanced draw with the sum of all segment counts — the same scaling story as `InstancedMesh` vs N individual `Mesh`es.

**Caveat — per-primitive transforms**. Today each `LineSegments2` inherits the parent `LineSegments`'s `position`/`rotation`/`scale`/`quaternion` (`gltf-edges.ts:233-236`). The GLTF loader bakes node transforms into the parent `Object3D`, so source-mesh edges sit under their parent's local frame. A merged geometry must bake each parent's `matrixWorld` into the positions before concatenation (one-shot Float32Array transform at apply time). This is the same compromise three.js docs cite for `BatchedMesh`: instances share a material, the geometry carries the world-space data.

### Finding 3: `extractPositions` is allocation-pathological for large meshes

**Evidence** (`gltf-edges.ts:53-94`, `:99-148`):

```53:72:apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts
function extractFromInterleavedIndexed(
  positionAttribute: InterleavedBufferAttribute,
  indices: Iterable<number>,
): number[] {
  const interleavedBuffer = positionAttribute.data;
  const { stride } = interleavedBuffer;
  const { offset } = positionAttribute;
  const { array } = interleavedBuffer;
  const positions: number[] = [];

  for (const index of indices) {
    const vertexIndex = index * stride + offset;
    const x = array[vertexIndex] ?? 0;
    const y = array[vertexIndex + 1] ?? 0;
    const z = array[vertexIndex + 2] ?? 0;
    positions.push(x, y, z);
  }

  return positions;
}
```

Three independent perf taxes:

1. **`number[]` instead of `Float32Array`**. JS engines grow dense numeric arrays in chunks; for a 50 000-edge primitive (300 000 floats) the array re-grows ~22 times under V8's default geometric growth schedule, each re-growth copying every existing element. The final `LineSegmentsGeometry.setPositions(array)` (`node_modules/three/examples/jsm/lines/LineSegmentsGeometry.js:100-107`) immediately re-wraps the `number[]` in a fresh `Float32Array(array)`, doubling the allocation.
2. **`for (const index of indices)` on a `Uint32Array`/`Uint16Array`**. The iteration protocol allocates an iterator object and pays an iter-result-object boundary per step. An indexed `for (let i = 0; i < indices.length; i++)` is 2-3× faster in V8 for typed-array sources (canonical micro-benchmark; same finding behind three's own internal index loops in `LineSegmentsGeometry.computeBoundingSphere`).
3. **`array[idx] ?? 0`**. Defensive against malformed buffers, but typed-array reads cannot return `undefined` for in-range indices — only out-of-range reads do, and those should be caller's responsibility, not a per-element overhead.

**Fallback branch is worse** — non-indexed regular buffer:

```146:148:apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts
// Non-indexed regular buffer - copy directly
return [...array];
```

The spread re-allocates a `number[]` of length `array.length`, then `LineSegmentsGeometry.setPositions` re-allocates a `Float32Array` from that `number[]`. Two extra full-mesh allocations for a path that could `return array` (or a `.slice()` if mutation safety matters).

**Magnitude**. For the largest CAD assemblies (e.g. mechanical models with ~100 k boundary edges), each fresh load allocates several megabytes of transient `number[]` storage on the main thread and induces a multi-millisecond GC pause inside `parseAsync`.

### Finding 4: GLTF-parse promise blocks on synchronous extraction

`applyFatLineSegments` runs inside Effect 1 of `gltf-mesh.tsx` (lines 341-386), inside the `await gltfLoader.parseAsync` continuation, synchronously on the main thread before `setBaseScene(gltf.scene)` triggers React render. For a 200-primitive assembly each primitive contributes a full extraction loop plus a `LineSegmentsGeometry`/`Line2NodeMaterial` allocation; aggregate cost compounds linearly with part count and is paid on every project switch (every time `gltfFile` deps change).

**Compounding factor**. The extraction loops run _after_ the GLB has already been re-parsed by `gltfLoader.parseAsync` (which itself allocates all surface geometry buffers and runs `KHR_materials_unlit` extension processing) — the edge-conversion cost arrives on a CPU already hot from GLTF parse work, so its real-world latency overlaps with peak GC pressure.

### Finding 5: Cold-mount pipeline-compile cliff is unmitigated

`docs/policy/webgpu-shader-and-pipeline-policy.md` Rule 13 mandates `gl.compileAsync(group, camera)` for any cohort of materials that lands as a unit. The scene `AxesHelper` and `ViewportGizmoCube` both now warm their fat-line pipelines explicitly (`docs/research/webgpu-axes-hover-pipeline-stall.md`); the edge-rendering path does not. On cold cache, the first `useFrame` after a model load triggers sequential `createRenderPipelineAsync` calls — one per primitive material — and three's render path bails on each non-resolved pipeline, producing a multi-frame "edges fade in" stall that maps directly onto the user-reported "lag while loading large model" symptom.

### Finding 6: `LineSegments2.raycast` is expensive and unscoped

`LineSegments2.raycast` (upstream, `node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/lines/webgpu/LineSegments2.js:316-407`) runs a screen-space per-segment intersection check whenever a raycaster traverses the scene, even when the edge mesh has no consumer interested in line picks. The function allocates fresh `Vector3`s inside its inner loop (lines 199-208 of the WebGPU variant), iterates every segment in screen space, and compounds linearly with `instanceCount × LineSegments2 count`.

R3F's pointer events drive `Raycaster.intersectObject(scene, true)` on every pointermove when any element subscribes to `onPointerMove`. The user-visible lag on hover/orbit comes from this even when edges are nominally "passive overlays" — they participate in every raycast because they sit under `scene.traverse()`.

**Today's UX contract**. Nothing in the codebase raycasts against edges. The matcap surfaces own all click/hover behaviour, and `isFatLineSegmentsMesh(child)` is used in `gltf-mesh.tsx:153-174` only to _exclude_ fat-line meshes from material saving/restoring — never to pick them.

### Finding 7: WebGL `onBeforeCompile` per-instance produces N program-cache slots

`createWebGlGltfFatLineMaterial` allocates `depthBiasUniform` as a per-material `{ value: depthBiasFactor }` object and assigns it inside `onBeforeCompile` (lines 174-203). Three.js's program cache keys programs by `(vertexShader, fragmentShader, defines, customProgramCacheKey)`. The shader text is identical across instances, so programs _should_ dedupe — but three's `WebGLPrograms.getProgramCacheKey` includes a per-material program identity for materials with `onBeforeCompile` set unless `customProgramCacheKey()` is overridden. For N edge materials we therefore mint N program-cache entries that compile to identical GLSL.

**Mitigation today**. Modern three.js drivers reuse identical compiled GLSL via the _driver's_ program cache (not three's), so the GPU side is OK; the JS-side waste is the WebGLProgram object overhead + `gl.getUniformLocation` queries × N. Smaller perf hit than F1 in absolute terms, but the same architectural smell.

### Finding 8: `renderOrder = 1` forces a separate sort bucket

Every fat-line mesh sets `renderOrder = 1` (`gltf-edges.ts:241, 258`). Three.js's `RenderList` sorts opaque renderables by `(renderOrder, material.id, programId, z)`. Setting `renderOrder = 1` is a legacy hint to draw edges after surfaces — useful when edges were transparent overlays competing on depth, but with the explicit `depthBias` on both backends the surfaces already lose the coplanar comparison. The only effect today is that the sort comparator can't co-locate edges with the surfaces they overlay, which mildly hurts cache locality on the GPU side.

### Finding 9: Spread fallback in extractPositions

```146:148:apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts
// Non-indexed regular buffer - copy directly
return [...array];
```

Documented in F3 (item 3). Flagged separately because the fix is independent: every other branch returns a `number[]` built incrementally, but this one is the only path where the source is already a contiguous `Float32Array` that can be returned directly (or shallow-cloned via `.slice()`).

### Finding 10: Per-material resolution updates after sharing

`updateLineMaterialResolution` (`gltf-edges.ts:418-429`) traverses the scene and writes `material.resolution.copy(resolution)` on every `LineSegments2`. With per-primitive materials this is N writes; after sharing, it would still be N writes (one per mesh) because traversal hits each mesh independently. Sharing the material plus changing the resolution-update path to a single `sharedMaterial.resolution.copy(resolution)` collapses this to one write per resize.

### Finding 11: LineSegmentsGeometry.setPositions second-call bug ([three.js #21488](https://github.com/mrdoob/three.js/issues/21488))

`LineSegmentsGeometry.setPositions` mutates the `instanceStart`/`instanceEnd` attributes in place. `InstancedBufferGeometry._maxInstanceCount` is cached on the geometry and is not invalidated by the second `setPositions` call. Today `gltf-edges.ts` only calls `setPositions` once per geometry (right after construction), so the bug is dormant — but the merged-geometry implementation proposed in Finding 2 needs to honour it: re-merge means a new `LineSegmentsGeometry`, not `setPositions` on the old one.

### Finding 12: `discard` path overdraw cost is real but bounded

`createWebGpuGltfFatLineMaterial` sets `alphaToCoverage = false` to fall through to the deterministic `discard` path (Divergence justified in `docs/research/webgpu-edge-line-crispness-gap.md`). `discard` disables early depth-test on tile-based GPUs (the entire endcap fragment shader runs before the depth check decides to throw the result away). For dense overlapping edges this is real GPU work — for a fullscreen-covering wireframe at 4× MSAA, perhaps 10-15 % of fragment budget. The trade-off is intentional and tied to a higher-priority requirement (screenshot crispness), so this audit does not propose reverting it; it is listed here so the perf budget reasoning is explicit.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                           | Priority | Effort  | Impact           | Status                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Share a single `Line2NodeMaterial` (and `LineMaterial`) instance per GLTF-loaded scene.** Allocate once in `applyFatLineSegments`, attach to every converted `LineSegments2`. Dispose on `disposeSceneResources` via a per-scene side channel (e.g. attach via `scene.userData.edgeMaterial`). | P0       | Low     | Very High        | ✅ RESOLVED — `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts` (`applyFatLineSegments` allocates one shared material per call).                                                                                                                                                                                                    |
| R2  | **Merge per-primitive edge positions into a single `LineSegmentsGeometry`** per scene (or per material-style cohort when future colour variants land). Bake each parent's `matrixWorld` into positions at apply time; attach the merged geometry under `gltf.scene` with `matrixWorld = I`.      | P0       | Med     | Very High        | ✅ RESOLVED via **R6-first sequencing** — merge runs kernel-side in `packages/runtime/src/utils/merge-gltf-edges.ts` + `packages/runtime/src/middleware/gltf-edge-detection.middleware.ts`. UI receives one `LineSegments` ready to wrap.                                                                                                                  |
| R3  | **Pre-allocate `Float32Array` in `extractPositions`** with the exact final length. Replace `for…of` with indexed loops; drop the `?? 0` fallback for in-range typed-array reads. The non-indexed regular-buffer path returns `array.slice()` (or `array` directly if ownership allows).          | P1       | Low     | High             | ✅ RESOLVED — `gltf-edges.ts:extractFromInterleavedIndexed` + siblings now indexed-loop typed-array reads.                                                                                                                                                                                                                                                 |
| R4  | **Pre-warm pipelines via `await gl.compileAsync(gltf.scene, camera)`** at the tail of Effect 1 in `gltf-mesh.tsx`, guarded by `typeof gl.compileAsync === 'function'`. Publish the scene state only after the warmup resolves so the first `useFrame` never blocks on pipeline creation.         | P1       | Low     | High             | ✅ RESOLVED — `apps/ui/app/components/geometry/graphics/three/react/gltf-mesh.tsx` Effect 1 tail (cancellation-safe).                                                                                                                                                                                                                                      |
| R5  | **Override `LineSegments2.raycast` to a no-op for kernel-loaded edges.** Set `lineSegments2.raycast = noop` inside `convertToFatLineSegments2`. Pickable variants (when introduced) opt in explicitly.                                                                                           | P1       | Low     | Med-High         | ✅ RESOLVED — `wrapAsFatLineSegments` assigns `fatLine.raycast = disableRaycast`.                                                                                                                                                                                                                                                                          |
| R6  | **Move `extractPositions` and the geometry-merge step into the kernel-side middleware** (`gltfEdgeDetectionMiddleware`) so the data arrives at the UI as a single merged LINES primitive per material. Keeps the main thread off the extraction critical path.                                   | P2       | Med     | High             | ✅ RESOLVED — `mergeGltfLineSegments` (`packages/runtime/src/utils/merge-gltf-edges.ts`) is invoked from the middleware (`packages/runtime/src/middleware/gltf-edge-detection.middleware.ts`) AFTER `addEdgePrimitivesToDocument` so it picks up both detection-generated edges and replicad's `meshEdges`. The merge promoted to a P0 prereq for R1 + R2. |
| R7  | **Lift `depthBiasUniform` to a module-level singleton on the WebGL path** and override `customProgramCacheKey` to return a constant. Lets three's `WebGLPrograms` dedupe the compiled program across all edge materials in the scene.                                                            | P2       | Low     | Med              | ✅ RESOLVED — `gltf-edges.ts` ships `sharedDepthBiasUniform` + `webGlEdgeProgramCacheKey = 'tau-gltf-edge-logdepth-bias-v1'`.                                                                                                                                                                                                                              |
| R8  | **Drop `renderOrder = 1`** on edge meshes. The explicit depth bias already wins the coplanar comparison; an opaque sort by depth is correct.                                                                                                                                                     | P3       | Trivial | Low              | ✅ RESOLVED — `wrapAsFatLineSegments` no longer assigns `renderOrder`.                                                                                                                                                                                                                                                                                     |
| R9  | **Codify the persistent-material-instance rule for edge overlays** in `docs/policy/webgpu-shader-and-pipeline-policy.md` Rule 4's "Line materials addendum" so future contributors don't reintroduce per-primitive materials when scaffolding new line consumers.                                | P2       | Low     | Med (governance) | ✅ RESOLVED — Rule 4 "Edge-merge addendum (mandatory)" added; this research doc cross-linked from the policy's `related` frontmatter.                                                                                                                                                                                                                      |
| R10 | **Snapshot regression guard**: extend `gltf-edges-webgpu.material.test.ts` with a "factory is called once per `applyFatLineSegments` invocation regardless of primitive count" assertion via a spy on `createWebGpuGltfFatLineMaterial`.                                                         | P2       | Low     | Med              | ✅ RESOLVED — `gltf-edges-webgpu.material.test.ts` (allocation-count assertions) + new `gltf-edges-webgl.material.test.ts` (program cache key + shared uniform).                                                                                                                                                                                           |
| R11 | **Spatial subdivision for very large merged geometries** (≥1 M segments): partition into chunks bounded by world-space bbox so frustum culling can still drop offscreen chunks. Defer until R1-R5 have measured impact.                                                                          | P3       | High    | Med (future)     | DEFERRED — awaiting real-world telemetry from the post-merge release before chunking adds complexity.                                                                                                                                                                                                                                                      |

### Recommended Sequencing

> **Update (2026-05-16)** — R1-R10 landed together under the **R6-first** sequencing chosen during plan review (the user explicitly directed all geometry merging to live in the kernel-side middleware rather than the UI). The shipped order was:
>
> 1. **R6** (kernel-side merge utility + middleware wiring) — `packages/runtime/src/utils/merge-gltf-edges.ts` and the integration into `gltf-edge-detection.middleware.ts`. This is the structural foundation that lets R1/R2 collapse to trivial UI-side single-mesh wraps rather than ad-hoc UI traversal merging.
> 2. **R3** (typed-array `extractPositions`) — independent isolated win.
> 3. **R1 + R2 + R5 + R8** (single-mesh wrap, shared material, raycast no-op, drop `renderOrder`) — landed in one coordinated rewrite of `gltf-edges.ts` now that the merge prerequisite is in place.
> 4. **R7** (WebGL program cache + shared uniform) — bolted onto `createWebGlGltfFatLineMaterial` in the same patch as R1.
> 5. **R4** (`compileAsync` warmup) — appended to `gltf-mesh.tsx` Effect 1 tail; cancellation-safe.
> 6. **R10** (regression guards) — `gltf-edges-webgpu.material.test.ts` + new `gltf-edges-webgl.material.test.ts`.
> 7. **R9** (policy update) — `docs/policy/webgpu-shader-and-pipeline-policy.md` Rule 4 "Edge-merge addendum (mandatory)".
>
> The original sequencing (R3 → R1+R10 → R5 → R2 → R4 → R8+R7 → R6 → R11) is preserved below for historical context.

1. **R3** (typed-array allocation) — safe, isolated, immediate win on extraction time.
2. **R1 + R10** (shared material + regression test) — single material instance fixes the P0 pipeline-cache thrash.
3. **R5** (raycast no-op) — independent micro-fix; substantial UX impact under R3F's pointer-event loop.
4. **R2** (geometry merge) — the structural draw-call collapse. Land after R1 so the shared material is already in place.
5. **R4** (compileAsync warmup) — once the material cohort is bounded by R1/R2, the warmup payload is small enough to be near-free.
6. **R8 + R7** (renderOrder, WebGL program cache) — cleanup once the big rocks land.
7. **R6** (kernel-side merge) — architectural improvement once the UI-side fix has shipped and proved stable.
8. **R11** (spatial chunks) — only if real-world telemetry shows merged geometries hitting frustum-cull blindness.

## Trade-offs

### R1 / R2 vs `applyEdgeMaterialsToClonedScene`

The screenshot pipeline (`applyEdgeMaterialsToClonedScene`) deliberately allocates fresh materials per capture because the screenshot renderer's flag set diverges from the viewport's (`docs/research/screenshot-viewport-shared-material-state-bleed.md`). The shared-material recommendation here applies to the viewport scene only — `applyEdgeMaterialsToClonedScene` continues to mint per-capture instances and replaces the shared viewport material on the cloned scene before invoking the offscreen renderer. The contract stays intact: per-renderer materials, but only one per scene per renderer.

### R2 vs CAD picking semantics

Today edge picks are not wired through pointer events, so a merged geometry doesn't lose semantic information visible to the user. If future work introduces edge-level selection (hover-highlight individual edges, snap-to-edge dimensioning), the merged geometry needs a `(primitiveId → segmentRange)` lookup table to map a `raycast` `faceIndex` back to the source primitive. The merged geometry is still the right architecture; the lookup table is a parallel `Uint32Array` indexed by segment.

### R4 vs first-paint latency

`compileAsync` keeps the canvas empty until the warmup resolves. For "large CAD model" workflows the model load itself already shows a loading state, so adding the warmup at the tail of Effect 1 is net-imperceptible. For "small model with cold shader cache" the warmup adds a sub-second beat; under R1 the warmup payload is _one_ material's pipeline, so the cost is small in absolute terms.

### Comparison table — alternatives considered

| Approach                                                                                          | Verdict                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrate to `gl.LINES` (1px native lines) for non-fat builds                                       | Faster on dense models, but loses screen-space line width parity with the WebGL path. Re-introduces the historic 1px-line look-and-feel divergence we deliberately fixed via fat lines. **Reject.**                                                                    |
| Switch to `webgpu-instanced-lines` (R. Reusser) or `regl-gpu-lines`                               | Faster fat-line implementation for very high segment counts, but forks the rendering stack away from three.js material conventions (no TSL graph, no scene integration, custom raycast). **Reject** for the in-tree path; reconsider only if R1-R5 prove insufficient. |
| Wait for `BatchedMesh` line support (`mrdoob/three.js#29018`)                                     | Upstream feature request, no committed timeline. The merged-`LineSegmentsGeometry` approach gives 80 % of the benefit today with no upstream dependency. **Defer.**                                                                                                    |
| Push edge rendering into a compute-shader prepass that updates the existing surface mesh in-place | Architecturally elegant for _generated_ edges, but our edges arrive pre-detected from the kernel via glTF — the compute pass would be doing work the kernel already did. **Reject.**                                                                                   |

## Code Examples

### R1 + R2 (sketch — shared material, merged geometry)

```typescript
// gltf-edges.ts (sketch — actual implementation should pass cancellation tokens
// through the GLTF-load promise and bake `matrixWorld` into positions).

export function applyFatLineSegments(gltf: GLTF, resolution: Vector2, backend: ResolvedGraphicsBackend): void {
  const lineSegmentsToMerge: Array<{ parent: Group; lineSegments: LineSegments }> = [];

  gltf.scene.traverse((object) => {
    if (object.type === 'LineSegments' && object.parent) {
      lineSegmentsToMerge.push({
        parent: object.parent as Group,
        lineSegments: object as LineSegments,
      });
    }
  });

  if (lineSegmentsToMerge.length === 0) {
    return;
  }

  // 1. Bake each parent's world matrix into a single Float32Array.
  let totalFloats = 0;
  const sources = lineSegmentsToMerge.map(({ parent, lineSegments }) => {
    parent.updateWorldMatrix(true, false);
    const positions = extractPositions(lineSegments);
    if (positions === undefined) {
      return undefined;
    }
    totalFloats += positions.length;
    return { lineSegments, positions, matrixWorld: lineSegments.matrixWorld };
  });

  const merged = new Float32Array(totalFloats);
  let offset = 0;
  const tmp = new Vector3();
  for (const source of sources) {
    if (source === undefined) continue;
    for (let i = 0; i < source.positions.length; i += 3) {
      tmp.set(source.positions[i]!, source.positions[i + 1]!, source.positions[i + 2]!);
      tmp.applyMatrix4(source.matrixWorld);
      merged[offset++] = tmp.x;
      merged[offset++] = tmp.y;
      merged[offset++] = tmp.z;
    }
  }

  // 2. Single geometry + single material for the entire scene.
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(merged);

  const material =
    backend === 'webgpu' ? createWebGpuGltfFatLineMaterial() : createWebGlGltfFatLineMaterial(resolution);

  const MeshClass = backend === 'webgpu' ? WebGpuFatLineSegments2 : LineSegments2;
  const mergedMesh = new MeshClass(geometry, material);
  mergedMesh.raycast = noop; // R5
  mergedMesh.name = 'tau-merged-edges';
  // Note: no `renderOrder = 1` — R8.

  // 3. Remove the per-primitive LineSegments and attach the merged mesh under the scene root.
  for (const { parent, lineSegments } of lineSegmentsToMerge) {
    parent.remove(lineSegments);
    lineSegments.geometry.dispose();
    // Materials on the unlit edge primitives come from the kernel; dispose them
    // as before.
    const sourceMaterial = Array.isArray(lineSegments.material) ? lineSegments.material : [lineSegments.material];
    for (const m of sourceMaterial) m.dispose();
  }
  gltf.scene.add(mergedMesh);
  // Stash on the scene for later resolution updates + disposal.
  (gltf.scene.userData as { edgeResources?: { material: Material; geometry: BufferGeometry } }).edgeResources = {
    material,
    geometry,
  };
}

const noop = () => undefined;
```

### R3 (typed-array extraction, indexed loops)

```typescript
function extractFromInterleavedIndexed(
  positionAttribute: InterleavedBufferAttribute,
  indices: Uint32Array | Uint16Array,
): Float32Array {
  const { stride } = positionAttribute.data;
  const { offset } = positionAttribute;
  const { array } = positionAttribute.data;
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]! * stride + offset;
    out[i * 3] = array[v]!;
    out[i * 3 + 1] = array[v + 1]!;
    out[i * 3 + 2] = array[v + 2]!;
  }
  return out;
}
```

### R4 (compileAsync warmup tail)

```typescript
// gltf-mesh.tsx Effect 1 tail, after applyFatLineSegments(...)
const compile = gl.compileAsync;
if (typeof compile === 'function') {
  try {
    await compile.call(gl, gltf.scene, camera);
  } catch (error) {
    console.warn('Edge pipeline warmup failed (continuing):', error);
  }
  if (cancelled) {
    disposeSceneResources(gltf.scene);
    return;
  }
}
setBaseScene(gltf.scene);
```

### R7 (WebGL custom program cache key + module-level uniform)

```typescript
const sharedDepthBiasUniform = { value: depthBiasFactor };

export function createWebGlGltfFatLineMaterial(resolution: Vector2): LineMaterial {
  const material = new LineMaterial({
    color: defaultEdgeColor,
    linewidth: defaultLineWidth,
    worldUnits: false,
    resolution: resolution.clone(),
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['depthBias'] = sharedDepthBiasUniform;
    // …(injection unchanged)…
  };
  material.customProgramCacheKey = () => 'tau-gltf-edge-logdepth-bias-v1';
  return material;
}
```

## Diagrams

### Draw-call topology — before vs after R1 + R2

```text
BEFORE (200-part assembly)
──────────────────────────
gltf.scene
├─ MeshA (surface) ── material A
├─ LineSegments2 (edges of A) ── Line2NodeMaterial #1
├─ MeshB (surface) ── material B
├─ LineSegments2 (edges of B) ── Line2NodeMaterial #2
├─ …
├─ MeshN (surface) ── material N
└─ LineSegments2 (edges of N) ── Line2NodeMaterial #N
                                                ^^^^^^^^^^^^^^^^^^^^^^
                                          200 pipelines × 1 instance each = 200 draw calls

AFTER (R1 + R2)
───────────────
gltf.scene
├─ MeshA (surface) ── material A
├─ MeshB (surface) ── material B
├─ …
├─ MeshN (surface) ── material N
└─ tau-merged-edges (LineSegments2) ── Line2NodeMaterial (shared)
                                                ^^^^^^^^^^^^^^^^^^^^^^
                                          1 pipeline × Σ segment counts = 1 draw call
```

### Cold-mount frame timeline — before vs after R4

```text
BEFORE                          AFTER (R4)
───────                         ──────────
T0  parse GLB                   T0   parse GLB
T1  applyFatLineSegments        T1   applyFatLineSegments (R1/R2/R3 already fast)
T2  setBaseScene → render       T2   await compileAsync(scene, camera)   ◀ Rule 13 warmup
T3  first useFrame                  ├─ pipeline batch resolves
    └─ N × createRenderPipeline     │
    └─ each ~10-100 ms          T3   setBaseScene → render
    └─ frames skipped / "fade"  T4   first useFrame — every pipeline cache-warm
T4  steady state                T5   steady state
```

## References

- Policy: [`docs/policy/webgpu-shader-and-pipeline-policy.md`](../policy/webgpu-shader-and-pipeline-policy.md) (Rules 4, 8, 13)
- Policy: [`docs/policy/graphics-backend-policy.md`](../policy/graphics-backend-policy.md) (CB-3, CB-4, S6, S7)
- Policy: [`docs/policy/webgpu-rendering-pipeline.md`](../policy/webgpu-rendering-pipeline.md)
- Research: [`docs/research/webgpu-edge-line-crispness-gap.md`](./webgpu-edge-line-crispness-gap.md)
- Research: [`docs/research/webgpu-fat-line-renderer-aware-depth.md`](./webgpu-fat-line-renderer-aware-depth.md)
- Research: [`docs/research/webgpu-fat-line-hardware-clipping-bug.md`](./webgpu-fat-line-hardware-clipping-bug.md)
- Research: [`docs/research/webgpu-line2-reversed-z-trim.md`](./webgpu-line2-reversed-z-trim.md)
- Research: [`docs/research/gltf-edges-line-rendering-regression.md`](./gltf-edges-line-rendering-regression.md)
- Research: [`docs/research/webgpu-axes-hover-pipeline-stall.md`](./webgpu-axes-hover-pipeline-stall.md)
- Research: [`docs/research/screenshot-viewport-shared-material-state-bleed.md`](./screenshot-viewport-shared-material-state-bleed.md)
- three.js issue [#32582](https://github.com/mrdoob/three.js/issues/32582) — shared `Line2NodeMaterial` perf regression (fixed in r183).
- three.js PR [#32639](https://github.com/mrdoob/three.js/pull/32639) — `viewportOpaqueMipTexture` singleton fix.
- three.js issue [#29018](https://github.com/mrdoob/three.js/issues/29018) — `BatchedMesh` + `gl.LINES`/`gl.POINTS` feature request.
- three.js issue [#29114](https://github.com/mrdoob/three.js/issues/29114) — batch rendering support for lines.
- three.js issue [#21488](https://github.com/mrdoob/three.js/issues/21488) — `LineSegmentsGeometry.setPositions` second-call bug.
- three.js issue [#1370](https://github.com/mrdoob/three.js/issues/1370) — historic perf baseline for line rendering.
- R. Reusser — [`webgpu-instanced-lines`](https://github.com/rreusser/webgpu-instanced-lines) (reference WebGPU fat-line implementation).
- R. Reusser — [`regl-gpu-lines`](https://rreusser.github.io/regl-gpu-lines/) batching documentation.

## Appendix

### A. Edge-rendering call graph (current)

```text
gltfFile (Uint8Array)
   │
   ▼
gltfLoader.parseAsync (three/addons GLTFLoader)
   │     │
   │     ├─ parses GLB header
   │     ├─ allocates surface BufferGeometries (interleaved when GLB authoring is glTF-Transform style)
   │     └─ creates LineSegments objects (one per LINE primitive — added by gltfEdgeDetectionMiddleware
   │                                       on the kernel side, or by replicad's meshEdges path)
   │
   ▼
probeGltfScene (smoke trail)
   │
   ▼
applyFatLineSegments  ◀── F1, F2, F3 hot here
   │
   ├─ traverse(): collect LineSegments
   ├─ for each: extractPositions  ◀── F3 / F9
   │     ├─ extractFromInterleavedIndexed | extractFromInterleavedNonIndexed
   │     └─ extractFromRegularIndexed | spread fallback
   ├─ for each: new LineSegmentsGeometry  ◀── F11 (latent)
   ├─ for each: createWebGpuGltfFatLineMaterial | createWebGlGltfFatLineMaterial  ◀── F1, F7
   ├─ for each: new WebGpuFatLineSegments2 | new LineSegments2
   ├─ for each: copy transforms + renderOrder = 1  ◀── F8
   └─ apply replacements; dispose source materials
   │
   ▼
setBaseScene → React render
   │
   ▼
useFrame (priority 2) — first frame
   │
   └─ WebGPURenderer: N × createRenderPipelineAsync  ◀── F5
       └─ each pipeline blocks the draw it serves until resolved
```

### B. Pipeline-count budget — illustrative

| Assembly size                                         | Current pipelines | After R1 | After R1 + R2 |
| ----------------------------------------------------- | ----------------- | -------- | ------------- |
| Single part (1 LINE primitive)                        | 1                 | 1        | 1             |
| 10-part assembly                                      | 10                | 1        | 1             |
| 100-part assembly                                     | 100               | 1        | 1             |
| 500-part assembly (typical aerospace bracket cluster) | 500               | 1        | 1             |

(Pipeline count is per backend; under WebGL these become program-cache entries instead.)

### C. Allocation pressure — illustrative for a 100-part assembly with 5 000 boundary edges per part (500 k segments total)

| Stage                                             | Current allocation                                       | After R1-R3                                     |
| ------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `extractPositions` output                         | 100 × `number[]` of 30 000 entries (intermediate)        | 1 × `Float32Array` of 3 000 000 entries (final) |
| `LineSegmentsGeometry`                            | 100 instances + 100 `InstancedInterleavedBuffer`         | 1 instance                                      |
| `Line2NodeMaterial`                               | 100 instances + 100 TSL graphs + 100 uniform buffers     | 1 instance                                      |
| `WebGpuFatLineSegments2`                          | 100 meshes (each a `Mesh` w/ matrix, world matrix, bbox) | 1 mesh                                          |
| Total `number[]`-to-`Float32Array` re-allocations | 100                                                      | 0 (single direct typed-array fill)              |

### D. Policy compliance matrix

| Policy rule                                                                   | Current status     | After R1-R5 |
| ----------------------------------------------------------------------------- | ------------------ | ----------- |
| `webgpu-shader-and-pipeline-policy.md` Rule 4 (uniform branching)             | ✗ violated         | ✓ compliant |
| Rule 4 — line-materials addendum (persistent instances)                       | ✗ violated         | ✓ compliant |
| Rule 7 (lifecycle flags)                                                      | ✓ compliant        | ✓ compliant |
| Rule 8 (pipeline budget knowable at mount time)                               | ✗ violated         | ✓ compliant |
| Rule 13 (`compileAsync` warmup)                                               | ✗ violated         | ✓ compliant |
| `graphics-backend-policy.md` CB-4 (sRGB gamma blend for transparent overlays) | n/a (edges opaque) | n/a         |
| `graphics-backend-policy.md` S6/S7 (frame-buffer target target color space)   | ✓ compliant        | ✓ compliant |
