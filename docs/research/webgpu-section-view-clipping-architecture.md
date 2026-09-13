---
title: 'WebGPU section view clipping architecture'
description: 'Why WebGPU section view ignores material clippingPlanes; blueprint for backend-aware clipping with ClippingGroup and preserved capping parity.'
status: draft
created: '2026-05-11'
updated: '2026-05-11'
category: architecture
related:
  - docs/policy/graphics-backend-policy.md
  - docs/research/webgpu-render-loop-audit.md
  - docs/research/webgpu-migration-graphics-stack.md
  - docs/research/webgpu-cad-rendering-blueprint.md
---

# WebGPU section view clipping architecture

Architectural blueprint for fixing Tau's section view on WebGPU and unifying the WebGL + WebGPU code paths behind a single backend-aware clipping primitive while keeping stencil capping intact, hardware-accelerating the clip when the device supports it, and reducing per-frame stencil-prep cost from `O(parts)` to `O(1)` so the feature is production-ready on assemblies with many sub-meshes.

## Eigenquestion

> **Three.js r184 deleted the per-material/per-renderer clipping API on the WebGPU `Renderer` and replaced it with a scene-graph-only `ClippingGroup`. What is the minimum-blast-radius backend-aware abstraction that lets Tau ship one section-view component for both backends while preserving stencil-cap correctness, hardware clipping where available, and the same XState contract today?**

This frames the rest of the doc: the bug is not in the cap material, the stencil ops, or the plane math — those work identically on both backends. The bug is that Tau is feeding clipping planes through the **WebGL-only API surface** (`renderer.localClippingEnabled` + `material.clippingPlanes`). On WebGPU, that API is **silently a no-op**, which is why the WebGPU pane shows the original geometry untouched.

## Executive Summary

- **Smoking gun.** Tau's `<SectionView>` enables clipping by (a) toggling `gl.localClippingEnabled` and (b) writing `mat.clippingPlanes = [plane]` onto every mesh material via `applyMeshClipping` / `enforceMaterialClipping`. **Neither input is consulted by `WebGPURenderer`.** The only clipping driver in the WebGPU pipeline is the scene-graph `ClippingGroup` (`isClippingGroup === true`). With no `ClippingGroup` ancestor, `builder.clippingContext.unionPlanes` is empty for every NodeMaterial, `NodeMaterial.setupClipping` returns `null`, and the geometry renders unclipped.
- **Stencil ops are _not_ the problem.** `WebGPUPipelineUtils.js` honours `material.stencilWrite/Func/Fail/ZFail/ZPass/Ref/Mask` byte-for-byte (lines 133–256 of the upstream r184 source). The capping technique itself ports cleanly; only the _clipping driver_ is missing on WebGPU.
- **WebGL-side bug is unrelated.** The user-reported "white overlay where the section should be cut" on WebGL is a separate stencil-prep ordering / cap-plane sizing issue and is intentionally out of scope for this blueprint (Section "Scope and Non-Goals"). Fixing the WebGPU clipping driver is the prerequisite for fixing both.
- **Recommended target architecture.** Replace `applyMeshClipping` + `enforceMaterialClipping` + `gl.localClippingEnabled = true` with one declarative primitive: `<SectionClippingGroup>` that, on WebGPU, mounts an upstream `THREE.ClippingGroup` (`{ clippingPlanes: [plane], enabled, clipIntersection: false }`) and, on WebGL, walks descendants once on mount/plane-change and writes `material.clippingPlanes` + flips `renderer.localClippingEnabled`. The consumer-facing JSX is identical across backends. The stencil prep + cap-plane subtree is unchanged on both backends.
- **Performance ceiling.** With the WebGPU driver fixed, three additional optimisations push the feature from "slow on assemblies" to production:
  1. Single-pass stencil prep using a scene **`override material`** instead of per-mesh `<PlaneStencilGroup>` components, eliminating R3F reconciliation of `2 × meshList.length` extra meshes every section-view re-keying.
  2. One cap plane **per `ClippingGroup`** rather than one per mesh — drops cap-pass cost from `O(parts)` to `O(1)`.
  3. Opt-in **hardware clipping** (`ClippingNode.HARDWARE`, `clip-distances` builtin, ≤ 8 union planes) on devices that advertise the WebGPU `clip-distances` feature — vertex-stage cull instead of fragment `discard`, ~30–60 % fragment-shader speedup on dense meshes (verified upstream PR #28237 benchmark notes).

## Problem Statement

User-reported symptoms (image evidence captured 2026-05-11):

1. **WebGPU pane:** Section view has zero visible effect. Selecting any plane (XY, XZ, YZ, …), translating, rotating, or flipping the direction never cuts the rendered geometry. The cap material does not appear either.
2. **WebGL pane:** Section view _does_ take effect (geometry is cut along the plane) but a flat white quad is rendered across the entire cut region instead of the striped cap material being limited to the cross-section silhouette. (Out of scope for this doc.)

Both panes are driven by the same React subtree (`<Stage>` → `<SectionView>` from `react/section-view.tsx` consuming `useSectionView()`). The only divergence is which `Renderer` instance the parent `<Canvas>` was constructed with.

The investigation must answer:

- Why does `material.clippingPlanes = [plane]` not clip on WebGPU even though three.js's NodeMaterial tree advertises a `setupClipping` hook?
- What is the canonical r184+ idiom for clipping in WebGPU?
- How can the WebGL stencil-cap technique survive the WebGPU port without per-backend forks proliferating across the React tree?
- What changes are needed for the cap surface to render only inside the silhouette on both backends (architectural prerequisite that the WebGL bug exposes)?

## Methodology

1. **Source-first audit.** Read the four call-site files the user pointed at (`react/section-view.tsx`, `react/section-view-controls.tsx`, `use-section-view.ts`, `chat-interface-graphics-section-view.tsx`) plus their direct deps (`react/section-view.utils.ts`, `materials/striped-material.ts`, `materials/striped-material.node.ts`, `graphics/three/stage.tsx`).
2. **Three.js r184 source dive.** `node_modules/three/src/`:
   - `renderers/WebGLRenderer.js` — confirms `localClippingEnabled` + `clippingPlanes` API.
   - `renderers/common/Renderer.js` — confirms WebGPU `Renderer` exposes neither.
   - `renderers/common/ClippingContext.js` — confirms only `ClippingGroup.clippingPlanes` populates the context.
   - `objects/ClippingGroup.js` — confirms WebGPU-only design (docstring: _"`ClippingGroup` can only be used with `WebGPURenderer`"_).
   - `materials/nodes/NodeMaterial.js` `setupClipping` — confirms NodeMaterial reads from `builder.clippingContext`, never from `material.clippingPlanes`.
   - `nodes/accessors/ClippingNode.js` — confirms `default` / `alphaToCoverage` / `hardware` scopes and the TSL `clipping()` / `hardwareClipping()` factory functions.
   - `renderers/webgpu/utils/WebGPUPipelineUtils.js` — confirms stencil ops are wired through to the GPU pipeline descriptor on WebGPU.
3. **Web research.** Cross-referenced findings against the upstream PR #28237 (ClippingGroup implementation, merged r171), PR #33457 milestones, three.js docs (`ClippingGroup`, `ClippingNode`), discourse thread #88922, GitHub issues #31708/#31779/#31716/#31757, and the official `webgl_clipping_stencil` example.
4. **Pipeline trace.** Traced an example WebGPU render of a clipped mesh through `Renderer._renderObjectDirect` → `getGroupContext` → `NodeMaterial.setup` → `ClippingNode.setupDefault` to confirm the _only_ path that wires planes into the fragment program.

## Findings

### Finding 1 — `WebGPURenderer` does not honour `material.clippingPlanes`

`node_modules/three/src/renderers/common/Renderer.js` lines 3048–3062 build the per-render-object `ClippingContext` like so (paraphrased):

```js
function _renderObjectDirect( object, scene, camera, ... ) {
  let clippingContext = renderContext.clippingContext;
  // walk ancestors:
  for ( let parent = object.parent; parent; parent = parent.parent ) {
    if ( parent.isClippingGroup && parent.enabled ) {
      clippingContext = clippingContext.getGroupContext( parent ); // pulls parent.clippingPlanes
    }
  }
  // …
}
```

`material.clippingPlanes` is **never read** anywhere in `node_modules/three/src/renderers/common/`. Confirmed by:

```bash
$ rg 'material\.clippingPlanes' node_modules/three/src/renderers/common
# zero matches
```

`Material.clippingPlanes` continues to exist on `Material.js` (line 309) for WebGL backwards compatibility, but the WebGPU pipeline never consults it. This is a _deliberate_ upstream design decision documented on `ClippingGroup` itself: _"clipping was defined globally on the renderer or on material level. This special version of `THREE.Group` allows to encode the clipping state into the scene graph."_ (`node_modules/three/src/objects/ClippingGroup.js` lines 4–9.)

**Consequence for Tau.** `applyMeshClipping(mesh, { enable, plane })` in `react/section-view.utils.ts` writes `mat.clippingPlanes = [plane]` on every mesh material in the subtree. On WebGPU, this is a structurally-correct but semantically-inert mutation — the property is set, it just doesn't affect rendering.

### Finding 2 — `Renderer.localClippingEnabled` does not exist on WebGPU

`WebGLRenderer` defines two clipping inputs (`renderers/WebGLRenderer.js`):

```js
this.clippingPlanes = []; // line 251 - global planes
this.localClippingEnabled = false; // line 259 - toggle for material-level planes
```

`Renderer` (the common base for `WebGPURenderer`) defines **neither**:

```bash
$ rg 'localClippingEnabled|this\.clippingPlanes' node_modules/three/src/renderers/common/Renderer.js
# zero matches
```

Tau's `react/section-view.tsx` lines 142–148:

```typescript
React.useEffect(() => {
  gl.localClippingEnabled = enableSection;
  return () => {
    gl.localClippingEnabled = false;
  };
}, [gl, enableSection]);
```

On a `WebGPURenderer` instance, this assigns a property the renderer does not consult — TypeScript allows it because `WebGPURenderer` has no `localClippingEnabled` declaration but the `gl` parameter is typed as the union. Silently no-op.

### Finding 3 — `NodeMaterial.setupClipping` only reads `builder.clippingContext`

`node_modules/three/src/materials/nodes/NodeMaterial.js` lines 623–650:

```js
setupClipping( builder ) {
  if ( builder.clippingContext === null ) return null;
  const { unionPlanes, intersectionPlanes } = builder.clippingContext;
  let result = null;
  if ( unionPlanes.length === 0 && intersectionPlanes.length === 0 ) return null;
  // …
  if ( this.alphaToCoverage && samples > 1 ) {
    result = clippingAlpha();
  } else {
    builder.stack.addToStack( clipping() );
  }
  return result;
}
```

The fragment-shader `discard` (or `clip-distances` write under hardware mode) is only emitted when the **scene-graph-derived** clipping context has at least one plane. The custom `MeshBasicNodeMaterial` Tau uses for the cap and any `MeshStandardNodeMaterial` on imported geometry inherit this method unchanged.

**Implication.** Even after the migration to a `ClippingGroup`, every clipped mesh will go through this code path automatically — no per-material wiring needed.

### Finding 4 — Stencil capping survives the WebGPU port intact

`node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js` lines 129–142 and 250–256:

```js
let stencilFront = {};
if (material.stencilWrite === true) {
  stencilFront = {
    compare: this._getStencilCompare(material),
    failOp: this._getStencilOperation(material.stencilFail),
    depthFailOp: this._getStencilOperation(material.stencilZFail),
    passOp: this._getStencilOperation(material.stencilZPass),
  };
}
// …
depthStencil.stencilFront = stencilFront;
depthStencil.stencilBack = stencilFront;
depthStencil.stencilReadMask = material.stencilFuncMask;
depthStencil.stencilWriteMask = material.stencilWriteMask;
```

Every `Material.stencil*` field Tau already configures on `PlaneStencilGroup` and `createStripedMaterial` is faithfully translated into the WebGPU `GPURenderPipelineDescriptor.depthStencil` block. The cap algorithm itself does not need changes — only the clipping driver does.

Caveat: the `<Canvas>` must be constructed with `stencil: true`, which Tau already does for both backends in `renderer.ts` (line 60 / line 65 / `webGlOptions.stencil = true`).

### Finding 5 — `Renderer.clearStencil()` exists on WebGPU

`node_modules/three/src/renderers/common/Renderer.js` line 2340. The common `Renderer` exposes `clearColor()`, `clearDepth()`, `clearStencil()`, `clear()` synchronous variants in r181+ (deprecated async versions emit warnings, lines 2375 / 2390). Tau's `<Plane onAfterRender={(renderer) => renderer.clearStencil()}>` call works on both backends.

### Finding 6 — `LineMaterial` (WebGL) + `Line2NodeMaterial` (WebGPU) both inherit clipping

- WebGL `LineMaterial` (`node_modules/three/examples/jsm/lines/LineMaterial.js`) explicitly includes `clipping_planes_*` shader chunks (lines 35, 237, 281, 317) and sets `clipping: true` (line 438) — full WebGL clipping support.
- WebGPU `Line2NodeMaterial` (`node_modules/three/src/materials/nodes/Line2NodeMaterial.js` line 25) extends `NodeMaterial`, so it inherits `setupClipping` and respects `ClippingGroup` automatically.

**Implication.** Tau's separate "lines" toggle (`enableClippingLines`) can drive the same `ClippingGroup` enabled flag — no special per-material plumbing for fat lines.

### Finding 7 — Tau already has per-mesh stencil-prep that scales `O(parts)`

`react/section-view.tsx` lines 152–181:

```tsx
{
  enableSection && meshList.length > 0
    ? meshList.map((meshObject, index) => (
        <React.Fragment key={meshObject.id}>
          <PlaneStencilGroup meshObj={meshObject} plane={plane} renderOrder={index + 1} />
          <Plane
            args={[planeSize, planeSize]}
            renderOrder={index + 1.1}
            material={cappingMaterial}
            onAfterRender={(renderer) => renderer.clearStencil()}
          />
        </React.Fragment>
      ))
    : null;
}
```

For a model with N parts (a multi-shape replicad assembly with N glTF primitives), every frame renders:

- N × 2 stencil-prep meshes (front + back faces) — full geometry traversal, no draw-call merging.
- N cap planes — each as large as `2 * boxSize.length()`, each followed by a synchronous `renderer.clearStencil()`.

The clear-stencil-per-mesh pattern is necessary today because each cap plane is sized and oriented per-mesh and the stencil mask is consumed by exactly one cap. This is the dominant cost. With the architectural fix below, this drops to **one stencil prep pass + one cap plane** per `ClippingGroup`.

### Finding 8 — Hardware clipping is available but unused

`node_modules/three/src/materials/nodes/NodeMaterial.js` lines 657–674:

```js
setupHardwareClipping( builder ) {
  this.hardwareClipping = false;
  if ( builder.clippingContext === null ) return;
  const candidateCount = builder.clippingContext.unionPlanes.length;
  if ( candidateCount > 0 && candidateCount <= 8 && builder.isAvailable( 'clipDistance' ) ) {
    builder.stack.addToStack( hardwareClipping() );
    this.hardwareClipping = true;
  }
}
```

When the device supports the `clip-distances` WebGPU feature (Chrome 119+ on most desktop GPUs, missing on Safari 26.x), three.js will use vertex-stage culling instead of a fragment-shader `discard`. Tau's section view uses exactly one plane → 1 ≤ 8 → eligible automatically. **No code change required to opt in once the `ClippingGroup` migration lands** — `setupHardwareClipping` is called from `NodeMaterial.setup` regardless of `setupClipping` scope.

### Finding 9 — Coexistence of `ClippingGroup` + per-material `clippingPlanes`

The `ClippingContext.update` method (`renderers/common/ClippingContext.js` lines 152–221) reads `clippingGroup.clippingPlanes` only — material-level planes are never merged in. This is fine for our use case because we only ever want **one plane**, but the WebGL fallback (where `material.clippingPlanes` is the only API) cannot be unified without a backend-aware shim.

## Target Architecture

### Layered design

```
+--------------------------------------------------------------+
|  Layer 0  Plane state      <- XState (graphics.machine)      |
|           plane: THREE.Plane                                 |
|           enabled, intersection mode, lines toggle           |
+--------------------------------------------------------------+
                          |
                          v
+--------------------------------------------------------------+
|  Layer 1  useSectionView() hook                              |
|           - Reads XState                                     |
|           - Returns { plane, isActive, capping*, mode }      |
|           - Backend-aware capping material factory only      |
+--------------------------------------------------------------+
                          |
                          v
+--------------------------------------------------------------+
|  Layer 2  <SectionClippingGroup plane enabled>               |
|           Backend-aware:                                     |
|             webgpu -> THREE.ClippingGroup attached as primitive |
|             webgl  -> walk descendants, set clippingPlanes,  |
|                       flip renderer.localClippingEnabled     |
|           One declarative ancestor for clipped subtree.      |
+--------------------------------------------------------------+
                          |
                          v
+--------------------------------------------------------------+
|  Layer 3  <SectionCap plane meshes capping enabled>          |
|           Backend-agnostic.                                  |
|           One stencil-prep pass via override material        |
|           on a private secondary scene, one cap plane.       |
|           Cap plane sized to scene bounds, masked by stencil.|
+--------------------------------------------------------------+
                          |
                          v
+--------------------------------------------------------------+
|  Layer 4  Existing <SectionViewControls> + parameter UI      |
|           No changes.                                        |
+--------------------------------------------------------------+
```

### Layer 2 contract — `<SectionClippingGroup>`

Single React component, both backends behind a single import.

```tsx
type Properties = Readonly<{
  plane: THREE.Plane;
  enabled: boolean;
  children: React.ReactNode;
}>;

export function SectionClippingGroup({ plane, enabled, children }: Properties) {
  const backend = useThreeGraphicsBackend();
  if (backend === 'webgpu')
    return (
      <WebGpuSectionClippingGroup plane={plane} enabled={enabled}>
        {children}
      </WebGpuSectionClippingGroup>
    );
  return (
    <WebGlSectionClippingGroup plane={plane} enabled={enabled}>
      {children}
    </WebGlSectionClippingGroup>
  );
}
```

WebGPU implementation:

```tsx
function WebGpuSectionClippingGroup({ plane, enabled, children }) {
  const groupRef = React.useRef<THREE.ClippingGroup>(null);
  React.useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.clippingPlanes = [plane]; // referential identity stable across frames
    g.enabled = enabled;
    g.clipIntersection = false;
    g.clipShadows = false;
  }, [plane, enabled]);
  return (
    <primitive object={useMemo(() => new THREE.ClippingGroup(), [])} ref={groupRef}>
      {children}
    </primitive>
  );
}
```

WebGL implementation walks once on mount + plane-change, falls back to the existing `applyMeshClipping`/`enforceMaterialClipping` mechanism but lifted out of `<SectionView>`. `enforceMaterialClipping` (the per-frame guard) stays only on the WebGL branch — a no-op on WebGPU because `ClippingGroup` updates are picked up automatically by `ClippingContext.version` bump.

### Layer 3 contract — `<SectionCap>`

Single cap pass per `ClippingGroup`, irrespective of mesh count. Two sub-strategies depending on cap fidelity vs. cost:

| Strategy                                  | Cap correctness                              | Cost                                                       | When to use                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stencil cap (default)**                 | Exact silhouette, requires manifold geometry | 1× full-scene stencil prep + 1 cap plane + 1 stencil clear | Today's default. Works on both backends.                                                                                                    |
| **Alpha-to-coverage clipping (option B)** | No cap surface, smooth clipped edge          | 0× cap plane, 0× stencil prep, 1× MSAA shader cost         | Future work. Use when `samples > 1` and cap-surface fidelity is not required (e.g. exploded-view assemblies that don't need a striped cap). |

The default uses a private `THREE.Scene` reference to render the stencil prep with a scene-level `overrideMaterial = stencilPrepMaterial` (front + back faces in two passes), then a single `cappingMaterial` plane sized to the scene bounding-sphere diameter. Render order:

1. `enabled === true && hasManifoldMeshes` → `renderer.render(stencilPrepScene, camera)` with `overrideMaterial = backFaceStencilMaterial`, `colorWrite = false`, `depthWrite = false`, `depthTest = false`, stencil ops `THREE.IncrementWrapStencilOp`.
2. Same scene with `overrideMaterial = frontFaceStencilMaterial`, `THREE.DecrementWrapStencilOp`.
3. Cap plane: `stencilFunc = THREE.NotEqualStencilFunc`, `stencilRef = 0`, `colorWrite = true`, `depthWrite = false`, `depthTest = false`.
4. `renderer.clearStencil()`.

This collapses Finding 7's `O(parts)` to `O(1)` and removes `<PlaneStencilGroup>` reconciliation entirely.

### Where the existing code goes

| File                                          | Action                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react/section-view.tsx`                      | Rewrite to `<SectionClippingGroup>{children}</SectionClippingGroup>` + `<SectionCap />`. Remove `gl.localClippingEnabled` effect (now owned by `<WebGlSectionClippingGroup>`), `<PlaneStencilGroup>` (replaced by override-material pass), per-mesh cap loop, `enforceMaterialClipping` per-frame guard (WebGL-only, lifted into Layer 2). |
| `react/section-view.utils.ts`                 | Keep `applyMeshClipping` + `enforceMaterialClipping` + `isClosedManifold`. Keep `collectAndClipMeshes` but rename to `collectClippableTargets` and **only call from the WebGL branch**. Add `walkSubtreeForStencilPrep` returning `{ meshes, lines }` for the cap pass.                                                                    |
| `materials/striped-material.ts` (WebGL)       | Unchanged.                                                                                                                                                                                                                                                                                                                                 |
| `materials/striped-material.node.ts` (WebGPU) | Unchanged.                                                                                                                                                                                                                                                                                                                                 |
| `use-section-view.ts`                         | Unchanged outputs. Optional: extend return type with a `mode: 'stencilCap' \| 'alphaCoverage'` discriminator for the future Option B path; default `'stencilCap'`.                                                                                                                                                                         |
| `react/section-view-controls.tsx`             | Unchanged.                                                                                                                                                                                                                                                                                                                                 |
| `chat-interface-graphics-section-view.tsx`    | Unchanged.                                                                                                                                                                                                                                                                                                                                 |
| `graphics/three/stage.tsx`                    | One-line change: pass children through `<SectionClippingGroup>` instead of `<SectionView>`. Cap renders as a sibling.                                                                                                                                                                                                                      |

### Data flow

```
graphics.machine
   |
   v
useSectionView()  ---> { plane, isActive, cappingMaterial, enableLines, enableMesh }
   |                                 |
   |                                 +-----------+
   v                                             v
<SectionClippingGroup plane enabled>     <SectionCap plane material enabled>
   |
   +--> WebGPU: <primitive ClippingGroup .clippingPlanes=[plane]>
   |        |
   |        +--> NodeMaterial.setupClipping reads builder.clippingContext.unionPlanes
   |        +--> ClippingNode emits TSL discard / hardware clip-distances
   |
   +--> WebGL: walk descendants, set mat.clippingPlanes = [plane],
              gl.localClippingEnabled = enabled
            |
            +--> WebGLRenderer reads mat.clippingPlanes via WebGLClipping
            +--> clipping_planes_fragment chunk emits discard
```

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Priority | Effort           | Impact                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| R1  | Introduce `<SectionClippingGroup>` (Layer 2). Keep stencil-cap technique on Layer 3 but route both backends through one declarative tree.                                                                                                                                                                                                                                                                                                                                                  | P0       | M (~1 day)       | Fixes WebGPU section view at the root cause.                                                                       |
| R2  | Replace `<PlaneStencilGroup>` per-mesh loop with `overrideMaterial`-based single-scene stencil prep + one cap plane per `ClippingGroup`.                                                                                                                                                                                                                                                                                                                                                   | P0       | M (~1 day)       | Drops cap-pass cost from `O(parts)` to `O(1)`; resolves the historical "section view is slow" complaint.           |
| R3  | Delete `gl.localClippingEnabled` effect from `<SectionView>`; move to WebGL branch of Layer 2. Delete `applyMeshClipping` / `enforceMaterialClipping` calls from the WebGPU path; both are no-ops there.                                                                                                                                                                                                                                                                                   | P0       | S (~30 min)      | Removes silent no-op code paths; satisfies user request to "rip out as much irrelevant code from the WebGPU path". |
| R4  | Confirm hardware clipping engages on supported devices. Add a `console.debug('section-view hardware clipping', material.hardwareClipping)` smoke during dev to verify; remove before merge.                                                                                                                                                                                                                                                                                                | P1       | XS               | Free vertex-stage clipping speedup on Chrome desktop.                                                              |
| R5  | Fix WebGL "white overlay" cap-plane sizing/ordering bug. Likely culprit: per-mesh cap plane is `2 * boxSize.length()` and renderOrder collisions cause one cap to draw over another. Once R2 lands (one cap plane per group), this falls out for free.                                                                                                                                                                                                                                     | P0       | XS once R2 lands | Closes the WebGL backend bug.                                                                                      |
| R6  | Add Vitest snapshot of the resolved striped node-material TSL graph after the `ClippingNode` injection, mirroring `tsl-node-graph-snapshot.ts`, to catch regressions when the upstream `ClippingNode` API evolves.                                                                                                                                                                                                                                                                         | P1       | S                | Long-term protection against silent re-breakage from upstream r185+ refactors.                                     |
| R7  | Document the backend-aware Layer 2 idiom in `docs/policy/graphics-backend-policy.md` §"Clipping" so future contributors don't re-introduce per-material `clippingPlanes` mutations on the WebGPU path.                                                                                                                                                                                                                                                                                     | P1       | S                | Prevents recurrence.                                                                                               |
| R8a | Future: prototype `clippingAlpha()` / `alphaToCoverage` mode behind a `useSectionView({ mode: 'alphaCoverage' })` flag for fast preview-quality cuts on assemblies where cap fidelity is unimportant.                                                                                                                                                                                                                                                                                      | P2       | M                | Optional follow-up; not on the production path.                                                                    |
| R8b | Future: replace `enableClippingLines` (currently clips original mesh edges → noisy floating fragments) with **three-mesh-bvh `intersectsPlane`-derived contour polylines** rendered as `LineSegments2`. Production CAD-grade edge fidelity; demonstrated on 2M-poly model in the upstream `clippedEdges` example. **Complementary** to R1+R2 (cap surface stays stencil-driven). One-time BVH build per mesh on glTF load (`O(n log n)`), per-frame contour extraction is `O(√n)` average. | P2       | M (~2 days)      | Section-view edge lines move from "noisy clipped-mesh-edges artefact" to "true CAD contour at the cut".            |

## Trade-offs

### Single `<SectionClippingGroup>` vs. two parallel components

| Dimension                                              | Unified `<SectionClippingGroup>` (R1)                       | Per-backend `<WebGl…>` / `<WebGpu…>` siblings |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| Consumer JSX                                           | Identical across backends                                   | Branching in caller (`stage.tsx`)             |
| Backend-detection cost                                 | One `useThreeGraphicsBackend()` per mount                   | Same                                          |
| Future graphics backend added (e.g. WebGL2.5 fallback) | One file to extend                                          | Caller refactor required                      |
| Test isolation                                         | Each branch can be unit-tested by stubbing the backend hook | Same                                          |

Verdict: **Unified primitive** wins on consumer DX and is the same internal complexity.

### `ClippingGroup` (scene-graph) vs. global `Renderer.clippingPlanes` polyfill on WebGL

We could make WebGL behave like WebGPU by mapping `<SectionClippingGroup>` to a renderer-level `gl.clippingPlanes = [plane]` + `gl.localClippingEnabled = false` instead of walking descendants. Trade-off:

| Dimension                            | Per-material walk (current proposal) | Renderer-global on WebGL                                                                      |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Affects only descendants?            | Yes                                  | No — all scenes share planes                                                                  |
| Multiple panes with different planes | Works                                | Breaks (Tau renders multiple `<Canvas>` simultaneously: chat viewer, settings dialog preview) |
| Code size                            | Same                                 | Same                                                                                          |

Verdict: **Per-material walk on WebGL** wins because Tau renders multiple concurrent `<Canvas>` instances and global state would cross-contaminate. WebGPU's `ClippingGroup` is naturally scoped — no risk on that branch.

### Stencil cap default vs. alpha-to-coverage default

| Dimension                          | Stencil cap (R2 default)       | Alpha-to-coverage (R8 future)        |
| ---------------------------------- | ------------------------------ | ------------------------------------ |
| Fidelity at clip edge              | Exact, hard edge               | Smooth MSAA gradient                 |
| Visible cap surface                | Yes (striped material)         | No                                   |
| Manifold-geometry requirement      | Yes                            | No                                   |
| MSAA sample count                  | Independent                    | Required (≥ 4x)                      |
| Performance vs. unclipped baseline | + 1 stencil prep + 1 cap plane | + 1 fragment-shader length per plane |

Verdict: **Stencil cap stays the default** because Tau is a CAD tool — users expect a visible cross-section surface, not a soft-edged hole. Alpha-coverage is reserved for non-CAD modes (preview render in chat tool result thumbnails, exploded-view animations).

### Why not custom TSL `discard()` in `material.colorNode`?

Since r174, TSL exposes `discard()` directly ([PR #30538](https://github.com/mrdoob/three.js/pull/30538)) and any NodeMaterial can write `positionView.dot(plane.xyz).greaterThan(plane.w).discard()` inside its `colorNode` to clip a fragment. This raises a fair question: should we skip `ClippingGroup` and write the clipping logic directly in TSL on each material we control?

**No.** `ClippingGroup` is the consumer-facing API; `ClippingNode` (the TSL implementation) sits underneath it. Bypassing the layered API would mean reimplementing what `ClippingNode.setupDefault` already emits (`node_modules/three/src/nodes/accessors/ClippingNode.js` lines 150–189) **and losing three machinery benefits we get for free from `NodeMaterial.setup`**:

| Concern                               | `ClippingGroup` + `NodeMaterial.setupClipping` (R1)                                                                                                                                                                                                        | Custom TSL `discard()` in `colorNode`                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hardware-clipping promotion           | Automatic. `NodeMaterial.setupHardwareClipping` (lines 657–674) checks `builder.isAvailable('clipDistance')` and promotes to vertex-stage `clip-distances` builtin (`hardwareClipping()` factory). Free 30–60 % fragment-shader speedup on Chrome desktop. | Cannot reach the vertex stage from `colorNode`. Always fragment `discard`.                                                                                       |
| Per-camera plane projection           | Done once per render in `ClippingContext.projectPlanes` (`renderers/common/ClippingContext.js` lines 111–129) and shared across every clipped material via `unionPlanes` uniform array.                                                                    | Each material would re-project per frame, or share a uniform we hand-wire — duplicates infrastructure.                                                           |
| Pipeline cache-key correctness        | `RenderObject.getMaterialCacheKey()` includes the `ClippingContext.cacheKey` fingerprint, so the WebGPU pipeline cache invalidates correctly when planes count/intersection mode changes.                                                                  | `colorNode` mutations do **not** propagate into the cache key. Plane-count changes hit stale pipelines, leading to silent rendering corruption on plane toggles. |
| Works on `LineSegments2` / fat lines  | Yes — `Line2NodeMaterial extends NodeMaterial`, inherits `setupClipping`.                                                                                                                                                                                  | Would need a parallel TSL-clip implementation per node-material subclass we use.                                                                                 |
| Works on user-imported glTF materials | Yes — every standard NodeMaterial inherits the path.                                                                                                                                                                                                       | Would need to swap every glTF mesh's material to a custom subclass on load.                                                                                      |
| Backwards compatibility with WebGL    | Layer 2 already forks (`<WebGlSectionClippingGroup>` walks descendants). Stays orthogonal.                                                                                                                                                                 | WebGL doesn't even use NodeMaterial — would need a _third_ code path.                                                                                            |

The custom-TSL path is therefore **strictly worse** on every axis we care about — performance (no HW clip), correctness (cache-key drift), ergonomics (must mutate every material), and dual-backend coverage. The architectural relationship to keep in mind:

```
<SectionClippingGroup>           consumer-facing, declarative
        |
        v
THREE.ClippingGroup              scene-graph driver, populates ClippingContext
        |
        v
NodeMaterial.setupClipping()     auto-injects ClippingNode into the material's stack
        |
        v
ClippingNode (default | hardware | alphaToCoverage)
        |
        v
TSL primitives (positionView.dot, .discard, hw_clip_distances)
                                 — this is the only correct place to write TSL clipping
```

`ClippingGroup` and TSL are **the same pipeline** — not competing alternatives.

## Code Examples

### Smoking gun — three-line proof

```ts
// node_modules/three/src/objects/ClippingGroup.js (verbatim, lines 4-11)
/**
 * In earlier three.js versions, clipping was defined globally
 * on the renderer or on material level. This special version of
 * `THREE.Group` allows to encode the clipping state into the scene
 * graph. ...
 *
 * Note: `ClippingGroup` can only be used with `WebGPURenderer`.
 */
```

```ts
// node_modules/three/src/materials/nodes/NodeMaterial.js (paraphrased, lines 623-650)
setupClipping(builder) {
  if (builder.clippingContext === null) return null;
  const { unionPlanes, intersectionPlanes } = builder.clippingContext;
  // ^ ONLY this is read. material.clippingPlanes is NEVER consulted.
}
```

```bash
$ rg 'material\.clippingPlanes' node_modules/three/src/renderers/common
# zero matches — confirms WebGPU pipeline never reads per-material clipping
```

### After (target Layer 2 + 3 sketch)

```tsx
// stage.tsx
<SectionClippingGroup plane={sectionView.plane} enabled={sectionView.isActive}>
  <group ref={inner}>{children}</group>
</SectionClippingGroup>;
{
  sectionView.isActive ? (
    <SectionCap
      plane={sectionView.plane}
      material={sectionView.cappingMaterial}
      targets={inner}
      enableLines={sectionView.enableLines}
    />
  ) : null;
}
```

```tsx
// react/section-clipping-group.tsx (WebGPU branch)
import * as THREE from 'three';
function WebGpuSectionClippingGroup({ plane, enabled, children }: Properties) {
  const group = useMemo(() => new THREE.ClippingGroup(), []);
  useLayoutEffect(() => {
    group.clippingPlanes = [plane];
    group.enabled = enabled;
  }, [group, plane, enabled]);
  return <primitive object={group}>{children}</primitive>;
}
```

```tsx
// react/section-clipping-group.tsx (WebGL branch)
function WebGlSectionClippingGroup({ plane, enabled, children }: Properties) {
  const { gl, scene } = useThree();
  const rootRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    gl.localClippingEnabled = enabled;
    return () => {
      gl.localClippingEnabled = false;
    };
  }, [gl, enabled]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    walkAndApplyClipping(root, enabled ? [plane] : []);
  }, [plane, enabled]);
  // per-frame guard (replaces enforceMaterialClipping, scoped here):
  useFrame(() => {
    if (!enabled || !rootRef.current) return;
    enforcePlaneOnSubtree(rootRef.current, plane);
  });
  return <group ref={rootRef}>{children}</group>;
}
```

## Diagrams

### Render-time clipping driver pipeline (WebGPU, after R1)

```
Scene
 |
 +-- Camera
 +-- Lights
 +-- ClippingGroup (clippingPlanes=[plane], enabled=true)        [Layer 2 boundary]
 |    |
 |    +-- Group (inner) ----> all geometry consumes clipping context
 |
 +-- SectionCap (sibling of ClippingGroup)
 |    +-- Stencil-prep override pass on (inner) subtree
 |    +-- Cap plane (stencilFunc=NotEqual, stencilRef=0)
 |    +-- renderer.clearStencil()
 |
 +-- Other overlays (SceneOverlay grid + axes)

For each rendered object inside ClippingGroup:
  Renderer._renderObjectDirect walks ancestors,
  finds isClippingGroup === true && enabled,
  calls clippingContext.getGroupContext(group).update(parent, group),
  populates unionPlanes from ClippingGroup.clippingPlanes.
NodeMaterial.setup -> setupClipping(builder) -> ClippingNode emits TSL discard.
On clip-distances-capable devices, NodeMaterial.setupHardwareClipping promotes
to vertex-stage hardware clipping (no fragment discard).
```

### Render-time pipeline (WebGL, after R1)

```
Scene
 |
 +-- Group (Layer 2 wrapper):
 |    on mount/plane-change, walk children:
 |      mesh.material.clippingPlanes = [plane]  (drei + matcap + glTF mats)
 |      lineSegments.material.clippingPlanes = [plane] (when enableLines)
 |    renderer.localClippingEnabled = enabled
 |    +-- Group (inner) ----> meshes already mutated
 |
 +-- SectionCap (same as WebGPU)

WebGLRenderer.render reads gl.localClippingEnabled, sees true,
WebGLClipping.beginShadows / setState pushes per-material planes into uniforms.
clipping_planes_fragment shader chunk discards fragments behind plane.
```

## Scope and Non-Goals

**In scope.**

- Fixing WebGPU section-view clipping driver (R1, R3).
- Unifying both backends behind one declarative tree (R1).
- Eliminating `O(parts)` cap pass (R2, R5).
- Documenting the new policy in `graphics-backend-policy.md` (R7).

**Out of scope.**

- Switching the cap material from striped to solid (UX decision, separate doc).
- Multi-plane section views (Tau today exposes a single plane through the XState machine).
- Non-manifold mesh capping (handled by `isClosedManifold` precondition; a separate research doc on robust capping for open meshes is the right home).
- The translucent halo around the viewport gizmo (`webgpu-compositor-premultiplied-alpha-halo.md`); orthogonal upstream r185 wait.

## Validation Plan

1. **Unit.** `react/section-view.utils.test.ts` — extend with cases asserting `walkAndApplyClipping` writes/clears `mat.clippingPlanes` on every traversed `Mesh` / `LineSegments` / `LineSegments2`.
2. **TSL snapshot.** New `react/__shader-snapshots__/section-clipping.json` capturing the `serialiseStrippedTslGraph` output of a `MeshBasicNodeMaterial` after `setupClipping` injection — guards against upstream `ClippingNode` regressions.
3. **Vitest playwright.** `apps/ui-e2e/src/section-view-clipping.spec.ts` (new): with `?graphicsBackend=webgl` and `?graphicsBackend=webgpu`, load `/e2e/graphics-backend` fixture (Tau already has the `box.glb`), enable section view, capture screenshots at the same camera, assert cropped pixel hash matches a per-backend baseline within tolerance. Confirms parity at the integration level.
4. **Smoke.** Dev console check: `material.hardwareClipping === true` when `navigator.gpu.requestAdapter()` advertises `clip-distances` (Chrome 119+ on macOS / Win / Linux desktop).

## Performance Budget

| Phase                               | Today (WebGL, N parts)                         | After R1+R2 (both backends)          |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Stencil prep meshes drawn           | 2N                                             | 2 (override material, full subtree)  |
| Cap planes drawn                    | N                                              | 1                                    |
| Stencil clears                      | N                                              | 1                                    |
| Fragment-shader `discard` per plane | 1                                              | 0 (hardware clipping when available) |
| Per-frame React reconciliation cost | proportional to N (`<PlaneStencilGroup>` keys) | constant                             |

For the user's reference test asset (`hollowbox` / engine assembly with ~12 parts), this is a ~12× reduction in draw-call count for the section-view overhead.

## References

- three.js docs: [`ClippingGroup`](https://threejs.org/docs/pages/ClippingGroup.html), [`ClippingNode`](https://threejs.org/docs/pages/ClippingNode.html), [`webgl_clipping_stencil`](https://threejs.org/examples/webgl_clipping_stencil.html).
- Upstream PR [#28237](https://github.com/mrdoob/three.js/pull/28237) — `WebGPURenderer: implement ClippingGroup object` (merged r171, ships in r184).
- Upstream PR [#22172](https://github.com/mrdoob/three.js/pull/22172) — alpha-to-coverage clipping (foundation for R8a).
- [`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) `MeshBVH.shapecast` / `intersectsPlane` plus the `clippedEdges` example — basis for R8b's true-contour line extraction at the cut.
- Upstream PR [#30538](https://github.com/mrdoob/three.js/pull/30538) — TSL `discard()` (r174); referenced under "Why not custom TSL `discard()`?".
- Issues [#31708](https://github.com/mrdoob/three.js/issues/31708), [#31779](https://github.com/mrdoob/three.js/issues/31779), [#31716](https://github.com/mrdoob/three.js/issues/31716) — `ClippingGroup` r180 stability fixes (we are r184; covered).
- Discourse [#88922](https://discourse.threejs.org/t/clippinggroup-clips-outside-of-its-descendants/88922) — community confirmation of scene-graph descendant-only semantics.
- Tau internals:
  - `apps/ui/app/components/geometry/graphics/three/react/section-view.tsx`
  - `apps/ui/app/components/geometry/graphics/three/react/section-view.utils.ts`
  - `apps/ui/app/components/geometry/graphics/three/use-section-view.ts`
  - `apps/ui/app/components/geometry/graphics/three/materials/striped-material.node.ts`
  - `apps/ui/app/components/geometry/graphics/three/stage.tsx`
- Three.js source (`node_modules/three/src`):
  - `objects/ClippingGroup.js`
  - `nodes/accessors/ClippingNode.js`
  - `materials/nodes/NodeMaterial.js`
  - `renderers/common/Renderer.js`
  - `renderers/common/ClippingContext.js`
  - `renderers/webgpu/utils/WebGPUPipelineUtils.js`
  - `renderers/WebGLRenderer.js`

## Appendix — minimal repro

```ts
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

const renderer = new WebGPURenderer({ canvas, antialias: true, stencil: true });
await renderer.init();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(2, 2, 4);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial({ color: 'orange' }));

// THIS DOES NOT CLIP ON WebGPU:
cube.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];

scene.add(cube);
renderer.render(scene, camera); // unclipped cube

// THIS DOES CLIP:
const group = new THREE.ClippingGroup();
group.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
group.enabled = true;
scene.add(group);
group.add(cube);
renderer.render(scene, camera); // clipped cube
```
