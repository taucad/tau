---
title: 'WebGPU fat-line hardware-clipping bug in section view'
description: 'Why GLTF edge lines bleed onto the clipped-away half of the section view on WebGPU only; root cause traced to NodeMaterial hardware-clipping ignoring Line2NodeMaterial vertex-node space.'
status: active
created: '2026-05-12'
updated: '2026-05-12'
category: investigation
related:
  - docs/research/webgpu-section-view-clipping-architecture.md
  - docs/research/gltf-edges-line-rendering-regression.md
  - docs/research/webgpu-line2-reversed-z-trim.md
  - docs/research/webgpu-fat-line-renderer-aware-depth.md
  - docs/policy/graphics-backend-policy.md
---

# WebGPU fat-line hardware-clipping bug in section view

Root-cause investigation of a section-view regression where GLTF edge lines render across the clipped-away half on WebGPU while the same scene clips correctly on WebGL.

## Executive Summary

- **Symptom (image evidence, 2026-05-12).** With section view enabled on the WebGPU backend, the brown solid mesh of a windmill is correctly clipped at the section plane, but the GLTF edge lines (windmill blades, gallery, cap) remain fully visible on the clipped-away side as a wireframe X-ray. WebGL clips both lines and solids identically and correctly.
- **Smoking gun.** Three.js's `NodeMaterial.setupHardwareClipping` adds a vertex-stage `gl_ClipDistance` computation to **every** WebGPU NodeMaterial whenever the device advertises the `clip-distances` feature. It computes the per-vertex clip distance using `positionView`, which falls through to `modelViewMatrix * positionLocal`. For `Line2NodeMaterial`, `positionLocal` is the static **`LineSegmentsGeometry` unit-quad corners** (six fixed `(±1, ±1, 0)`-style values reused across every instanced segment), not the line endpoints. The per-vertex clip distance therefore depends on the **mesh's local origin**, not on each segment's actual world position; every segment receives the same clip distance and is uniformly kept or culled.
- **WebGL escapes the bug** because its WebGL `LineMaterial` (a hand-written `ShaderMaterial`) explicitly fixes up `mvPosition = (position.y < 0.5) ? start : end;` immediately before `#include <clipping_planes_vertex>`. The `vClipPosition = -mvPosition.xyz;` varying then carries the actual segment endpoint into the fragment-stage `<clipping_planes_fragment>` discard. WebGPU has no equivalent fixup hook on `Line2NodeMaterial`.
- **Why the screenshot looks "inverted" rather than "everywhere".** The line mesh's origin sits roughly at the model origin near the bottom of the windmill — on the kept side of the section plane. With every segment given the kept-side mesh-origin distance, every line passes hardware clipping. We then perceive the lines as "appearing on the clipped-off side" because that is the only place where they aren't visually subsumed by the underlying solid mesh; on the kept side the lines still draw, but they sit on top of brown solid where they are expected.
- **Surgical fix (landed).** The existing Tau subclass `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts` already overrides `Line2NodeMaterial` for the reversed-Z `nearEstimate` divergence and is the import target of every fat-line consumer (`gltf-edges.ts`, `axes-helper.tsx`). Adding a single `setupHardwareClipping` override there forces `this.hardwareClipping = false`, routing `NodeMaterial.setupClipping` through the **software fragment-stage path**, which reconstructs `positionView` per fragment via `cameraProjectionMatrixInverse * v_clipSpace` — perspective-correctly interpolated across the line quad and aligned with the line's actual world position. WebGL's path and bulk surface-mesh hardware clipping are untouched.

## Problem Statement

User-reported symptoms (image evidence captured 2026-05-12, windmill model with horizontal section plane):

1. **WebGPU pane.** Solid surfaces are clipped correctly (only the lower tower base shows as filled brown). Edge lines from `gltf-edges.ts` for the windmill blades, the cap, and the gallery — all geometry _above_ the section plane — render in full, producing a wireframe ghost of the cut-off half.
2. **WebGL pane.** Both solids _and_ lines clip correctly. The wireframe matches the visible solid silhouette and stops cleanly at the section plane.

Both panes share:

- The same `<SectionClippingGroup>` in `apps/ui/app/components/geometry/graphics/three/react/section-clipping-group.tsx`.
- The same `THREE.Plane` instance from `useSectionView()` (`apps/ui/app/components/geometry/graphics/three/use-section-view.ts`).
- The same fat-line geometry (`LineSegmentsGeometry` + extracted positions from `gltf-edges.ts`).

The only divergence is the line _material_ (`LineMaterial` for WebGL, `Line2NodeMaterial` for WebGPU) and the clipping driver (`material.clippingPlanes` + `gl.localClippingEnabled` for WebGL; `THREE.ClippingGroup` for WebGPU).

The investigation must answer:

1. Why does the WebGPU `ClippingGroup` correctly clip mesh materials but fail to clip `Line2NodeMaterial`?
2. What is the canonical mechanism by which the WebGL `LineMaterial` clipping path stays correct despite the same fat-line vertex displacement maths?
3. What is the minimum-blast-radius fix that preserves the WebGL behaviour and fixes WebGPU without disabling hardware clipping for the bulk surface meshes?

## Methodology

1. Read the Tau call sites: `gltf-edges.ts`, `section-clipping-group.tsx`, `section-view.utils.ts`, `use-section-view.ts`.
2. Trace clipping uniform packing per backend: `WebGLClipping.js` (WebGL) vs `ClippingContext.js` (WebGPU).
3. Compare the WebGL/WebGPU shader chunks: `clipping_planes_vertex.glsl.js`, `clipping_planes_fragment.glsl.js`, `ClippingNode.js`.
4. Compare the WebGL `LineMaterial` (`examples/jsm/lines/LineMaterial.js`) with the WebGPU `Line2NodeMaterial` (`src/materials/nodes/Line2NodeMaterial.js`) for any clipping-specific fixups.
5. Inspect `NodeMaterial.setup` (`src/materials/nodes/NodeMaterial.js`) to identify the entry points where `setupHardwareClipping` and `setupClipping` decide between hardware and software clipping.
6. Inspect `positionView` (`src/nodes/accessors/Position.js`) to understand how the accessor resolves per shader stage when `material.vertexNode` is set.
7. Cross-reference upstream issues: three.js #18009, #29537, #31779, #32229.

## Findings

### Finding 1: Plane uniform packing is sign-flipped between backends, but the discard predicate is equivalent

WebGL (`WebGLClipping.js`, lines 145–151) packs the clipping plane uniform as `(n.x, n.y, n.z, plane.constant)` with `n` and `constant` already transformed into view space via `plane.applyMatrix4(viewMatrix, viewNormalMatrix)`.

WebGPU (`ClippingContext.js`, lines 122–125) packs **the negated normal**: `(-n.x, -n.y, -n.z, plane.constant)`, with the same view-space transform.

The fragment-stage discard predicates compose to the same kept half-space:

| Backend | Fragment predicate                                                                           | Algebraic kept condition          |
| ------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| WebGL   | `dot(vClipPosition, plane.xyz) > plane.w → discard;` where `vClipPosition = -mvPosition.xyz` | `n · positionView + constant ≥ 0` |
| WebGPU  | `positionView.dot(plane.xyz).greaterThan(plane.w).discard()` with `plane.xyz = -n`           | `n · positionView + constant ≥ 0` |

Both backends arrive at the same kept condition. The plane-sign packing is **not** the bug.

### Finding 2: WebGL `LineMaterial` carries a per-fragment line-endpoint view position via an explicit `mvPosition` fixup

`examples/jsm/lines/LineMaterial.js` line 234, immediately before `#include <clipping_planes_vertex>`:

```glsl
vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
```

The `<clipping_planes_vertex>` chunk then assigns `vClipPosition = -mvPosition.xyz`. Because `start = modelViewMatrix * vec4(instanceStart, 1.0)` and `end = modelViewMatrix * vec4(instanceEnd, 1.0)`, the varying carries the actual **segment endpoint** view-space position per quad vertex. The rasterizer perspective-correctly interpolates the varying across the line quad, so each fragment's `vClipPosition` lies near the actual line in 3D and the per-fragment discard test is correct.

The comment "this is an approximation" acknowledges that the screen-space pixel-offset is not folded into `mvPosition`; this is a sub-pixel error that is invisible in practice.

`LineMaterial`'s constructor also passes `clipping: true` to `super(...)` (line 438), which is required for `ShaderMaterial` subclasses to enable clipping.

### Finding 3: WebGPU `Line2NodeMaterial` has no equivalent line-endpoint fixup

`src/materials/nodes/Line2NodeMaterial.js`'s `vertexNode` (lines 159–317) computes a clip-space output `clip = (positionGeometry.y < 0.5).select(clipStart, clipEnd) + screenSpaceOffset`. It assigns this clip-space vec4 as the material's vertex output. Critically, the material **never assigns or overrides `positionView`** — it operates entirely in clip space.

Three.js's `positionView` accessor (`src/nodes/accessors/Position.js`, lines 84–98) resolves differently per shader stage:

```js
export const positionView = Fn((builder) => {
  if (builder.shaderStage === 'fragment' && builder.material.vertexNode) {
    // reconstruct view position from clip space
    const viewPos = cameraProjectionMatrixInverse.mul(clipSpace);
    return viewPos.xyz.div(viewPos.w).toVar('positionView');
  }
  return builder.context.setupPositionView().toVarying('v_positionView');
}, 'vec3').once(['POSITION', 'VERTEX'])();
```

- In **fragment stage** with `vertexNode` set, `positionView` is reconstructed per fragment from the interpolated `v_clipSpace` varying. This is approximately correct for the line: `v_clipSpace` carries the line shader's own clip-space output, which interpolates across the line quad and (after inverse projection / `w` divide) yields a per-fragment view-space position close to the actual line.
- In **vertex stage** (or fragment stage without `vertexNode`), the accessor falls through to `setupPositionView() = modelViewMatrix * positionLocal`. For `LineSegmentsGeometry`, `positionLocal` is the static unit-quad attribute (`±1` corners reused for every instance). This view-space value bears **no relation to the actual line segment's world position**.

### Finding 4: `NodeMaterial.setupHardwareClipping` activates HW clipping for **every** WebGPU NodeMaterial when the device supports `clip-distances`

`src/materials/nodes/NodeMaterial.js` lines 657–676:

```js
setupHardwareClipping( builder ) {
  this.hardwareClipping = false;

  if ( builder.clippingContext === null ) return;

  const candidateCount = builder.clippingContext.unionPlanes.length;

  // 8 planes supported by WebGL ANGLE_clip_cull_distance and WebGPU clip-distances

  if ( candidateCount > 0 && candidateCount <= 8 && builder.isAvailable( 'clipDistance' ) ) {
    builder.stack.addToStack( hardwareClipping() );
    this.hardwareClipping = true;
  }
}
```

This unconditional opt-in adds `hardwareClipping()` to the **vertex stage** stack. `ClippingNode.setupHardwareClipping` (lines 198–217) emits per-vertex `gl_ClipDistance[i] = -(positionView · plane.xyz) + plane.w` — and this is where `positionView` is first referenced in the **vertex** stage.

`positionView`'s `.once([ 'POSITION', 'VERTEX' ])` cache key produces a different cache slot per sub-build. In the vertex sub-build, the fragment-stage `vertexNode` branch is **not** taken (the condition is `builder.shaderStage === 'fragment' && builder.material.vertexNode`), so it falls through to `modelViewMatrix * positionLocal`.

For `Line2NodeMaterial`, **`positionLocal` is the unit-quad attribute** of the shared `LineSegmentsGeometry` (six vertices like `(-1, 2, 0), (1, 2, 0), (-1, 1, 0), …`), reused for every instanced segment via the `instanceStart`/`instanceEnd` attributes. The hardware-clipping per-vertex distance therefore depends only on the LineSegments2 mesh's local origin (transformed by `modelViewMatrix`), not on each segment's actual endpoints.

Result: **every segment receives the same `gl_ClipDistance` value** (the distance from the mesh origin to the plane). The rasterizer either keeps the entire mesh or culls the entire mesh; per-segment clipping does not occur.

### Finding 5: When the mesh origin sits on the kept side, hardware clipping silently passes everything

In Tau's `gltf-edges.ts`, each `LineSegments2` inherits the source `LineSegments`'s `position`/`rotation`/`scale`. For a typical GLTF asset, this is the model origin — which for the windmill in the screenshot is near the centre-bottom of the model, _on the kept side_ of the section plane. Hardware clipping therefore reports `gl_ClipDistance ≥ 0` for every quad vertex of every segment, and **all line segments pass the hardware cull**. The fragment-stage software clipping (`clipping()`) is not added either, because `NodeMaterial.setupClipping` skips the software branch when `this.hardwareClipping === true` is already in effect via the union-plane gate inside `ClippingNode.setupDefault` / `setupAlphaToCoverage` (`if (this.hardwareClipping === false && numUnionPlanes > 0) { … }`, `ClippingNode.js` lines 96 and 156).

So the lines reach the fragment shader undiscarded on **both** sides of the plane. Visually, the user perceives the unintended visibility on the clipped-off side because that is where there is no underlying solid to confound them; on the kept side the lines still draw _on top_ of the visible solid.

### Finding 6: WebGL is immune because it never goes through `NodeMaterial.setupHardwareClipping`

`LineMaterial` is a `ShaderMaterial` (raw GLSL with `clippingPlanes` uniform), not a `NodeMaterial`. The WebGL pipeline routes clipping entirely through the `<clipping_planes_*>` shader chunks; `setupHardwareClipping` is never called. The WebGL `LineMaterial`'s explicit `mvPosition = (position.y < 0.5) ? start : end` fixup (Finding 2) ensures `vClipPosition` carries the correct line endpoint into the fragment-stage discard. WebGL therefore enjoys per-fragment, line-endpoint-accurate clipping for free.

`WEBGL_clip_cull_distance` (the WebGL2 extension that would parallel WebGPU's `clip-distances`) is consulted only by the `webgl-fallback` `GLSLNodeBuilder` path (`src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js` line 1257), which Tau does not use; we use the regular `WebGLRenderer` with `LineMaterial`.

### Finding 7: Software fragment clipping uses the per-fragment reconstructed `positionView` and works correctly for the line shader

`ClippingNode.setupDefault` (lines 150–189) and `setupAlphaToCoverage` (lines 85–141) both reference `positionView` from the **fragment** stage. With `material.vertexNode` set, the fragment-stage `positionView` reconstructs from the interpolated `v_clipSpace` varying:

```glsl
viewPos = projectionMatrixInverse * v_clipSpace;
positionView = viewPos.xyz / viewPos.w;
```

Because `v_clipSpace` is the line shader's own clip-space output (per quad vertex: `clipStart + offset` or `clipEnd + offset`), the rasterizer's perspective-correct interpolation across the line quad combined with the inverse projection yields a per-fragment view-space position approximately on the line itself. The screen-space offset adds a sub-pixel perpendicular displacement that is invisible in practice (same approximation as WebGL's `mvPosition` fixup, in mirror form). The discard predicate `positionView · plane.xyz > plane.w` is then evaluated per fragment with correct positions.

**Conclusion of findings.** The fragment-stage software clipping path is the correct path for `Line2NodeMaterial`. Hardware clipping is broken for this material specifically because it is keyed on per-vertex `positionView` against unit-quad geometry. Disabling hardware clipping on the Tau WebGPU edge material routes clipping back through the software fragment path and recovers correct behaviour without affecting any other material.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                            | Status     | Priority | Effort  | Impact                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| R1  | Override `setupHardwareClipping` on the canonical Tau `Line2NodeMaterial` subclass at `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`, forcing the framework into software fragment-stage clipping for every fat-line consumer (`gltf-edges.ts`, `axes-helper.tsx`). | **Landed** | P0       | Trivial | Fixes the visible bug on every WebGPU-capable device with no fresh subclass; zero impact on bulk meshes (still HW-clipped). |
| R2  | Co-locate a Vitest regression guard in `line2.material.test.ts` that asserts the override leaves `material.hardwareClipping === false` and never pushes `hardwareClipping()` onto the vertex stack.                                                                                               | **Landed** | P1       | Low     | Locks the workaround in place across `three` upgrades.                                                                      |
| R3  | File a three.js issue / PR to either (a) add a `material.useHardwareClipping = false` opt-out flag, or (b) skip `setupHardwareClipping` automatically when `material.vertexNode` is set and the material does not declare a per-vertex `positionView` substitute.                                 | Pending    | P2       | Medium  | Removes the workaround long-term; helps every other downstream consumer of fat lines + `ClippingGroup`.                     |
| R4  | Once R3 lands upstream, reduce the override to a comment-only acknowledgement that a future `three` bump will let us delete it (and update the class JSDoc "Divergence 2" block accordingly).                                                                                                     | Pending    | P3       | Trivial | Tracks the workaround's expiry.                                                                                             |

### R1 — Surgical fix (landed): override on the existing `Line2NodeMaterial` subclass

Tau already maintains a `Line2NodeMaterial` subclass at `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts` that re-implements `vertexNode`/`colorNode`/`outputNode` (Divergence 1, the reversed-Z `nearEstimate` trim) and is the import target of every fat-line consumer (`gltf-edges.ts`, `axes-helper.tsx`). The right home for the hardware-clipping override is **this same class**, alongside the `setup` override — not a fresh subclass in `gltf-edges.ts`. Reasons:

1. **One subclass, all consumers.** A single change covers GLTF edge lines _and_ the axes helper (and any future fat-line user) without each call site adopting its own bespoke subclass.
2. **Co-located divergences.** Both upstream divergences from `Line2NodeMaterial` (reversed-Z near trim and section-view hardware clipping) live in the same file with one shared JSDoc rationale.
3. **No prototype chain duplication.** The existing `Reflect.apply(Object.getPrototypeOf(ThreeLine2NodeMaterial.prototype).setup, this, [builder])` already bypasses upstream `Line2NodeMaterial.setup`; adding the new override here keeps the prototype walk unchanged.

```typescript
// apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts
export class Line2NodeMaterial extends ThreeLine2NodeMaterial {
  // ... existing constructor + setup() override (Divergence 1) ...

  /**
   * Forces software fragment-stage clipping (`positionView` reconstructed from `clipSpace`
   * per fragment) instead of vertex-stage hardware `gl_ClipDistance`. See class JSDoc
   * "Divergence 2" for the smoking-gun chain.
   */
  public override setupHardwareClipping(builder: unknown): void {
    (this as { hardwareClipping: boolean }).hardwareClipping = false;
  }
}
```

`createWebGpuGltfFatLineMaterial` and `createAxesHelperFatLineMaterial` already construct via this Tau subclass, so no call-site changes are needed. The WebGL path (`createEdgeLineMaterial → LineMaterial`) is untouched, and bulk surface materials in the rest of the scene continue to enjoy hardware clipping inside the `<ClippingGroup>` ancestor.

### R2 — Regression test (landed)

`apps/ui/app/components/geometry/graphics/three/materials/line2.material.test.ts` adds a "section-view regression guard" alongside the existing reversed-Z trim guard:

1. Constructs a `Line2NodeMaterial`, calls `setupHardwareClipping(stubBuilder)` with a stub that would normally trigger upstream's hardware path (`clippingContext.unionPlanes.length > 0`, `isAvailable('clipDistance') === true`).
2. Asserts `material.hardwareClipping === false`.
3. Asserts `stubBuilder.stack.addToStack` is **not** called — i.e. the upstream `hardwareClipping()` node never reaches the vertex stack.

The test runs in Node (`// @vitest-environment node`) without a GPU device because `setupHardwareClipping` is plain JS.

### R3 — Upstream framework fix

Two viable upstream shapes:

- **Opt-out flag.** Introduce `material.useHardwareClipping: boolean = true`. `setupHardwareClipping` short-circuits when `this.useHardwareClipping === false`. Minimal API surface and trivially adoptable.
- **Auto-detect.** Skip hardware clipping when `material.vertexNode !== null` _and_ the material has not provided an explicit per-vertex `positionView` override. Marginally more magical but removes a foot-gun for every fat-line consumer.

Either way, the fix should ship with a `Line2NodeMaterial` regression test that places the material in a `ClippingGroup` and asserts that fragment-stage software clipping is the active path.

### R4 — Long-term cleanup

Once the upstream fix lands and we bump `three` past that release, remove the `setupHardwareClipping` override from the Tau subclass and trim "Divergence 2" out of the class JSDoc. Keep "Divergence 1" (the reversed-Z `nearEstimate` trim) as long as that upstream maths remains unfixed. Cross-link the deletion commit to the upstream PR.

## Trade-offs

| Option                                                                                 | Pros                                                                                                                                                                                                                                  | Cons                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1: override on the existing canonical Tau `Line2NodeMaterial` subclass** _(landed)_ | One method on the class we already maintain; isolated to fat-line materials; preserves HW clipping for all other meshes; survives `three` upgrades transparently; reuses the same JSDoc rationale block as the reversed-Z divergence. | We own the explanatory comment until the upstream fix lands.                                                                                                                                                                           |
| Fresh `TauEdgeNodeMaterial` subclass in `gltf-edges.ts`                                | Localised to the GLTF edge use case                                                                                                                                                                                                   | Misses `axes-helper.tsx` (would need a parallel subclass); fragments the divergence ledger across two files; introduces a second `Reflect.apply` chain or a `super.setup` that ricochets back into upstream `Line2NodeMaterial.setup`. |
| Disable HW clipping renderer-wide via `WebGPURenderer({ … })` knob                     | No subclass needed                                                                                                                                                                                                                    | Drops HW-clipping perf for bulk surface meshes; defeats the optimisation that motivated the renderer's `clip-distances` feature gate.                                                                                                  |
| Reimplement clipping in the Tau line shader                                            | Total control                                                                                                                                                                                                                         | Re-derives logic the framework already provides; brittle across `three` upgrades; ignores the `ClippingGroup` scene-graph contract.                                                                                                    |
| Patch `three` locally via `pnpm patch`                                                 | Fixes for all materials at once                                                                                                                                                                                                       | Requires a patch file we have to maintain; the override approach is strictly cheaper because only fat-line materials are affected.                                                                                                     |

## Code Examples

### Vertex-stage hardware clipping uses unit-quad-relative `positionView` (the bug)

`src/nodes/accessors/ClippingNode.js` lines 198–217:

```js
setupHardwareClipping( unionPlanes, builder ) {
  const numUnionPlanes = unionPlanes.length;

  builder.enableHardwareClipping( numUnionPlanes );

  return Fn( () => {
    const clippingPlanes = uniformArray( unionPlanes ).setGroup( renderGroup );
    const hw_clip_distances = builtin( builder.getClipDistance() );

    Loop( numUnionPlanes, ( { i } ) => {
      const plane = clippingPlanes.element( i );

      const distance = positionView.dot( plane.xyz ).sub( plane.w ).negate();
      hw_clip_distances.element( i ).assign( distance );
    } );
  } )();
}
```

For `Line2NodeMaterial`, `positionView` here resolves to `modelViewMatrix * positionLocal`, where `positionLocal` is the unit-quad attribute. The clip distance therefore reflects only the mesh's local origin.

### WebGL `LineMaterial` fixes up `mvPosition` so `vClipPosition` is endpoint-accurate

`examples/jsm/lines/LineMaterial.js` lines 232–238:

```glsl
gl_Position = clip;

vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>   // sets vClipPosition = -mvPosition.xyz
#include <fog_vertex>
```

The fragment chunk (`clipping_planes_fragment.glsl.js`) then issues `if ( dot(vClipPosition, plane.xyz) > plane.w ) discard;` per fragment.

### Surgical fix (landed): opt the canonical Tau line subclass out of hardware clipping

```typescript
// apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts
export class Line2NodeMaterial extends ThreeLine2NodeMaterial {
  // ... existing setup() override re-implementing vertexNode/colorNode/outputNode ...

  public override setupHardwareClipping(builder: unknown): void {
    (this as { hardwareClipping: boolean }).hardwareClipping = false;
  }
}
```

`NodeMaterial.setupClipping` (called immediately after `setupHardwareClipping` in `NodeMaterial.setup`) sees `this.hardwareClipping === false` and adds `clipping()` (or `clippingAlpha()`) to the fragment stack. `ClippingNode.setupDefault` / `setupAlphaToCoverage` gate their software loops on `this.hardwareClipping === false`, so the per-fragment `positionView` reconstruction now drives the discard. The fix is purely additive: every other material in the scene retains hardware clipping, and every fat-line consumer (`gltf-edges.ts`, `axes-helper.tsx`) inherits the override without any call-site change.

## Diagrams

```
WebGL path (correct)
──────────────────────────────────────────────
LineMaterial (ShaderMaterial)
  vertex:
    start = MV * instanceStart
    end   = MV * instanceEnd
    clip  = projection * (start | end) + screenOffset
    mvPosition = (position.y < 0.5) ? start : end   ← endpoint fixup
    vClipPosition = -mvPosition.xyz                 ← varying
  fragment:
    discard if dot(vClipPosition, plane.xyz) > plane.w
                  ↑ per-fragment interpolated endpoint position
                  ↑ correct discard ✓


WebGPU path (broken — current)
──────────────────────────────────────────────
Line2NodeMaterial (NodeMaterial, vertexNode set)
  vertex (HW clipping path):
    positionLocal     = unit-quad attribute (±1, ±1, 0)
    positionView      = modelViewMatrix * positionLocal       ← WRONG SPACE
    gl_ClipDistance[i] = -(positionView · plane.xyz) + plane.w
                        ↑ depends on mesh origin only
                        ↑ same value for every instanced segment ✗
  fragment:
    software discard skipped (hardwareClipping === true)


WebGPU path (after R1 fix, landed)
──────────────────────────────────────────────
Tau Line2NodeMaterial subclass (line2.material.ts)
  vertex:
    setupHardwareClipping → hardwareClipping = false (no addToStack)
  fragment:
    positionView      = projectionMatrixInverse * v_clipSpace / w   ← reconstructed per fragment
    discard if positionView · plane.xyz > plane.w                    ← correct ✓
```

## References

- three.js #18009 — _THREE.Line2 and THREE.LineSegments2 cannot be cropped by clippingPlanes_ (the WebGL `material.clipping = true` requirement that motivated the `LineMaterial` constructor default).
- three.js #29537 — _LineMaterial: fix segment clipping with reverse depth_ — note the related "axes appeared inverted" symptom that, while distinct, demonstrates the line-quad geometry's susceptibility to clipping mis-mapping when shader maths is not endpoint-aware.
- three.js #31779 — _ClippingGroup_: the WebGPU rotation-on-clip regression fixed in r180 (PR #31716). Establishes that `ClippingGroup`-driven clipping is the canonical WebGPU path for the bulk meshes; this investigation is the next layer down (line materials specifically).
- three.js #32229 — _LineMaterial vs Line2NodeMaterial_: Mugen87 confirms (Nov 2025) "Line2NodeMaterial does not currently support clipping" in user-reported parity issues, aligning with this finding.
- three.js source files referenced inline:
  - `src/renderers/common/ClippingContext.js`
  - `src/renderers/webgl/WebGLClipping.js`
  - `src/renderers/shaders/ShaderChunk/clipping_planes_{vertex,fragment}.glsl.js`
  - `src/nodes/accessors/{ClippingNode,Position,Camera}.js`
  - `src/materials/nodes/{NodeMaterial,Line2NodeMaterial}.js`
  - `examples/jsm/lines/{LineMaterial,LineSegmentsGeometry}.js`
- Related Tau research:
  - `docs/research/webgpu-section-view-clipping-architecture.md` — establishes the `<SectionClippingGroup>` backend abstraction.
  - `docs/research/gltf-edges-line-rendering-regression.md` — prior history of the edge-rendering pipeline.
  - `docs/research/webgpu-line2-reversed-z-trim.md` — depth-bias adaptation between WebGL `<logdepthbuf_*>` chunks and WebGPU reversed-Z encoding.
  - `docs/research/webgpu-fat-line-renderer-aware-depth.md` — sibling override on the same subclass that picks the matching `viewZTo*Depth` encoder per renderer use case (resolves the WebGPU screenshot occlusion bug).
- Related Tau policy:
  - `docs/policy/graphics-backend-policy.md`.
