---
title: 'WebGPU reversed-Z transparent sort inversion'
description: "Three.js's default `reversePainterSortStable` silently inverts the transparent draw order on `reversedDepthBuffer: true` renderers; surgical fix is a custom `setTransparentSort` that flips the z comparison."
status: active
created: '2026-05-12'
updated: '2026-05-12'
category: investigation
related:
  - docs/research/webgpu-fat-line-hardware-clipping-bug.md
  - docs/research/webgpu-section-view-clipping-architecture.md
  - docs/research/webgpu-line2-reversed-z-trim.md
  - docs/policy/graphics-backend-policy.md
---

# WebGPU reversed-Z transparent sort inversion

Root-cause investigation of why the section-view selector pair's labels render mirrored / swapped on the WebGPU viewport while the same UI is correct on WebGL. The bug generalises to any `transparent: true, depthTest: false` overlap on a `reversedDepthBuffer: true` renderer.

## Executive Summary

- **Symptom (image evidence, 2026-05-12).** `SectionViewControls`'s six face-selector pairs render with their labels swapped on the WebGPU viewport (e.g. "Top" reads "Bottom", "Right" reads "Left") and the glyphs are horizontally mirrored. WebGL renders them correctly. The two reported defects (label name swap and mirrored glyphs) are not independent bugs — they are the same draw-order inversion observed twice.
- **Smoking gun.** Three.js's transparent-render-list sort `reversePainterSortStable` (`node_modules/three/src/renderers/common/RenderList.js` line 43) returns `b.z - a.z`, encoding the assumption "**larger clip-space Z = farther from camera**." That assumption is **violated** under `reversedDepthBuffer: true` (`node_modules/three/src/math/Matrix4.js` `makePerspective(reversedDepth=true)` lines 1134–1138, branched on by the WebGPU viewport renderer at [`apps/ui/app/components/geometry/graphics/three/renderer.ts`](../../apps/ui/app/components/geometry/graphics/three/renderer.ts) line 57). Under reversed-Z, **closer = larger clip-z**, so the default sort renders closer transparent geometry FIRST and farther LAST — front-to-back, the opposite of correct back-to-front for alpha blending and `depthTest: false` overdraw.
- **Why the section-view selectors visualise the bug so cleanly.** Each face is rendered as a back-to-back forward / inverse pair offset by `labelDepth * scale ≈ 0.02 * scale` along the plane normal ([`apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx`](../../apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx) lines 287–301) with `transparent: true, depthTest: false, depthWrite: false, side: FrontSide`. With `FrontSide` cull, only the camera-facing cap of each selector renders. From any +Z-side viewpoint, the forward "Top" back cap and the inverse "Bottom" Y-rotated front cap both face the camera and overlap in screen space. Whichever renders **last** under `depthTest: false` wins. On WebGL, the forward (closer, smaller clip-z) sorts after the inverse (farther, larger clip-z) — forward overdraws ✓. On WebGPU reversed-Z, the forward (closer, **larger** clip-z) sorts before the inverse (smaller clip-z) — inverse overdraws, producing the "Bottom" label in the "Top" slot with X-mirrored glyphs from the 180° Y rotation ✗.
- **Surgical fix (landed).** Register a custom transparent sort `reversedDepthTransparentSort` (defined at [`apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts`](../../apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts)) on the WebGPU `viewport` branch via `renderer.setTransparentSort(...)`. The new sort is identical to upstream except for the inverted z subtraction (`a.z - b.z` instead of `b.z - a.z`); group-order, render-order, and id tie-breaks are unchanged. Applies only when `reversedDepthBuffer: true` is active (i.e. the WebGPU `viewport` use case). Opaque sort, WebGL renderers, and WebGPU `offscreen` / `screenshot` renderers are intentionally untouched.
- **Generality.** The fix covers every current and future `transparent: true, depthTest: false` overlap on the WebGPU viewport, not just the section-view selectors. Any future overlay UI that relies on draw-order to win an overdraw race (HUDs, stickers, label clusters, gizmo widgets) inherits correct behaviour automatically.

## Problem Statement

User-reported symptoms (image evidence captured 2026-05-12, identical scene rendered on WebGPU vs WebGL):

1. **WebGPU pane.** Section-view face selectors render mirrored labels in swapped slots ("Top" reads "Bottom", "Right" reads "Left", glyphs horizontally mirrored).
2. **WebGL pane.** Same selectors read correctly with un-mirrored glyphs.

Both panes share:

- The same `<SectionViewControls>` React tree, materials, geometries, and `renderOrder` values ([`apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx`](../../apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx)).
- The same `transparent: true, depthTest: false, depthWrite: false, side: FrontSide` material configuration on every face selector.
- The same camera and the same scene graph.

The investigation must answer:

1. Why does the WebGPU pane render the inverse selector when the forward selector should win the depth-test-disabled overdraw race?
2. What single backend-only difference can flip the visible result given identical materials and identical geometry?
3. What is the minimum-blast-radius fix that preserves WebGL behaviour and addresses every other transparent overlap on the WebGPU viewport (not just this UI)?

## Methodology

1. Read the Tau call sites: `section-view-controls.tsx`, `renderer.ts`, `tau-renderer.ts`, `graphics-backend-policy.md`.
2. Trace the transparent render-item flow in three.js: `Renderer.js` (push to render list) → `RenderList.js` (sort) → `Renderer.js` (draw loop).
3. Inspect the projection-matrix construction for both depth conventions: `Matrix4.makePerspective(...)`.
4. Algebraically verify the clip-space `z` direction under each branch (forward vs reversed) and confirm which assumption `reversePainterSortStable` encodes.
5. Map the resulting draw order onto the section-view selector pair geometry (forward closer than inverse; both `FrontSide`-culled to a single camera-facing cap).
6. Confirm the fix does not regress opaque rendering (depth-test handles correctness; sort affects only early-Z perf) or WebGL / non-viewport WebGPU renderers (no reversed-Z there).

## Findings

### Finding 1: `reversePainterSortStable` encodes "larger clip-z = farther" via `b.z - a.z`

`node_modules/three/src/renderers/common/RenderList.js` lines 43–63:

```javascript
function reversePainterSortStable(a, b) {
  if (a.groupOrder !== b.groupOrder) {
    return a.groupOrder - b.groupOrder;
  } else if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  } else if (a.z !== b.z) {
    return b.z - a.z;
  } else {
    return a.id - b.id;
  }
}
```

The `b.z - a.z` term sorts items with larger `a.z` BEFORE items with smaller `a.z` — i.e. larger clip-z renders first, smaller renders last. Under the implicit assumption "larger clip-z = farther," this is back-to-front, the canonical painter order for transparent compositing.

`a.z` is **clip-space Z before the homogeneous divide**, computed in `Renderer.js` line 3080:

```javascript
_projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
// ...
_vector4.setFromMatrixPosition(object.matrixWorld).applyMatrix4(_projScreenMatrix);
// ...
renderList.push(object, geometry, material, groupOrder, _vector4.z, null, clippingContext);
```

`Vector4.applyMatrix4` performs a plain matrix multiplication and does **not** divide by the homogeneous `w`, so `_vector4.z` is the row-3 dot product `c·viewZ + d`.

### Finding 2: Reversed-Z inverts the relationship between clip-space Z and view-space distance

`node_modules/three/src/math/Matrix4.js` `makePerspective(...)` lines 1134–1156 selects two distinct row-3 coefficients `(c, d)` based on the `reversedDepth` flag:

| Branch                                                                                  | `c`                 | `d`                        | clip-z at viewZ = -near | clip-z at viewZ = -far |
| --------------------------------------------------------------------------------------- | ------------------- | -------------------------- | ----------------------- | ---------------------- |
| **WebGPU forward** (`coordinateSystem = WebGPUCoordinateSystem, reversedDepth = false`) | `-far / (far-near)` | `-(far·near) / (far-near)` | `0`                     | `far`                  |
| **WebGPU reversed** (`reversedDepth = true`)                                            | `near / (far-near)` | `(far·near) / (far-near)`  | `near`                  | `0`                    |

Algebra (substituting `viewZ = -z` for a point at `z` units in front of the camera, where `z ∈ [near, far]`):

- Forward: `clipZ = c·(-z) + d = (far·z)/(far-near) - (far·near)/(far-near) = far(z - near)/(far-near)`. Monotonically increasing in `z` → **larger z (farther) gives larger clip-z** ✓ (matches `reversePainterSortStable`'s assumption).
- Reversed: `clipZ = c·(-z) + d = -(near·z)/(far-near) + (far·near)/(far-near) = near(far - z)/(far-near)`. Monotonically **decreasing** in `z` → **larger z (farther) gives smaller clip-z** ✗ (the assumption is inverted).

This single sign flip in `c` and `d` silently inverts every consumer of `_vector4.z` that assumes "larger = farther." `reversePainterSortStable` is the only path where this assumption affects rendering correctness; opaque sort uses the same convention but rests on depth-test for visibility (sort is only an early-Z perf hint).

### Finding 3: The section-view selector pair makes the bug visible

`SectionViewControls` ([`apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx`](../../apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx) lines 287–301) renders each of the six faces as a back-to-back pair:

- **Forward selector** (e.g. "Top"): `position = baseOffset along +N`, `isInverse = false`, baseRotation. Text glyphs in original orientation.
- **Inverse selector** (e.g. "Bottom"): `position = baseOffset - labelDepth*scale along +N`, `isInverse = true`, `baseRotation + (0, π, 0)`. The 180° Y rotation horizontally mirrors the text glyphs.

The two selectors share the same `groupOrder` (from `THREE.ClippingGroup` membership), the same `renderOrder = topMostRenderOrder`, and the same materials (`transparent: true, depthTest: false, depthWrite: false, side: FrontSide`).

With `FrontSide` cull, only the camera-facing cap of each selector renders. From any +Z-side viewpoint:

- The forward "Top" selector's back cap (normal +Z, original text) faces the camera → rendered.
- The inverse "Bottom" selector's original front cap, after the 180° Y rotation, now faces +Z with its X-mirrored text → also rendered.

Both visible caps overlap in screen space. With `depthTest: false`, the cap drawn LAST overdraws the cap drawn FIRST. The render list's transparent sort decides who wins:

| Renderer                           | `_vector4.z` (forward)             | `_vector4.z` (inverse)            | Sort under `b.z - a.z`      | Last drawn | Visible label                       |
| ---------------------------------- | ---------------------------------- | --------------------------------- | --------------------------- | ---------- | ----------------------------------- |
| **WebGL** (forward depth)          | smaller (closer, smaller clip-z)   | larger (farther, larger clip-z)   | inverse FIRST, forward LAST | Forward    | "Top" with original glyphs ✓        |
| **WebGPU `viewport`** (reversed-Z) | larger (closer, **larger** clip-z) | smaller (farther, smaller clip-z) | forward FIRST, inverse LAST | Inverse    | "Bottom" with **mirrored** glyphs ✗ |

The two reported defects (wrong label name, mirrored glyphs) are the same draw-order inversion observed twice — fixing the sort fixes both.

### Finding 4: The fix generalises to every `transparent: true, depthTest: false` overlap on the reversed-Z viewport

`reversePainterSortStable` is the **only** transparent-list comparator three.js ships, and `setTransparentSort(...)` is the documented hook for replacing it (`Renderer.js` line 953 in @types/three: `setTransparentSort(method: ((a: RenderItem, b: RenderItem) => number) | null): void`). Any current or future Tau overlay that relies on transparent draw order — HUDs, sticker decals, gizmo widgets, label clusters, future overlay UIs — inherits the same inversion under `reversedDepthBuffer: true`. Registering the corrected sort once at the renderer factory boundary covers them all without per-call-site mitigations.

The fix scope is bounded by `reversedDepthBuffer: true`. The WebGPU `offscreen` and `screenshot` use cases ([`renderer.ts`](../../apps/ui/app/components/geometry/graphics/three/renderer.ts) lines 61–66) explicitly opt out of reversed-Z (`logarithmicDepthBuffer: true` instead) and therefore want the upstream sort. WebGL renderers obviously want the upstream sort. The override is therefore registered **only** in the WebGPU `viewport` branch.

### Finding 5: Opaque sort is intentionally left untouched

Opaque rendering relies on the depth test for visibility, not on draw order. The opaque sort (`painterSortStable`, `RenderList.js` line 1) is identical to `reversePainterSortStable` except its z subtraction is `a.z - b.z` (front-to-back, an early-Z perf optimisation). Under reversed-Z this becomes back-to-front, which is a perf regression but **not** a correctness regression. The plan deliberately scopes the override to `setTransparentSort` and leaves opaque sort to upstream so we don't introduce surface-area for a future bug while solving a transparent-only problem.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                        | Status     | Priority | Effort  | Impact                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------- | ------------------------------------------------------------------------------------------------- |
| R1  | Add a custom transparent sort module (`reversed-depth-transparent-sort.ts`) and register it on the WebGPU `viewport` renderer in `renderer.ts`.                                                                                                               | **Landed** | P0       | Trivial | Fixes every `transparent + depthTest:false` overdraw on the viewport without touching call sites. |
| R2  | Co-locate Vitest unit tests for the sort function and a renderer-factory test that asserts the sort is registered only for WebGPU `viewport`.                                                                                                                 | **Landed** | P1       | Low     | Locks the regression guard against future renderer-factory refactors and `three` upgrades.        |
| R3  | File a three.js issue / PR proposing a reversed-Z-aware default transparent sort (or a `Renderer.coordinateSystem` / `Renderer._reversedDepth`-keyed variant). The current default's "larger = farther" assumption silently breaks every reversed-Z consumer. | Pending    | P2       | Medium  | Removes the workaround long-term for every downstream consumer.                                   |
| R4  | Once R3 lands upstream and we bump `three` past that release, delete `reversed-depth-transparent-sort.ts` and the `setTransparentSort(...)` registration. The unit + renderer factory tests can move to a regression-only "post-upstream-fix" comment.        | Pending    | P3       | Trivial | Tracks the workaround's expiry.                                                                   |

### R1 — Surgical fix (landed): custom transparent sort on WebGPU `viewport`

The new module ([`apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts`](../../apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts)) exports a single function:

```typescript
export function reversedDepthTransparentSort(a: TransparentSortItem, b: TransparentSortItem): number {
  if (a.groupOrder !== b.groupOrder) return (a.groupOrder ?? 0) - (b.groupOrder ?? 0);
  if (a.renderOrder !== b.renderOrder) return (a.renderOrder ?? 0) - (b.renderOrder ?? 0);
  if (a.z !== b.z) return (a.z ?? 0) - (b.z ?? 0);
  return (a.id ?? 0) - (b.id ?? 0);
}
```

Differences vs upstream `reversePainterSortStable`:

- Z subtraction is `a.z - b.z` (inverted). Closer items (larger clip-z under reversed-Z) sort AFTER farther items, so the rasterizer draws them last.
- `?? 0` coercion preserves upstream's implicit JS null arithmetic (`null - null = 0`, `null - 5 = -5`) under `RenderItem`'s nullable typings (`number | null`).
- `groupOrder`, `renderOrder`, `id` tie-breaks are byte-identical to upstream.

Registration ([`apps/ui/app/components/geometry/graphics/three/renderer.ts`](../../apps/ui/app/components/geometry/graphics/three/renderer.ts)):

```typescript
const renderer = new ThreeWebGPURenderer(options);
await initWebGpuIfNeeded(renderer);

if (useCase === 'viewport') {
  renderer.setTransparentSort(reversedDepthTransparentSort);
}

return renderer;
```

Scope: applies only to the WebGPU `viewport` branch. WebGL renderers and the WebGPU `offscreen` / `screenshot` renderers receive no override and continue to use the upstream sort.

### R2 — Regression tests (landed)

- [`reversed-depth-transparent-sort.test.ts`](../../apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.test.ts) — pure-function tests covering `groupOrder` precedence, `renderOrder` precedence, z-order under reversed-Z (closer = larger clip-z renders LAST), id tie-break, field precedence, null coercion, and an end-to-end section-view label scenario regression guard.
- [`renderer.test.ts`](../../apps/ui/app/components/geometry/graphics/three/renderer.test.ts) — renderer-factory tests stub `WebGPURenderer` / `WebGLRenderer` and assert `setTransparentSort` is called exactly once with `reversedDepthTransparentSort` for `(viewport, webgpu)` and **never** for `(offscreen, webgpu)`, `(screenshot, webgpu)`, `(viewport, webgl)`, `(offscreen, webgl)`, `(screenshot, webgl)`.

The unit test does not need a GPU device or jsdom; the factory test runs in jsdom with the same WebGPU mocking style as `post-processing-webgpu.test.tsx`.

### R3 — Upstream framework fix

Two viable upstream shapes:

- **Coordinate-system-keyed default.** `RenderList.sort(...)` reads `renderer._reversedDepth` (already available on the `Renderer` instance) and selects between `painterSortStable` / `reversePainterSortStable` and reversed-Z variants automatically.
- **Generic `compareDepth(a, b, renderer)` helper.** Hide the sign inside a single helper that all built-in comparators consult, so future depth-encoding additions (logarithmic, custom-near/far, etc.) only need to touch one place.

Either shape ships with a regression test on a `reversedDepthBuffer: true` renderer that asserts back-to-front order under transparent sort.

### R4 — Long-term cleanup

Once the upstream fix lands and we bump `three` past that release, delete `reversed-depth-transparent-sort.ts`, remove the `setTransparentSort(...)` registration in `renderer.ts`, and reduce the renderer-factory test to a single check that no custom transparent sort is registered (the upstream default is now correct). Cross-link the deletion commit to the upstream PR.

## Trade-offs

| Option                                                                          | Pros                                                                                                                                                                                                                                                                                        | Cons                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1: custom `setTransparentSort` on the WebGPU `viewport` factory** _(landed)_ | One line in the renderer factory + one tiny pure-function module; covers every transparent overlay; survives `three` upgrades transparently; no per-call-site mitigations; opaque sort untouched (no perf surface area changes); WebGL and non-viewport WebGPU paths bit-for-bit unchanged. | We own the override and a small JSDoc rationale until the upstream fix lands.                                                                                                |
| Patch `SectionViewControls` to disable depth-test only for the forward selector | Localised to the visible UI bug                                                                                                                                                                                                                                                             | Doesn't generalise — the next transparent overlay (HUD, gizmo, sticker) regresses identically; introduces UI-level branching on the active backend; misses future use cases. |
| Insert a `SceneOverlay` portal for selectors                                    | Architecturally clean for some overlay UIs                                                                                                                                                                                                                                                  | Section-view selectors must remain inside the scene's projection / camera frame to align with face normals; portaling them out misaligns positions.                          |
| Eliminate the back-to-back forward / inverse selector pair                      | Removes the overlap entirely                                                                                                                                                                                                                                                                | Loses the visual "card flip" affordance the pair pattern provides; doesn't fix any other transparent overlay.                                                                |
| Patch `three` locally via `pnpm patch`                                          | Single source of truth across the codebase                                                                                                                                                                                                                                                  | Maintenance cost on every `three` upgrade; the override approach is strictly cheaper because the override itself is ~10 lines.                                               |
| Override opaque sort too                                                        | Marginal early-Z perf parity with WebGL                                                                                                                                                                                                                                                     | No correctness benefit; expands the override surface area; risks a future regression chasing perf.                                                                           |

## Code Examples

### Algebraic verification of the inversion (Finding 2 in concrete numbers)

For `near = 0.1, far = 100`, evaluate `clipZ` at the near plane (`z = 0.1`, closest), at `z = 50` (mid), and at the far plane (`z = 100`, farthest):

```text
viewZ = -z   (z is the positive distance from camera in view space)

WebGPU forward (reversedDepth = false):
  c = -100 / (100 - 0.1) ≈ -1.001
  d = -(100 · 0.1) / (100 - 0.1) ≈ -0.1001
  clipZ(z) = c · (-z) + d
    z = 0.1   → clipZ ≈   0.0      (closest)
    z = 50    → clipZ ≈  49.95
    z = 100   → clipZ ≈ 100.0      (farthest)
  ⇒ clipZ INCREASES with distance ⇒ "larger clip-z = farther" ✓

WebGPU reversed (reversedDepth = true):
  c =  0.1 / (100 - 0.1) ≈  0.001001
  d = (100 · 0.1) / (100 - 0.1) ≈ 0.1001
  clipZ(z) = c · (-z) + d
    z = 0.1   → clipZ ≈ 0.1        (closest)
    z = 50    → clipZ ≈ 0.0500
    z = 100   → clipZ ≈ 0.0        (farthest)
  ⇒ clipZ DECREASES with distance ⇒ "larger clip-z = closer" ✗ (inverted)
```

`reversePainterSortStable`'s `b.z - a.z` correctly puts the farther item FIRST under the forward branch (where `clipZ` increases with distance). Under the reversed branch, the same comparator puts the **closer** item FIRST, so the rasterizer ends up drawing back-to-front-by-clip-z but front-to-back-by-actual-distance.

### Section-view selector pair under each backend (Finding 3)

```text
Forward "Top" position: (0, 0, baseOffset)
Inverse "Bottom" position: (0, 0, baseOffset - labelDepth*scale)   // labelDepth*scale ≈ 0.02*scale
Camera at (0, 0, baseOffset + 5)

           ┌─ Forward "Top": viewZ = -5, clipZ_forward ≈ small, clipZ_reversed ≈ LARGE
           │
           ├─ Inverse "Bottom": viewZ = -(5 + 0.02*scale), clipZ_forward ≈ LARGE, clipZ_reversed ≈ small
           │
   Camera ─┘

WebGL / WebGPU forward:
  reversePainterSortStable: inverse FIRST (large clipZ), forward LAST (small clipZ)
  → forward "Top" overdraws inverse "Bottom" → "Top" with original glyphs visible ✓

WebGPU reversed (current bug):
  reversePainterSortStable: forward FIRST (large clipZ), inverse LAST (small clipZ)
  → inverse "Bottom" overdraws forward "Top" → "Bottom" with mirrored glyphs visible ✗

WebGPU reversed (after R1):
  reversedDepthTransparentSort: forward LAST (large clipZ), inverse FIRST (small clipZ)
  → forward "Top" overdraws inverse "Bottom" → "Top" with original glyphs visible ✓
```

### Override is scoped to the WebGPU `viewport` branch only

```typescript
// apps/ui/app/components/geometry/graphics/three/renderer.ts
if (backend === 'webgpu') {
  // ... options assembly with `reversedDepthBuffer: true` only when useCase === 'viewport' ...

  const renderer = new ThreeWebGPURenderer(options);
  await initWebGpuIfNeeded(renderer);

  if (useCase === 'viewport') {
    renderer.setTransparentSort(reversedDepthTransparentSort);
  }

  return renderer;
}

// WebGL branch and non-viewport WebGPU branches: untouched, upstream default sort.
```

## Diagrams

```text
Default upstream (correct under forward depth)
──────────────────────────────────────────────
  RenderList.transparent[]
       │
       ▼
  reversePainterSortStable: b.z - a.z
       │
       ├── assumption: larger clip-z = farther
       ▼
  back-to-front order  ✓ (alpha + depthTest:false correctness)


Default upstream (broken under reversed-Z)
──────────────────────────────────────────────
  RenderList.transparent[]
       │
       ▼
  reversePainterSortStable: b.z - a.z
       │
       ├── assumption violated: larger clip-z = closer
       ▼
  front-to-back order  ✗ (closer overdrawn by farther)


After R1 (registered on WebGPU viewport only)
──────────────────────────────────────────────
  WebGPURenderer (viewport, reversedDepthBuffer: true)
       │
       ├── renderer.setTransparentSort(reversedDepthTransparentSort)
       ▼
  RenderList.transparent[]
       │
       ▼
  reversedDepthTransparentSort: a.z - b.z
       │
       ├── reversed-Z aware: smaller clip-z = farther
       ▼
  back-to-front order  ✓
```

## References

- Three.js source files referenced inline:
  - `node_modules/three/src/renderers/common/RenderList.js` — `painterSortStable`, `reversePainterSortStable`.
  - `node_modules/three/src/renderers/common/Renderer.js` — `setTransparentSort` registration; `_projScreenMatrix.multiplyMatrices(...)` and `_vector4.z` push to render list.
  - `node_modules/three/src/math/Matrix4.js` — `makePerspective(..., reversedDepth = false)` row-3 coefficient branching.
  - `node_modules/@types/three/src/renderers/common/RenderList.d.ts` — `RenderItem` typings (`groupOrder | renderOrder | z | id` all `number | null`).
- Tau call sites:
  - [`apps/ui/app/components/geometry/graphics/three/renderer.ts`](../../apps/ui/app/components/geometry/graphics/three/renderer.ts) — registration site.
  - [`apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts`](../../apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts) — sort function.
  - [`apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx`](../../apps/ui/app/components/geometry/graphics/three/react/section-view-controls.tsx) — visible bug surface (forward / inverse selector pair).
  - [`apps/ui/app/components/geometry/graphics/three/tau-renderer.ts`](../../apps/ui/app/components/geometry/graphics/three/tau-renderer.ts) — `reversedDepthBuffer: true` rationale (line / GTAO depth pipeline).
- Related Tau research:
  - `docs/research/webgpu-fat-line-hardware-clipping-bug.md` — sibling section-view investigation; demonstrates that section view exposes several distinct WebGPU edge cases.
  - `docs/research/webgpu-section-view-clipping-architecture.md` — establishes the `<SectionClippingGroup>` backend abstraction.
  - `docs/research/webgpu-line2-reversed-z-trim.md` — depth-bias adaptation between WebGL `<logdepthbuf_*>` chunks and WebGPU reversed-Z encoding.
- Related Tau policy:
  - `docs/policy/graphics-backend-policy.md` — frameloop, MSAA, reversed-Z stance for the CAD viewport.
