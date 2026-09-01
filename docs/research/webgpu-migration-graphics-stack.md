---
title: 'WebGPU Migration for Three.js Graphics Stack'
description: 'Comprehensive audit and migration roadmap for moving the apps/ui Three.js rendering stack from WebGL2 to WebGPU, including custom shaders, post-processing, and three-viewport-gizmo'
status: draft
created: '2026-05-07'
updated: '2026-05-07'
category: migration
related:
  - docs/research/three-viewport-gizmo-fork-blueprint.md
  - docs/policy/ui-policy.md
---

# WebGPU Migration for Three.js Graphics Stack

End-to-end audit of every Three.js touchpoint in `apps/ui` and a phased plan for migrating from `WebGLRenderer` to `WebGPURenderer` without regressing parity (logarithmic depth, stencil-based section caps, fat lines, AO, viewport gizmo, screenshots).

## Executive Summary

The graphics root in `apps/ui/app/components/geometry/graphics/three/three-context.tsx` is the only entry point that needs to flip from the implicit `WebGLRenderer` to a `WebGPURenderer` factory, but the dependencies fan out wider than the file count suggests. Three.js `0.179.1` ships native WebGPU + TSL via `three/webgpu` and `three/tsl`, and `@react-three/fiber` v9 supports an async `gl` factory, so the renderer swap is mechanical. The substantive work is **(1)** converting four custom GLSL `ShaderMaterial`s to TSL/`NodeMaterial`, **(2)** replacing `@react-three/postprocessing` (WebGL-only) with Three.js's native `RenderPipeline` + TSL nodes (`gtao`, `fxaa`), **(3)** retargeting fat-line usage (`LineMaterial` + `onBeforeCompile` for log-depth bias) to `Line2NodeMaterial` with a TSL bias node, **(4)** updating the `three-viewport-gizmo` fork's internal renderer factory (its public types already accept `WebGPURenderer`), and **(5)** rewriting the `WebGLRenderer`-coupled paths in `screenshot-capability.machine.ts` and `shared-renderer.tsx` for the async WebGPU command queue.

Recommendation: stage the migration behind a `graphicsBackend: 'webgl' | 'webgpu'` setting on the graphics machine, ship WebGL as the default for one release while WebGPU bakes behind a flag, then flip the default once the gizmo fork and TSL post-processing reach parity.

## Problem Statement

WebGPU offers concrete wins for this workload — multi-queue command submission, compute shaders for downstream geometry post-processing (e.g. spatial vertex welding, normal smoothing), better Apple Silicon performance, and a path off the WebGL2 deprecation curve — but the codebase has accumulated WebGL-specific assumptions:

- Four `THREE.ShaderMaterial` instances written in raw GLSL
- One `LineMaterial.onBeforeCompile` patch that injects a custom GLSL chunk for FOV-adaptive log-depth bias
- A post-processing pipeline (`@react-three/postprocessing` + `N8AO`) that is WebGL-only
- A custom shared off-screen renderer (`shared-renderer.tsx`) and a screenshot machine that both directly instantiate `THREE.WebGLRenderer`
- A viewport gizmo (`three-viewport-gizmo`) that internally `new WebGLRenderer({...})`s even though its outward types accept `WebGPURenderer`
- A `webglcontextlost` event handler in `three-context.tsx` that has no WebGPU analogue (WebGPU surfaces device loss via `device.lost` Promise instead)

Without an explicit migration plan these assumptions will block any WebGPU experiment past the first `Canvas` render.

## Methodology

- Inventoried every `from 'three'`, `from 'three/addons/...'`, and `@react-three/*` import under `apps/ui/app/`
- Read every custom shader file end-to-end (vertex + fragment) and noted GLSL features that don't trivially map to WGSL/TSL (`gl_PointSize`, `fwidth`, `dFdx`/`dFdy`, varying interpolation qualifiers)
- Cross-referenced Three.js `examples/jsm/tsl/display/*` and `webgpu/*` modules in `node_modules/three/` to confirm available TSL replacements
- Read `node_modules/three-viewport-gizmo/dist/three-viewport-gizmo.d.ts` to confirm public type surface accepts `WebGPURenderer`
- Re-read `docs/research/three-viewport-gizmo-fork-blueprint.md` for fork context and pending defects to bundle with the WebGPU work
- Verified `three@0.179.1` `package.json` exports `./webgpu` and `./tsl` subpath conditions

## Findings

### Finding 1: Renderer Boundary Is Single-File but Implicit

`three-context.tsx` does not instantiate a renderer directly — it relies on `@react-three/fiber`'s default `WebGLRenderer` selection driven by the `gl` prop. R3F v9 supports a callback form of `gl` that can return a `WebGPURenderer` (or a Promise of one), and exposes `frameloop="never"` semantics that compose with `renderer.renderAsync()`.

The relevant config:

- `gl={{ logarithmicDepthBuffer: true, antialias: true, stencil: true }}`
- A `useEffect` that listens for `webglcontextlost` on `gl.domElement`

WebGPU equivalents:

| WebGL knob               | WebGPU mapping                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logarithmicDepthBuffer` | Supported in `WebGPURenderer` when material/node graph reads `cameraLogDepth` (TSL has `logarithmicDepthToViewZ`). Verify each `NodeMaterial` enables it; default node graph respects renderer flag like WebGL. |
| `antialias`              | Identical flag; backed by `GPUTextureDescriptor.sampleCount = 4`. No code change required.                                                                                                                      |
| `stencil`                | Supported; `WebGPURenderer` allocates a depth-stencil attachment when `stencil: true`. Material `stencilWrite`/`stencilFunc`/`stencilRef` semantics carry over (used by striped section caps).                  |
| `webglcontextlost`       | No equivalent event. Subscribe to `renderer.backend.device.lost: Promise<GPUDeviceLostInfo>` once the device is created (or via `renderer.lostContext` callback if added).                                      |

### Finding 2: Custom GLSL Shaders Requiring TSL Migration

Four files contain handwritten GLSL bound to `THREE.ShaderMaterial`. Each must be rewritten as a TSL-built `NodeMaterial` (or `MeshBasicNodeMaterial` subclass) for WebGPU.

| #   | File                                                                                 | Material kind                      | GLSL features used                                                                                           | TSL migration sketch                                                                                                               |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `apps/ui/app/components/geometry/graphics/three/materials/striped-material.ts`       | `ShaderMaterial`                   | uniforms (`uColor`, `uStripeColor`, `uStripeWidth`), `gl_FragCoord`, `discard`, `logdepthbuf` chunk includes | `MeshBasicNodeMaterial` with `colorNode = mix(color, stripe, screenCoord.x.mod(width).step(width.div(2)))`; stencil props verbatim |
| S2  | `apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.ts` | `ShaderMaterial`                   | `fwidth`, `dFdx`/`dFdy`, screen-space derivatives, `logdepthbuf` chunk                                       | TSL `fwidth(uv)` node available since r166; rebuild with `Fn(...)` and `screenUV`. Validate derivative quality at oblique angles   |
| S3  | `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts`             | `LineMaterial` + `onBeforeCompile` | Custom log-depth bias chunk injected before `gl_Position`; FOV-adaptive offset via uniform                   | Switch to `Line2NodeMaterial`; reimplement bias as `positionGeometry.add(viewDirection.mul(biasNode))` in `vertexNode`             |
| S4  | `apps/ui/app/routes/auth.$/splashback/morphing-points-material.ts`                   | `ShaderMaterial` (Points)          | `gl_PointSize`, attribute morph targets, time uniform, additive blending                                     | `PointsNodeMaterial` with `positionNode` morph blend and `sizeNode = pointSizeFn(time, attribute('aMorph'))`                       |

Notes:

- TSL has stable equivalents for every node listed above as of `three@0.179.1`. No experimental forks required.
- `logdepthbuf` chunk includes (S1, S2) become a no-op once converted because `NodeMaterial` consumes the renderer's log-depth flag through the standard view-space pipeline.
- S2's `fwidth` is the highest risk — WebGPU/WGSL `dpdx`/`dpdy` use the exact same pixel-quad model as GLSL, so behavior is portable, but anti-aliased grid line width may need a small per-fragment recalibration; bake a screenshot-diff test before/after.
- S3's bias node must keep the existing FOV-adaptive coefficient (`tan(fov/2)`-derived) — the smoking-gun gltf-edge z-fighting fix; do not "simplify" during port.

### Finding 3: Post-Processing Pipeline Is WebGL-Only

`apps/ui/app/components/geometry/graphics/three/post-processing.tsx` uses `@react-three/postprocessing`'s `EffectComposer` with `N8AO`. Both depend on `pmndrs/postprocessing`, which targets `WebGLRenderer` and has no WebGPU adapter.

Replacement options under `three/webgpu` + `three/tsl`:

| Effect      | TSL replacement                                                                                      | Notes                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| N8AO (SSAO) | `gtao()` from `three/examples/jsm/tsl/display/GTAONode.js`                                           | GTAO is Three.js's official AO node; visually similar to N8AO at default settings. The community `n8ao-webgpu` TSL port exists but is unofficial. |
| Antialias   | `fxaa()` from `three/examples/jsm/tsl/display/FXAANode.js` if MSAA `antialias: true` is insufficient | MSAA 4x via `antialias` flag is usually enough; FXAA only needed if mixing with deferred-style passes                                             |

The render pipeline becomes:

```ts
// inside useEffect when renderer is WebGPURenderer
import { pass } from 'three/tsl';
import { gtao } from 'three/examples/jsm/tsl/display/GTAONode.js';

const scenePass = pass(scene, camera);
const aoNode = gtao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
const composed = scenePass.add(aoNode.mul(scenePass));
renderer.outputNode = composed;
```

The current `distanceFalloff: 0` workaround for log-depth + N8AO depth reconstruction is no longer needed because GTAO consumes the depth texture from the same pass that emitted it (no manual viewZ reconstruction).

### Finding 4: Fat Lines and `LineMaterial`

`gltf-edges.ts` (model edges) and `three-viewport-gizmo`'s axis renderer both use the `LineMaterial`/`LineSegments2`/`Line2` family from `three/addons/lines/`. Three.js ships node-material variants under `three/addons/lines/webgpu/`:

- `Line2NodeMaterial`
- `LineSegments2` and `Wireframe` (geometry/scene-graph classes are unchanged)
- `LineSegmentsGeometry`/`LineGeometry` (unchanged)

Migration is a one-class swap plus reimplementing the `onBeforeCompile` bias as a TSL `vertexNode`. The user-facing API (resolution, dashed flag, `linewidth`) is identical.

### Finding 5: `three-viewport-gizmo` Fork

The fork (`taucad/three-viewport-gizmo`) already declares its public constructor as accepting `WebGLRenderer | WebGPURenderer`. Internal blockers:

1. `createGizmoRenderer` in `viewport-gizmo-cube.tsx`, `viewport-gizmo-axes.tsx`, and `viewport-gizmo-onshape.tsx` instantiates `new THREE.WebGLRenderer({...})` directly. Switch to `new THREE.WebGPURenderer({...})` and `await renderer.init()` before first frame.
2. `createViewportGizmoCubeAxes` builds axes with `LineMaterial` — same `Line2NodeMaterial` swap as Finding 4.
3. The face cube uses a `CanvasTexture` rendered from a HTMLCanvasElement; this is fully WebGPU-compatible (no shader changes).
4. Bundle the pending blueprint fixes from `docs/research/three-viewport-gizmo-fork-blueprint.md` (rotation singularity in `_setOrientation`, `hoverchange` event) into the same fork bump so we publish one tarball not two.

### Finding 6: `OffscreenCanvas` and Screenshots

`apps/ui/app/components/docs/shared-renderer.tsx` and `apps/ui/app/machines/screenshot-capability.machine.ts` both create their own `WebGLRenderer` instance and call synchronous `renderer.render()` followed by `transferToImageBitmap()` / `gl.domElement.toDataURL()`.

WebGPU implications:

- `WebGPURenderer.renderAsync(scene, camera)` is required (the synchronous `render` exists but flushes the queue with an awaitable internally; for off-screen reads await `renderAsync`).
- `OffscreenCanvas.transferToImageBitmap()` works for WebGPU contexts in Chromium and Safari TP. Firefox WebGPU off-screen support is partial as of writing — verify before declaring parity.
- `toDataURL()` on a WebGPU-backed canvas requires the renderer to flush before the read; wrap in `await renderer.renderAsync(); await new Promise(requestAnimationFrame); canvas.toDataURL();` or use `readRenderTargetPixels` + manual PNG encode for determinism.
- Screenshot machine clones the scene and replaces materials with matcap `MeshMatcapMaterial` — that material has a NodeMaterial equivalent (`MeshMatcapNodeMaterial`); swap during clone when backend === 'webgpu'.

### Finding 7: Logarithmic Depth, Stencil, Local Clipping

| Feature                  | WebGPURenderer status (r179)                                                                           | Action                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `logarithmicDepthBuffer` | Supported by node materials; same renderer flag                                                        | None for built-in node materials; ensure custom TSL graphs use `cameraNear`/`cameraFar` log mapping nodes |
| Local clipping planes    | Supported; `material.clippingPlanes` and `clipShadows` carry over to NodeMaterial                      | None                                                                                                      |
| Stencil ops              | Supported; `stencilWrite`, `stencilFunc`, `stencilRef`, `stencilZPass` all map onto WebGPU descriptors | None — striped section caps continue to work                                                              |
| MSAA                     | `antialias: true` allocates 4x MSAA color attachment automatically                                     | None                                                                                                      |
| `gl.getExtension('...')` | No WebGL extension API; capabilities live on `renderer.backend.device.features`                        | Audit any `gl.getExtension` calls (none found in inventory)                                               |

### Finding 8: `@react-three/drei` Helpers

Inventoried Drei imports: `OrbitControls`, `Plane`, `Environment`, `Lightformer`, `Line`, `PerspectiveCamera`. All are scene-graph or controls helpers that don't bind to `WebGLRenderer` internals **except**:

- `Environment` calls `PMREMGenerator` which has a WebGPU rewrite (`PMREMGenerator` in `three/webgpu` accepts `WebGPURenderer`) — Drei v10 picks the right one when passed a `WebGPURenderer`. Verified by reading `node_modules/@react-three/drei/core/Environment.js`.
- `Line` (the thin-line variant) uses `MeshLineMaterial`-style internals but is shader-free at the user surface.

No code changes expected for the Drei surface; smoke-test the Environment path because PMREM differences are visible in the lighting integral.

### Finding 9: R3F Async `gl` Factory and `frameloop`

R3F v9 supports:

```tsx
<Canvas
  gl={async (canvas) => {
    const r = new THREE.WebGPURenderer({ canvas, antialias: true, stencil: true, logarithmicDepthBuffer: true });
    await r.init();
    return r;
  }}
  frameloop="demand"
>
```

`frameloop="demand"` is preserved; R3F's render loop already awaits `renderAsync` when the renderer exposes it. No invalidation hook changes required.

### Finding 10: Browser Support Reality Check

| Browser      | WebGPU status (May 2026)    | Notes                                                                       |
| ------------ | --------------------------- | --------------------------------------------------------------------------- |
| Chrome 122+  | Stable, default-on          | Primary target                                                              |
| Edge 122+    | Stable, default-on          | Same as Chrome                                                              |
| Safari 18+   | Stable on macOS/iOS 18+     | Some `OffscreenCanvas` paths still flag-gated; verify `shared-renderer.tsx` |
| Firefox 141+ | Behind `dom.webgpu.enabled` | Treat as feature-flagged; fall back to WebGL                                |

The graphics machine should detect support via `'gpu' in navigator && (await navigator.gpu.requestAdapter()) !== null` and fall back to WebGL on negative result.

## Recommendations

| #   | Action                                                                                                                                                  | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add `graphicsBackend` to `graphics.machine.ts` context with `'auto' \| 'webgl' \| 'webgpu'` and an `auto`-resolution actor that probes `navigator.gpu`  | P0       | Low    | High   |
| R2  | Refactor `three-context.tsx` to accept the resolved backend and pass an async `gl` factory; replace `webglcontextlost` with a backend-aware listener    | P0       | Low    | High   |
| R3  | Port S1–S4 custom shaders to `NodeMaterial` + TSL with screenshot-diff regression tests under `apps/ui/app/components/geometry/.../*.shader.test.tsx`   | P0       | Med    | High   |
| R4  | Replace `@react-three/postprocessing` `EffectComposer`/`N8AO` with Three.js `RenderPipeline` + `gtao()` TSL node; remove the `distanceFalloff: 0` hack  | P0       | Med    | High   |
| R5  | Migrate `gltf-edges.ts` (and gizmo axis material) from `LineMaterial` to `Line2NodeMaterial`; reimplement the FOV-adaptive log-depth bias as a TSL node | P0       | Med    | Med    |
| R6  | Update `three-viewport-gizmo` fork: swap internal renderer creation to `WebGPURenderer`, port axes to `Line2NodeMaterial`, bundle blueprint fixes       | P1       | Med    | Med    |
| R7  | Adapt `shared-renderer.tsx` and `screenshot-capability.machine.ts` to await `renderAsync` and pick `MeshMatcapNodeMaterial` when backend is WebGPU      | P1       | Low    | Med    |
| R8  | Add a Playwright e2e that toggles `graphicsBackend` and asserts pixel parity on the canonical model + section-cap + grid scenes                         | P1       | Med    | High   |
| R9  | Document the migration in `docs/policy/ui-policy.md` (or a new `graphics-backend-policy.md`) once R1–R7 land                                            | P2       | Low    | Med    |
| R10 | Defer compute-shader-based geometry post-processing (vertex welding, normal smoothing) to a follow-up; out of scope for the renderer flip               | P2       | —      | —      |

## Implementation Roadmap

### Phase 0 — Backend selection plumbing (1–2 days)

1. Add `graphicsBackend` to `graphics.machine.ts` context and `assign` the resolved value from a `fromPromise` actor that probes `navigator.gpu.requestAdapter()`. Default to `'auto'`. Persist user override via existing `graphics-view-settings` schema (bump `schemaVersion`).
2. Expose `useGraphicsSelector((s) => s.context.graphicsBackend)`.
3. Add a settings toggle under "Advanced → Rendering Backend" with `auto / WebGL / WebGPU` options; reuse the existing settings `SettingsSection` pattern.
4. No rendering changes yet — the value is read but unused. Ship to staging behind the flag.

### Phase 1 — Renderer factory and context loss (1 day)

1. Refactor `three-context.tsx`:

   ```tsx
   const gl = useMemo(() => {
     if (backend === 'webgpu') {
       return async (canvas: HTMLCanvasElement) => {
         const r = new WebGPURenderer({ canvas, antialias: true, stencil: true, logarithmicDepthBuffer: true });
         await r.init();
         return r;
       };
     }
     return { antialias: true, stencil: true, logarithmicDepthBuffer: true };
   }, [backend]);
   ```

2. Replace the `webglcontextlost` `useEffect` with a backend-discriminated `useEffect`:
   - WebGL: existing listener
   - WebGPU: `gl.backend.device.lost.then((info) => onContextLost(info))`
3. Smoke-test that scene mounts in both backends with the existing materials still on `MeshStandardMaterial`/`MeshPhysicalMaterial` (these have automatic NodeMaterial selection inside `WebGPURenderer`).

### Phase 2 — Custom shader migration (3–5 days)

Order recommended by risk × impact:

1. **S1 striped-material** — simplest, isolated to section caps. Prove the TSL pattern here.
2. **S4 morphing-points** — splash screen only; failure mode is contained.
3. **S3 gltf-edges** — production-critical (every model uses edges). Port `LineMaterial` + `onBeforeCompile` to `Line2NodeMaterial` + TSL bias node. Add a regression that screenshots the canonical edge-render scene and pixel-diffs against the WebGL baseline (≤2% delta acceptable due to rasterizer differences; investigate larger).
4. **S2 infinite-grid** — `fwidth`-heavy. Add a screenshot diff at 3 zoom levels (close, mid, near-clip) to catch derivative-quality regressions.

For each shader: keep the WebGL version intact; produce a sibling `*.node.ts` exporting a NodeMaterial; route at the `useMemo` site based on `backend`. After full Phase 4 validation, delete the WebGL version.

### Phase 3 — Post-processing rewrite (2–3 days)

1. Create `post-processing-webgpu.tsx` returning `null` and side-effecting via `useEffect` to wire `renderer.outputNode` with a `pass(scene, camera) → gtao(...) → toneMapping`.
2. Gate `<PostProcessing />` on backend; render the WebGL version under WebGL and the new WebGPU version otherwise.
3. Drop the `distanceFalloff: 0` hack — verify with side-by-side AO screenshots.
4. If MSAA proves insufficient on WebGPU edges, add `fxaa()` to the node graph.

### Phase 4 — Gizmo fork bump (2–3 days)

1. In `repos/three-viewport-gizmo`, rewrite `createGizmoRenderer` to a discriminated factory: `'webgl' | 'webgpu'`. Default still WebGL; consumer passes the kind.
2. Convert the axis material to `Line2NodeMaterial`. Validate visual parity against the existing axis sprites.
3. Apply the rotation-singularity and `hoverchange` blueprint fixes in the same commit batch.
4. Build, `npm pack`, drop tarball into `tarballs/`, bump `apps/ui/package.json` reference, run `pnpm install`, and re-test gizmo scenes (cube, axes, onshape variants).
5. File one upstream PR per discrete fix (renderer factory, rotation, hover) for maintainer review per `submit-pr` skill conventions.

### Phase 5 — Off-screen and screenshots (1–2 days)

1. `shared-renderer.tsx`: branch on backend; `renderAsync` → `transferToImageBitmap` for WebGPU. Add a Firefox feature probe; fall back to WebGL when `OffscreenCanvas` + WebGPU is unavailable.
2. `screenshot-capability.machine.ts`: parametrize material substitution (`MeshMatcapMaterial` ↔ `MeshMatcapNodeMaterial`) by backend. Audit any `WebGLRenderer`-typed assertions in tests.
3. Update `screenshot-capability.machine.test.ts` with backend-parameterized cases.

### Phase 6 — End-to-end validation and default flip (1 week)

1. Add Playwright e2e under `apps/ui/e2e/graphics-backend.spec.ts` covering: cube section-cap, gltf-edges scene, grid at 3 zooms, gizmo interaction, screenshot capture, and AO-on/AO-off transitions. Run for both backends.
2. Bake on staging for ≥1 week with `graphicsBackend = 'auto'` defaulting to `'webgl'`.
3. Flip default to `'auto' → webgpu when supported`; keep WebGL as fallback for ≥2 releases before considering removal.

## Trade-offs

| Approach                                               | Pros                                                                                     | Cons                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Big-bang rewrite (delete WebGL, ship WebGPU only)**  | Single source of truth; no dual code paths; smallest long-term maintenance               | Loses Firefox/older Safari users until they catch up; harder to roll back; high regression risk on day one                      |
| **Dual-backend with runtime probe (recommended)**      | Graceful fallback; can A/B in production; per-shader migrations validatable in isolation | Two material implementations to maintain during transition; ~2× test surface for graphics paths                                 |
| **Stay on WebGL2 indefinitely**                        | Zero work                                                                                | Locked out of compute shaders; deprecation pressure on macOS/iOS; can't leverage TSL ecosystem (GTAO, bloom, FXAA in node form) |
| **Migrate post-processing only, keep `WebGLRenderer`** | Smaller diff                                                                             | TSL post-processing nodes don't run under `WebGLRenderer`; this option is technically unavailable                               |
| **Replace Three.js with `regl`/`bgfx`/etc.**           | Bigger ceiling                                                                           | Throws away years of integration with Drei, R3F, postprocessing, gizmo; out of scope                                            |

## Code Examples

### TSL striped material (Finding 2, S1)

```ts
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { Fn, mix, screenCoordinate, step, uniform, vec3 } from 'three/tsl';

const stripeWidth = uniform(8);
const baseColor = uniform(vec3(0.95));
const stripeColor = uniform(vec3(0.55));

const stripeMix = Fn(() => {
  const x = screenCoordinate.x;
  const m = x.mod(stripeWidth.mul(2));
  return mix(baseColor, stripeColor, step(stripeWidth, m));
});

export const createStripedNodeMaterial = (opts: { stencilRef?: number } = {}) => {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = stripeMix();
  if (opts.stencilRef !== undefined) {
    m.stencilWrite = true;
    m.stencilRef = opts.stencilRef;
  }
  return m;
};
```

### TSL log-depth bias for fat lines (Finding 4, S3)

```ts
import { Line2NodeMaterial } from 'three/addons/lines/webgpu/Line2NodeMaterial.js';
import { Fn, cameraProjectionMatrix, modelViewMatrix, positionGeometry, uniform } from 'three/tsl';

const fovBias = uniform(0); // updated each frame from camera.fov

export const createGltfEdgeMaterial = () => {
  const m = new Line2NodeMaterial({ linewidth: 1.5, worldUnits: false });
  m.vertexNode = Fn(() => {
    const mvPos = modelViewMatrix.mul(positionGeometry);
    const biased = mvPos.add(mvPos.normalize().mul(fovBias));
    return cameraProjectionMatrix.mul(biased);
  })();
  return m;
};

// in render loop:
fovBias.value = computeFovAdaptiveBias(camera.fov, camera.near, camera.far);
```

### WebGPU post-processing pipeline (Finding 3)

```tsx
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { pass } from 'three/tsl';
import { gtao } from 'three/examples/jsm/tsl/display/GTAONode.js';

export const PostProcessingWebGPU = () => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const scenePass = pass(scene, camera);
    const ao = gtao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
    ao.radius.value = 0.5;
    ao.thickness.value = 1.0;
    gl.outputNode = scenePass.mul(ao);
    return () => {
      gl.outputNode = null;
    };
  }, [gl, scene, camera]);
  return null;
};
```

### Backend probe actor (Recommendation R1)

```ts
import { fromSafeAsync } from '#lib/xstate.lib.js';

export const probeWebGPUSupport = fromSafeAsync(async () => {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  const adapter = await navigator.gpu.requestAdapter();
  return adapter !== null;
});
```

## Diagrams

### Current WebGL render flow

```
React Tree
   │
   ▼
<Canvas gl={{...}}>          ← @react-three/fiber implicitly creates WebGLRenderer
   │
   ▼
Scene  ─►  WebGLRenderer  ─►  EffectComposer (postprocessing)  ─►  HTMLCanvasElement
                                       │
                                       └─► N8AO pass (depth → AO → composite)

Custom GLSL ShaderMaterials (S1–S4) bound directly to WebGLRenderer's
GLSL include system; LineMaterial.onBeforeCompile injects log-depth bias.
```

### Target WebGPU render flow

```
React Tree
   │
   ▼
<Canvas gl={async (canvas) => await new WebGPURenderer(...).init()}>
   │
   ▼
Scene  ─►  WebGPURenderer  ─►  outputNode = pass(scene, cam) ⊗ gtao(...)
              │
              └─► NodeMaterial graph (TSL)
                     │
                     ├─ S1' striped (MeshBasicNodeMaterial + screenCoord stripe)
                     ├─ S2' grid    (MeshBasicNodeMaterial + fwidth)
                     ├─ S3' edges   (Line2NodeMaterial + log-depth bias node)
                     └─ S4' points  (PointsNodeMaterial + morph)
```

## References

- Three.js r179 release notes: WebGPU + TSL APIs in `three/webgpu` and `three/tsl`
- `node_modules/three/examples/jsm/tsl/display/` — `GTAONode`, `FXAANode`, `BloomNode`
- `node_modules/three/examples/jsm/lines/webgpu/Line2NodeMaterial.js`
- `@react-three/fiber` v9 async `gl` factory: <https://github.com/pmndrs/react-three-fiber/pull/3320>
- `@react-three/postprocessing` WebGPU tracking issue: <https://github.com/pmndrs/postprocessing/issues/465>
- `n8ao-webgpu` community port: <https://github.com/N8python/n8ao> (unofficial; reference only)
- WebGPU device-loss spec: <https://www.w3.org/TR/webgpu/#gpudevice-lost>
- Related: `docs/research/three-viewport-gizmo-fork-blueprint.md`

## Appendix A — Three.js Imports Inventory

| Source                                | Importer                                                                                                                                      | Migration risk                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `three`                               | ~30 files (core types: `Vector3`, `Matrix4`, `Mesh`, `Group`, ...)                                                                            | None                          |
| `three` (`WebGLRenderer`)             | `shared-renderer.tsx`, `screenshot-capability.machine.ts`, `viewport-gizmo-cube.tsx`, `viewport-gizmo-axes.tsx`, `viewport-gizmo-onshape.tsx` | High                          |
| `three` (`ShaderMaterial`)            | `striped-material.ts`, `infinite-grid-material.ts`, `morphing-points-material.ts`                                                             | High                          |
| `three/addons/lines/LineMaterial.js`  | `gltf-edges.ts`, `viewport-gizmo-cube-axes` (in fork)                                                                                         | High                          |
| `three/addons/lines/LineSegments2.js` | `gltf-edges.ts`                                                                                                                               | Low (geometry only)           |
| `@react-three/fiber`                  | All graphics components                                                                                                                       | Low (R3F v9 supports WebGPU)  |
| `@react-three/drei`                   | `OrbitControls`, `Plane`, `Environment`, `Lightformer`, `Line`, `PerspectiveCamera`                                                           | Low (Drei 10 supports WebGPU) |
| `@react-three/postprocessing`         | `post-processing.tsx`                                                                                                                         | Replace                       |
| `three-viewport-gizmo`                | `viewport-gizmo-*.tsx`                                                                                                                        | Fork-bump                     |

## Appendix B — Open Questions

1. Does `OffscreenCanvas` + `WebGPURenderer` produce ImageBitmaps in Safari 18 in the off-thread context used by `shared-renderer.tsx`? Needs runtime probe.
2. Should the "matcap" screenshot path use `MeshMatcapNodeMaterial` exclusively even under WebGL backend, to collapse to a single material? Lower priority; defer.
3. Is there value in a compute-shader-based vertex weld pass for the `connected-components` analyser once we have WebGPU? Out of scope, but worth filing as a follow-up.
4. `pmndrs/postprocessing` has an in-progress WebGPU fork; should we wait for it instead of porting to TSL nodes? Verdict: no — TSL nodes are first-party Three.js and reduce dependency surface.

## Checklist

- [x] Filename slug `webgpu-migration-graphics-stack.md`
- [x] Frontmatter with quoted dates, `category: migration`
- [x] Problem statement, methodology, numbered findings, prioritized recommendations
- [x] Trade-offs table with the chosen approach justified
- [x] Code examples for each non-trivial migration pattern
- [x] References to upstream issues and related research
- [x] Under 800 lines
