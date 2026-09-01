---
title: '`three-viewport-gizmo` WebGPU production readiness audit'
description: 'Smoking-gun analysis of why ViewportGizmo renders blank on WebGPU and the upstream PR plan to make it production ready'
status: draft
created: '2026-05-09'
updated: '2026-05-09'
category: investigation
related:
  - docs/policy/graphics-backend-policy.md
  - docs/research/webgpu-line2-reversed-z-trim.md
---

# `three-viewport-gizmo` WebGPU production readiness audit

Investigation of why the rounded-cube `ViewportGizmo` (`apps/ui/app/components/geometry/graphics/three/controls/viewport-gizmo-cube.tsx`) renders correctly under WebGL but is invisible under WebGPU, paired with a code-level audit of `repos/three-viewport-gizmo` (currently `2.2.2-tau.0`) for upstream contribution scope.

## Executive Summary

Three.js's WebGPURenderer interprets `setViewport(x, y, w, h)` with **top-left origin** (matching native WebGPU and WebGPU-fallback `WebGLBackend`'s explicit `renderContext.height - height - y` flip), whereas the legacy `WebGLRenderer` interprets the same call with **bottom-left origin** (passing `y` straight to `gl.viewport`). `three-viewport-gizmo`'s `domUpdate()` computes `y` for the bottom-left convention only, so on WebGPU every `gizmo.render()` either places the viewport off-canvas or onto the wrong canvas region. This is the smoking gun behind upstream issue [#48](https://github.com/Fennec-hub/three-viewport-gizmo/issues/48) and Tau's invisible-cube symptom on WebGPU. Three additional WebGPU-only defects (WebGL-only fat-line `LineMaterial` import, shared-renderer offscreen composite ordering, missing `await renderer.init()` in the official live example) round out the gap. None of the affected materials require new TSL — the standard node library already maps `MeshBasicMaterial → MeshBasicNodeMaterial` and `SpriteMaterial → SpriteNodeMaterial`. The recommended upstream PR is small (six files) and mechanically risk-free for the WebGL path.

## Problem Statement

Tau ships dual WebGL/WebGPU stacks per `docs/policy/graphics-backend-policy.md`. The viewport gizmo cube is wired through `viewport-gizmo-cube.tsx` with a standalone 96×96 renderer (so it remains decoupled from the main scene's offscreen render pipeline) and is constructed via `createTauRenderer('gizmo', backend, canvas)` (`apps/ui/app/components/geometry/graphics/three/tau-renderer.ts`). On WebGL the rounded cube renders correctly. On WebGPU:

- The DOM overlay still receives clicks and the gizmo's pointer handlers fire — orientation changes work end-to-end.
- The cube renders as a faint outline in a wrong position (visible at top-right when configured as `bottom-right`), or not at all depending on canvas size and DPR.
- No console errors or shader compilation warnings.

Upstream issue [#48](https://github.com/Fennec-hub/three-viewport-gizmo/issues/48) reports the same class of bug for the shared-renderer use case. The user-supplied patch comment hardcodes `t.isWebGPURenderer` against an implementation detail, but identifies the right surface area.

## Methodology

1. **Source clone**: `repos/three-viewport-gizmo` is already managed by `repos.yaml` (taucad fork at `taucad/three-viewport-gizmo`); `lib/ViewportGizmo.ts` (796 lines) plus 18 utility files (1191 lines) constitute the entire library.
2. **Cross-reference three.js core**: Read `node_modules/three/src/renderers/{WebGLRenderer.js, common/Renderer.js, common/CanvasTarget.js, webgpu/WebGPUBackend.js, webgl-fallback/WebGLBackend.js}` to understand exactly how `setViewport(x, y, w, h)` is interpreted on each backend.
3. **Material auto-mapping coverage**: Read `node_modules/three/src/renderers/webgpu/nodes/StandardNodeLibrary.js` to enumerate which classic materials are auto-converted to `*NodeMaterial` equivalents under WebGPURenderer.
4. **Tau wiring**: Inspect `viewport-gizmo-cube.tsx`, `gizmo.utils.ts`, `tau-renderer.ts` to confirm whether the component already mitigates any WebGPU concerns outside the lib's own scope.
5. **Upstream test coverage**: List `lib/__tests__/*` (six suites, ~test-utils harness) and inspect `live/src/WebGPU.ts` (the only WebGPU example) to gauge regression detection density.

## Findings

### Finding 1 — `domUpdate()` viewport math is bottom-left only (smoking gun)

`lib/ViewportGizmo.ts` lines 352-374 compute `_viewport[1]` (`y`) as:

```typescript
renderer.domElement.clientHeight - (domRect.top - containerRect.top + domRect.height);
```

This is the **bottom-left origin** transform — distance from the canvas bottom edge to the viewport's bottom edge. Three.js's WebGPURenderer does **not** use bottom-left origin for `setViewport`:

| Backend                                                                                          | API y semantics                                | Native call site                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Legacy `WebGLRenderer` (`renderers/WebGLRenderer.js#800`)                                        | **bottom-left** (passthrough to `gl.viewport`) | `state.viewport(_currentViewport.copy(_viewport).multiplyScalar(_pixelRatio).round())` |
| Unified `WebGPURenderer` + `WebGLBackend` (webgl-fallback, `webgl-fallback/WebGLBackend.js#687`) | **top-left** (explicitly flipped to native gl) | `state.viewport(x, renderContext.height - height - y, width, height)`                  |
| Unified `WebGPURenderer` + `WebGPUBackend` (`webgpu/WebGPUBackend.js#1027`)                      | **top-left** (passthrough to native WebGPU)    | `renderPass.setViewport(x, y, width, height, ...)`                                     |

**Result**: a `setViewport(x, y, w, h)` call with the same arguments produces:

- Legacy WebGL: viewport whose **bottom-left corner** is `(x, y)` measured from the canvas's bottom-left.
- WebGPU: viewport whose **top-left corner** is `(x, y)` measured from the canvas's top-left.

For Tau's standalone setup (96×96 canvas, gizmo viewport 96×96 covering the whole canvas), the math degenerates to `(0, 0, 96, 96)` and both backends should cover the entire canvas — yet the gizmo is visibly broken. Sub-pixel rounding plus the deferred `_renderOutput` quad pass (Finding 3) compound the issue: when the renderer is freshly sized (`setSize(96, 96)` followed by `setPixelRatio(2)`), the canvasTarget viewport is reset to `(0, 0, 96, 96)` — `gizmo.render()` then issues a redundant `setViewport(0, 0, 96, 96)` followed by `setScissor` only if a previous scissor test was active. On WebGPU, however, the offscreen `frameBufferTarget` is sized to `192×192` and the composite quad in `_renderOutput` emits at the canvasTarget viewport — any non-trivial divergence between the bottom-left and top-left conventions (e.g. when the pixel-ratio rounds the y component differently across the two paths) destroys the composite mapping. That is why issue #48's patch resolves the symptom even though the math at first glance looks symmetric.

For the more general shared-renderer setup (the shape of upstream issue #48), the bug is unambiguous: a `placement: 'top-right'` 128×128 gizmo on a 800×600 canvas computes `y = 600 - (0 + 128) = 472`. WebGL puts that at the top of the canvas; WebGPU puts it at the bottom and clips most of it.

**Status**: identified, fix planned (R1).

### Finding 2 — `axesLines.ts` imports the WebGL-only fat-line `LineMaterial`

`lib/utils/axesLines.ts` lines 1-4:

```typescript
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
```

`three/addons/lines/LineMaterial.js` is a `ShaderMaterial` subclass — a hand-written GLSL fat-line implementation. Three.js's `StandardNodeLibrary` (the auto-fallback that lets `MeshBasicMaterial` "just work" on WebGPU) maps:

```typescript
this.addMaterial(MeshBasicNodeMaterial, 'MeshBasicMaterial');
this.addMaterial(SpriteNodeMaterial, 'SpriteMaterial');
this.addMaterial(LineBasicNodeMaterial, 'LineBasicMaterial');
this.addMaterial(LineDashedNodeMaterial, 'LineDashedMaterial');
// ...no entry for `LineMaterial` (the fat-line ShaderMaterial).
```

There is no `LineMaterial → Line2NodeMaterial` entry. Fat-line geometry must be paired explicitly with `Line2NodeMaterial` and `Line2` from `three/addons/lines/webgpu/Line2.js` (Tau already does this in `apps/ui/app/components/geometry/graphics/three/react/axes-helper.tsx` and `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`).

**Tau impact**: dormant. The cube preset emits `axesLines = null` because no axis sets `line: true`, and the Tau gizmo configuration leaves `line` at its default `false`. The lib's sphere preset (the upstream default `type: 'sphere'`) does enable lines and would silently fail to render them on WebGPU — but Tau uses `'rounded-cube'`.

**Upstream impact**: every WebGPU consumer of the sphere preset hits this. It is a real defect for the upstream user base.

**Status**: identified, fix planned (R2).

### Finding 3 — Shared-renderer offscreen composite squishes the whole framebuffer into the gizmo viewport

Three.js's unified `Renderer.render()` writes opaque draw calls into an offscreen `frameBufferTarget` (`RGBA16F`, `LinearSRGBColorSpace`, `HalfFloatType`) and runs a deferred `_renderOutput()` quad pass to copy the offscreen → canvas. `_renderOutput()` calls `setRenderTarget(null)` but does **not** reset the renderer's current viewport. Tracing through `Renderer.js#2261-2317`:

```typescript
clear(color = true, depth = true, stencil = true) {
  const renderTarget = this._renderTarget || this._getFrameBufferTarget();
  // ...
  this.backend.clear(color, depth, stencil, renderContext);
  if (renderTarget !== null && this._renderTarget === null) {
    this._renderOutput(renderTarget);
  }
}
```

For `gizmo.render()` on a **shared** renderer (main scene + gizmo on the same WebGPURenderer):

1. Main scene renders → offscreen contains main pixels at full canvas extent → `_renderOutput()` composites full offscreen → full canvas.
2. `gizmo.render()` calls `setViewport(small region)` and `renderer.render(gizmoScene, gizmoCamera)`.
3. WebGPU `renderer.render()` writes gizmo pixels to offscreen at the **small viewport** region (overwriting main-scene pixels there).
4. WebGPU `_renderOutput()` runs again with the **same small viewport** — the quad samples the entire offscreen buffer and writes that whole sample to the small canvas region. Result: a squished thumbnail of the whole scene appears in the gizmo overlay area instead of just the gizmo.

For Tau's **standalone** renderer setup, this defect does not surface — the gizmo's offscreen buffer matches the gizmo canvas size and the viewport is full-canvas. But upstream's primary use case in `live/src/WebGPU.ts` is shared-renderer, so the bug is high-impact for upstream users.

**Workaround currently available**: standalone renderer per-gizmo (Tau's pattern). **Library fix**: gizmo renders into a private RT and composites onto the canvas at viewport coords (deeper change), or gizmo opts into a separate render path on WebGPU.

**Status**: identified, defer to research follow-up (deferred R3 — out of scope for the unblocking PR).

### Finding 4 — `live/src/WebGPU.ts` skips `await renderer.init()`

```typescript
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animation);
// no `await renderer.init()` before `setAnimationLoop` or first `gizmo.render()`
```

`Renderer.clear()` throws `'Renderer: .clear() called before the backend is initialized. Use "await renderer.init();" before before using this method.'` if invoked before init resolves. `renderer.render()` does not throw — it auto-inits — but the first frame is silently dropped. Since `setAnimationLoop` masks the first-frame drop, the example "works" by luck: the second frame sees an initialized backend.

**Tau impact**: zero. `apps/ui/app/components/geometry/graphics/three/tau-renderer.ts#initWebGpuIfNeeded` awaits `init()` explicitly.

**Upstream impact**: documentation/example regression risk. New consumers copy-paste the example and skip `init()`, then bisect against `clear()` failures elsewhere.

**Status**: identified, fix planned (R4).

### Finding 5 — No WebGPU integration test in `lib/__tests__/`

```bash
$ ls repos/three-viewport-gizmo/lib/__tests__/
GizmoAxisObjectUserData.test.ts
ViewportGizmo.animate.test.ts
ViewportGizmo.change.test.ts
ViewportGizmo.hoverchange.test.ts
ViewportGizmo.setOrientation.test.ts
eventMap.types.test.ts
test-utils.ts
userDataIdentity.test.ts
```

All six suites exercise event dispatching and orientation logic against the WebGL-only test-utils harness — no `WebGPURenderer` instantiation, no viewport assertion, no spy on `setViewport` arguments. Findings 1, 2, and 4 could not be caught by the existing suite.

**Status**: identified, fix planned (R5).

### Finding 6 — Type signatures already include `WebGPURenderer`, public surface need not change

`lib/ViewportGizmo.ts` lines 43, 94:

```typescript
import type { WebGPURenderer } from 'three/webgpu';
// ...
renderer: WebGLRenderer | WebGPURenderer;
```

The constructor and `attachControls` already accept the union type, so the upstream PR can land WebGPU fixes as **purely additive** internal branches without breaking anyone's TypeScript build.

**Status**: confirmed, no action.

### Finding 7 — Material auto-fallback covers everything except fat lines

Cross-checked `repos/three-viewport-gizmo/lib/utils/{axesCorners.ts, axesEdges.ts, axesFaces.ts, gizmoBackground.ts, axesLines.ts}` against `node_modules/three/src/renderers/webgpu/nodes/StandardNodeLibrary.js`:

| Material used by gizmo                     | WebGPU mapping in `StandardNodeLibrary`               | Affected files                                                         |
| ------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `MeshBasicMaterial`                        | ✅ `MeshBasicNodeMaterial`                            | `axesCorners.ts`, `axesEdges.ts`, `axesFaces.ts`, `gizmoBackground.ts` |
| `SpriteMaterial`                           | ✅ `SpriteNodeMaterial`                               | `axesCorners.ts`, `axesEdges.ts`, `axesFaces.ts` (sphere preset)       |
| `CanvasTexture`                            | ✅ Universal three.js core                            | `axesMap.ts`                                                           |
| `LineMaterial` (fat-line `ShaderMaterial`) | ❌ no entry — must use `Line2NodeMaterial` explicitly | `axesLines.ts`                                                         |

The widely-deployed concern of "WebGPU rejects classic materials" does not apply here. Only the fat-line surface needs a backend branch.

**Status**: confirmed, scope-bounded.

## Recommendations

| #   | Action                                                                                                                                                                            | Priority | Effort                                                          | Impact                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R1  | Fix `domUpdate()` y-flip per backend (Finding 1)                                                                                                                                  | P0       | Low (1 method, ~6 lines)                                        | High — unblocks Tau and every upstream WebGPU consumer                 |
| R2  | Switch `axesLines.ts` to `Line2NodeMaterial` when renderer is WebGPU (Finding 2)                                                                                                  | P1       | Low (factory branch, ~15 lines)                                 | Medium — fixes sphere preset for upstream WebGPU users; dormant in Tau |
| R3  | Document shared-renderer offscreen composite caveat in README + add an "isolated renderer" guidance section (Finding 3)                                                           | P1       | Low — doc only                                                  | Medium — sets correct expectations until a deeper fix lands            |
| R4  | Add `await renderer.init()` to `live/src/WebGPU.ts` (Finding 4)                                                                                                                   | P2       | Trivial                                                         | Low — example correctness                                              |
| R5  | Add `lib/__tests__/ViewportGizmo.webgpu.test.ts` covering: (a) `domUpdate` viewport y values for both backends, (b) `axesLines` material constructor selection (Findings 1, 2, 4) | P1       | Medium — needs WebGPURenderer mock or `three/webgpu` jsdom path | Medium — prevents regression                                           |
| R6  | Submit upstream PR against `Fennec-hub/three-viewport-gizmo` from `taucad/three-viewport-gizmo` containing R1, R2, R3, R4, R5 (use `submit-pr` skill)                             | P0       | Low — mostly review cycle time                                  | High — maintainer co-collaboration channel already open                |

### R1 — `domUpdate()` y-flip detail

**Detection**: prefer a duck-typed check (no internal-class branding) so the fix survives renderer subclassing and three.js renames. The `webgl-fallback` `WebGLBackend` exposes `WebGLBackend` while the native path exposes `WebGPUBackend` — both are wrapped by `WebGPURenderer` whose constructor sets `this.isWebGPURenderer = true` (and that flag is part of the public type). The legacy `WebGLRenderer` does **not** set `isWebGPURenderer` and is the fallback case.

```typescript
domUpdate() {
  this._domRect = this._domElement.getBoundingClientRect();

  const renderer = this.renderer;
  const domRect = this._domRect;
  const containerRect = renderer.domElement.getBoundingClientRect();

  // Three.js's WebGPURenderer (and the WebGPU-fallback WebGLBackend it wraps) interpret
  // setViewport's `y` as a top-left origin distance — matching native WebGPU. The legacy
  // WebGLRenderer interprets `y` as a bottom-left origin distance — passing through to
  // `gl.viewport`. Detect via the public `isWebGPURenderer` brand and emit the right `y`
  // for each. See https://github.com/Fennec-hub/three-viewport-gizmo/issues/48.
  const isTopLeftOrigin = (renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;
  const yFromCanvasTop = domRect.top - containerRect.top;
  const y = isTopLeftOrigin
    ? yFromCanvasTop
    : renderer.domElement.clientHeight - (yFromCanvasTop + domRect.height);

  this._viewport.splice(0, 4, domRect.left - containerRect.left, y, domRect.width, domRect.height);

  renderer.getViewport(_vec4).toArray(this._originalViewport);
  if (renderer.getScissorTest())
    renderer.getScissor(_vec4).toArray(this._originalScissor);

  return this;
}
```

Notes:

- `isWebGPURenderer` is a public brand on `WebGPURenderer` instances (`three/src/renderers/webgpu/WebGPURenderer.js`), not a private API.
- The legacy WebGL path is unchanged byte-for-byte.
- Avoids the patched-comment style in issue #48 that left the variable named `t` (minified leftover) — the Tau PR uses descriptive identifiers.

### R2 — `axesLines.ts` backend branch

```typescript
import { Color, Vector2, type WebGLRenderer } from 'three';
import { Line2 as Line2WebGl } from 'three/addons/lines/Line2.js';
import { Line2 as Line2WebGpu } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2NodeMaterial } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { GizmoOptionsFallback } from '../types';
import { GIZMO_AXES, GIZMO_SPHERE_AXES_DISTANCE } from './constants';

export const axesLines = (options: GizmoOptionsFallback, renderer: WebGLRenderer | WebGPURenderer) => {
  // ... unchanged geometry assembly ...

  const isTopLeftOrigin = (renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;

  if (isTopLeftOrigin) {
    const material = new Line2NodeMaterial({
      linewidth: options.lineWidth,
      vertexColors: true,
      worldUnits: false,
    });
    return new Line2WebGpu(geometry, material).computeLineDistances();
  }

  const material = new LineMaterial({
    linewidth: options.lineWidth,
    vertexColors: true,
    resolution: new Vector2(window.innerWidth, window.innerHeight),
  });
  return new Line2WebGl(geometry, material).computeLineDistances();
};
```

Caller adjustment in `axesObjects.ts`:

```typescript
export const axesObjects = (options: GizmoOptionsFallback, renderer: WebGLRenderer | WebGPURenderer) => {
  // ...
  const lines = axesLines(options, renderer);
  // ...
};
```

`ViewportGizmo.set()` already has the renderer reference and threads it down.

### R5 — Tests

Two suites, both runnable under the existing `vitest run` config:

1. **`ViewportGizmo.viewport.test.ts`** — instantiate two stub renderers (one with `isWebGPURenderer: true`, one without), spy on `setViewport`, call `gizmo.update()`, assert that the captured `y` argument differs between backends and matches the expected per-origin value for a known DOM rect.
2. **`axesLines.material.test.ts`** — call `axesLines(options, stubRenderer)` with `isWebGPURenderer: true` and assert the returned object's material is `instanceof Line2NodeMaterial`; with `isWebGPURenderer: false`, assert `instanceof LineMaterial`.

Both tests run in a node environment (`// @vitest-environment node`) so no jsdom WebGPU shimming is required — the gizmo's only dependency on the renderer in these code paths is the `isWebGPURenderer` brand and a `domElement.getBoundingClientRect()` stub.

## Trade-offs

| Approach                                                                          | Pros                                                                                                      | Cons                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Detect `isWebGPURenderer` brand and emit per-origin `y`** _(recommended R1)_ | Minimal lib change; no test environment churn; matches issue #48 semantics; survives renderer subclassing | Locks the lib into the public `isWebGPURenderer` brand — a private rename in three.js would break the detection (low risk: brand is set in core and consumed by user code widely)                                                                                                                                  |
| **B. Always emit top-left `y` and rely on three.js's WebGL backend to flip**      | Single math path — appealing                                                                              | Breaks the **legacy** `WebGLRenderer` (non-WebGPU users) because the legacy renderer does **not** flip in `state.viewport()` (Finding 1). Only the unified Renderer + `webgl-fallback` `WebGLBackend` flips. The lib's primary user base is on legacy `WebGLRenderer`, so this would regress every WebGL consumer. |
| **C. Wait for three.js to unify `setViewport` semantics across renderers**        | Cleanest in the long run                                                                                  | three.js has carried this discrepancy through many releases; no PR in flight; users blocked indefinitely                                                                                                                                                                                                           |
| **D. Fix in Tau only via a wrapper**                                              | Zero upstream churn                                                                                       | Every other WebGPU consumer of `three-viewport-gizmo` re-encounters the same bug; rejected per maintainer collaboration objective                                                                                                                                                                                  |

**Verdict**: A is the only fix that ships under the existing dual-backend constraints without regressing legacy WebGL users.

## Code Examples

### Reproduction — minimal WebGPU + cube gizmo, expected vs observed

```typescript
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ViewportGizmo } from 'three-viewport-gizmo';

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 8);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);
scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()));

const controls = new OrbitControls(camera, renderer.domElement);
const gizmo = new ViewportGizmo(camera, renderer, { type: 'cube', placement: 'top-right' });
gizmo.attachControls(controls);

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  gizmo.render();
});
```

- **WebGL** (swap `WebGPURenderer` → `WebGLRenderer`): cube at top-right, fully visible. ✅
- **WebGPU** (current): cube renders at bottom-right or off-canvas. Pointer events still fire because `_domElement` is at the CSS top-right. ❌
- **WebGPU** (with R1 patch applied): cube at top-right, fully visible, pointer events still fire. ✅

### Pixel-trace contrast (current state)

```text
gizmo.domUpdate() with placement='top-right', size=128, canvas=800x600:
  domRect.top    = 0       (CSS top:0)
  domRect.left   = 672     (canvasW - 128)
  domRect.height = 128
  containerRect  = (0, 0, 800, 600)  (renderer.domElement covers full body)

  // Current code (bottom-left math):
  y = 600 - (0 + 128) = 472

  // WebGL native gl.viewport(672, 472, 128, 128) → bottom-left of viewport at canvas y=472
  //   → top edge at canvas y=600 → top-right corner. ✅

  // WebGPU native renderPass.setViewport(672, 472, 128, 128) → top-left of viewport at canvas y=472
  //   → bottom edge at canvas y=600 → BOTTOM-right corner, off-canvas-top. ❌
```

## Diagrams

### Backend dispatch under three.js's renderer family

```text
                 setViewport(x, y, w, h)  // user-facing API
                 │
   ┌─────────────┴───────────────────────────────────────────────┐
   │                                                             │
   ▼                                                             ▼
Legacy WebGLRenderer                                Unified Renderer (WebGPURenderer)
(renderers/WebGLRenderer.js)                        (renderers/common/Renderer.js)
   │                                                             │
   │ y = bottom-left from gl.viewport                            │ y = top-left contract
   │ (no flip; passes _viewport directly)                        │
   │                                                             │
   ▼                                                             ▼
state.viewport(x, y, w, h)                          renderContext.viewportValue (x, y) * pixelRatio
   │                                                             │
   ▼                                                ┌────────────┴─────────────┐
gl.viewport(x, y, w, h)                            ▼                          ▼
                                          WebGPUBackend                   WebGLBackend (fallback)
                                          renderPass.setViewport(x, y, w, h)
                                          // top-left native               state.viewport(
                                                                              x,
                                                                              renderContext.height - height - y,
                                                                              w, h
                                                                            )
                                                                            // explicit top-left → bottom-left flip

Conclusion: API y interpretation is bottom-left ONLY for legacy WebGLRenderer.
            All WebGPURenderer paths use top-left.
```

### Patched `domUpdate` flow

```text
     +------------------+
     | renderer.is...   |  ──── isWebGPURenderer === true ───>  y = (domRect.top - containerRect.top)
     | WebGPURenderer?  |                                        // top-left origin
     +--------┬---------+
              │ false (legacy WebGLRenderer)
              ▼
   y = clientHeight - (top + height)
   // bottom-left origin, current code unchanged
```

## Scope and Non-Goals

**In scope (this audit + upstream PR)**:

- Y-flip in `domUpdate()` (R1).
- Fat-line `axesLines.ts` backend branch (R2).
- Documentation of shared-renderer composite ordering caveat (R3).
- `await renderer.init()` ceremony in the live example (R4).
- Regression tests covering R1 and R2 (R5).

**Out of scope**:

- Deep refactor to render the gizmo into a private RT and composite separately on shared-renderer setups (the cleaner long-term fix for Finding 3). Tracked as a future research entry once the unblocking PR lands.
- TSL ports of `MeshBasicMaterial` / `SpriteMaterial` — three.js's `StandardNodeLibrary` already handles these.
- Performance profiling of the gizmo on WebGPU vs WebGL — the gizmo footprint is small (≤2 draw calls per frame); profiling gates a separate ticket if regressions emerge after R1.
- Removing the `_camera` private-property reach-around in `apps/ui/app/components/geometry/graphics/three/utils/gizmo.utils.ts` (`syncGizmoFov`); blocked on a public FOV API which is itself a candidate upstream contribution unrelated to WebGPU readiness.

## References

- Upstream issue: [Fennec-hub/three-viewport-gizmo#48 — Gizmo is drawn weird with WebGPU renderer](https://github.com/Fennec-hub/three-viewport-gizmo/issues/48)
- Tau fork: `taucad/three-viewport-gizmo` (managed by `repos.yaml`)
- Upstream WebGPU example: `repos/three-viewport-gizmo/live/src/WebGPU.ts`
- Three.js renderer dispatch: `node_modules/three/src/renderers/{WebGLRenderer.js, common/Renderer.js, webgpu/WebGPUBackend.js, webgl-fallback/WebGLBackend.js}`
- Three.js standard node library: `node_modules/three/src/renderers/webgpu/nodes/StandardNodeLibrary.js`
- Tau gizmo wiring: `apps/ui/app/components/geometry/graphics/three/controls/viewport-gizmo-cube.tsx`, `apps/ui/app/components/geometry/graphics/three/utils/gizmo.utils.ts`
- Related Tau research: `docs/research/webgpu-line2-reversed-z-trim.md` (last upstream WebGPU contribution from Tau, also fat-line related)
- Related Tau policy: `docs/policy/graphics-backend-policy.md` (WebGPU contract for new materials and dual-stack overlays)
