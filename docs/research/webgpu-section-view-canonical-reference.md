---
title: 'WebGPU section view: canonical reference'
description: 'Canonical reference for implementing section-view (clipping + visible cap) in three.js WebGPURenderer — semantics, gotchas, performance, and target architectures.'
status: active
created: '2026-05-11'
updated: '2026-05-11'
category: reference
related:
  - docs/research/webgpu-section-view-clipping-architecture.md
  - docs/policy/graphics-backend-policy.md
---

# WebGPU section view: canonical reference

Canonical, evidence-based reference for implementing a section view (clipping + visible cap surface) on `THREE.WebGPURenderer`. Source-grounded in three.js `dev` (r181+), three-mesh-bvh, three-cad-viewer, and Tau's own `apps/ui` graphics stack. Use this document to inform any future plan that touches clipping, capping, stencil, or `ClippingGroup`.

## Executive summary

WebGPU clipping in three.js is **scene-graph-driven, not material-driven**. `material.clippingPlanes` is silently ignored by `WebGPURenderer`; the only way a fragment is clipped is if the mesh is a descendant of a `THREE.ClippingGroup`. The `ClippingNode` TSL emits `discard()` for every clipped fragment, so **the cap quad cannot live inside the same `ClippingGroup` as the geometry it caps** — it would be discarded too. Stencil ops are fully supported on WebGPU but require `new WebGPURenderer({ stencil: true })` **and**, when post-processing is active, every intermediate `RenderTarget` must explicitly set `stencilBuffer = true` and a `DepthStencilFormat` depth texture — otherwise stencil is dropped silently (issue #31757). Hardware clipping (clip-distances) is the fast path for ≤8 union planes when `clipIntersection` and `alphaToCoverage` are both off; everything else falls through to the TSL discard path.

**Per-mesh cap visibility is governed by `isClosedManifold`.** The single most common cause of "some objects show capping, others don't" in the same scene is **per-color glTF primitive splitting**: kernel exporters that group faces by color emit one `THREE.Mesh` per color, and any topological face shared between two colors becomes an open boundary edge in each per-color primitive. The `isClosedManifold` filter (correctly designed to prevent cap artifacts) then rejects every primitive that participates in a color seam, so each non-manifold sub-mesh is clipped without a cap — the user sees the hollow interior. Per-color primitive splitting, open shells (lofts, surfaces, decorations), and sub-1e-6 vertex precision drift all converge on the same symptom.

**Decided direction (2026-05-11): Architecture C — BVH-accelerated per-mesh contour fill.** Stencil capping cannot deliver per-mesh-coloured caps for the full Tau scene set: it is fundamentally 1-bit-per-pixel, and the manifold gate inherits every Finding 11/12 failure mode. After reviewing seven candidate approaches (per-mesh stencil rounds, stencil reference IDs, MRT object-ID + colour LUT, BVH per-mesh contour fill, hybrid stencil+BVH, epsilon ribbons, back-face substitution), the only approach that is robust **and** consistent across closed mono-colour solids, multi-colour authored solids (per-colour split), and open shells is BVH-accelerated per-mesh contour fill. It also dissolves the post-processing render-target stencil concern (Recommendation R1) and the entire Findings 7/8/11/12 chain in one architectural step.

## Table of contents

- [Problem statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Per-mesh coloured caps](#per-mesh-coloured-caps)
- [Target architectures](#target-architectures)
- [Gotchas](#gotchas)
- [Performance](#performance)
- [Recommendations](#recommendations)
- [Comparison: WebGL stencil vs WebGPU stencil](#comparison-webgl-stencil-vs-webgpu-stencil)
- [Diagnostic: why does mesh X not show a cap?](#diagnostic-why-does-mesh-x-not-show-a-cap)
- [References](#references)

## Problem statement

The Tau viewport must render a CAD-style section view: a clipping plane that hides a half-space and a visible **cap surface** showing the cross-section where the plane coincides with solid geometry. The viewport runs both backends (WebGL and WebGPU) and must look identical on both.

Recent regressions — `material.clippingPlanes` no-op on WebGPU, then a working clip but invisible cap — pointed at the architectural mismatch between the WebGL pattern (per-material clipping + global `localClippingEnabled`) and the WebGPU pattern (`ClippingGroup` scene-graph + TSL `discard`). Existing Tau research (`docs/research/webgpu-section-view-clipping-architecture.md`) caught the clipping mismatch but did not capture the cap-rendering implications, leading to the cap-disappears regression. This document is the canonical reference so future plans do not retrace the same ground.

## Methodology

- **Three.js source review** at `repos/three.js` (branch `dev`, commit pinned via `repos.yaml`):
  - `src/objects/ClippingGroup.js` — scene-graph clipping primitive.
  - `src/nodes/accessors/ClippingNode.js` — TSL emitter (`setupDefault`, `setupAlphaToCoverage`, `setupHardwareClipping`).
  - `src/renderers/common/Renderer.js` — `_projectObject` traversal, `getGroupContext` per-`ClippingGroup` cache.
  - `src/renderers/common/ClippingContext.js` — plane-to-view-space projection, additive nesting.
  - `src/renderers/webgpu/utils/WebGPUPipelineUtils.js` — material stencil → `GPUDepthStencilState` translation.
  - `examples/webgpu_clipping.html`, `examples/webgl_clipping_stencil.html` — canonical official examples.
- **Repo deep-dives** (cloned via `pnpm repos add --clone`):
  - `repos/three-mesh-bvh/example/clippedEdges.js` — BVH-accelerated section view with stencil cap (WebGL).
  - `repos/three-cad-viewer/src/scene/clipping.ts` — production CAD viewer clipping/cap (WebGL).
- **Issue/PR review**: three.js #28237 (ClippingGroup), #28578 (hardware clipping), #31716 (shared geometry r180 fix), #31757 (post-processing render targets drop stencil), #31779 (multi-block ClippingGroup bug, fixed in r180).
- **Forum**: discourse.threejs.org thread 18407 (BufferGeometry stencil cap walkthrough).
- **Local verification** of Tau's own `apps/ui/app/components/geometry/graphics/three/{renderer.ts,post-processing-webgpu.tsx,react/section-clipping-group.tsx,react/section-cap.tsx,stage.tsx}`.

## Findings

Numbered, evidence-based findings. Cross-referenced from the Recommendations table at the end.

### Finding 1: WebGPU clipping is scene-graph-only — `material.clippingPlanes` is a silent no-op

`Renderer._projectObject` (`repos/three.js/src/renderers/common/Renderer.js:3111`) walks the scene graph and only mutates `clippingContext` when it encounters `object.isClippingGroup && object.enabled`:

```javascript
if (object.isClippingGroup && object.enabled) clippingContext = clippingContext.getGroupContext(object);
```

The `clippingContext` is then passed to `renderList.push(...)` and ultimately becomes the input to `ClippingNode.setup()` via `builder.clippingContext`. There is **no** code path on WebGPU that reads `material.clippingPlanes`. That property is exclusively a `WebGLRenderer` API (consumed inside `WebGLRenderer`'s deprecated `WebGLClipping`). On WebGPU, a mesh outside any `ClippingGroup` is fully unclipped regardless of what its material declares.

**Implication**: Every WebGL section-view recipe that sets `material.clippingPlanes` must be ported by either:

1. Wrapping the meshes in a `ClippingGroup` whose `clippingPlanes` carry the same planes, or
2. Authoring a custom `NodeMaterial` whose fragment graph emits `discard()` based on `positionView.dot(plane.xyz)`.

### Finding 2: `ClippingNode.setupDefault` discards every clipped fragment

`repos/three.js/src/nodes/accessors/ClippingNode.js:150` — the default scope (always active when not using `alphaToCoverage` or hardware clipping) iterates union planes and discards:

```javascript
Loop(numUnionPlanes, ({ i }) => {
  const plane = clippingPlanes.element(i);
  positionView.dot(plane.xyz).greaterThan(plane.w).discard();
});
```

This means **any mesh that is a descendant of a `ClippingGroup` whose plane points away from the cap-facing half-space gets every fragment killed when the cap quad sits on the clipped side**. This is the smoking gun behind "clipping works but cap is invisible": placing the cap quad inside the same `ClippingGroup` as the geometry guarantees the cap is discarded by the very plane it represents.

**Implication**: The cap quad must live **outside** the `ClippingGroup` of its own plane. If multiple planes are active, the cap quad for plane _i_ should still be inside `ClippingGroup`s for planes _j ≠ i_ (so it gets trimmed at plane intersections), but never inside the `ClippingGroup` of plane _i_.

### Finding 3: `ClippingGroup` planes are additive across nested groups

`ClippingContext.update` (`repos/three.js/src/renderers/common/ClippingContext.js:152`) projects parent planes first, then appends the group's own planes; `clipIntersection` flips between `unionPlanes` (default) and `intersectionPlanes` (when enabled). PR #28237 confirms: "_clipping planes are additive with nested groups_."

```javascript
this.intersectionPlanes = Array.from(parentContext.intersectionPlanes);
this.unionPlanes = Array.from(parentContext.unionPlanes);
// then append groups own planes via projectPlanes(...)
```

**Implication**: A multi-plane section view does **not** need one giant `ClippingGroup` — siblings or nested groups compose naturally, and `clipIntersection: true` on an inner group switches the meaning of _that group's planes only_.

### Finding 4: Stencil pipeline is wired, but render targets drop it by default

`WebGPUPipelineUtils.js:139-264` translates `material.stencilWrite/stencilFunc/stencilFail/stencilZFail/stencilZPass/stencilRef/stencilFuncMask/stencilWriteMask` into `GPUDepthStencilState`:

```javascript
if (material.stencilWrite === true) {
  stencilFront = {
    compare: this._getStencilCompare(material),
    failOp: this._getStencilOperation(material.stencilFail),
    depthFailOp: this._getStencilOperation(material.stencilZFail),
    passOp: this._getStencilOperation(material.stencilZPass),
  };
}
// stencilBack = stencilFront — three.js does not expose face-separated stencil
```

But `_getStencilOperation` is only invoked when `renderContext.stencil === true`, which is set from either `Renderer.stencil` (the constructor flag) for the default framebuffer or from `renderTarget.stencilBuffer` for off-screen passes (`Renderer.js:1732, 2989`).

**Issue #31757** is the canonical reference: `pass()` and `reflector()` nodes create their own internal render targets, and unless you mutate them after construction, those targets do **not** allocate a stencil attachment. Mugen87's verbatim fix:

```javascript
scenePass.renderTarget.stencilBuffer = true;
scenePass.renderTarget.depthTexture.format = THREE.DepthStencilFormat;
scenePass.renderTarget.depthTexture.type = THREE.UnsignedInt248Type;
```

**Implication**: A renderer constructed with `{ stencil: true }` is necessary but not sufficient. **Every intermediate `RenderTarget` in the post-processing chain must be patched.** Tau's `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` constructs `pass(scene, camera)` for both pre-pass and scene-pass without this configuration — that is a likely contributor to the "cap invisible on WebGPU" symptom because the scene render is going through a stencil-less render target.

### Finding 5: `renderOrder` is not optional — it is the contract

`webgl_clipping_stencil.html` enforces a strict order:

- Stencil writers (front and back proxies): `renderOrder = i + 1` (1, 2, 3 for three planes)
- Cap quads: `renderOrder = i + 1.1` (1.1, 2.1, 3.1)
- Final shaded mesh: `renderOrder = 6`

three-mesh-bvh's `clippedEdges.js:91`:

- Stencil writers: default `renderOrder = 0`
- Equal-depth shaded surface: `renderOrder = 1`
- Cap quad: `renderOrder = 2`
- Outline lines: `renderOrder = 3`

three-cad-viewer's `clipping.ts` similarly orders stencil before cap.

`stencilFunc: NotEqualStencilFunc` on the cap quad means **the cap reads the stencil written by the proxies**. If the cap renders before the proxies, the stencil is zero everywhere and the cap is invisible. Mugen87 (issue #31757): _"Ah wait, it's a matter of render order. You must make sure the plane defining the stencil mask is always rendered first."_

WebGPU does **not** change this. Three.js sorts the render list by `renderOrder` (then group order, then depth) before dispatching draw calls, regardless of backend.

### Finding 6: Hardware clipping is the fast path but has restrictions

PR #28578 added `clip-distances` (WebGPU) and `WEBGL_clip_cull_distance` (WebGL2) hardware clipping in `ClippingNode.setupHardwareClipping` (`ClippingNode.js:198`). The vertex shader writes `gl_ClipDistance[i]`, the GPU rejects primitives whose clip distance is negative, and **the fragment shader does not run for clipped fragments** (no `discard` cost).

Restrictions (from PR #28578):

- ≤8 union planes total.
- Disabled when `clipIntersection: true` (intersection logic is per-fragment, not per-vertex).
- Disabled when `alphaToCoverage: true` (smooth-edge clipping needs the smoothstep gradient, not a binary clip).

When ineligible, three.js silently falls back to `setupDefault` (the discard path). Both paths produce identical visual results; only the GPU cost differs.

### Finding 7: Stencil cap requires the actual shape geometry, not a proxy box

All three references use the **real shape geometry** for stencil parity:

- `webgl_clipping_stencil.html:62` — `createPlaneStencilGroup(geometry, plane, renderOrder)` where `geometry` is the torus knot itself.
- `repos/three-mesh-bvh/example/clippedEdges.js:215-243` — `frontSideModel`/`backSideModel` are clones of the loaded mesh.
- `repos/three-cad-viewer/src/scene/clipping.ts:451-475` — front/back stencil meshes share `group.shapeGeometry` (the solid's actual mesh).

**Why**: The increment/decrement parity creates a non-zero stencil count exactly where the section plane intersects solid volume. A `BoxGeometry` proxy bears no relation to the solid's silhouette; the stencil it produces is a rectangle, so the cap visualisation is a rectangle — not the solid's true cross-section. This is a likely Tau-specific bug if Tau's `SectionStencilProxies` ever switched to box proxies (verified via `apps/ui/app/components/geometry/graphics/three/react/section-cap.tsx:70-97` — Tau correctly uses `mesh.geometry`, but the prior summary's mention of "BoxGeometry proxies" should be re-checked in tests).

### Finding 8: Solids must be closed (manifold) for stencil parity to work

The increment-front / decrement-back parity assumes every entry into the volume has a matching exit. If the solid has a hole (open mesh, missing back faces, badly-tessellated NURBS), the stencil count drifts and the cap shows holes or stripes.

three-cad-viewer guards against this at `clipping.ts:444` — it only generates stencils when `group.subtype === 'solid' && group.front`. Tau's `collectStencilCapTargets` already filters via `isClosedManifold`, which is correct.

**Implication**: Mesh-line geometry (edges-only outputs from kernels) cannot have a stencil cap. Either skip them or render only contour lines (BVH `clippedEdges` approach).

### Finding 9: Cap material on WebGPU should be `NodeMaterial`-based

`MeshBasicMaterial` and `MeshStandardMaterial` work on WebGPU via auto-conversion to their `*NodeMaterial` counterparts. But `ShaderMaterial` and `RawShaderMaterial` are explicitly unsupported (issue #26925). For a custom striped/hatched cap, author a `MeshBasicNodeMaterial` (or `NodeMaterial` directly) with a `colorNode` that builds the stripe pattern in TSL — this works on both backends and gives identical output.

`material.clippingPlanes` on the cap is ignored on WebGPU (Finding 1), so to clip the cap by _other_ planes (multi-plane intersection), the cap quad must be a descendant of those other planes' `ClippingGroup`s.

### Finding 10: BVH-based contour lines are WebGL-only today

three-mesh-bvh's `clippedEdges.js` uses `WebGLRenderer`, `localClippingEnabled`, and `material.clippingPlanes` directly. The `three-mesh-bvh/webgpu` export (added in v0.9.2, October 2025) provides TSL functions for raycast/distance compute shaders but **does not** include a WebGPU-ready contour-line example. Porting the algorithm to WebGPU requires:

1. Replacing `material.clippingPlanes` with a `ClippingGroup` ancestor.
2. Routing CPU-extracted line vertices into a `LineSegments` with a `LineBasicNodeMaterial` (line width is still 1 unless you author a `Line2`/fat-line shader).
3. Performing the BVH traversal CPU-side as today, or migrating to the compute-shader path.

For Tau, BVH contour lines are an enhancement, not a blocker for the cap — current TSL discard is sufficient.

### Finding 11: Per-color glTF primitive splitting is the smoking-gun for "some objects cap, others don't"

This is the **root cause** behind the inconsistent-cap regression observed in the Dutch Windmill scene (cream walls cap correctly, dark hat and wooden details show hollow interior).

The chain of causation:

1. **Cap eligibility is gated by `isClosedManifold`.** Tau's `apps/ui/app/components/geometry/graphics/three/react/section-view.utils.ts:137-156` calls `collectStencilCapTargets`, which traverses every `THREE.Mesh` under the inner ref and feeds `child.geometry` into `isClosedManifold([…])`. The check at lines 210-276 spatial-keys every triangle vertex via `vertexKey(x, y, z)` (1e-6 quantize) and asserts that **every edge appears exactly twice** in the index buffer. Any geometry with one or more `count !== 2` edges is rejected — no stencil proxies are emitted, so the single cap quad sees stencil = 0 over that mesh's footprint and `NotEqualStencilFunc` discards the fragment.
2. **The kernel export pipeline writes per-color, unwelded primitives.** In `packages/runtime/src/utils/export-glb.ts:97-204`, `groupFacesByColor` partitions every face by its color key, then for each color group emits a fresh `BufferGeometry` where positions/normals are duplicated per-triangle and indices are sequential `[0,1,2, 3,4,5, …]`. Each color group becomes one glTF `primitive`, and the GLTFLoader instantiates each primitive as a separate `THREE.Mesh`.
3. **Topological face-sharing across colors becomes an open boundary on each side.** A solid that the user authored as a single closed shape, then painted with `paintColor()` per face, has internal edges shared between two faces of different colors. After `groupFacesByColor`, each color group contains only the triangles of its own color; the shared edge appears in the cream primitive's index buffer but **not** in the dark primitive's index buffer (and vice versa). In the cream primitive, that edge has `count = 1`. In the dark primitive, the same edge has `count = 1`. **Both primitives fail the manifold check**, even though the geometry is conceptually a single closed solid.
4. **In-color spatial welding still works, so a fully-mono-color closed solid passes.** Within a single color group, two triangles sharing an edge produce identical `tri.v_n` source values (bit-equal floats copied from the same `vertices[i]` slot), so the spatial-key dedupe in `vertexKey` pairs them and edges are correctly counted twice. Mono-color solids → cap renders. Multi-color solids → no primitive caps unless every color group is independently closed (e.g. when the user paints whole detached sub-shapes one color each).

**Evidence**:

```typescript
// packages/runtime/src/utils/export-glb.ts:160-197 — fresh per-triangle layout
const positions = new Float32Array(numberTriangles * 3 * 3);
const normals = new Float32Array(numberTriangles * 3 * 3);
const indices = new Uint32Array(numberTriangles * 3);
for (let triIndex = 0; triIndex < numberTriangles; triIndex++) {
  const tri = triangles[triIndex]!;
  positions[positionIndex++] = tri.v1[0]; // … each vertex written once per triangle
  // …
  indices[triIndex * 3] = triIndex * 3; // sequential — no edge sharing in the index buffer
  indices[triIndex * 3 + 1] = triIndex * 3 + 1; // (intra-color welding is recovered later
  indices[triIndex * 3 + 2] = triIndex * 3 + 2; //  by `vertexKey` spatial dedupe in `isClosedManifold`)
}
```

```typescript
// apps/ui/app/components/geometry/graphics/three/react/section-view.utils.ts:137-156 — gate
export function collectStencilCapTargets(rootGroup: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  rootGroup.traverse((child) => {
    if (hasSceneTag(child, sceneTag.sectionViewHelper)) return;
    if (!isMeshWithBufferGeometry(child)) return;
    const { closed } = isClosedManifold([child.geometry]);
    if (closed) result.push(child);
  });
  return result;
}
```

**Why the windmill image looks the way it does**:

| Mesh                  | Likely topology            | Per-color primitive(s)      | Manifold passes? | Cap shown? |
| --------------------- | -------------------------- | --------------------------- | ---------------- | ---------- |
| Cream walls           | Single-color closed solid  | One primitive, fully closed | ✅               | ✅         |
| Dark hat              | Multi-color solid OR loft  | Open at color/face seam     | ❌               | ❌         |
| Wooden balcony/ladder | Open shells / thin details | Open by construction        | ❌               | ❌         |
| Internal scaffolding  | Surface or shell           | Open by construction        | ❌               | ❌         |

**Replicad / OCCT export path note**: Replicad uses its own assembly exporter (`repos/replicad/packages/replicad/src/export/assemblyExporter.ts`) which writes one glTF primitive per `ShapeConfig` rather than per color group. A `ShapeConfig` that is a single closed `TopoDS_Solid` exports as a closed primitive; one whose `appearance()` is painted per-face, or which is a `TopoDS_Shell`/loft/surface, exports as an open primitive. The same root-cause pattern applies; only the splitting boundary moves from "color group" to "shape config".

**`THREE.Mesh` with multi-material array**: GLTFLoader sometimes preserves a single `THREE.Mesh` with `material: Material[]` and `geometry.groups[]` for multi-material primitives instead of splitting. In that path, `child.geometry` is the shared full geometry — manifold check sees the whole geometry's edge counts and may pass. So **whether a multi-color authored solid caps or not depends on whether the loader split per primitive or kept a multi-material mesh**. Tau's current loader path appears to split, which is the worst case for cap eligibility.

### Finding 12: Vertex-key tolerance in `isClosedManifold` is fixed at 1e-6

`vertexKey(x, y, z)` rounds each coordinate to `1e-6`. For Tau's post-export coordinate system (meters after Z-up→Y-up + mm→m transform), 1e-6 = 1 µm. Tessellation produced by OCCT's `BRepMesh_IncrementalMesh` typically reuses identical edge-vertex parameters across adjacent faces, so vertex positions are bit-identical and the 1e-6 quantize matches them. But:

- **Post-export float precision drift**: `Float32Array` storage in glTF accessors loses ~1e-7 of relative precision compared to the kernel's double-precision triangulation. For meshes near unit scale, this is well below 1e-6 — should pass. For meshes at sub-mm scale (e.g. fine 3D-printed details authored in sub-mm units), 1e-6 quantize can falsely separate vertices that are ~1e-7 apart but originally identical.
- **`groupFacesByColor` calls `transform(v)` per triangle**: the same source vertex passed through the same transform should produce bit-identical outputs (deterministic), so this does not introduce drift in practice.
- **Rotated/transformed scene graph**: `isClosedManifold` reads positions from the geometry attribute directly — no world-space transform applied. So scene-graph rotations don't impact the check.

In short: the 1e-6 tolerance is a reasonable default but **scale-dependent**. If a model fails manifold despite being conceptually closed, raising tolerance (e.g. to `1e-5` or scale-relative) is the lever — but doing so risks false-positives where genuinely-distinct vertices fold together on coarse meshes. A robust fix uses neighbor-grid spatial welding mirroring `packages/runtime/src/utils/watertight.ts`'s `classifyEdges` (referenced in AGENTS.md for the connected-components fix in `@taucad/testing`).

### Finding 13: Stencil capping is fundamentally incompatible with per-mesh-coloured caps

The stencil cap pipeline is **1 bit per pixel per mesh**. The increment-back / decrement-front parity tells the cap quad "any solid was cut here" but throws away every other piece of information — including the identity of _which_ mesh wrote the bit. `NotEqualStencilFunc` reads a binary "non-zero" condition; multiple meshes contribute to the same stencil count, so a single cap quad cannot recover per-fragment colour from the stencil channel.

Three escape hatches exist; only one is architecturally sound:

1. **Per-mesh stencil round** — run a full stencil cycle per mesh (front-stencil → back-stencil → cap quad with that mesh's material → `clearStencil`). Because each cycle clears stencil at the end, cap _i_ reads only its own parity. Per-mesh colour works natively. **But still gated by `isClosedManifold`** — Findings 11/12 failures (per-colour split, open shells, precision drift) still produce uncapped meshes. Solves the colour question for meshes that already cap; does not extend coverage.
2. **Stencil reference IDs** — write mesh ID via `stencilRef + ReplaceStencilOp` instead of increment/decrement. **Architecturally broken**: `Replace` collapses the volume parity, so the cap traces the mesh's bounding silhouette (a rectangle for a box mesh, a circle for a sphere) instead of the actual cut surface. Rejected.
3. **MRT object-ID + colour LUT** — pre-pass writes object IDs into a second render target; cap pass samples ID and looks up colour. Still needs to know which fragments are _in the cap_ (stencil or BVH under the hood) — strictly worse than running BVH alone.

The architecturally complete answer is to **bypass stencil entirely and produce the cap geometry directly**: for each mesh, compute the plane-mesh intersection polygon CPU-side (BVH-accelerated), triangulate it, and render the fill with the source mesh's material. This is the three-mesh-bvh `clippedEdges` algorithm extended with `earcut` triangulation for the fill, and it is the only approach that simultaneously delivers per-mesh colour, multi-colour-authored-solid coverage, open-shell coverage (as outline), WebGL/WebGPU parity, and independence from the post-processing render-target stencil trap.

## Per-mesh coloured caps

Adding a per-mesh-coloured cap to the section view (so the cream walls cap in cream, the dark hat caps in dark, etc.) raises a separate architectural question from the bare cap visibility one. This section reviews seven candidate approaches and records the chosen direction.

### Approach matrix

| #   | Approach                                                                                           | Per-mesh colour | Closed mono-colour solid               | Multi-colour authored solid (per-colour split) | Open shell                                     | Per-frame cost                                                     | Complexity |
| --- | -------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| 1   | **Per-mesh stencil round** (one cycle per manifold mesh, three-cad-viewer pattern)                 | ✅              | ✅                                     | ❌ inherits Finding 11 manifold gate           | ❌                                             | 3N draw calls, N small cap quads                                   | Low        |
| 2   | **Stencil reference IDs** (`Replace` op, mesh ID per ref)                                          | ✅ convex only  | ❌ loses parity → silhouettes the bbox | ❌                                             | ❌                                             | —                                                                  | rejected   |
| 3   | **MRT object-ID + colour LUT** (pre-pass writes ID, cap pass looks up colour)                      | ✅              | depends on stencil under the hood      | depends                                        | depends                                        | 1 extra MRT attachment + lookup                                    | High       |
| 4   | **BVH per-mesh contour fill** ([Architecture C](#architecture-c-bvh-per-mesh-contour-fill-chosen)) | ✅              | ✅                                     | ✅ per colour group                            | ⚠ outline only when intersection is open chain | CPU O(triangles-near-plane) — ~1–3 ms on 2M tris in three-mesh-bvh | Med-high   |
| 5   | **Hybrid (1 + 4)**: stencil for closed mono-colour, BVH for the rest                               | ✅              | ✅                                     | ✅                                             | ✅                                             | Mixed                                                              | High       |
| 6   | **Epsilon-band NodeMaterial** (TSL `discard`-based ribbon near plane)                              | ✅              | ❌ ribbon, no fill                     | ❌                                             | ❌                                             | Trivial                                                            | Low        |
| 7   | **Back-face material substitution** (no cap, three-cad-viewer fallback)                            | ✅              | ⚠ shows interior, not flat cap         | ⚠                                              | ❌                                             | 1 extra pass                                                       | Low        |

### Why approaches 2, 3, 6, 7 fail the test

- **#2** writing a specific stencil value via `Replace` collapses the front/back parity that detects volume. Cap traces the mesh's bounding silhouette, not the actual cut surface. Architecturally incompatible with stencil capping.
- **#3** still needs to know which fragments are _in the cap_ — combined with stencil it re-introduces every Finding 11/12 failure mode and the issue #31757 render-target gotcha; combined with BVH it's strictly worse than #4 alone.
- **#6** doesn't actually fill the interior — just colours the surface where it's close to the plane. Already noted as "Architecture B" placeholder.
- **#7** doesn't produce a flat cap, just makes the hollow look less hollow. Useful as a _fallback_ (R12), not a primary technique.

### Honest #1 vs #4 trade-off

**Approach 1 — per-mesh stencil round**: well-trodden CAD-viewer pattern (three-cad-viewer is exactly this), simple to implement, fast. **Hard limit**: still gated by `isClosedManifold`. Anything that fails Finding 11 (multi-colour authored solid → per-colour split → open boundary at colour seam), Finding 12 (sub-1e-6 drift), or the open-shell case **gets no cap at all**. Switching to per-mesh stencil makes the meshes that already cap colour-correct but doesn't extend coverage. Not the answer to "robust and consistent".

**Approach 4 — BVH per-mesh contour fill**: independent of manifoldness, independent of per-colour split, independent of stencil entirely. Per-mesh colour is direct (the fill mesh inherits the source material). WebGL/WebGPU parity is automatic (pure CPU pipeline → `BufferGeometry` + `LineSegments`). One-time `MeshBVH` build per primitive (~5–50 ms, cached on geometry assignment, invalidated on mutation); per-frame O(triangles-near-plane) (~1–3 ms on 2M tris in three-mesh-bvh's flagship). Pre-sized vertex buffers (~600 KB for 50K segments) avoid per-frame allocation. `frameloop='demand'` means cost only accrues during interaction.

Caveats:

- Earcut requires _closed_ 2D polygons. Open meshes produce open chains, which can't be filled — those degrade to outline-only (BVH `clippedEdges` line rendering). The Dutch Windmill railing/ladder case lands here: surface-only geometry, no fill is mathematically meaningful.
- Plane–edge robustness gotchas (PR #434, vertex-on-edge degeneracy) — three-mesh-bvh has the canonical fix encoded; we inherit it directly by using the same algorithm.
- BVH builds on each `geometry` assignment; needs invalidation when the kernel re-renders.

### Decision

**Tau adopts Approach 4 (Architecture C — BVH-accelerated per-mesh contour fill).** Approach 1 is a strict sub-case that solves the colour question only for meshes that already cap, leaving every Finding 11/12/G18 failure mode in place. Adopting it means doing the implementation work twice (once for stencil, then again for BVH when the per-colour-split / open-shell cases inevitably resurface). Skipping straight to Approach 4 dissolves per-mesh colour, per-colour split, the manifold gate, and the post-processing render-target stencil concern (R1) in one architectural step.

## Target architectures

Three architectures considered for WebGPU section view. After the [per-mesh coloured caps](#per-mesh-coloured-caps) review, **Architecture C is the chosen direction** — Architectures A and B remain documented for reference (A explains the prior approach and the post-processing render-target trap; B explains why the epsilon-ribbon shortcut is insufficient).

### Architecture A: ClippingGroup + stencil cap (prior approach, parity with WebGL)

```
<group> (outer)
  <ClippingGroup planes=[plane]>          ← scene-graph clipping for the viewable half
    <group ref={innerRef}>
      <CADGeometry />                     ← gets clipped by ClippingGroup
    </group>
    <SectionStencilProxies />             ← front/back parity per closed solid
  </ClippingGroup>
  <SectionCapPlane />                     ← OUTSIDE the ClippingGroup; reads stencil
</group>
```

- **Stencil proxies** (inside `ClippingGroup`):
  - Front face: `MeshBasicMaterial` with `stencilWrite: true`, `colorWrite: false`, `depthWrite: false`, `depthTest: false`, `side: FrontSide`, `stencilFail/ZFail/ZPass: IncrementWrapStencilOp`, `stencilFunc: AlwaysStencilFunc`.
  - Back face: same but `side: BackSide`, `DecrementWrapStencilOp`.
  - `renderOrder = 1` (or per-plane index for multi-plane).
- **Cap quad** (outside `ClippingGroup`):
  - `MeshBasicNodeMaterial` (or custom `NodeMaterial`) with the desired stripe/hatch.
  - `stencilWrite: true`, `stencilRef: 0`, `stencilFunc: NotEqualStencilFunc`, `stencilFail/ZFail/ZPass: ReplaceStencilOp`.
  - `onAfterRender = (renderer) => renderer.clearStencil()`.
  - Position: `plane.coplanarPoint(...)` then `lookAt` to align quad normal with plane normal; offset by `-zFightingOffset * normal` to avoid Z-fighting.
  - Size: `2 * boundsRadius` so the quad covers the whole bounding sphere of the geometry.
  - `renderOrder = 2` (after stencil writers, before any post-processing).
- **Renderer**: `new WebGPURenderer({ stencil: true })`.
- **Post-processing**: every `pass()` / `reflector()` `renderTarget` must set `stencilBuffer = true`, `depthTexture.format = DepthStencilFormat`, `depthTexture.type = UnsignedInt248Type`. **This is the most-missed step** (issue #31757).

This is the canonical CAD-viewer approach (three-cad-viewer, three-mesh-bvh `clippedEdges` example uses it). **Tau is migrating away from it** because (a) the manifold gate (`isClosedManifold`) excludes per-colour-split primitives and open shells from the cap (see Findings 11, 12, 13), and (b) the 1-bit-per-pixel stencil channel cannot encode per-mesh colour without per-mesh stencil rounds, which still inherit the manifold gate. See Architecture C below.

### Architecture B: Hardware clipping + custom NodeMaterial cap (no stencil)

For sections that do not need a _filled_ cap (just a colored fragment where the plane meets the geometry surface, no interior), drop stencil entirely:

1. Wrap geometry in `ClippingGroup` with the plane.
2. Author a `NodeMaterial` whose `colorNode` writes a stripe color when `abs(positionView.dot(plane.xyz) - plane.w) < epsilon`, transparent otherwise. Render this material on the geometry **without** a separate cap quad.

Trade-offs:

- ✅ Zero stencil setup, no render-target patching.
- ✅ Cap automatically follows the silhouette (no boundsRadius sizing).
- ❌ The cap is visible only where geometry surfaces are within `epsilon` of the plane — does not fill the interior of the cut.
- ❌ Looks correct on simple convex shapes; produces "ribbons" on thin shells.

**Verdict**: Only viable as a placeholder. Not equivalent to the stencil cap.

### Architecture C: BVH per-mesh contour fill (chosen)

Per mesh, per frame, on CPU:

1. Project the world-space plane into mesh-local space.
2. `MeshBVH.shapecast` with `Plane.intersectsBox` to cull entire BVH subtrees that don't straddle the plane.
3. For each visited triangle, run `Plane.intersectLine` on the three edges and collect 2D segment endpoints (the same algorithm three-mesh-bvh's `clippedEdges` example ships, including the PR #434 vertex-on-edge degeneracy fix).
4. Assemble segments into closed contours via edge-loop reconstruction; open chains stay as polylines.
5. Triangulate each closed contour with `earcut` (~tens of µs per polygon).
6. Render the resulting fill mesh with the source mesh's material (or a flat-shaded `MeshBasicNodeMaterial` carrying the source `color` / `colorNode` / `opacity`); render open polylines as `LineSegments` for outline-only feedback.

```
<group>
  <ClippingGroup planes=[plane]>
    <CADGeometry />                          ← gets clipped (descendants only)
  </ClippingGroup>
  <SectionContourFills>                      ← OUTSIDE the ClippingGroup
    {meshesInScene.map((mesh) => (
      <BvhContourFill mesh={mesh} plane={plane} />  ← per-mesh fill, inherits mesh material
    ))}
  </SectionContourFills>
</group>
```

Architectural properties:

- **Independent of manifoldness** — open shells produce open chains (rendered as outlines), closed solids produce closed loops (rendered as fills). Findings 7, 8, 11, 12 stop being gates.
- **Independent of per-colour split** — applied to each `THREE.Mesh` primitive, so the fill is automatically per-colour. Each per-colour primitive contributes its own contour fill in its own colour.
- **No stencil** — sidesteps issue #31757, the post-processing render-target stencil trap, the `renderOrder` contract, the `clearStencil` ordering, and gotchas G2–G4, G8–G14.
- **Per-mesh colour is direct** — the fill mesh literally inherits the source material; no LUT, no MRT, no encoding.
- **WebGL/WebGPU parity is automatic** — pure CPU pipeline outputs `BufferGeometry` + `LineSegments`, both of which work identically on both backends. No backend split inside the section-view module.
- **Composable with hardware clipping** — geometry stays in the `ClippingGroup` so the visible half clips via TSL `discard` (or hardware clip-distances when ≤8 union planes). Cap fills sit outside the group and render unclipped at the plane.

Performance budget:

- One-time `MeshBVH` build per primitive: ~5–50 ms depending on triangle count, paid on geometry assignment, cached, invalidated when the kernel re-renders the geometry.
- Per-frame: O(triangles near the plane) per primitive. three-mesh-bvh's flagship demo runs 2M tris in ~1–3 ms. Tau's typical scene (~50 primitives × ~10K tris) lands well under 5 ms total, comfortably within `frameloop='demand'` budget.
- Pre-sized vertex buffers (the three-mesh-bvh example uses 50 000 segments ≈ 600 KB) avoid per-frame allocation; `setDrawRange` updates segment count.
- Geometry mutation invalidates BVH; cache key is the geometry's `version` counter.

Caveats:

- Earcut requires _closed_ 2D polygons. Open meshes (railings, lofts, decorative surfaces) produce open chains and degrade to outline-only — mathematically correct since there's no interior to fill.
- Plane–edge robustness gotchas (PR #434, vertex-on-edge degeneracy) are inherited by using three-mesh-bvh's algorithm verbatim.
- Coplanar-triangle case: when the plane is exactly co-planar with a mesh face, `Plane.intersectLine` returns null for all three edges — the contour skips that face; visually this just means the cap doesn't include faces that _are_ the cap, which is fine.

## Gotchas

| #   | Gotcha                                                                                                  | Symptom                                                                                                                             | Reference                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| G1  | Cap quad inside the same `ClippingGroup` as the geometry it caps                                        | Clipping works, cap entirely invisible on WebGPU                                                                                    | Finding 2                                                                                        |
| G2  | Forgetting `new WebGPURenderer({ stencil: true })`                                                      | Stencil ops compile but never write — cap silently invisible                                                                        | Finding 4                                                                                        |
| G3  | Post-processing `pass()` render targets without `stencilBuffer = true`                                  | Stencil works in non-post-processing, breaks the moment GTAO/etc is enabled                                                         | Finding 4, issue #31757                                                                          |
| G4  | Setting `material.clippingPlanes` on WebGPU and expecting it to clip                                    | No clipping at all, no warning                                                                                                      | Finding 1                                                                                        |
| G5  | Setting `gl.localClippingEnabled = true` on WebGPU                                                      | No-op (property does not exist on `WebGPURenderer`); does not break, just ignored                                                   | Finding 1                                                                                        |
| G6  | Stencil proxies use a proxy box geometry instead of the shape's geometry                                | Cap shows the bounding box, not the solid's silhouette                                                                              | Finding 7                                                                                        |
| G7  | Open/non-manifold meshes feeding the stencil parity                                                     | Cap shows holes/stripes                                                                                                             | Finding 8                                                                                        |
| G8  | Wrong `renderOrder` (cap before stencil writers)                                                        | Cap reads stencil = 0 everywhere → invisible                                                                                        | Finding 5, issue #31757                                                                          |
| G9  | Using `ShaderMaterial` / `RawShaderMaterial` for the cap                                                | Hard error on WebGPU; "Material 'ShaderMaterial' is not compatible"                                                                 | Finding 9, issue #26925                                                                          |
| G10 | Using `clipIntersection: true` and expecting hardware clipping                                          | Silently falls through to discard path; same visual result, slower                                                                  | Finding 6                                                                                        |
| G11 | r178/r179 ClippingGroup with shared geometry across multiple meshes                                     | Clipping rotates with camera; toggling `enabled` "fixes" it temporarily                                                             | three.js #31779; fixed by #31716 in r180                                                         |
| G12 | Cap plane size hard-coded too small                                                                     | Cap clipped to a rectangle smaller than the geometry's silhouette → cap misses parts of the cut                                     | Finding 7; cap size must scale with `boundsRadius`                                               |
| G13 | Forgetting `onAfterRender = renderer.clearStencil()` on the cap                                         | Stale stencil bleeds across frames; first frame OK, subsequent frames glitchy                                                       | `webgl_clipping_stencil.html:171`, three-cad-viewer `clipping.ts`                                |
| G14 | Cap material `transparent: true` with `NotEqualStencilFunc`                                             | Stencil works on the opaque pass; transparent passes don't write the same depth/stencil — cap may show partial fragments            | three.js stencil ops apply to the material's pass; keep cap opaque or accept the asymmetry       |
| G15 | `coplanarPoint(out)` writes to `out` but does not clone the plane normal                                | Reusing module-level scratch vectors across multiple cap planes corrupts each other if not cloned per call                          | Pattern from `webgl_clipping_stencil.html:303-308`                                               |
| G16 | Multi-color authored solid exported via `groupFacesByColor` → per-color glTF primitives                 | Cap renders for some primitives and not others in the same scene; mono-color solids cap, multi-color do not                         | Finding 11; `packages/runtime/src/utils/export-glb.ts:97-204`                                    |
| G17 | `isClosedManifold` tolerance hard-coded at 1e-6                                                         | False-negatives on sub-mm-scale meshes; cap silently disabled                                                                       | Finding 12; `apps/ui/app/components/geometry/graphics/three/react/section-view.utils.ts:183-188` |
| G18 | Open shells (lofts without caps, swept surfaces, decorations, railings)                                 | Cap silently disabled; clipping still works → user sees hollow interior                                                             | Finding 8 + Finding 11                                                                           |
| G19 | Loader path keeps multi-material `THREE.Mesh` with `geometry.groups` instead of splitting per primitive | Manifold check sees the full closed geometry → cap renders. The same source asset may cap or not depending on loader version/config | Finding 11 (note); GLTFLoader behavior                                                           |

## Performance

| Aspect               | Hardware clipping                           | TSL discard             | Stencil cap                                                                | BVH contour                                                      |
| -------------------- | ------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Fragment shader cost | None for clipped fragments                  | Full FS run + `discard` | One extra opaque pass for cap                                              | None on cap                                                      |
| Vertex shader cost   | One extra `gl_ClipDistance` write per plane | None                    | None                                                                       | None                                                             |
| CPU per frame        | None                                        | None                    | None                                                                       | O(BVH-visited triangles) — ~1 ms for 2M tris with `useBVH: true` |
| GPU memory           | None                                        | None                    | One full-screen stencil buffer (8 bits, depth-stencil texture)             | One pre-sized line vertex buffer (~1 MB for 50k segments)        |
| Plane count cap      | 8 (union, no intersection, no A2C)          | Unlimited               | Unlimited                                                                  | Unlimited                                                        |
| Multi-pass cost      | One pass                                    | One pass                | Three passes per cap (front-stencil, back-stencil, cap) plus geometry pass | One pass for lines                                               |
| Scaling              | O(1) GPU                                    | O(fragments) GPU        | O(fragments × planes) GPU                                                  | O(triangles-near-plane) CPU                                      |

**Tau-specific budget**: viewport runs `frameloop='demand'` so per-frame cost only matters during interaction. Stencil cap ≤ 1 ms/frame on a 100k-poly model is fine; BVH contour adds < 1 ms for the same model. Hardware clipping is the cheap default; only fall back to TSL discard when intersection or A2C is enabled.

**Reversed-Z + stencil**: Tau's WebGPU renderer uses `reversedDepthBuffer: true`. Stencil ops are independent of depth direction (stencil writes happen after depth test regardless), so reversed-Z does not interact with the stencil cap pipeline. `polygonOffset`/`polygonOffsetFactor`/`polygonOffsetUnits` on the cap quad would translate to `depthBias`/`depthBiasSlopeScale` (`WebGPUPipelineUtils.js:270-272`); the **sign** must be appropriate for reversed-Z (subtract, not add) — same lesson as the gltf-edges depth-bias gotcha in `AGENTS.md`.

## Recommendations

Recommendations are split into the **chosen direction** (Approach 4 / Architecture C) and **decommissioned recommendations** that targeted the prior stencil pipeline.

### Chosen direction: BVH per-mesh contour fill

| #   | Action                                                                                                                                                                                                                                                                                                                                                   | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R8  | **Replace stencil cap pipeline with BVH per-mesh contour fill (Architecture C).** Build `MeshBVH` per primitive on geometry assignment; per frame, `shapecast` against the plane, extract triangle-edge intersection segments, assemble closed contours, triangulate with `earcut`, render fill in source-mesh material. Open chains render as outlines. | P0       | High   | High   |
| R8a | Extract the BVH build into a per-primitive cache keyed on `geometry.uuid + geometry.attributes.position.version`; invalidate on geometry mutation; share between Tau's existing CAD module and the section-view module                                                                                                                                   | P0       | Med    | High   |
| R8b | Pre-size the cap-fill `BufferGeometry` and `LineSegments` buffers (initial 50K segments per primitive, grow on demand); use `setDrawRange` to update segment count instead of allocating new geometries per frame                                                                                                                                        | P0       | Low    | High   |
| R8c | Inherit each source mesh's material when rendering the cap fill — for `MeshStandardNodeMaterial` source, use `MeshBasicNodeMaterial` carrying `colorNode`/`color`/`opacity` to skip lighting on the flat cap                                                                                                                                             | P1       | Low    | High   |
| R8d | Add a Vitest TSL snapshot for the cap-fill `MeshBasicNodeMaterial` under `__shader-snapshots__/` (per `apps/ui/app/components/geometry/graphics/three/utils/tsl-node-graph-snapshot.ts`)                                                                                                                                                                 | P1       | Low    | Medium |
| R8e | Add a Playwright fixture under `apps/ui-e2e/src/` rendering the windmill scene with section view active on both backends, asserting per-primitive cap fill colours match the source materials                                                                                                                                                            | P1       | Med    | High   |
| R8f | Adopt three-mesh-bvh's PR #434 vertex-on-edge fix verbatim — pin the BVH version in `repos.yaml` and reference the PR in a comment near the intersection-segment code                                                                                                                                                                                    | P1       | Low    | Medium |
| R7  | When introducing per-kernel native section-view UX (e.g. multi-plane intersection), keep clipping itself on `ClippingGroup` + hardware clip-distances; the BVH cap pipeline is plane-agnostic and extends naturally to multi-plane                                                                                                                       | P2       | Low    | Medium |

### Decommissioned (kept for context, no longer the path forward)

| #   | Action                                                                                                      | Status                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R1  | Audit `post-processing-webgpu.tsx` for `pass()` render targets missing `stencilBuffer + DepthStencilFormat` | **Decommissioned** — Architecture C uses no stencil; the post-processing render-target trap dissolves   |
| R2  | Verify stencil proxies use `mesh.geometry`                                                                  | **Decommissioned** — no stencil proxies in Architecture C                                               |
| R3  | Cap quad lives outside the `ClippingGroup`                                                                  | **Retained as principle** — Architecture C cap fills also live outside the `ClippingGroup`              |
| R4  | Pin three.js to ≥ r180 referencing PR #31716                                                                | **Retained** — `ClippingGroup` is still used for the visible-half clipping                              |
| R5  | Capture gotcha matrix (G1–G19) as ratchet test                                                              | **Partially retained** — G1, G4, G5, G11 still apply (`ClippingGroup`); G2–G3, G6–G14 dissolve          |
| R6  | Defer BVH contour lines                                                                                     | **Reversed** — BVH contour fill is now the cap pipeline (R8)                                            |
| R9  | Lift per-color split for `isClosedManifold`; emit one stencil-proxy pair per logical solid                  | **Decommissioned** — Architecture C operates per `THREE.Mesh` primitive, per-colour fill is automatic   |
| R10 | Switch `vertexKey` quantization to scale-relative                                                           | **Decommissioned** — manifoldness no longer gates cap visibility                                        |
| R11 | Surface runtime `manifoldDiagnostic` log                                                                    | **Decommissioned** — no manifold gate to diagnose                                                       |
| R12 | Back-face material substitution as fallback for legitimately open shells                                    | **Decommissioned** — Architecture C handles open shells natively (outline-only, mathematically correct) |

## Comparison: WebGL stencil vs WebGPU stencil

| Concern                   | WebGL                                              | WebGPU                                                                       |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Renderer constructor      | `new WebGLRenderer({ stencil: true })` (default)   | `new WebGPURenderer({ stencil: true })` (**default is false**)               |
| Per-material clipping     | `material.clippingPlanes = [plane]` works directly | **Ignored** — must use `ClippingGroup`                                       |
| Global toggle             | `renderer.localClippingEnabled = true`             | No equivalent — clipping is implicitly on inside `ClippingGroup`             |
| Stencil ops on `Material` | Native (forwarded to `gl.stencilOp`)               | Translated by `WebGPUPipelineUtils` to `GPUDepthStencilState`                |
| Render-target stencil     | `WebGLRenderTarget({ stencil: true })`             | `renderTarget.stencilBuffer = true` + `DepthStencilFormat`                   |
| Hardware clipping         | `WEBGL_clip_cull_distance` (extension, optional)   | `clip-distances` (feature, broadly available)                                |
| Custom shader path        | `ShaderMaterial` / `RawShaderMaterial`             | **Not supported** — must use `NodeMaterial` + TSL                            |
| Cap material              | Any `Material` subclass                            | `MeshBasicNodeMaterial` / `MeshStandardNodeMaterial` / custom `NodeMaterial` |
| Render-order contract     | Same — sort by `renderOrder`                       | Same — sort by `renderOrder`                                                 |
| `clipIntersection`        | Per material flag                                  | Per `ClippingGroup` flag (replaces material flag)                            |

## Diagnostic: why does mesh X not show a cap?

> **Note**: This flow is for the **current stencil-based pipeline** that Architecture C (R8) replaces. Once R8 ships, the flow collapses to "is the mesh's BVH built? is the plane in its bbox? did `shapecast` find any intersected triangles?" — which has no failure modes equivalent to the manifold gate.

Run through this flow for any mesh in a section-view scene whose cut surface is hollow:

```
┌────────────────────────────────────────────────────────────┐
│ 1. Is the mesh inside `SectionClippingGroup`?              │
│    No → mesh is not clipped at all (no cut surface).       │
│    Yes ↓                                                   │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ 2. Is the mesh in `manifoldSources` (output of             │
│    `collectStencilCapTargets`)?                            │
│    Inspect by tagging or temporary console.log.            │
│    Yes → cap should render. If it doesn't, issue is        │
│        elsewhere (renderOrder, render-target stencil,      │
│        cap-quad placement). Re-check G1–G15.               │
│    No ↓                                                    │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ 3. Run `isClosedManifold([mesh.geometry])` manually.       │
│    `closed: false, openEdges: N, totalEdges: M` — record   │
│    the openEdges count.                                    │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ 4. Is `openEdges` ≈ a small fraction of `totalEdges`?      │
│    Yes (e.g. <5%) → likely Finding 11 (per-color seam)     │
│        or Finding 12 (precision drift).                    │
│        Confirm: check whether the mesh is one of several   │
│        primitives sharing a glTF node (multi-color split). │
│    No (e.g. >50% open) → genuinely open shell, surface,    │
│        or decoration. Cap requires Architecture C (BVH     │
│        contour fill) or back-face fallback (R12).          │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ 5. If "many small primitives sharing a glTF node":         │
│    → Per-color split (Finding 11). Apply R9 (pre-split     │
│      welded geometry) or R8 (BVH contour fill).            │
│    If "single primitive, sub-1e-6 drift":                  │
│    → Apply R10 (scale-relative tolerance / neighbor-grid). │
│    If "intentionally open":                                │
│    → Apply R12 (back-face fallback) or R8 (BVH).           │
└────────────────────────────────────────────────────────────┘
```

Quick-classify table for the canonical Dutch Windmill scene captured during this investigation:

| Mesh                  | `openEdges` likely | Cause                                        | Fix                |
| --------------------- | ------------------ | -------------------------------------------- | ------------------ |
| Cream walls           | 0                  | Mono-color closed solid                      | Already caps       |
| Dark hat              | small (color seam) | Multi-color authored solid → per-color split | R9 (welded global) |
| Wooden balcony/ladder | many               | Open shell / thin decorative geometry        | R8 (BVH) or R12    |
| Internal scaffolding  | many               | Surface or open shell                        | R8 (BVH) or R12    |

## References

External:

- [three.js docs: ClippingGroup](https://threejs.org/docs/pages/ClippingGroup.html)
- [three.js example: webgpu_clipping](https://threejs.org/examples/webgpu_clipping.html) → `repos/three.js/examples/webgpu_clipping.html`
- [three.js example: webgl_clipping_stencil](https://threejs.org/examples/webgl_clipping_stencil.html) → `repos/three.js/examples/webgl_clipping_stencil.html`
- [three.js PR #28237 — WebGPURenderer ClippingGroup](https://github.com/mrdoob/three.js/pull/28237)
- [three.js PR #28578 — hardware clipping (clip-distances)](https://github.com/mrdoob/three.js/pull/28578)
- [three.js PR #31716 — shared geometry ClippingGroup fix (r180)](https://github.com/mrdoob/three.js/pull/31716)
- [three.js issue #31757 — pass/reflector ignoring stencil buffer](https://github.com/mrdoob/three.js/issues/31757)
- [three.js issue #31779 — multi-block ClippingGroup bug (closed by #31716)](https://github.com/mrdoob/three.js/issues/31779)
- [three.js issue #26925 — ShaderMaterial not compatible with WebGPU](https://github.com/mrdoob/three.js/issues/26925)
- [three-mesh-bvh clippedEdges live demo](https://gkjohnson.github.io/three-mesh-bvh/example/bundle/clippedEdges.html)
- [three-mesh-bvh source](https://github.com/gkjohnson/three-mesh-bvh) → `repos/three-mesh-bvh/example/clippedEdges.js`
- [three-cad-viewer source](https://github.com/bernhard-42/three-cad-viewer) → `repos/three-cad-viewer/src/scene/clipping.ts`
- [Discourse: capping clipped planes using stencil on a BufferGeometry](https://discourse.threejs.org/t/capping-clipped-planes-using-stencil-on-a-buffergeometry/18407)

Internal:

- `docs/research/webgpu-section-view-clipping-architecture.md` — first-pass investigation; superseded by this doc for the cap-rendering specifics.
- `docs/policy/graphics-backend-policy.md` — TSL snapshot tests and per-backend invariants.
- `apps/ui/app/components/geometry/graphics/three/react/section-clipping-group.tsx`, `section-cap.tsx`, `stage.tsx` — Tau's current implementation aligned with Architecture A.
- `apps/ui/app/components/geometry/graphics/three/renderer.ts` — confirms `stencil: true` on the renderer for both backends.
- `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` — flagged for R1 audit; missing render-target stencil patch.

## Appendix: canonical code excerpts

**Stencil proxy pair (front + back, `webgl_clipping_stencil.html:62-99`)**

```javascript
function createPlaneStencilGroup(geometry, plane, renderOrder) {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial();
  baseMat.depthWrite = false;
  baseMat.depthTest = false;
  baseMat.colorWrite = false;
  baseMat.stencilWrite = true;
  baseMat.stencilFunc = THREE.AlwaysStencilFunc;

  // back faces — increment on entry into the volume
  const mat0 = baseMat.clone();
  mat0.side = THREE.BackSide;
  mat0.clippingPlanes = [plane]; // ⚠ WebGL-only — use ClippingGroup ancestor on WebGPU
  mat0.stencilFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZPass = THREE.IncrementWrapStencilOp;
  const mesh0 = new THREE.Mesh(geometry, mat0);
  mesh0.renderOrder = renderOrder;
  group.add(mesh0);

  // front faces — decrement on exit from the volume
  const mat1 = baseMat.clone();
  mat1.side = THREE.FrontSide;
  mat1.clippingPlanes = [plane]; // ⚠ same caveat
  mat1.stencilFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZPass = THREE.DecrementWrapStencilOp;
  const mesh1 = new THREE.Mesh(geometry, mat1);
  mesh1.renderOrder = renderOrder;
  group.add(mesh1);

  return group;
}
```

**Cap quad material (`webgl_clipping_stencil.html:154-175`)**

```javascript
const planeMat = new THREE.MeshStandardMaterial({
  color: 0xe91e63,
  metalness: 0.1,
  roughness: 0.75,
  clippingPlanes: planes.filter((p) => p !== plane), // ⚠ on WebGPU, place inside other planes' ClippingGroups
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp,
  stencilZFail: THREE.ReplaceStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
});
const po = new THREE.Mesh(planeGeom, planeMat);
po.onAfterRender = function (renderer) {
  renderer.clearStencil();
};
po.renderOrder = i + 1.1; // strictly AFTER the proxies (renderOrder = i + 1)
```

**Per-frame cap orientation (`webgl_clipping_stencil.html:299-310`)**

```javascript
for (let i = 0; i < planeObjects.length; i++) {
  const plane = planes[i];
  const po = planeObjects[i];
  plane.coplanarPoint(po.position);
  po.lookAt(po.position.x - plane.normal.x, po.position.y - plane.normal.y, po.position.z - plane.normal.z);
}
```

**Post-processing render-target stencil patch (issue #31757 fix)**

```javascript
scenePass.renderTarget.stencilBuffer = true;
scenePass.renderTarget.depthTexture.format = THREE.DepthStencilFormat;
scenePass.renderTarget.depthTexture.type = THREE.UnsignedInt248Type;
// For reflector:
const reflectorBase = reflection.reflector;
const virtualCamera = reflectorBase.getVirtualCamera(camera);
const renderTarget = reflectorBase.getRenderTarget(virtualCamera);
renderTarget.stencilBuffer = true;
renderTarget.depthTexture.format = THREE.DepthStencilFormat;
renderTarget.depthTexture.type = THREE.UnsignedInt248Type;
```

**`ClippingNode.setupDefault` (proves the discard) — `repos/three.js/src/nodes/accessors/ClippingNode.js:150`**

```javascript
setupDefault( intersectionPlanes, unionPlanes ) {
  return Fn( () => {
    const numUnionPlanes = unionPlanes.length;
    if ( this.hardwareClipping === false && numUnionPlanes > 0 ) {
      const clippingPlanes = uniformArray( unionPlanes ).setGroup( renderGroup );
      Loop( numUnionPlanes, ( { i } ) => {
        const plane = clippingPlanes.element( i );
        positionView.dot( plane.xyz ).greaterThan( plane.w ).discard();
      } );
    }
    // intersection planes path: same idea but ANDs across all planes before discarding
  } )();
}
```
